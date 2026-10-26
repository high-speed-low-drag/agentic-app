"""File-based storage for cases, runs and uploads.

Layout (root = `GRIDSIM_WORKSPACE`, default `<repo>/workspace`)::

    cases/<case_id>/case.json
    runs/<run_id>/{run.json, case.json, summary.json, elements.json, *.parquet}
    uploads/networks/<key>.json (+ <key>.meta.json)
    uploads/profiles/<file_id>.csv (+ <file_id>.meta.json)
    .seeded.json  (ids of the demo cases seeded once, see `seed_demo_cases`)

All storage access goes through `Workspace`, so it can be swapped for a DB later.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from gridsim.models import CaseStudy, NetworkRef, ProfileAssignment, ProfileTarget, TimeSettings

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent


class NotFoundError(LookupError):
    """Requested object does not exist."""


class ConflictError(ValueError):
    """Object already exists / state conflict."""


def slugify(text: str, fallback: str = "case") -> str:
    norm = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", norm).strip("-").lower()
    return slug[:60].strip("-") or fallback


def write_json_atomic(path: Path, data: Any) -> None:
    """Write JSON via a temp file + rename so readers never see partial files."""
    path.parent.mkdir(parents=True, exist_ok=True)
    text = (
        data.model_dump_json(indent=2)
        if isinstance(data, BaseModel)
        else json.dumps(data, indent=2, default=str)
    )
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def now() -> datetime:
    return datetime.now().replace(microsecond=0)


class Workspace:
    def __init__(self, root: Path | str) -> None:
        self.root = Path(root)
        dirs = (self.cases_dir, self.runs_dir, self.network_uploads_dir, self.profile_uploads_dir)
        for d in dirs:
            d.mkdir(parents=True, exist_ok=True)

    @property
    def cases_dir(self) -> Path:
        return self.root / "cases"

    @property
    def runs_dir(self) -> Path:
        return self.root / "runs"

    @property
    def network_uploads_dir(self) -> Path:
        return self.root / "uploads" / "networks"

    @property
    def profile_uploads_dir(self) -> Path:
        return self.root / "uploads" / "profiles"

    # --- cases --------------------------------------------------------------------------------

    def _case_path(self, case_id: str) -> Path:
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", case_id):
            raise NotFoundError(f"Case '{case_id}' not found")
        return self.cases_dir / case_id / "case.json"

    def list_cases(self) -> list[CaseStudy]:
        cases = [CaseStudy.model_validate(read_json(p)) for p in self.cases_dir.glob("*/case.json")]
        # Newest first; ties (e.g. demos seeded in the same second) by id, for a stable order.
        return sorted(cases, key=lambda c: (c.updated_at or datetime.min, c.id or ""), reverse=True)

    def get_case(self, case_id: str) -> CaseStudy:
        path = self._case_path(case_id)
        if not path.exists():
            raise NotFoundError(f"Case '{case_id}' not found")
        return CaseStudy.model_validate(read_json(path))

    def create_case(self, case: CaseStudy) -> CaseStudy:
        if case.id:
            case_id = slugify(case.id)
            if self._case_path(case_id).exists():
                raise ConflictError(f"Case '{case_id}' already exists")
        else:
            base = slugify(case.name)
            case_id, i = base, 2
            while self._case_path(case_id).exists():
                case_id, i = f"{base}-{i}", i + 1
        ts = now()
        case = case.model_copy(update={"id": case_id, "created_at": ts, "updated_at": ts})
        write_json_atomic(self._case_path(case_id), case)
        return case

    def update_case(self, case_id: str, case: CaseStudy) -> CaseStudy:
        old = self.get_case(case_id)
        case = case.model_copy(
            update={"id": case_id, "created_at": old.created_at, "updated_at": now()}
        )
        write_json_atomic(self._case_path(case_id), case)
        return case

    def delete_case(self, case_id: str) -> None:
        path = self._case_path(case_id)
        if not path.exists():
            raise NotFoundError(f"Case '{case_id}' not found")
        shutil.rmtree(path.parent)

    # --- runs ---------------------------------------------------------------------------------

    def run_dir(self, run_id: str) -> Path:
        if not re.fullmatch(r"r-[0-9]{8}-[0-9]{6}-[0-9a-f]{4}", run_id):
            raise NotFoundError(f"Run '{run_id}' not found")
        return self.runs_dir / run_id

    def run_ids(self) -> list[str]:
        return sorted((p.parent.name for p in self.runs_dir.glob("*/run.json")), reverse=True)

    # --- seed ---------------------------------------------------------------------------------

    @property
    def seeded_marker(self) -> Path:
        return self.root / ".seeded.json"

    def _read_seeded(self) -> set[str] | None:
        try:
            return set(read_json(self.seeded_marker)["seeded"])
        except FileNotFoundError:
            return None
        except (ValueError, KeyError, TypeError):  # unreadable marker: treat as missing
            return None

    def seed_demo_cases(self, reseed_deleted: bool = False) -> list[CaseStudy]:
        """Create the bundled demo cases this workspace has not had yet; return the new ones.

        `.seeded.json` lists the demo ids seeded once, so a demo the user deleted is not
        re-created (unless `reseed_deleted`). A case with a demo's id is never overwritten.
        A workspace from before the marker existed that has cases already had the original
        demo seeded once (it was seeded whenever the workspace was empty).
        """
        before = self._read_seeded()
        if before is not None:
            seeded = before
        elif any(self.cases_dir.glob("*/case.json")):
            seeded = {LEGACY_DEMO_ID}
        else:
            seeded = set()
        skip = set() if reseed_deleted else seeded
        created: list[CaseStudy] = []
        # Created in id order, so the newest-first list shows the original demo on top, then the
        # others by id descending, even if seeding crosses a second boundary.
        for demo in sorted(demo_cases(), key=lambda d: d.id or ""):
            assert demo.id
            if demo.id in skip:
                continue
            seeded = seeded | {demo.id}
            if not self._case_path(demo.id).exists():
                created.append(self.create_case(demo))
        if seeded != before:
            write_json_atomic(self.seeded_marker, {"seeded": sorted(seeded)})
        return created


LEGACY_DEMO_ID = "vision-mv-summer-week"
DEMO_CASES_DIR = Path(__file__).resolve().parent / "samples" / "cases"


def demo_cases() -> list[CaseStudy]:
    """The bundled demo cases: the original summer week plus `samples/cases/*.json`."""
    legacy = CaseStudy(
        id=LEGACY_DEMO_ID,
        name="Vision MV – summer week",
        description="Demo: one summer week on the Vision MV validation network with "
        "residential load and PV profiles.",
        network=NetworkRef(source="sample", key="vision_mv"),
        time=TimeSettings(
            start=datetime(2026, 7, 1), end=datetime(2026, 7, 8), resolution_minutes=15
        ),
        profile_assignments=[
            ProfileAssignment(
                id="a1",
                label="Household load",
                generator="residential_load",
                params={"seed": 1},
                target=ProfileTarget(component="sym_load"),
            ),
            ProfileAssignment(
                id="a2",
                label="Solar PV",
                generator="pv",
                params={"seed": 2},
                target=ProfileTarget(component="sym_gen"),
            ),
        ],
    )
    bundled = [
        CaseStudy.model_validate(read_json(p)) for p in sorted(DEMO_CASES_DIR.glob("*.json"))
    ]
    return [legacy, *bundled]


_current: Workspace | None = None


def default_root() -> Path:
    return Path(os.environ.get("GRIDSIM_WORKSPACE") or REPO_ROOT / "workspace")


def get_workspace() -> Workspace:
    """Return the active workspace (created from `GRIDSIM_WORKSPACE` on first use)."""
    global _current
    if _current is None:
        _current = Workspace(default_root())
    return _current


def set_workspace(ws: Workspace | None) -> None:
    """Override the active workspace (used by the app factory and tests)."""
    global _current
    _current = ws
