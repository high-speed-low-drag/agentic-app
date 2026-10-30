"""Addable equipment (per-case network additions).

`ADDABLE_COMPONENTS` lists the PGM components a case may add on top of the unchanged network
file (`CaseStudy.network_additions`), with the fields the "add element" form shows and the PGM
input attributes that are filled automatically (`fixed`). Values are SI/PGM units; `unit` and
`scale` tell the UI how to display them (`display = value * scale`). `kind: node` fields are
node references (PGM ids).

`fixed` holds only what PGM needs for a symmetric power flow and the form does not ask for
(statuses, the load/gen type, the line's `tan1`). An addition's `attrs` may still set them, e.g.
when the element table switches an added branch out of service.

Defaults: lines are a 1 km 10 kV XLPE 3x1x150 mm² Al cable; node `u_rated` has no default (the UI
prefills it from the network). To add a component, add an entry below (and a test); the apply and
validation logic in `networks/additions.py` is generic.
"""

from __future__ import annotations

from gridsim.models import AddableComponentSpec, AddableField


def _f(field: str, label: str, unit: str = "", scale: float = 1.0, **kw: object) -> AddableField:
    return AddableField(field=field, label=label, unit=unit, scale=scale, kind="float", **kw)  # type: ignore[arg-type]


def _node(field: str, label: str) -> AddableField:
    return AddableField(field=field, label=label, kind="node")


_BRANCH_NODES = [_node("from_node", "From node"), _node("to_node", "To node")]
_BRANCH_FIXED = {"from_status": 1.0, "to_status": 1.0}
_PQ_FIXED = {"status": 1.0, "type": 0.0}  # type 0 = const_power


def _pq(p_default: float) -> list[AddableField]:
    return [
        _node("node", "Node"),
        _f("p_specified", "P", "MW", 1e-6, default=p_default),
        _f("q_specified", "Q", "Mvar", 1e-6, default=0.0),
    ]


ADDABLE_COMPONENTS: list[AddableComponentSpec] = [
    AddableComponentSpec(
        component="node",
        label="Node",
        kind="node",
        fields=[_f("u_rated", "Rated voltage", "kV", 1e-3, min=0.001)],
    ),
    AddableComponentSpec(
        component="line",
        label="Line",
        kind="branch",
        fields=[
            *_BRANCH_NODES,
            _f("r1", "R1", "Ω", 1.0, default=0.206, min=0),
            _f("x1", "X1", "Ω", 1.0, default=0.11),
            _f("c1", "C1", "µF", 1e6, default=0.33e-6, min=0),
            _f("i_n", "Rated current", "A", 1.0, default=315.0, min=0),
        ],
        fixed={**_BRANCH_FIXED, "tan1": 0.0},
    ),
    AddableComponentSpec(
        component="link",
        label="Link",
        kind="branch",
        fields=list(_BRANCH_NODES),
        fixed=_BRANCH_FIXED,
    ),
    AddableComponentSpec(
        component="sym_load", label="Load", kind="appliance", fields=_pq(100_000.0), fixed=_PQ_FIXED
    ),
    AddableComponentSpec(
        component="sym_gen",
        label="Generator",
        kind="appliance",
        fields=_pq(100_000.0),
        fixed=_PQ_FIXED,
    ),
    AddableComponentSpec(
        component="shunt",
        label="Shunt",
        kind="appliance",
        fields=[
            _node("node", "Node"),
            _f("g1", "G1", "µS", 1e6, default=0.0, required=False),
            _f("b1", "B1", "µS", 1e6),
        ],
        fixed={"status": 1.0, "g1": 0.0},
    ),
]

ADDABLE: dict[str, AddableComponentSpec] = {s.component: s for s in ADDABLE_COMPONENTS}


def addable_spec(component: str) -> AddableComponentSpec | None:
    return ADDABLE.get(component)
