from collections.abc import Iterator
from datetime import datetime
from pathlib import Path

import pytest

from gridsim.models import CaseStudy, NetworkRef, ProfileAssignment, ProfileTarget, TimeSettings
from gridsim.workspace import Workspace, set_workspace

SAMPLES = Path(__file__).resolve().parents[1] / "src" / "gridsim" / "samples" / "networks"


@pytest.fixture(autouse=True)
def workspace(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Workspace]:
    """Every test gets an isolated workspace."""
    root = tmp_path / "workspace"
    monkeypatch.setenv("GRIDSIM_WORKSPACE", str(root))
    ws = Workspace(root)
    set_workspace(ws)
    yield ws
    set_workspace(None)


def make_case(**overrides) -> CaseStudy:
    data = dict(
        id="test-case",
        name="Test case",
        network=NetworkRef(source="sample", key="vision_mv"),
        time=TimeSettings(
            start=datetime(2026, 7, 1), end=datetime(2026, 7, 2), resolution_minutes=60
        ),
        profile_assignments=[
            ProfileAssignment(
                id="a1", generator="residential_load", target=ProfileTarget(component="sym_load")
            ),
            ProfileAssignment(id="a2", generator="pv", target=ProfileTarget(component="sym_gen")),
        ],
    )
    data.update(overrides)
    return CaseStudy(**data)
