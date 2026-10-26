"""Per-case network overrides (editable equipment parameters)."""

import json

import pyarrow.parquet as pq
import pytest
from fastapi.testclient import TestClient

from gridsim.api import create_app
from gridsim.models import NetworkOverride
from gridsim.networks import load_network
from gridsim.networks.editable import EDITABLE_FIELDS
from gridsim.networks.overrides import apply_overrides
from gridsim.studies import STUDY_TYPES
from gridsim.validation import validate_case

from .conftest import make_case
from .test_api import wait_done

LINE = 47  # vision_mv line "R1"-ish, i_n = 360 A
LOAD = 104  # vision_mv sym_load, p_specified = 1.5 MW


def _run(workspace, name: str, overrides: list[NetworkOverride]):
    case = make_case(network_overrides=overrides)
    assert validate_case(case).ok, validate_case(case).issues
    run_dir = workspace.runs_dir / f"r-20260101-000000-{name}"
    run_dir.mkdir()
    net = load_network("sample", "vision_mv")
    study = STUDY_TYPES.get("timeseries_powerflow")
    outcome = study.run(name, case, net, run_dir, lambda p, m: None, lambda: False)
    return outcome.summary, run_dir


def test_apply_overrides_copies_input() -> None:
    net = load_network("sample", "vision_mv")
    o = NetworkOverride(component="sym_load", id=LOAD, field="p_specified", value=3e6)
    new = apply_overrides(net, [o])
    assert new is not net
    assert new.input_data["sym_load"]["p_specified"][0] == 3e6
    assert net.input_data["sym_load"]["p_specified"][0] == 1.5e6  # cached network untouched
    assert apply_overrides(net, []) is net


def test_lower_line_rating_raises_loading(workspace) -> None:
    base, _ = _run(workspace, "aaaa", [])
    low, _ = _run(
        workspace, "aaab", [NetworkOverride(component="line", id=LINE, field="i_n", value=90.0)]
    )
    lb = next(b for b in base.branches if b.id == LINE).loading_max
    ll = next(b for b in low.branches if b.id == LINE).loading_max
    assert lb is not None and ll is not None
    assert ll == pytest.approx(4 * lb, rel=1e-6)


def test_doubled_load_p_raises_it(workspace) -> None:
    _, d0 = _run(workspace, "bbba", [])
    o = NetworkOverride(component="sym_load", id=LOAD, field="p_specified", value=3e6)
    _, d1 = _run(workspace, "bbbb", [o])

    def p_of(d) -> list[float]:
        df = pq.read_table(d / "appliance.parquet").to_pandas()
        return df[df["id"] == LOAD].sort_values("t")["p"].tolist()

    p0, p1 = p_of(d0), p_of(d1)
    assert len(p0) == 24 and max(p0) > 0
    assert p1 == pytest.approx([2 * v for v in p0], rel=1e-4)


def test_invalid_overrides_give_clear_errors() -> None:
    bad = [
        NetworkOverride(component="node", id=0, field="u_rated", value=1.0),
        NetworkOverride(component="sym_load", id=9999, field="p_specified", value=1.0),
        NetworkOverride(component="sym_load", id=LOAD, field="type", value=1.0),
        NetworkOverride(component="line", id=LINE, field="i_n", value=-5.0),
        NetworkOverride(component="sym_load", id=LOAD, field="status", value=0.5),
        NetworkOverride(component="transformer", id=77, field="tap_pos", value=20),
        NetworkOverride(component="transformer", id=77, field="tap_pos", value=1.5),
    ]
    res = validate_case(make_case(network_overrides=bad))
    assert not res.ok
    text = " | ".join(i.message for i in res.issues if i.level == "error")
    assert "unknown or non-editable component 'node'" in text
    assert "sym_load id 9999: element not in network" in text
    assert "field 'type': field is not editable" in text
    assert "field 'i_n': value -5 is below the minimum 0" in text
    assert "value must be 0 or 1" in text
    assert "value 20 is above the maximum 12" in text
    assert "duplicate override" in text  # second tap_pos override on the same element


def test_pgm_validation_after_overrides() -> None:
    # sn = 0 passes our min (inclusive) but PGM requires sn > 0.
    o = NetworkOverride(component="transformer", id=77, field="sn", value=0.0)
    res = validate_case(make_case(network_overrides=[o]))
    msgs = [i.message for i in res.issues if i.level == "error"]
    assert any(m.startswith("After overrides:") and "sn" in m for m in msgs), msgs


def test_api_editable_fields_topology_params_and_frozen_case(workspace) -> None:
    with TestClient(create_app()) as client:
        fields = client.get("/api/networks/editable-fields").json()
        assert set(fields) == set(EDITABLE_FIELDS)
        p = next(f for f in fields["sym_load"] if f["field"] == "p_specified")
        assert p == {
            "field": "p_specified",
            "label": "P",
            "unit": "MW",
            "scale": 1e-6,
            "kind": "float",
            "min": None,
            "max": None,
        }
        assert [f["field"] for f in fields["link"]] == ["from_status", "to_status"]

        topo = client.get("/api/networks/sample/vision_mv").json()
        load = next(a for a in topo["appliances"] if a["id"] == LOAD)
        assert load["params"] == {"p_specified": 1.5e6, "q_specified": 1e6, "status": 1.0}
        line = next(b for b in topo["branches"] if b["id"] == LINE)
        assert set(line["params"]) == {"r1", "x1", "c1", "i_n", "from_status", "to_status"}
        assert topo["sources"][0]["params"] == {"u_ref": topo["sources"][0]["u_ref"]}

        body = json.loads(make_case().model_dump_json())
        body.pop("id")
        ov = {"component": "sym_load", "id": LOAD, "field": "p_specified", "value": 3e6}
        body["network_overrides"] = [ov]
        case = client.post("/api/cases", json=body).json()
        assert case["network_overrides"] == [ov]
        r = client.post(f"/api/cases/{case['id']}/runs")
        assert r.status_code == 202, r.text
        frozen = client.get(f"/api/runs/{r.json()['id']}/case").json()
        assert frozen["network_overrides"] == [ov]
        assert wait_done(client, r.json()["id"])["status"] == "succeeded"

        body["network_overrides"] = [{**ov, "id": 9999}]
        bad = client.post("/api/cases", json=body).json()
        r = client.post(f"/api/cases/{bad['id']}/runs")
        assert r.status_code == 422
        assert "element not in network" in json.dumps(r.json())
