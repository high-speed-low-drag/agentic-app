"""Read-side queries on run results (timeseries, envelope, heatmap, snapshot)."""

from __future__ import annotations

import threading
import warnings
from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow.parquet as pq

from gridsim.models import (
    CaseStudy,
    EnvelopeResponse,
    HeatmapResponse,
    SnapshotResponse,
    TimeseriesResponse,
    TimeseriesSeries,
)
from gridsim.results.groups import GROUPS
from gridsim.workspace import read_json


class QueryError(ValueError):
    """Bad query parameters (unknown field, index out of range, ...)."""


@dataclass
class Dense:
    ids: np.ndarray
    names: list[str]
    values: np.ndarray  # (T, E)


def to_list(a: np.ndarray) -> list[float | None]:
    return [None if v != v else v for v in np.asarray(a, dtype=float).tolist()]


class ResultStore:
    """Loads (run, component, field) as dense arrays with a small LRU cache."""

    def __init__(self, max_entries: int = 32) -> None:
        self._cache: OrderedDict[tuple[str, str, str], Dense] = OrderedDict()
        self._lock = threading.Lock()
        self.max_entries = max_entries

    def invalidate(self, run_dir: Path) -> None:
        with self._lock:
            for k in [k for k in self._cache if k[0] == str(run_dir)]:
                del self._cache[k]

    @staticmethod
    def timestamps(run_dir: Path) -> pd.DatetimeIndex:
        return CaseStudy.model_validate(read_json(run_dir / "case.json")).time.timestamps()

    @staticmethod
    def unit(component: str, field: str) -> str:
        fields = GROUPS[component].fields
        if field not in fields:
            raise QueryError(
                f"Unknown field '{field}' for {component}; available: {', '.join(fields)}"
            )
        return fields[field]

    def dense(self, run_dir: Path, component: str, field: str) -> Dense:
        self.unit(component, field)
        key = (str(run_dir), component, field)
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
                return self._cache[key]
        d = self._load(run_dir, component, field)
        with self._lock:
            self._cache[key] = d
            while len(self._cache) > self.max_entries:
                self._cache.popitem(last=False)
        return d

    def _load(self, run_dir: Path, component: str, field: str) -> Dense:
        el = read_json(run_dir / "elements.json")[component]
        ids = np.asarray(el["ids"], dtype=np.int64)
        n_t = len(self.timestamps(run_dir))
        values = np.full((n_t, len(ids)), np.nan)
        path = run_dir / f"{component}.parquet"
        if len(ids) and path.exists():
            table = pq.read_table(path, columns=["t", "id", field])
            t = table.column("t").to_numpy()
            pos = _index(ids, table.column("id").to_numpy())
            values[t, pos] = table.column(field).to_numpy(zero_copy_only=False)
        return Dense(ids, list(el["names"]), values)

    # --- queries ------------------------------------------------------------------------------

    def timeseries(
        self, run_dir: Path, component: str, field: str, ids: list[int] | None
    ) -> TimeseriesResponse:
        unit = self.unit(component, field)
        d = self.dense(run_dir, component, field)
        cols = range(len(d.ids)) if ids is None else [self._col(d, i) for i in ids]
        return TimeseriesResponse(
            timestamps=_dt(self.timestamps(run_dir)),
            field=field,
            unit=unit,
            series=[
                TimeseriesSeries(id=int(d.ids[c]), name=d.names[c], values=to_list(d.values[:, c]))
                for c in cols
            ],
        )

    def envelope(self, run_dir: Path, component: str, field: str) -> EnvelopeResponse:
        unit = self.unit(component, field)
        v = self.dense(run_dir, component, field).values
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            if v.shape[1] == 0:
                v = np.full((v.shape[0], 1), np.nan)
            pct = np.percentile if not np.isnan(v).any() else np.nanpercentile  # fast path
            p05, p95 = pct(v, [5, 95], axis=1)
            stats = {
                "min": np.nanmin(v, 1),
                "mean": np.nanmean(v, 1),
                "max": np.nanmax(v, 1),
                "p05": p05,
                "p95": p95,
            }
        return EnvelopeResponse(
            timestamps=_dt(self.timestamps(run_dir)),
            field=field,
            unit=unit,
            **{k: to_list(a) for k, a in stats.items()},
        )

    def heatmap(
        self, run_dir: Path, component: str, field: str, max_columns: int
    ) -> HeatmapResponse:
        self.unit(component, field)
        d = self.dense(run_dir, component, field)
        ts = self.timestamps(run_dir)
        n_t = len(ts)
        nb = max(1, min(n_t, max_columns))
        edges = np.linspace(0, n_t, nb + 1).astype(np.int64)[:-1]
        edges = np.unique(edges)
        if d.values.shape[1] == 0:
            return HeatmapResponse(timestamps=_dt(ts[edges]), ids=[], names=[], values=[])
        buckets = np.fmax.reduceat(d.values, edges, axis=0)  # (nb, E)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            peak = np.nanmax(d.values, axis=0)
        order = np.argsort(np.where(np.isnan(peak), -np.inf, -peak), kind="stable")
        return HeatmapResponse(
            timestamps=_dt(ts[edges]),
            ids=[int(d.ids[i]) for i in order],
            names=[d.names[i] for i in order],
            values=[to_list(buckets[:, i]) for i in order],
        )

    def snapshot(self, run_dir: Path, t: int) -> SnapshotResponse:
        ts = self.timestamps(run_dir)
        if not 0 <= t < len(ts):
            raise QueryError(f"Timestep index {t} out of range 0..{len(ts) - 1}")
        u = self.dense(run_dir, "node", "u_pu")
        ld = self.dense(run_dir, "branch", "loading")
        return SnapshotResponse(
            index=t,
            timestamp=ts[t].to_pydatetime(),
            nodes=dict(zip((str(i) for i in u.ids), to_list(u.values[t]), strict=True)),
            branches=dict(zip((str(i) for i in ld.ids), to_list(ld.values[t]), strict=True)),
        )

    @staticmethod
    def _col(d: Dense, element_id: int) -> int:
        hits = np.nonzero(d.ids == element_id)[0]
        if len(hits) == 0:
            raise QueryError(f"Unknown element id {element_id}")
        return int(hits[0])


def _index(ids: np.ndarray, query: np.ndarray) -> np.ndarray:
    order = np.argsort(ids)
    return order[np.searchsorted(ids, query, sorter=order)]


def _dt(ts: pd.DatetimeIndex) -> list[datetime]:
    return list(ts.to_pydatetime())


RESULTS = ResultStore()
