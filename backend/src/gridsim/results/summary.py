"""KPIs, per-element extremes and violation episodes for a finished run."""

from __future__ import annotations

import warnings
from datetime import datetime

import numpy as np
import pandas as pd

from gridsim.models import (
    BranchExtremes,
    CaseStudy,
    Kpis,
    NodeExtremes,
    ResultSummary,
    Violation,
)
from gridsim.results.writer import Accumulated, GroupElements

MAX_VIOLATIONS = 5000


def find_episodes(mask: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Contiguous True runs per column of a (T, E) mask.

    Returns (element index, start, stop) with `stop` exclusive, sorted by element then start.
    """
    mask = np.asarray(mask, dtype=bool)
    if mask.ndim == 1:
        mask = mask[:, None]
    n_el = mask.shape[1]
    padded = np.zeros((mask.shape[0] + 2, n_el), dtype=np.int8)
    padded[1:-1] = mask
    d = np.diff(padded, axis=0).T  # (E, T+1)
    el_s, starts = np.nonzero(d == 1)
    _, stops = np.nonzero(d == -1)
    return el_s, starts, stops


def _episode_extreme(
    values: np.ndarray, el: np.ndarray, starts: np.ndarray, stops: np.ndarray, use_max: bool
) -> np.ndarray:
    """Min/max of values[start:stop, el] for every episode, vectorised via reduceat."""
    if len(el) == 0:
        return np.zeros(0)
    n_t = values.shape[0]
    flat = np.append(values.T.reshape(-1), np.nan)  # pad so stop index is always valid
    idx = np.empty(2 * len(el), dtype=np.int64)
    idx[0::2] = el * n_t + starts
    idx[1::2] = el * n_t + stops
    fn = np.fmax if use_max else np.fmin
    return fn.reduceat(flat, idx)[0::2]


def _opt(v: float) -> float | None:
    return None if v is None or not np.isfinite(v) else float(v)


def _ts(ts: pd.DatetimeIndex, i: int | None) -> datetime | None:
    return None if i is None else ts[i].to_pydatetime()


def _arg(values: np.ndarray, use_max: bool) -> list[int | None]:
    """Per-column nanargmin/nanargmax, None for all-NaN columns."""
    ok = ~np.all(np.isnan(values), axis=0)
    filled = np.where(np.isnan(values), -np.inf if use_max else np.inf, values)
    arg = filled.argmax(axis=0) if use_max else filled.argmin(axis=0)
    return [int(a) if o else None for a, o in zip(arg, ok, strict=True)]


def _violations(
    component: str,
    kind: str,
    values: np.ndarray,
    mask: np.ndarray,
    limit: float,
    use_max: bool,
    elements: GroupElements,
    ts: pd.DatetimeIndex,
) -> list[Violation]:
    el, starts, stops = find_episodes(mask)
    worst = _episode_extreme(values, el, starts, stops, use_max)
    return [
        Violation(
            component=component,
            id=int(elements.ids[e]),
            name=elements.names[e],
            kind=kind,
            start=ts[s].to_pydatetime(),
            end=ts[t - 1].to_pydatetime(),
            n_timesteps=int(t - s),
            worst_value=float(w),
            limit=limit,
        )
        for e, s, t, w in zip(el, starts, stops, worst, strict=True)
    ]


def compute_summary(
    run_id: str, case: CaseStudy, acc: Accumulated, elements: dict[str, GroupElements]
) -> ResultSummary:
    ts = case.time.timestamps()
    dt_h = case.time.resolution_minutes / 60.0
    lim = case.limits
    u = np.where(acc.u_pu > 0, acc.u_pu, np.nan)  # ignore de-energised nodes (u = 0)
    loading = acc.loading
    nodes_el, br_el = elements["node"], elements["branch"]

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        u_min, u_max, u_mean = np.nanmin(u, 0), np.nanmax(u, 0), np.nanmean(u, 0)
        l_max, l_mean = np.nanmax(loading, 0), np.nanmean(loading, 0)
        if u.size == 0:
            u_min = u_max = u_mean = np.zeros(u.shape[1])
        if loading.size == 0:
            l_max = l_mean = np.zeros(loading.shape[1])

    nodes = [
        NodeExtremes(
            id=int(i),
            name=n,
            u_min_pu=_opt(a),
            u_max_pu=_opt(b),
            u_mean_pu=_opt(c),
            t_u_min=_ts(ts, ia),
            t_u_max=_ts(ts, ib),
        )
        for i, n, a, b, c, ia, ib in zip(
            nodes_el.ids,
            nodes_el.names,
            u_min,
            u_max,
            u_mean,
            _arg(u, False),
            _arg(u, True),
            strict=True,
        )
    ]
    branches = [
        BranchExtremes(
            id=int(i),
            type=t,
            name=n,
            loading_max=_opt(a),
            loading_mean=_opt(b),
            t_loading_max=_ts(ts, ia),
        )
        for i, t, n, a, b, ia in zip(
            br_el.ids, br_el.types, br_el.names, l_max, l_mean, _arg(loading, True), strict=True
        )
    ]

    with np.errstate(invalid="ignore"):
        lo, hi, lmax = lim.u_min_pu, lim.u_max_pu, lim.loading_max
        under = _violations("node", "undervoltage", u, u < lo, lo, False, nodes_el, ts)
        over = _violations("node", "overvoltage", u, u > hi, hi, True, nodes_el, ts)
        overload = _violations(
            "branch", "overloading", loading, loading > lmax, lmax, True, br_el, ts
        )
    violations = sorted(under + over + overload, key=lambda v: (v.start, v.component, v.id))

    def agg(fn, arr: np.ndarray) -> float | None:
        if arr.size == 0 or np.all(np.isnan(arr)):
            return None
        return float(fn(arr))

    kpis = Kpis(
        u_min_pu=agg(np.nanmin, u),
        u_max_pu=agg(np.nanmax, u),
        loading_max=agg(np.nanmax, loading),
        n_voltage_violations=len(under) + len(over),
        n_loading_violations=len(overload),
        energy_import_mwh=float(np.nansum(acc.source_p_w) * dt_h / 1e6),
        energy_losses_mwh=float(np.nansum(acc.losses_w) * dt_h / 1e6),
        n_failed_timesteps=int(acc.failed.sum()),
    )
    return ResultSummary(
        run_id=run_id,
        n_timesteps=len(ts),
        timestamps_start=case.time.start,
        resolution_minutes=case.time.resolution_minutes,
        kpis=kpis,
        nodes=nodes,
        branches=branches,
        violations=violations[:MAX_VIOLATIONS],
    )
