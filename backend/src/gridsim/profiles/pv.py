"""Photovoltaic generation: clear-sky curve from solar geometry times cloudiness."""

from __future__ import annotations

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field

from gridsim.profiles.base import (
    ProfileGenerator,
    element_amplitude,
    hour_of_day,
    hours_since_start,
    smooth_noise,
)


class PvParams(BaseModel):
    seed: int = Field(1, title="Random seed")
    peak: float = Field(1.0, ge=0, title="Peak multiplier", description="At clear-sky max")
    latitude: float = Field(52.0, ge=-66, le=66, title="Latitude (°)")
    cloudiness: float = Field(0.3, ge=0, le=1, title="Cloudiness (0 = always clear)")
    solar_noon_hour: float = Field(13.5, ge=10, le=15, title="Solar noon (local clock hour)")


class PvGenerator(ProfileGenerator):
    key = "pv"
    name = "Solar PV"
    description = (
        "Clear-sky PV output from sun elevation (day of year and latitude give sunrise and "
        "sunset), reduced by day-to-day and intra-day cloud variability."
    )
    applies_to = ["sym_gen", "sym_load"]
    Params = PvParams

    def generate(
        self, timestamps: pd.DatetimeIndex, n_elements: int, params: PvParams
    ) -> np.ndarray:
        rng = np.random.default_rng(params.seed)
        n = len(timestamps)
        doy = timestamps.day_of_year.to_numpy(float)
        lat = np.radians(params.latitude)
        decl = np.radians(23.44) * np.sin(2 * np.pi * (284.0 + doy) / 365.0)
        omega = np.radians(15.0 * (hour_of_day(timestamps) - params.solar_noon_hour))
        cosz = np.sin(lat) * np.sin(decl) + np.cos(lat) * np.cos(decl) * np.cos(omega)
        cosz_max = np.cos(max(abs(lat) - np.radians(23.44), 0.0))
        clear = np.clip(cosz / cosz_max, 0.0, 1.0) ** 1.2  # (n,)

        t_h = hours_since_start(timestamps)
        day = (t_h // 24).astype(np.int64) if n else np.zeros(0, np.int64)
        n_days = int(day.max()) + 1 if n else 0
        day_cloud = rng.beta(0.8, 1.6, n_days)  # shared weather, mostly clear-ish days
        intra = np.abs(smooth_noise(t_h, n_elements, rng, 1.0)) / 2.0
        cloud = np.clip(0.75 * day_cloud[day][:, None] + 0.25 * intra, 0.0, 1.0)
        amp = element_amplitude(rng, n_elements, 0.05)
        out = params.peak * clear[:, None] * (1.0 - params.cloudiness * cloud) * amp[None, :]
        return np.clip(out, 0.0, params.peak)
