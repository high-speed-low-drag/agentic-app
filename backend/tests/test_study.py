import numpy as np
import pyarrow.parquet as pq

from gridsim.networks import load_network
from gridsim.results import RESULTS, find_episodes
from gridsim.results.summary import _episode_extreme
from gridsim.studies import STUDY_TYPES
from gridsim.workspace import write_json_atomic

from .conftest import make_case


def test_find_episodes() -> None:
    mask = np.array(
        [[0, 1], [1, 1], [1, 0], [0, 0], [1, 1]],
        dtype=bool,
    )
    el, start, stop = find_episodes(mask)
    assert list(zip(el, start, stop, strict=True)) == [(0, 1, 3), (0, 4, 5), (1, 0, 2), (1, 4, 5)]
    values = np.array([[5, 1], [3, 2], [4, 9], [9, 9], [2, 0]], dtype=float)
    assert _episode_extreme(values, el, start, stop, use_max=False).tolist() == [3, 2, 1, 0]
    assert _episode_extreme(values, el, start, stop, use_max=True).tolist() == [4, 2, 2, 0]
    assert len(find_episodes(np.zeros((4, 3), bool))[0]) == 0


def test_timeseries_study_end_to_end(workspace) -> None:
    case = make_case()
    net = load_network("sample", "vision_mv")
    study = STUDY_TYPES.get("timeseries_powerflow")
    assert [i for i in study.validate(case, net) if i.level == "error"] == []
    run_dir = workspace.runs_dir / "r-20260101-000000-abcd"
    run_dir.mkdir()
    write_json_atomic(run_dir / "case.json", case)
    progress: list[float] = []
    outcome = study.run("r1", case, net, run_dir, lambda p, m: progress.append(p), lambda: False)

    for name in ("node", "branch", "source", "appliance"):
        assert (run_dir / f"{name}.parquet").exists()
    node = pq.read_table(run_dir / "node.parquet").to_pandas()
    assert len(node) == 24 * 47 and set(node.columns) >= {"t", "id", "u_pu", "u", "u_angle"}
    branch = pq.read_table(run_dir / "branch.parquet").to_pandas()
    assert set(branch["type"].unique()) == {"line", "link", "transformer"}
    assert progress[-1] > 0.9 and progress == sorted(progress)

    s = outcome.summary
    assert s.n_timesteps == 24 and s.kpis.n_failed_timesteps == 0
    assert 0.9 < s.kpis.u_min_pu <= s.kpis.u_max_pu < 1.1
    assert s.kpis.energy_import_mwh > 0 and 0 < s.kpis.energy_losses_mwh < s.kpis.energy_import_mwh
    assert len(s.nodes) == 47 and s.nodes[0].name == "Rail B"
    assert len(s.branches) == 52

    ts = RESULTS.timeseries(run_dir, "node", "u_pu", [0, 3])
    assert len(ts.timestamps) == 24 and ts.series[1].name == "KNP 11"
    env = RESULTS.envelope(run_dir, "branch", "loading")
    assert all(a <= b <= c for a, b, c in zip(env.min, env.mean, env.max, strict=True))
    hm = RESULTS.heatmap(run_dir, "branch", "loading", 5)
    assert len(hm.timestamps) == 5 and len(hm.values[0]) == 5
    peaks = [max(v) for v in hm.values]
    assert peaks == sorted(peaks, reverse=True)


def test_violations_with_tight_limits(workspace) -> None:
    from gridsim.models import Limits

    case = make_case(limits=Limits(u_min_pu=0.99, u_max_pu=1.03, loading_max=0.3))
    net = load_network("sample", "vision_mv")
    run_dir = workspace.runs_dir / "r-20260101-000000-abce"
    run_dir.mkdir()
    s = (
        STUDY_TYPES.get("timeseries_powerflow")
        .run("r2", case, net, run_dir, lambda p, m: None, lambda: False)
        .summary
    )
    assert s.kpis.n_loading_violations > 0 and s.kpis.n_voltage_violations > 0
    v = next(v for v in s.violations if v.kind == "overloading")
    assert v.worst_value > 0.3 and v.n_timesteps >= 1 and v.end >= v.start


def test_validation_errors() -> None:
    from gridsim.models import ProfileAssignment, ProfileTarget

    case = make_case(
        profile_assignments=[
            ProfileAssignment(id="a", generator="nope"),
            ProfileAssignment(
                id="b", generator="ev_charging", mode="add", target=ProfileTarget(ids=[999])
            ),
        ]
    )
    issues = STUDY_TYPES.get("timeseries_powerflow").validate(
        case, load_network("sample", "vision_mv")
    )
    text = " | ".join(i.message for i in issues if i.level == "error")
    assert "unknown profile generator" in text
    assert "not in network" in text and "magnitude_w" in text
