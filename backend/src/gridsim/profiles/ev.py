"""Electric-vehicle home charging: stochastic evening arrivals with a charge duration."""

from __future__ import annotations

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field, model_validator

from gridsim.profiles.base import ProfileGenerator, hour_of_day, hours_since_start


class EvParams(BaseModel):
    seed: int = Field(1, title="Random seed")
    share: float = Field(0.3, ge=0, le=1, title="Share of elements with an EV")
    daily_probability: float = Field(0.8, ge=0, le=1, title="Probability of charging per day")
    arrival_mean_hour: float = Field(18.5, ge=0, le=24, title="Mean arrival hour")
    arrival_std_hours: float = Field(1.5, ge=0, le=6, title="Arrival std dev (h)")
    duration_min_hours: float = Field(2.0, gt=0, le=23, title="Min charge duration (h)")
    duration_max_hours: float = Field(5.0, gt=0, le=23, title="Max charge duration (h)")

    @model_validator(mode="after")
    def _check_durations(self) -> EvParams:
        if self.duration_max_hours < self.duration_min_hours:
            raise ValueError("duration_max_hours must be >= duration_min_hours")
        return self


class EvChargingGenerator(ProfileGenerator):
    key = "ev_charging"
    name = "EV charging"
    description = (
        "On/off (0/1) home-charging sessions: a share of elements owns an EV, arriving in "
        "the evening and charging for a random duration. Use mode 'add' with the charger "
        "power as magnitude_w."
    )
    applies_to = ["sym_load"]
    default_mode = "add"
    Params = EvParams

    def generate(
        self, timestamps: pd.DatetimeIndex, n_elements: int, params: EvParams
    ) -> np.ndarray:
        rng = np.random.default_rng(params.seed)
        n = len(timestamps)
        if n == 0:
            return np.zeros((0, n_elements))
        t_h = hours_since_start(timestamps)
        day = (t_h // 24).astype(np.int64)
        n_days = int(day.max()) + 1
        has_ev = rng.random(n_elements) < params.share
        active = (rng.random((n_days, n_elements)) < params.daily_probability) & has_ev
        arrival = np.clip(
            rng.normal(params.arrival_mean_hour, params.arrival_std_hours, (n_days, n_elements)),
            0.0,
            23.99,
        )
        dur = rng.uniform(
            params.duration_min_hours, params.duration_max_hours, (n_days, n_elements)
        )
        end = arrival + dur
        h = hour_of_day(timestamps)[:, None]
        today = active[day] & (h >= arrival[day]) & (h < end[day])
        prev = np.maximum(day - 1, 0)
        overnight = (day >= 1)[:, None] & active[prev] & (h + 24.0 < end[prev])
        return (today | overnight).astype(float)
