"""Per-case network additions (new equipment on top of the unchanged network file)."""

import json

import numpy as np
import pyarrow.parquet as pq
import pytest
from fastapi.testclient import TestClient
from power_grid_model import ComponentType, PowerGridModel

from gridsim.api import create_app
from gridsim.models import (
    CaseStudy,
    NetworkAddition,
    NetworkOverride,
    NetworkRef,
    Position,
    ProfileAssignment,
    ProfileTarget,
)
from gridsim.networks import load_network
from gridsim.networks.addable import ADDABLE, ADDABLE_COMPONENTS
from gridsim.networks.additions import apply_additions, check_additions
from gridsim.studies import STUDY_TYPES
from gridsim.validation import validate_case

from .conftest import make_case
from .test_api import wait_done

NODE = 5  # vision_mv "KNP 3", 10.5 kV
U = 10_500.0
LINE_ATTRS = {"r1": 0.206, "x1": 0.11, "c1": 0.33e-6, "i_n": 315.0}


def _node(i: int = 1000, u: float = U, name: str = "New node") -> NetworkAddition:
    return NetworkAddition(component="node", id=i, name=name, attrs={"u_rated": u})


def _line(i: int = 1001, a: int = NODE, b: int = 1000, **kw: float) -> NetworkAddition:
    attrs = {"from_node": a, "to_node": b, **LINE_ATTRS, **kw}
    return NetworkAddition(component="line", id=i, name="New line", attrs=attrs)


def _load(i: int = 1002, node: int = 1000, p: float = 1e6) -> NetworkAddition:
    attrs = {"node": node, "p_specified": p, "q_specified": 0.0}
    return NetworkAddition(component="sym_load", id=i, name="New load", attrs=attrs)


def _base() -> list[NetworkAddition]:
    return [_node(), _line(), _load()]


def _errors(net, additions) -> str:
    return " | ".join(i.message for i in check_additions(net, additions) if i.level == "error")


def test_registry_shape() -> None:
    assert [s.component for s in ADDABLE_COMPONENTS] == [
        "node",
        "line",
        "link",
        "sym_load",
        "sym_gen",
        "shunt",
    ]
    line = ADDABLE["line"]
    assert line.kind == "branch"
    assert {f.field: f.default for f in line.fields} == {
        "from_node": None,
        "to_node": None,
        "r1": 0.206,
        "x1": 0.11,
        "c1": 0.33e-6,
        "i_n": 315.0,
    }
    assert line.fixed == {"from_status": 1.0, "to_status": 1.0, "tan1": 0.0}
    assert ADDABLE["sym_load"].fixed == {"status": 1.0, "type": 0.0}


@pytest.mark.parametrize(
    "addition",
    [
        _node(),
        _line(),
        NetworkAddition(
            component="link", id=1001, name="L", attrs={"from_node": NODE, "to_node": 1000}
        ),
        _load(),
        NetworkAddition(
            component="sym_gen",
            id=1002,
            name="G",
            attrs={"node": 1000, "p_specified": 2e5, "q_specified": 0},
        ),
        NetworkAddition(component="shunt", id=1002, name="S", attrs={"node": 1000, "b1": 1e-5}),
    ],
    ids=lambda a: a.component,
)
def test_apply_each_component(addition: NetworkAddition) -> None:
    net = load_network("sample", "vision_mv")
    adds = [addition] if addition.component == "node" else [_node(), addition]
    if addition.component in ("sym_load", "sym_gen", "shunt"):
        adds.insert(1, _line())
    assert check_additions(net, adds) == []
    new = apply_additions(net, adds)
    comp = addition.component
    arr = new.input_data[comp]
    assert len(arr) == len(net.input_data[comp]) + 1
    assert len(net.input_data[comp]) == net.counts[comp]  # cached network untouched
    row = arr[arr["id"] == addition.id][0]
    for k, v in addition.attrs.items():
        assert row[k] == pytest.approx(v)
    for k, v in ADDABLE[comp].fixed.items():
        if k not in addition.attrs:
            assert row[k] == v
    assert new.names[addition.id] == addition.name
    assert new.topology.counts[comp] == net.counts[comp] + 1
    PowerGridModel(new.input_data).calculate_power_flow()


