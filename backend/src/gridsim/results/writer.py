"""Streams chunked PGM results into long-format parquet files and keeps summary arrays."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

from gridsim.engine.pgm_adapter import ChunkResult
from gridsim.networks.base import BRANCH3_TYPES, LoadedNetwork
from gridsim.results.groups import GROUPS, pgm_attr
from gridsim.workspace import write_json_atomic


@dataclass
class GroupElements:
    ids: np.ndarray
    names: list[str]
    types: list[str]
    blocks: list[tuple[str, int]] = field(default_factory=list)  # (component, count) in order


def group_elements(net: LoadedNetwork) -> dict[str, GroupElements]:
    out: dict[str, GroupElements] = {}
    for gname, group in GROUPS.items():
        ids: list[int] = []
        names: list[str] = []
        types: list[str] = []
        blocks: list[tuple[str, int]] = []
        for comp in group.components:
            arr = net.input_data.get(comp)
            if arr is None or len(arr) == 0:
                continue
            comp_ids = [int(i) for i in arr["id"]]
            ids += comp_ids
            names += [net.name_of(comp, i) for i in comp_ids]
            types += [comp] * len(comp_ids)
            blocks.append((comp, len(comp_ids)))
        out[gname] = GroupElements(np.asarray(ids, dtype=np.int64), names, types, blocks)
    return out


@dataclass
class Accumulated:
    """Dense arrays needed for the summary (timesteps x elements)."""

    u_pu: np.ndarray
    loading: np.ndarray
    losses_w: np.ndarray
    source_p_w: np.ndarray
    failed: np.ndarray  # bool per timestep


class ResultWriter:
    def __init__(self, run_dir: Path, net: LoadedNetwork, n_steps: int) -> None:
        self.run_dir = run_dir
        self.n_steps = n_steps
        self.elements = group_elements(net)
        self._writers: dict[str, pq.ParquetWriter] = {}
        n_nodes = len(self.elements["node"].ids)
        n_br = len(self.elements["branch"].ids)
        self.acc = Accumulated(
            u_pu=np.full((n_steps, n_nodes), np.nan),
            loading=np.full((n_steps, n_br), np.nan),
            losses_w=np.full(n_steps, np.nan),
            source_p_w=np.full(n_steps, np.nan),
            failed=np.zeros(n_steps, dtype=bool),
        )
        write_json_atomic(
            run_dir / "elements.json",
            {
                g: {"ids": e.ids.tolist(), "names": e.names, "types": e.types}
                for g, e in self.elements.items()
            },
        )

    def _group_values(self, gname: str, out: dict, k: int) -> dict[str, np.ndarray]:
        el = self.elements[gname]
        values = {}
        for f in GROUPS[gname].fields:
            parts = [out[c][pgm_attr(c, f)] for c, _ in el.blocks]
            values[f] = np.hstack(parts) if parts else np.zeros((k, 0))
        return values

    def write_chunk(self, chunk: ChunkResult) -> None:
        s, e, out = chunk.start, chunk.stop, chunk.output
        k = e - s
        self.acc.failed[chunk.failed] = True
        for gname, el in self.elements.items():
            n = len(el.ids)
            if n == 0:
                continue
            values = self._group_values(gname, out, k)
            cols: dict[str, pa.Array] = {
                "t": pa.array(np.repeat(np.arange(s, e, dtype=np.int32), n)),
                "id": pa.array(np.tile(el.ids.astype(np.int32), k)),
            }
            if gname == "branch":
                dictionary = sorted(set(el.types))
                idx = np.array([dictionary.index(t) for t in el.types], dtype=np.int8)
                cols["type"] = pa.DictionaryArray.from_arrays(
                    pa.array(np.tile(idx, k)), pa.array(dictionary)
                )
            for f, v in values.items():
                cols[f] = pa.array(v.reshape(-1))
            table = pa.table(cols)
            if gname not in self._writers:
                self._writers[gname] = pq.ParquetWriter(
                    self.run_dir / f"{gname}.parquet", table.schema, compression="zstd"
                )
            self._writers[gname].write_table(table)

            if gname == "node":
                self.acc.u_pu[s:e] = values["u_pu"]
            elif gname == "branch":
                self.acc.loading[s:e] = values["loading"]
                losses = values["p_from"] + values["p_to"]
                total = losses.sum(axis=1)
                for c, _ in el.blocks:
                    if c in BRANCH3_TYPES:
                        total += out[c]["p_3"].sum(axis=1)
                self.acc.losses_w[s:e] = total
            elif gname == "source":
                self.acc.source_p_w[s:e] = values["p"].sum(axis=1)

    def close(self) -> Accumulated:
        for w in self._writers.values():
            w.close()
        self._writers.clear()
        return self.acc
