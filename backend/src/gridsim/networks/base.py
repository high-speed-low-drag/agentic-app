"""Network source interface and helpers to turn a PGM JSON file into a `LoadedNetwork`."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Protocol

import numpy as np
from power_grid_model.utils import json_deserialize

from gridsim.models import (
    NetworkItem,
    NetworkTopology,
    TopologyAppliance,
    TopologyBranch,
    TopologyNode,
    TopologySource,
)

BRANCH_TYPES = ("line", "asym_line", "link", "transformer", "generic_branch")
BRANCH3_TYPES = ("three_winding_transformer",)
APPLIANCE_TYPES = ("sym_load", "sym_gen", "asym_load", "asym_gen", "shunt")


@dataclass
class LoadedNetwork:
    """A network ready for calculation: PGM input dataset + names + topology."""

    source: str
    key: str
    name: str
    input_data: dict[str, np.ndarray]
    names: dict[int, str]
    topology: NetworkTopology
    description: str = ""
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def counts(self) -> dict[str, int]:
        return {str(k): int(len(v)) for k, v in self.input_data.items()}

    def name_of(self, component: str, element_id: int) -> str:
        return self.names.get(int(element_id), f"{component} {element_id}")

    def item(self) -> NetworkItem:
        return NetworkItem(
            source=self.source,
            key=self.key,
            name=self.name,
            description=self.description,
            counts=self.counts,
        )


class NetworkSource(Protocol):
    """A provider of networks (bundled samples, uploads, a future lakehouse, ...)."""

    key: str

    def list_items(self) -> list[NetworkItem]: ...

    def load(self, key: str) -> LoadedNetwork: ...


def parse_names(raw_json: str) -> dict[int, str]:
    """Read optional `Name` fields from a PGM JSON file (json_deserialize drops them)."""
    raw = json.loads(raw_json)
    data = raw.get("data", {}) if isinstance(raw, dict) else {}
    names: dict[int, str] = {}
    for elements in data.values() if isinstance(data, dict) else []:
        for el in elements if isinstance(elements, list) else []:
            if isinstance(el, dict) and "id" in el and el.get("Name") not in (None, ""):
                names[int(el["id"])] = str(el["Name"])
    return names


def _status(arr: np.ndarray, *cols: str) -> np.ndarray:
    ok = np.ones(len(arr), dtype=bool)
    for c in cols:
        if c in arr.dtype.names:
            ok &= arr[c] != 0
    return ok


def _float_or_none(v: Any) -> float | None:
    f = float(np.sum(v))  # asym appliances carry 3 phase values
    return None if np.isnan(f) else f


def build_topology(
    source: str, key: str, name: str, data: dict[str, np.ndarray], names: dict[int, str]
) -> NetworkTopology:
    def nm(comp: str, i: int) -> str:
        return names.get(int(i), f"{comp} {int(i)}")

    nodes = [
        TopologyNode(id=int(r["id"]), name=nm("node", r["id"]), u_rated=float(r["u_rated"]))
        for r in data.get("node", [])
    ]
    branches: list[TopologyBranch] = []
    for comp in BRANCH_TYPES:
        arr = data.get(comp)
        if arr is None:
            continue
        ok = _status(arr, "from_status", "to_status")
        for r, s in zip(arr, ok, strict=True):
            branches.append(
                TopologyBranch(
                    id=int(r["id"]),
                    type=comp,
                    name=nm(comp, r["id"]),
                    from_node=int(r["from_node"]),
                    to_node=int(r["to_node"]),
                    in_service=bool(s),
                )
            )
    for comp in BRANCH3_TYPES:
        arr = data.get(comp)
        if arr is None:
            continue
        ok = _status(arr, "status_1", "status_2", "status_3")
        for r, s in zip(arr, ok, strict=True):
            branches.append(
                TopologyBranch(
                    id=int(r["id"]),
                    type=comp,
                    name=nm(comp, r["id"]),
                    from_node=int(r["node_1"]),
                    to_node=int(r["node_2"]),
                    node_3=int(r["node_3"]),
                    in_service=bool(s),
                )
            )
    appliances: list[TopologyAppliance] = []
    for comp in APPLIANCE_TYPES:
        arr = data.get(comp)
        if arr is None:
            continue
        has_pq = "p_specified" in arr.dtype.names
        for r in arr:
            appliances.append(
                TopologyAppliance(
                    id=int(r["id"]),
                    type=comp,
                    name=nm(comp, r["id"]),
                    node=int(r["node"]),
                    p_specified=_float_or_none(r["p_specified"]) if has_pq else None,
                    q_specified=_float_or_none(r["q_specified"]) if has_pq else None,
                    in_service=bool(r["status"] != 0),
                )
            )
    sources = [
        TopologySource(
            id=int(r["id"]),
            name=nm("source", r["id"]),
            node=int(r["node"]),
            u_ref=float(r["u_ref"]),
        )
        for r in data.get("source", [])
    ]
    return NetworkTopology(
        source=source,
        key=key,
        name=name,
        nodes=nodes,
        branches=branches,
        appliances=appliances,
        sources=sources,
        counts={str(k): int(len(v)) for k, v in data.items()},
    )


def load_pgm_json(
    source: str, key: str, name: str, raw_json: str, description: str = ""
) -> LoadedNetwork:
    """Deserialize a PGM JSON input file and build the topology/names."""
    data = json_deserialize(raw_json)
    data = {str(k): v for k, v in data.items()}
    names = parse_names(raw_json)
    topo = build_topology(source, key, name, data, names)
    return LoadedNetwork(
        source=source,
        key=key,
        name=name,
        input_data=data,
        names=names,
        topology=topo,
        description=description,
    )
