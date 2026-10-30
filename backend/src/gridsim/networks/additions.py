"""Per-case network additions: check them and append them to copies of the loaded input arrays.

Additions are applied before overrides (`networks/overrides.py`), so a case may override an added
element like any file element. The network file itself is never changed. What may be added, and
with which fields, is the registry in `networks/addable.py`.
"""

from __future__ import annotations

import dataclasses
import math

import numpy as np
from power_grid_model import CalculationType, initialize_array
from power_grid_model.validation import validate_input_data

from gridsim.models import NetworkAddition, ValidationIssue
from gridsim.networks.addable import addable_spec
from gridsim.networks.base import LoadedNetwork, build_topology

NODE_REFS = ("node", "from_node", "to_node")


def _label(a: NetworkAddition) -> str:
    return f"New {a.component} '{a.name}' (id {a.id})"


def _existing_ids(net: LoadedNetwork) -> set[int]:
    return {int(i) for arr in net.input_data.values() for i in arr["id"]}


def _check_attrs(
    a: NetworkAddition, nodes: set[int], u_rated: dict[int, float]
) -> tuple[list[str], list[str]]:
    """Errors and warnings for one addition's attributes."""
    spec = addable_spec(a.component)
    assert spec is not None
    label = _label(a)
    errors: list[str] = []
    warnings: list[str] = []
    dtype_names = initialize_array("input", a.component, 0).dtype.names or ()
    fields = {f.field: f for f in spec.fields}
    for k, v in a.attrs.items():
        if k == "id" or k not in dtype_names or (k not in fields and k not in spec.fixed):
            errors.append(f"{label}: unknown attribute '{k}'")
        elif not math.isfinite(v):
            errors.append(f"{label}: '{k}' must be a finite number")
    if errors:
        return errors, warnings
    for f in spec.fields:
        v = a.attrs.get(f.field)
        if v is None:
            if f.required:
                errors.append(f"{label}: missing required attribute '{f.field}' ({f.label})")
            continue
        if f.kind == "node":
            if v != int(v) or int(v) not in nodes:
                errors.append(f"{label}: {f.label.lower()} {v:g} is not a node of the network")
            continue
        if f.kind == "bool" and v not in (0, 1):
            errors.append(f"{label}: '{f.field}' must be 0 or 1")
        if f.kind == "int" and v != int(v):
            errors.append(f"{label}: '{f.field}' must be an integer")
        if f.min is not None and v < f.min:
            errors.append(f"{label}: '{f.field}' {v:g} is below the minimum {f.min:g}")
        if f.max is not None and v > f.max:
            errors.append(f"{label}: '{f.field}' {v:g} is above the maximum {f.max:g}")
    for k in ("status", "from_status", "to_status"):
        if k in a.attrs and a.attrs[k] not in (0, 1):
            errors.append(f"{label}: '{k}' must be 0 or 1")
    if errors:
        return errors, warnings
    if "from_node" in a.attrs and "to_node" in a.attrs:
        fn, tn = int(a.attrs["from_node"]), int(a.attrs["to_node"])
        if fn == tn:
            errors.append(f"{label}: from node and to node must differ")
        elif (
            a.component == "link"
            and fn in u_rated
            and tn in u_rated
            and not math.isclose(u_rated[fn], u_rated[tn], rel_tol=1e-9)
        ):
            warnings.append(
                f"{label}: connects nodes of different rated voltage "
                f"({u_rated[fn] / 1e3:g} kV and {u_rated[tn] / 1e3:g} kV)"
            )
    return errors, warnings


def _apply(net: LoadedNetwork, additions: list[NetworkAddition]) -> LoadedNetwork:
    data = dict(net.input_data)
    by_comp: dict[str, list[NetworkAddition]] = {}
    for a in additions:
        by_comp.setdefault(a.component, []).append(a)
    for comp, items in by_comp.items():
        spec = addable_spec(comp)
        assert spec is not None
        new = initialize_array("input", comp, len(items))
        for k, a in enumerate(items):
            new["id"][k] = a.id
            for field, value in {**spec.fixed, **a.attrs}.items():
                new[field][k] = value
        old = data.get(comp)
        data[comp] = new if old is None else np.concatenate([old, new])
    names = {**net.names, **{a.id: a.name for a in additions}}
    topo = build_topology(net.source, net.key, net.name, data, names)
    return dataclasses.replace(net, input_data=data, names=names, topology=topo)


def check_additions(net: LoadedNetwork, additions: list[NetworkAddition]) -> list[ValidationIssue]:
    """Validate additions; if they are individually fine, run PGM input validation on the result."""
    issues: list[ValidationIssue] = []

    def err(msg: str) -> None:
        issues.append(ValidationIssue(level="error", message=msg))

    existing = _existing_ids(net)
    u_rated = {int(r["id"]): float(r["u_rated"]) for r in net.input_data.get("node", [])}
    for a in additions:
        if a.component == "node" and math.isfinite(a.attrs.get("u_rated", math.nan)):
            u_rated.setdefault(a.id, a.attrs["u_rated"])
    nodes = set(u_rated) | {a.id for a in additions if a.component == "node"}
    seen: set[int] = set()
    for a in additions:
        if addable_spec(a.component) is None:
            err(f"New element '{a.name}' (id {a.id}): component '{a.component}' cannot be added")
            continue
        if a.id in seen:
            err(f"{_label(a)}: duplicate id among the new elements")
            continue
        seen.add(a.id)
        if a.id in existing:
            err(f"{_label(a)}: id is already used by '{net.names.get(a.id, a.id)}' in the network")
            continue
        errors, warnings = _check_attrs(a, nodes, u_rated)
        for m in errors:
            err(m)
        issues += [ValidationIssue(level="warning", message=m) for m in warnings]
    if any(i.level == "error" for i in issues) or not additions:
        return issues
    new = _apply(net, additions)
    for e in validate_input_data(new.input_data, calculation_type=CalculationType.power_flow) or []:
        ids = e.ids or []
        named = ", ".join(
            f"'{new.names.get(int(i[1] if isinstance(i, tuple) else i), i)}'"  # type: ignore[call-overload]
            for i in ids[:5]
        )
        suffix = f" ({named})" if named else ""
        err(f"After additions: {e}{suffix}")
    return issues


def apply_additions(net: LoadedNetwork, additions: list[NetworkAddition]) -> LoadedNetwork:
    """Return a LoadedNetwork with the additions appended to copied input arrays.

    Raises ValueError if any addition is invalid (callers normally validate first).
    """
    if not additions:
        return net
    errors = [i.message for i in check_additions(net, additions) if i.level == "error"]
    if errors:
        raise ValueError("; ".join(errors[:5]))
    return _apply(net, additions)
