"""Background run manager: a small thread pool executing study runs.

Run state lives in memory while a run is active and is persisted to `runs/<id>/run.json`
on every status change (and throttled on progress). Readers (`get`, SSE) see a consistent
`RunInfo` because state is replaced, never mutated in place.
"""

from __future__ import annotations

import asyncio
import logging
import secrets
import shutil
import threading
import time
from collections.abc import AsyncIterator, Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from gridsim.models import TERMINAL_STATUSES, CaseStudy, RunInfo
from gridsim.networks import load_network
from gridsim.results import RESULTS
from gridsim.studies import STUDY_TYPES, RunCancelled
from gridsim.workspace import (
    ConflictError,
    NotFoundError,
    Workspace,
    now,
    read_json,
    write_json_atomic,
)

log = logging.getLogger(__name__)
Listener = Callable[[RunInfo], None]
PERSIST_INTERVAL_S = 0.5


@dataclass
class _RunState:
    info: RunInfo
    cancel: threading.Event = field(default_factory=threading.Event)
    delete_after: bool = False
    last_persist: float = 0.0


def new_run_id() -> str:
    return f"r-{datetime.now():%Y%m%d-%H%M%S}-{secrets.token_hex(2)}"


class RunManager:
    def __init__(self, ws: Workspace, max_workers: int = 1, mark_stale: bool = True) -> None:
        self.ws = ws
        self._lock = threading.Lock()
        self._active: dict[str, _RunState] = {}
        self._executor = ThreadPoolExecutor(max_workers, thread_name_prefix="gridsim-run")
        if mark_stale:
            self.mark_stale_runs()

    # --- persistence --------------------------------------------------------------------------

    def _read(self, run_id: str) -> RunInfo:
        path = self.ws.run_dir(run_id) / "run.json"
        if not path.exists():
            raise NotFoundError(f"Run '{run_id}' not found")
        return RunInfo.model_validate(read_json(path))

    def _persist(self, info: RunInfo) -> None:
        d = self.ws.run_dir(info.id)
        if d.exists():
            try:
                write_json_atomic(d / "run.json", info)
            except OSError:  # run dir deleted concurrently
                log.warning("could not persist run %s", info.id)

    def mark_stale_runs(self) -> int:
        """Runs left queued/running by a previous process can never finish: mark them failed."""
        n = 0
        for run_id in self.ws.run_ids():
            try:
                info = self._read(run_id)
            except Exception:  # noqa: BLE001
                continue
            if info.status in ("queued", "running") and run_id not in self._active:
                self._persist(
                    info.model_copy(
                        update={"status": "failed", "error": "interrupted", "finished_at": now()}
                    )
                )
                n += 1
        return n

    # --- lifecycle ----------------------------------------------------------------------------

    def create(self, case: CaseStudy) -> RunInfo:
        """Create a queued run with a frozen copy of the case."""
        run_id = new_run_id()
        while self.ws.run_dir(run_id).exists():
            run_id = new_run_id()
        d = self.ws.run_dir(run_id)
        d.mkdir(parents=True)
        write_json_atomic(d / "case.json", case)
        info = RunInfo(
            id=run_id,
            case_id=case.id or "adhoc",
            case_name=case.name,
            status="queued",
            message="Queued",
            n_timesteps=case.time.n_timesteps,
            created_at=now(),
        )
        with self._lock:
            self._active[run_id] = _RunState(info)
        self._persist(info)
        return info

    def submit(self, case: CaseStudy) -> RunInfo:
        info = self.create(case)
        self._executor.submit(self.execute, info.id)
        return info

    def _update(self, state: _RunState, force: bool = False, **changes: Any) -> RunInfo:
        state.info = state.info.model_copy(update=changes)
        t = time.monotonic()
        if force or t - state.last_persist >= PERSIST_INTERVAL_S:
            state.last_persist = t
            self._persist(state.info)
        return state.info

    def execute(self, run_id: str, listener: Listener | None = None) -> RunInfo:
        """Run synchronously (used by the worker pool and the CLI)."""
        with self._lock:
            state = self._active.get(run_id)
        if state is None:
            raise NotFoundError(f"Run '{run_id}' is not active")
        notify = listener or (lambda _info: None)
        if state.cancel.is_set() or state.info.status in TERMINAL_STATUSES:
            return self._finish(state)
        t0 = time.monotonic()
        notify(self._update(state, True, status="running", started_at=now(), message="Starting"))

        def progress(fraction: float, message: str) -> None:
            frac = round(min(max(fraction, 0.0), 1.0), 4)
            notify(self._update(state, progress=frac, message=message))

        try:
            run_dir = self.ws.run_dir(run_id)
            case = CaseStudy.model_validate(read_json(run_dir / "case.json"))
            net = load_network(case.network.source, case.network.key)
            study = STUDY_TYPES.get(case.study_type)
            outcome = study.run(run_id, case, net, run_dir, progress, state.cancel.is_set)
            final = {
                "status": "succeeded",
                "progress": 1.0,
                "message": f"Completed {case.time.n_timesteps} timesteps",
                "n_failed_timesteps": outcome.n_failed_timesteps,
            }
        except RunCancelled:
            final = {"status": "cancelled", "message": "Cancelled"}
        except Exception as exc:  # noqa: BLE001
            log.exception("run %s failed", run_id)
            final = {"status": "failed", "message": "Failed", "error": str(exc) or repr(exc)}
        final |= {"finished_at": now(), "duration_s": round(time.monotonic() - t0, 3)}
        notify(self._update(state, True, **final))
        return self._finish(state)

    def _finish(self, state: _RunState) -> RunInfo:
        if state.info.status not in TERMINAL_STATUSES:  # cancelled while queued
            self._update(state, True, status="cancelled", message="Cancelled", finished_at=now())
        self._persist(state.info)
        with self._lock:
            self._active.pop(state.info.id, None)
        if state.delete_after:
            shutil.rmtree(self.ws.run_dir(state.info.id), ignore_errors=True)
        return state.info

    # --- queries / actions --------------------------------------------------------------------

    def get(self, run_id: str) -> RunInfo:
        with self._lock:
            state = self._active.get(run_id)
        return state.info if state else self._read(run_id)

    def list(self, case_id: str | None = None) -> list[RunInfo]:
        runs = []
        for run_id in self.ws.run_ids():
            try:
                info = self.get(run_id)
            except Exception:  # noqa: BLE001
                continue
            if case_id is None or info.case_id == case_id:
                runs.append(info)
        return sorted(runs, key=lambda r: (r.created_at, r.id), reverse=True)

    def last_run(self, case_id: str) -> RunInfo | None:
        runs = self.list(case_id)
        return runs[0] if runs else None

    def cancel(self, run_id: str) -> RunInfo:
        with self._lock:
            state = self._active.get(run_id)
        if state is None:
            return self._read(run_id)
        state.cancel.set()
        if state.info.status == "queued":
            self._update(state, True, status="cancelled", message="Cancelled", finished_at=now())
        return state.info

    def delete(self, run_id: str) -> None:
        info = self.get(run_id)
        if info.status not in TERMINAL_STATUSES:
            raise ConflictError(f"Run '{run_id}' is {info.status}; cancel it first")
        self._remove_dir(self.ws.run_dir(run_id))

    def delete_case_runs(self, case_id: str) -> None:
        for info in self.list(case_id):
            with self._lock:
                state = self._active.get(info.id)
                if state is not None:
                    state.delete_after = True
                    state.cancel.set()
            if state is None:
                self._remove_dir(self.ws.run_dir(info.id))

    def _remove_dir(self, d: Path) -> None:
        RESULTS.invalidate(d)
        shutil.rmtree(d, ignore_errors=True)

    def run_dir(self, run_id: str) -> Path:
        return self.ws.run_dir(run_id)

    async def watch(self, run_id: str, interval_s: float = 0.25) -> AsyncIterator[RunInfo]:
        """Yield RunInfo whenever it changes, until (and including) a terminal state."""
        last = None
        while True:
            info = self.get(run_id)
            dumped = info.model_dump_json()
            if dumped != last:
                last = dumped
                yield info
            if info.status in TERMINAL_STATUSES:
                return
            await asyncio.sleep(interval_s)

    def shutdown(self) -> None:
        with self._lock:
            states = list(self._active.values())
        for s in states:
            s.cancel.set()
        self._executor.shutdown(wait=True, cancel_futures=True)
        with self._lock:
            leftover = list(self._active.values())
        for s in leftover:  # queued runs whose futures were cancelled
            self._finish(s)