def test_apply_creates_missing_component_array() -> None:
    net = load_network("sample", "ieee14")
    assert "line" not in net.input_data
    add = _line(i=900, a=1, b=2)
    assert check_additions(net, [add]) == []
    new = apply_additions(net, [add])
    assert list(new.input_data["line"]["id"]) == [900]
    branch = next(b for b in new.topology.branches if b.id == 900)
    assert branch.type == "line" and branch.name == "New line" and branch.in_service
    assert branch.params["r1"] == pytest.approx(0.206)
    assert apply_additions(net, []) is net


def test_added_load_lowers_voltage() -> None:
    net = load_network("sample", "vision_mv")

    def u_new(p: float) -> float:
        new = apply_additions(net, [_node(), _line(), _load(p=p)])
        out = PowerGridModel(new.input_data).calculate_power_flow()[ComponentType.node]
        return float(out["u_pu"][out["id"] == 1000][0])

    assert u_new(3e6) < u_new(0.0) - 1e-3


def test_validation_errors() -> None:
    net = load_network("sample", "vision_mv")
    cases = {
        "duplicate id among the new elements": [_node(), _node(name="Twin")],
        "id is already used by": [_node(i=NODE)],
        "missing required attribute 'u_rated'": [
            NetworkAddition(component="node", id=1000, name="N", attrs={})
        ],
        "to node 999 is not a node of the network": [_line(b=999)],
        "from node and to node must differ": [_node(), _line(a=1000, b=1000)],
        "'r1' must be a finite number": [_node(), _line(r1=float("nan"))],
        "unknown attribute 'foo'": [
            NetworkAddition(component="node", id=1000, name="N", attrs={"u_rated": U, "foo": 1})
        ],
        "'i_n' -1 is below the minimum 0": [_node(), _line(i_n=-1.0)],
        "'status' must be 0 or 1": [
            NetworkAddition(
                component="sym_load",
                id=1002,
                name="L",
                attrs={"node": NODE, "p_specified": 1, "q_specified": 0, "status": 2},
            )
        ],
    }
    for expected, adds in cases.items():
        text = _errors(net, adds)
        assert expected in text, (expected, text)
    with pytest.raises(ValueError, match="already used"):
        apply_additions(net, [_node(i=NODE)])


def test_unknown_component_is_rejected_by_the_model() -> None:
    with pytest.raises(ValueError):
        NetworkAddition.model_validate({"component": "transformer", "id": 1, "name": "T"})
    with pytest.raises(ValueError):
        NetworkAddition.model_validate({"component": "node", "id": 1, "name": ""})


def test_link_between_voltage_levels_is_a_warning() -> None:
    net = load_network("sample", "vision_mv")
    lv = _node(u=400.0)
    link = NetworkAddition(
        component="link", id=1001, name="Lk", attrs={"from_node": NODE, "to_node": 1000}
    )
    issues = check_additions(net, [lv, link])
    assert [i.level for i in issues] == ["warning"]
    assert "different rated voltage (10.5 kV and 0.4 kV)" in issues[0].message


def test_pgm_validation_after_additions() -> None:
    # u_rated passes our min but a line from 10.5 kV to an isolated tiny node is fine for PGM;
    # x1 = r1 = 0 on a line is rejected by PGM (zero impedance).
    net = load_network("sample", "vision_mv")
    text = _errors(net, [_node(), _line(r1=0.0, x1=0.0)])
    assert "After additions:" in text and "New line" in text, text


def test_overrides_on_added_elements_and_case_validation() -> None:
    o = NetworkOverride(component="sym_load", id=1002, field="p_specified", value=2e6)
    case = make_case(network_additions=_base(), network_overrides=[o])
    res = validate_case(case)
    assert res.ok, res.issues
    bad = make_case(network_additions=[_node(i=NODE)], network_overrides=[o])
    res = validate_case(bad)
    assert not res.ok
    msgs = [i.message for i in res.issues]
    assert any("already used" in m for m in msgs)
    assert not any("element not in network" in m for m in msgs)  # no follow-on noise


