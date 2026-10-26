"""Per-case network overrides: check them and apply them to a copy of the loaded input data.

Overrides edit the base input arrays (before profiles), so profile `scale` assignments scale the
overridden base values. The network file itself is never changed.
"""

from __future__ import annotations

import dataclasses
import math

import numpy as np
from power_grid_model import CalculationType
from power_grid_model.validation import validate_input_data

from gridsim.models import NetworkOverride, ValidationIssue
from gridsim.networks.base import LoadedNetwork, build_topology
from gridsim.networks.editable import EDITABLE_FIELDS, editable_field


def _label(net: LoadedNetwork, o: NetworkOverride) -> str:
    name = net.name_of(o.component, o.id)
    return f"Override {o.component} '{name}' (id {o.id}) field '{o.field}'"


def _id_name(net: LoadedNetwork, i: object) -> str:
    if isinstance(i, tuple):
        return f"'{net.name_of(str(i[0]), int(i[1]))}'"
    return f"'{net.names.get(int(i), i)}'"  # type: ignore[call-overload]


def _check_one(net: LoadedNetwork, o: NetworkOverride, pos: dict[int, int] | None) -> str | None:
    """Return an error message for one override, or None if it is acceptable."""
    if o.component not in EDITABLE_FIELDS:
        return f"Override on unknown or non-editable component '{o.component}' (id {o.id})"
    arr = net.input_data.get(o.component)
    if arr is None or pos is None or o.id not in pos:
        return f"Override {o.component} id {o.id}: element not in network"
    spec = editable_field(o.component, o.field)
    label = _label(net, o)
    if spec is None or o.field not in (arr.dtype.names or ()):
        return f"{label}: field is not editable"
    v = o.value
    if not math.isfinite(v):
        return f"{label}: value must be a finite number"
    if spec.kind == "bool" and v not in (0, 1):
        return f"{label}: value must be 0 or 1"
    if spec.kind == "int" and v != int(v):
        return f"{label}: value must be an integer"
    lo, hi = spec.min, spec.max
    if o.component == "transformer" and o.field == "tap_pos":
        row = arr[pos[o.id]]
        a, b = int(row["tap_min"]), int(row["tap_max"])
        lo, hi = min(a, b), max(a, b)
    if lo is not None and v < lo:
        return f"{label}: value {v:g} is below the minimum {lo:g}"
    if hi is not None and v > hi:
        return f"{label}: value {v:g} is above the maximum {hi:g}"
    return None


def check_overrides(net: LoadedNetwork, overrides: list[NetworkOverride]) -> list[ValidationIssue]:
    """Validate overrides; if they are individually fine, run PGM input validation on the result."""
    issues: list[ValidationIssue] = []
    positions: dict[str, dict[int, int]] = {
        c: {int(i): k for k, i in enumerate(net.input_data[c]["id"])}
        for c in EDITABLE_FIELDS
        if c in net.input_data
    }
    seen: set[tuple[str, int, str]] = set()
    for o in overrides:
        key = (o.component, o.id, o.field)
        if key in seen:
            issues.append(
                ValidationIssue(level="error", message=f"{_label(net, o)}: duplicate override")
            )
            continue
        seen.add(key)
        msg = _check_one(net, o, positions.get(o.component))
        if msg:
            issues.append(ValidationIssue(level="error", message=msg))
    if issues or not overrides:
        return issues
    data = _apply(net, overrides)
    errors = validate_input_data(data, calculation_type=CalculationType.power_flow) or []
    for e in errors:
        ids = e.ids or []
        named = ", ".join(_id_name(net, i) for i in ids[:5])
        suffix = f" ({named})" if named else ""
        issues.append(ValidationIssue(level="error", message=f"After overrides: {e}{suffix}"))
    return issues


def _apply(net: LoadedNetwork, overrides: list[NetworkOverride]) -> dict[str, np.ndarray]:
    data = dict(net.input_data)
    for comp in {o.component for o in overrides}:
        data[comp] = net.input_data[comp].copy()
    for o in overrides:
        arr = data[o.component]
        idx = np.flatnonzero(arr["id"] == o.id)
        arr[o.field][idx] = o.value
    return data


def apply_overrides(net: LoadedNetwork, overrides: list[NetworkOverride]) -> LoadedNetwork:
    """Return a LoadedNetwork with overrides written into copied input arrays.

    Raises ValueError if any override is invalid (callers normally validate first).
    """
    if not overrides:
        return net
    errors = [i.message for i in check_overrides(net, overrides) if i.level == "error"]
    if errors:
        raise ValueError("; ".join(errors[:5]))
    data = _apply(net, overrides)
    topo = build_topology(net.source, net.key, net.name, data, net.names)
    return dataclasses.replace(net, input_data=data, topology=topo)
