"""Result component groups: which PGM components and fields end up in which parquet file."""

from __future__ import annotations

from dataclasses import dataclass

from gridsim.networks.base import APPLIANCE_TYPES, BRANCH3_TYPES, BRANCH_TYPES


@dataclass(frozen=True)
class Group:
    name: str
    components: tuple[str, ...]
    fields: dict[str, str]  # field -> unit


BRANCH_FIELDS = {
    "loading": "pu",
    "p_from": "W",
    "q_from": "var",
    "i_from": "A",
    "s_from": "VA",
    "p_to": "W",
    "q_to": "var",
    "i_to": "A",
}
PQI = {"p": "W", "q": "var", "i": "A"}

NODE_FIELDS = {"u_pu": "pu", "u": "V", "u_angle": "rad", "p": "W", "q": "var"}

GROUPS: dict[str, Group] = {
    "node": Group("node", ("node",), NODE_FIELDS),
    "branch": Group("branch", BRANCH_TYPES + BRANCH3_TYPES, BRANCH_FIELDS),
    "source": Group("source", ("source",), PQI),
    "appliance": Group("appliance", APPLIANCE_TYPES, PQI),
}

# For three-winding transformers, side 1 is "from" and side 2 is "to".
_THREE_WINDING_MAP = {
    "p_from": "p_1",
    "q_from": "q_1",
    "i_from": "i_1",
    "s_from": "s_1",
    "p_to": "p_2",
    "q_to": "q_2",
    "i_to": "i_2",
}


def pgm_attr(component: str, field: str) -> str:
    """Map a unified result field to the PGM output attribute of `component`."""
    if component in BRANCH3_TYPES:
        return _THREE_WINDING_MAP.get(field, field)
    return field


def output_spec(components_present: set[str]) -> dict[str, list[str]]:
    """PGM `output_component_types` filter for all groups (plus p_3 for 3-winding losses)."""
    spec: dict[str, list[str]] = {}
    for group in GROUPS.values():
        for comp in group.components:
            if comp in components_present:
                attrs = [pgm_attr(comp, f) for f in group.fields]
                if comp in BRANCH3_TYPES:
                    attrs.append("p_3")
                spec[comp] = attrs
    return spec
