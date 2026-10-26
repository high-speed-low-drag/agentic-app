"""Time-series power flow: profiles -> PGM batch update -> chunked batch calculation."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
from power_grid_model import initialize_array

from gridsim.engine import iter_power_flow
from gridsim.models import CaseStudy, ValidationIssue
from gridsim.networks.base import LoadedNetwork
from gridsim.profiles import PROFILE_GENERATORS
from gridsim.results.groups import output_spec
from gridsim.results.summary import compute_summary
from gridsim.results.writer import ResultWriter
from gridsim.studies.base import CancelCheck, ProgressCallback, RunCancelled, StudyOutcome
from gridsim.workspace import write_json_atomic

LARGE_RUN_ELEMENT_STEPS = 50_000_000


def _target_positions(net: LoadedNetwork, component: str, ids: list[int] | None) -> np.ndarray:
    all_ids = net.input_data[component]["id"]
    if ids is None:
        return np.arange(len(all_ids))
    lookup = {int(i): k for k, i in enumerate(all_ids)}
    missing = [i for i in ids if i not in lookup]
    if missing:
        raise ValueError(f"{component} ids not in network: {missing[:10]}")
    return np.asarray([lookup[i] for i in ids], dtype=np.int64)


def build_update(
    case: CaseStudy, net: LoadedNetwork, timestamps: pd.DatetimeIndex
) -> dict[str, np.ndarray]:
    """Build PGM batch update arrays (n_steps, n_elements) for targeted appliance types."""
    n = len(timestamps)
    p_q: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    for a in case.profile_assignments:
        comp = a.target.component
        if comp not in net.input_data or len(net.input_data[comp]) == 0:
            continue
        if comp not in p_q:
            base = net.input_data[comp]
            p_q[comp] = (
                np.tile(base["p_specified"].astype(float), (n, 1)),
                np.tile(base["q_specified"].astype(float), (n, 1)),
            )
        p, q = p_q[comp]
        pos = _target_positions(net, comp, a.target.ids)
        if len(pos) == 0:
            continue
        m = PROFILE_GENERATORS.get(a.generator).run(timestamps, len(pos), a.params)
        if a.mode == "scale":
            p[:, pos] *= m
            q[:, pos] *= m
        else:
            p[:, pos] += (a.magnitude_w or 0.0) * m

    update: dict[str, np.ndarray] = {}
    for comp, (p, q) in p_q.items():
        arr = initialize_array("update", comp, (n, p.shape[1]))
        arr["id"] = net.input_data[comp]["id"][None, :]
        arr["p_specified"] = p
        arr["q_specified"] = q
        update[comp] = arr
    return update


class TimeseriesPowerFlow:
    key = "timeseries_powerflow"
    name = "Time-series power flow"

    def validate(self, case: CaseStudy, net: LoadedNetwork) -> list[ValidationIssue]:
        issues: list[ValidationIssue] = []

        def err(msg: str) -> None:
            issues.append(ValidationIssue(level="error", message=msg))

        def warn(msg: str) -> None:
            issues.append(ValidationIssue(level="warning", message=msg))

        ts = case.time.timestamps()
        if not case.profile_assignments:
            warn("No profile assignments: every timestep uses the base network values")
        n_elements = sum(len(v) for v in net.input_data.values())
        if len(ts) * n_elements > LARGE_RUN_ELEMENT_STEPS:
            warn(f"Large run: {len(ts)} timesteps x {n_elements} elements may take a while")
        seen: set[str] = set()
        for a in case.profile_assignments:
            label = f"Assignment '{a.label or a.id}'"
            if a.id in seen:
                err(f"{label}: duplicate assignment id '{a.id}'")
            seen.add(a.id)
            if a.generator not in PROFILE_GENERATORS:
                err(f"{label}: unknown profile generator '{a.generator}'")
                continue
            gen = PROFILE_GENERATORS.get(a.generator)
            comp = a.target.component
            if comp not in gen.applies_to:
                warn(f"{label}: generator '{gen.key}' is intended for {', '.join(gen.applies_to)}")
            if comp not in net.input_data or len(net.input_data[comp]) == 0:
                warn(f"{label}: network has no {comp} elements; assignment has no effect")
                continue
            if a.target.ids is not None and len(a.target.ids) == 0:
                warn(f"{label}: empty target id list; assignment has no effect")
            try:
                _target_positions(net, comp, a.target.ids)
            except ValueError as exc:
                err(f"{label}: {exc}")
            if a.mode == "add" and a.magnitude_w is None:
                err(f"{label}: mode 'add' requires magnitude_w (W)")
            try:
                gen.run(ts, 1, a.params)  # dry run: params, CSV coverage, ...
            except Exception as exc:  # noqa: BLE001
                err(f"{label}: {exc}")
        return issues

    def run(
        self,
        run_id: str,
        case: CaseStudy,
        net: LoadedNetwork,
        run_dir: Path,
        progress: ProgressCallback,
        is_cancelled: CancelCheck,
    ) -> StudyOutcome:
        ts = case.time.timestamps()
        n = len(ts)
        progress(0.0, "Generating profiles")
        update = build_update(case, net, ts)
        if is_cancelled():
            raise RunCancelled()
        writer = ResultWriter(run_dir, net, n)
        spec = output_spec(set(net.input_data))
        try:
            for chunk in iter_power_flow(net.input_data, update, n, case.calculation, spec):
                writer.write_chunk(chunk)
                progress(0.02 + 0.95 * chunk.stop / n, f"Timestep {chunk.stop}/{n}")
                if is_cancelled():
                    raise RunCancelled()
        finally:
            acc = writer.close()
        progress(0.98, "Computing summary")
        summary = compute_summary(run_id, case, acc, writer.elements)
        write_json_atomic(run_dir / "summary.json", summary)
        return StudyOutcome(summary=summary, n_failed_timesteps=summary.kpis.n_failed_timesteps)
