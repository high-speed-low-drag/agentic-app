"""Residential load: morning and evening peaks, weekend and seasonal variation."""

from __future__ import annotations

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field

from gridsim.profiles.base import (
    ProfileGenerator,
    element_amplitude,
    element_shift,
    hour_of_day,
    hours_since_start,
    periodic_gauss,
    smooth_noise,
)


class ResidentialParams(BaseModel):
    seed: int = Field(1, title="Random seed")
    seasonal_amplitude: float = Field(
        0.2, ge=0, le=1, title="Seasonal amplitude", description="Winter/summer difference"
    )
    time_shift_hours: float = Field(
        0.75, ge=0, le=6, title="Time shift (h)", description="Std dev of per-element shift"
    )
    amplitude_jitter: float = Field(0.1, ge=0, le=0.5, title="Amplitude jitter")
    noise: float = Field(0.05, ge=0, le=0.5, title="Noise level")


class ResidentialLoadGenerator(ProfileGenerator):
    key = "residential_load"
    name = "Residential load"
    description = (
        "Household demand with a morning and a larger evening peak (peak ≈ 1 in winter), "
        "later mornings at weekends, seasonal amplitude and per-element variation."
    )
    applies_to = ["sym_load"]
    Params = ResidentialParams

    def generate(
        self, timestamps: pd.DatetimeIndex, n_elements: int, params: ResidentialParams
    ) -> np.ndarray:
        rng = np.random.default_rng(params.seed)
        shift = element_shift(rng, n_elements, params.time_shift_hours)
        amp = element_amplitude(rng, n_elements, params.amplitude_jitter)
        h = hour_of_day(timestamps)[:, None] - shift[None, :]
        weekend = (timestamps.day_of_week.to_numpy() >= 5).astype(float)[:, None]
        shape = (
            0.25
            + 0.45 * periodic_gauss(h, 7.5 + 1.5 * weekend, 1.2)
            + 0.75 * periodic_gauss(h, 19.5, 2.0)
            + 0.15 * weekend * periodic_gauss(h, 13.0, 2.5)
        )
        doy = timestamps.day_of_year.to_numpy(float)
        a = params.seasonal_amplitude
        season = ((1.0 + a * np.cos(2 * np.pi * (doy - 15.0) / 365.25)) / (1.0 + a))[:, None]
        out = shape * season * amp[None, :]
        if params.noise > 0:
            out *= 1.0 + params.noise * smooth_noise(
                hours_since_start(timestamps), n_elements, rng, 1.0
            )
        return np.clip(out, 0.0, None)
