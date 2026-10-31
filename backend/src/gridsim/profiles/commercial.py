"""Commercial (office) load: high during weekday office hours."""

from __future__ import annotations

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field, model_validator

from gridsim.profiles.base import (
    ProfileGenerator,
    element_amplitude,
    element_shift,
    hour_of_day,
    hours_since_start,
    sigmoid,
    smooth_noise,
)


class CommercialParams(BaseModel):
    seed: int = Field(1, title="Random seed")
    open_hour: float = Field(8.0, ge=0, le=24, title="Opening hour")
    close_hour: float = Field(18.0, ge=0, le=24, title="Closing hour")
    base_level: float = Field(0.3, ge=0, le=1, title="Base level (night)")
    weekend_level: float = Field(0.35, ge=0, le=1, title="Weekend level")
    time_shift_hours: float = Field(0.5, ge=0, le=6, title="Time shift (h)")
    amplitude_jitter: float = Field(0.05, ge=0, le=0.5, title="Amplitude jitter")
    noise: float = Field(0.03, ge=0, le=0.5, title="Noise level")

    @model_validator(mode="after")
    def _check_hours(self) -> CommercialParams:
        if self.close_hour <= self.open_hour:
            raise ValueError("close_hour must be after open_hour")
        return self


class CommercialLoadGenerator(ProfileGenerator):
    key = "commercial_load"
    name = "Commercial load"
    description = (
        "Office-type demand: plateau (≈1) during weekday opening hours, low base level at "
        "night and a flat weekend level."
    )
    applies_to = ["sym_load"]
    Params = CommercialParams

    def generate(
        self, timestamps: pd.DatetimeIndex, n_elements: int, params: CommercialParams
    ) -> np.ndarray:
        rng = np.random.default_rng(params.seed)
        shift = element_shift(rng, n_elements, params.time_shift_hours)
        amp = element_amplitude(rng, n_elements, params.amplitude_jitter)
        h = hour_of_day(timestamps)[:, None] - shift[None, :]
        open_ = sigmoid((h - params.open_hour) / 0.4) * sigmoid((params.close_hour - h) / 0.4)
        weekday = params.base_level + (1.0 - params.base_level) * open_
        weekend = (timestamps.day_of_week.to_numpy() >= 5)[:, None]
        out = np.where(weekend, params.weekend_level, weekday) * amp[None, :]
        if params.noise > 0:
            out *= 1.0 + params.noise * smooth_noise(
                hours_since_start(timestamps), n_elements, rng, 1.0
            )
        return np.clip(out, 0.0, None)
