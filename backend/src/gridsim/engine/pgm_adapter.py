"""Thin adapter around power-grid-model batch power flow, run in chunks.

With `continue_on_batch_error=True`, PGM 1.13 does not raise for failed scenarios; it stores
a `PowerGridBatchError` on `model.batch_error` whose `failed_scenarios` holds chunk-relative
indices. The outputs of those scenarios are undefined, so we overwrite them with NaN.
"""

from __future__ import annotations

from collections.abc import Iterator, Mapping
from dataclasses import dataclass

import numpy as np
from power_grid_model import PowerGridModel

from gridsim.models import CalculationSettings

OutputSpec = Mapping[str, list[str]]  # component -> attributes to return


@dataclass
class ChunkResult:
    start: int
    stop: int
    output: dict[str, dict[str, np.ndarray]]  # component -> attribute -> (k, n_elements)
    failed: np.ndarray  # absolute timestep indices that failed
    errors: list[str]


def pick_chunk_size(n_steps: int, n_elements: int) -> int:
    """~40 chunks for progress, 96..2000 steps each, and fewer steps for large networks."""
    by_progress = -(-n_steps // 40)
    by_memory = max(96, 2_000_000 // max(n_elements, 1))
    return int(max(1, min(n_steps, max(96, min(2000, by_progress)), by_memory)))


def _columnar(out: dict, spec: OutputSpec) -> dict[str, dict[str, np.ndarray]]:
    return {str(c): {a: np.asarray(out[c][a], dtype=float) for a in spec[c]} for c in out}


def iter_power_flow(
    input_data: dict[str, np.ndarray],
    update: dict[str, np.ndarray],
    n_steps: int,
    settings: CalculationSettings,
    output_spec: OutputSpec,
    chunk_size: int | None = None,
    threading: int = 0,
) -> Iterator[ChunkResult]:
    """Yield results chunk by chunk (callers report progress / check cancellation in between).

    `update` maps component -> structured update array of shape (n_steps, n_elements).
    If `update` is empty, a single calculation is broadcast to all timesteps.
    """
    model = PowerGridModel(input_data)
    spec = {c: list(a) for c, a in output_spec.items() if c in input_data}
    kwargs = {
        "calculation_method": settings.method,
        "error_tolerance": settings.error_tolerance,
        "max_iterations": settings.max_iterations,
        "output_component_types": spec,
    }
    n_el = sum(len(v) for v in input_data.values())
    size = chunk_size or pick_chunk_size(n_steps, n_el)

    if not update:
        single = _columnar(model.calculate_power_flow(**kwargs), spec)
        for start in range(0, n_steps, size):
            stop = min(start + size, n_steps)
            out = {
                c: {a: np.repeat(v[None, :], stop - start, axis=0) for a, v in attrs.items()}
                for c, attrs in single.items()
            }
            yield ChunkResult(start, stop, out, np.zeros(0, np.int64), [])
        return

    for start in range(0, n_steps, size):
        stop = min(start + size, n_steps)
        chunk = {c: arr[start:stop] for c, arr in update.items()}
        raw = model.calculate_power_flow(
            update_data=chunk, continue_on_batch_error=True, threading=threading, **kwargs
        )
        out = _columnar(raw, spec)
        failed = np.zeros(0, np.int64)
        errors: list[str] = []
        err = model.batch_error
        if err is not None:
            failed = np.asarray(err.failed_scenarios, dtype=np.int64)
            errors = [str(m) for m in (err.error_messages or [])]
            for attrs in out.values():
                for v in attrs.values():
                    v[failed] = np.nan
        yield ChunkResult(start, stop, out, failed + start, errors)