def test_profile_targets_may_refer_to_added_elements() -> None:
    a = ProfileAssignment(
        id="a1",
        generator="residential_load",
        target=ProfileTarget(component="sym_load", ids=[1002, 104]),
    )
    assert validate_case(make_case(network_additions=_base(), profile_assignments=[a])).ok
    assert not validate_case(make_case(profile_assignments=[a])).ok


def test_case_json_round_trip() -> None:
    placed = NetworkAddition(
        component="node",
        id=1003,
        name="Placed",
        attrs={"u_rated": U},
        position=Position(x=1.5, y=-2),
    )
    adds = [*_base(), placed]
    case = make_case(network_additions=adds)
    back = CaseStudy.model_validate_json(case.model_dump_json())
    assert back.network_additions == case.network_additions
    assert back.network_additions[-1].position is not None
    assert back.network_additions[-1].position.x == 1.5
    assert (
        CaseStudy.model_validate(json.loads(make_case().model_dump_json())).network_additions == []
    )


def test_run_with_additions(workspace) -> None:
    case = make_case(network_additions=_base())
    run_dir = workspace.runs_dir / "r-20260101-000000-adds"
    run_dir.mkdir()
    study = STUDY_TYPES.get("timeseries_powerflow")
    net = load_network("sample", "vision_mv")
    summary = study.run("adds", case, net, run_dir, lambda p, m: None, lambda: False).summary
    node = next(n for n in summary.nodes if n.id == 1000)
    assert node.name == "New node" and node.u_min_pu is not None
    assert next(b for b in summary.branches if b.id == 1001).name == "New line"
    df = pq.read_table(run_dir / "appliance.parquet").to_pandas()
    p = df[df["id"] == 1002].sort_values("t")["p"].to_numpy()
    assert len(p) == 24 and np.all(p > 0)  # residential profile (ids: null) scales the added load


def test_api_addable_fields_and_run(workspace) -> None:
    with TestClient(create_app()) as client:
        specs = client.get("/api/networks/addable-fields").json()
        assert [s["component"] for s in specs] == [s.component for s in ADDABLE_COMPONENTS]
        node = specs[0]
        assert node["kind"] == "node" and node["fields"][0]["field"] == "u_rated"
        assert node["fields"][0]["kind"] == "float" and node["fields"][0]["required"] is True

        body = json.loads(make_case().model_dump_json())
        body.pop("id")
        body["network_additions"] = [json.loads(a.model_dump_json()) for a in _base()]
        case = client.post("/api/cases", json=body).json()
        assert case["network_additions"] == body["network_additions"]
        r = client.post(f"/api/cases/{case['id']}/runs")
        assert r.status_code == 202, r.text
        run_id = r.json()["id"]
        assert (
            client.get(f"/api/runs/{run_id}/case").json()["network_additions"]
            == body["network_additions"]
        )
        assert wait_done(client, run_id)["status"] == "succeeded"
        ts = client.get(
            f"/api/runs/{run_id}/timeseries?component=appliance&field=p&ids=1002"
        ).json()
        assert ts["series"][0]["name"] == "New load"

        body["network_additions"][1]["attrs"]["to_node"] = 4242
        bad = client.post("/api/cases", json=body).json()
        r = client.post(f"/api/cases/{bad['id']}/runs")
        assert r.status_code == 422
        assert "is not a node of the network" in json.dumps(r.json())


def test_ieee14_network_ref_still_validates_with_additions() -> None:
    case = make_case(
        network=NetworkRef(source="sample", key="ieee14"),
        profile_assignments=[],
        network_additions=[
            _node(i=900, u=138_000.0),
            _line(i=901, a=1, b=900),
            _load(i=902, node=900),
        ],
    )
    assert validate_case(case).ok, validate_case(case).issues
