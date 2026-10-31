"""Bundled demo cases: seeding rules and that each demo still tells its story."""

import pyarrow.parquet as pq
import pytest

from gridsim.models import CaseStudy
from gridsim.runner import RunManager
from gridsim.validation import validate_case
from gridsim.workspace import LEGACY_DEMO_ID, Workspace, demo_cases, read_json

NEW_DEMOS = ["demo-ieee14-n1", "demo-mv-summer-pv", "demo-mv-winter-peak"]
ALL_DEMOS = sorted([LEGACY_DEMO_ID, *NEW_DEMOS])


def case_ids(ws: Workspace) -> list[str]:
    return sorted(c.id or "" for c in ws.list_cases())


def marker(ws: Workspace) -> list[str]:
    return read_json(ws.seeded_marker)["seeded"]


def test_bundled_demo_files() -> None:
    demos = demo_cases()
    assert sorted(d.id or "" for d in demos) == ALL_DEMOS
    for d in demos[1:]:
        assert d.description and d.created_at is None and d.updated_at is None


def test_empty_workspace_gets_all_demos(workspace: Workspace) -> None:
    created = workspace.seed_demo_cases()
    assert sorted(c.id or "" for c in created) == ALL_DEMOS
    assert case_ids(workspace) == ALL_DEMOS and marker(workspace) == ALL_DEMOS
    assert workspace.seed_demo_cases() == []  # idempotent


def test_old_workspace_without_marker_gets_new_demos(workspace: Workspace) -> None:
    legacy = next(d for d in demo_cases() if d.id == LEGACY_DEMO_ID)
    workspace.create_case(legacy)  # as seeded before the marker existed
    before = workspace.get_case(LEGACY_DEMO_ID)
    created = workspace.seed_demo_cases()
    assert sorted(c.id or "" for c in created) == NEW_DEMOS
    assert case_ids(workspace) == ALL_DEMOS and marker(workspace) == ALL_DEMOS
    assert workspace.get_case(LEGACY_DEMO_ID) == before


def test_old_workspace_whose_demo_was_deleted(workspace: Workspace) -> None:
    from .conftest import make_case

    workspace.create_case(make_case())  # the user's own case, the old demo deleted
    workspace.seed_demo_cases()
    assert case_ids(workspace) == sorted(["test-case", *NEW_DEMOS])


def test_deleted_demo_is_not_reseeded(workspace: Workspace) -> None:
    workspace.seed_demo_cases()
    workspace.delete_case("demo-mv-summer-pv")
    assert Workspace(workspace.root).seed_demo_cases() == []  # next startup
    assert "demo-mv-summer-pv" not in case_ids(workspace)
    # `gridsim seed-demos` brings it back on request.
    restored = workspace.seed_demo_cases(reseed_deleted=True)
    assert [c.id for c in restored] == ["demo-mv-summer-pv"]


def test_edited_demo_is_not_overwritten(workspace: Workspace) -> None:
    workspace.seed_demo_cases()
    case = workspace.get_case("demo-ieee14-n1")
    workspace.update_case("demo-ieee14-n1", case.model_copy(update={"name": "Mine"}))
    workspace.seeded_marker.unlink()  # even without the marker
    assert workspace.seed_demo_cases() == []
    assert workspace.get_case("demo-ieee14-n1").name == "Mine"
    assert workspace.seed_demo_cases(reseed_deleted=True) == []
    assert workspace.get_case("demo-ieee14-n1").name == "Mine"


def test_cli_seed_demos(workspace: Workspace) -> None:
    from typer.testing import CliRunner

    from gridsim.cli import app

    workspace.seed_demo_cases()
    workspace.delete_case(LEGACY_DEMO_ID)
    r = CliRunner().invoke(app, ["seed-demos"])
    assert r.exit_code == 0 and f"Created {LEGACY_DEMO_ID}" in r.output
    r = CliRunner().invoke(app, ["cases"])
    assert all(i in r.output for i in ALL_DEMOS)


def run_demo(ws: Workspace, case: CaseStudy):
    result = validate_case(case)
    assert [i.message for i in result.issues if i.level == "error"] == []
    runner = RunManager(ws, mark_stale=False)
    try:
        info = runner.create(case)
        final = runner.execute(info.id, lambda i: None)
    finally:
        runner.shutdown()
    assert final.status == "succeeded", final.error
    assert final.n_failed_timesteps == 0
    run_dir = runner.run_dir(info.id)
    summary = read_json(run_dir / "summary.json")
    source_p = pq.read_table(run_dir / "source.parquet").to_pandas().groupby("t")["p"].sum()
    return summary, source_p


@pytest.mark.parametrize("demo_id", NEW_DEMOS)
def test_demo_story_holds(workspace: Workspace, demo_id: str) -> None:
    case = next(d for d in demo_cases() if d.id == demo_id)
    summary, source_p = run_demo(workspace, case)
    k = summary["kpis"]
    kinds = [v["kind"] for v in summary["violations"]]
    over, under, load = (kinds.count(x) for x in ("overvoltage", "undervoltage", "overloading"))
    reverse_flow = bool((source_p < 0).any())
    if demo_id == "demo-mv-summer-pv":
        assert k["u_max_pu"] > 1.05 and over >= 1 and load >= 1 and reverse_flow
    elif demo_id == "demo-mv-winter-peak":
        assert k["u_min_pu"] < 0.95 and under >= 1 and k["loading_max"] > 1.2
        assert not reverse_flow
    else:
        assert k["loading_max"] > 1.3 and load >= 10 and over + under == 0
