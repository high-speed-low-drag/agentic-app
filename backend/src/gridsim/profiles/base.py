"""Profile generator base class and vectorised helpers.

A generator turns case timestamps into dimensionless multipliers of shape
`(n_steps, n_elements)`. Output must be deterministic for a given `seed`.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, ClassVar, Literal

import numpy as np
import pandas as pd
from pydantic import BaseModel, ValidationError

from gridsim.models import ProfileGeneratorInfo


class ProfileParamsError(ValueError):
    """Invalid generator parameters."""


class ProfileGenerator(ABC):
    key: ClassVar[str]
    name: ClassVar[str]
    description: ClassVar[str]
    applies_to: ClassVar[list[Literal["sym_load", "sym_gen"]]] = ["sym_load", "sym_gen"]
    default_mode: ClassVar[Literal["scale", "add"]] = "scale"
    Params: ClassVar[type[BaseModel]]

    def parse_params(self, raw: dict[str, Any] | None) -> BaseModel:
        try:
            return self.Params.model_validate(raw or {})
        except ValidationError as exc:
            msgs = "; ".join(
                f"{'.'.join(str(p) for p in e['loc']) or 'params'}: {e['msg']}"
                for e in exc.errors()
            )
            raise ProfileParamsError(f"Invalid parameters for '{self.key}': {msgs}") from None

    @abstractmethod
    def generate(self, timestamps: pd.DatetimeIndex, n_elements: int, params: Any) -> np.ndarray:
        """Return multipliers with shape (len(timestamps), n_elements)."""

    def run(self, timestamps: pd.DatetimeIndex, n_elements: int, raw: dict[str, Any]) -> np.ndarray:
        """Parse params, generate, and check the output shape."""
        out = np.asarray(self.generate(timestamps, n_elements, self.parse_params(raw)), float)
        if out.shape != (len(timestamps), n_elements):
            raise RuntimeError(f"Generator '{self.key}' returned shape {out.shape}")
        return out

    def info(self) -> ProfileGeneratorInfo:
        return ProfileGeneratorInfo(
            key=self.key,
            name=self.name,
            description=self.description,
            applies_to=list(self.applies_to),
            default_mode=self.default_mode,
            params_schema=self.Params.model_json_schema(),
        )


# --- vectorised helpers -----------------------------------------------------------------------


def hour_of_day(ts: pd.DatetimeIndex) -> np.ndarray:
    return (ts.hour + ts.minute / 60.0 + ts.second / 3600.0).to_numpy(float)


def hours_since_start(ts: pd.DatetimeIndex) -> np.ndarray:
    if len(ts) == 0:
        return np.zeros(0)
    return ((ts - ts[0].normalize()) / pd.Timedelta(hours=1)).to_numpy(float)


def periodic_gauss(h: np.ndarray, mu: float | np.ndarray, width: float) -> np.ndarray:
    """Gaussian bump on a 24 h circle."""
    d = (h - mu + 12.0) % 24.0 - 12.0
    return np.exp(-0.5 * (d / width) ** 2)


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def smooth_noise(
    t_hours: np.ndarray, n_elements: int, rng: np.random.Generator, corr_hours: float = 2.0
) -> np.ndarray:
    """Standard-normal-ish noise, linearly interpolated between knots every `corr_hours`."""
    n = len(t_hours)
    if n == 0:
        return np.zeros((0, n_elements))
    pos = t_hours / corr_hours
    k = np.floor(pos).astype(np.int64)
    frac = (pos - k)[:, None]
    knots = rng.standard_normal((int(k.max()) + 2, n_elements))
    return knots[k] * (1.0 - frac) + knots[k + 1] * frac


def element_shift(rng: np.random.Generator, n_elements: int, std_hours: float) -> np.ndarray:
    return rng.normal(0.0, std_hours, n_elements) if std_hours > 0 else np.zeros(n_elements)


def element_amplitude(rng: np.random.Generator, n_elements: int, jitter: float) -> np.ndarray:
    if jitter <= 0:
        return np.ones(n_elements)
    return np.clip(1.0 + rng.normal(0.0, jitter, n_elements), 0.5, 1.5)
