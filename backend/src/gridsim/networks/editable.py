"""Editable equipment parameters (per-case network overrides).

`EDITABLE_FIELDS` lists, per PGM component, the input attributes a case may override on top
of the unchanged network file. Values are stored in SI/PGM units; `unit` and `scale` tell the
UI how to display them (`display = value * scale`).

The two branch statuses (`from_status`, `to_status`) are listed separately; the UI shows them as
one "in service" toggle that sets both.

To make a new field editable, add an entry below (and a test). Components missing here have no
editable fields.
"""

from __future__ import annotations

from gridsim.models import EditableField


def _f(field: str, label: str, unit: str = "", scale: float = 1.0, **kw: float) -> EditableField:
    return EditableField(field=field, label=label, unit=unit, scale=scale, kind="float", **kw)


def _b(field: str, label: str) -> EditableField:
    return EditableField(field=field, label=label, kind="bool", min=0, max=1)


_BRANCH_STATUS = [_b("from_status", "In service (from)"), _b("to_status", "In service (to)")]
_APPLIANCE = [
    _f("p_specified", "P", "MW", 1e-6),
    _f("q_specified", "Q", "Mvar", 1e-6),
    _b("status", "In service"),
]

EDITABLE_FIELDS: dict[str, list[EditableField]] = {
    "sym_load": _APPLIANCE,
    "sym_gen": _APPLIANCE,
    "line": [
        _f("r1", "R1", "Ω", 1.0, min=0),
        _f("x1", "X1", "Ω", 1.0),
        _f("c1", "C1", "µF", 1e6, min=0),
        _f("i_n", "Rated current", "A", 1.0, min=0),
        *_BRANCH_STATUS,
    ],
    "transformer": [
        _f("sn", "Rated power", "MVA", 1e-6, min=0),
        # Range is per element (tap_min..tap_max) and checked in overrides.py.
        EditableField(field="tap_pos", label="Tap position", kind="int"),
        *_BRANCH_STATUS,
    ],
    "link": list(_BRANCH_STATUS),
    "source": [_f("u_ref", "U ref", "pu", 1.0, min=0)],
}


def editable_fields(component: str) -> list[EditableField]:
    return EDITABLE_FIELDS.get(component, [])


def editable_field(component: str, field: str) -> EditableField | None:
    return next((f for f in editable_fields(component) if f.field == field), None)
