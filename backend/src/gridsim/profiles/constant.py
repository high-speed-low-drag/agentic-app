"""Constant multiplier."""

from __future__ import annotations

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field

from gridsim.profiles.base import ProfileGenerator


class ConstantParams(BaseModel):
    value: float = Field(1.0, title="Value", description="Multiplier applied at every timestep")


class ConstantGenerator(ProfileGenerator):
    key = "constant"
    name = "Constant"
    description = "The same multiplier at every timestep (e.g. 1.0 keeps base values)."
    Params = ConstantParams

    def generate(
        self, timestamps: pd.DatetimeIndex, n_elements: int, params: ConstantParams
    ) -> np.ndarray:
        return np.full((len(timestamps), n_elements), params.value, dtype=float)
