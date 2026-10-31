"""Profile from an uploaded CSV column, interpolated to the case timestamps."""

from __future__ import annotations

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field

from gridsim.profiles.base import ProfileGenerator
from gridsim.profiles.csv_store import CsvProfileError, load_csv


class CsvParams(BaseModel):
    file_id: str = Field("", title="Uploaded file id", description="From /api/profiles/upload")
    column: str = Field("", title="Column name")
    repeat: bool = Field(
        True,
        title="Repeat to cover window",
        description="Tile the CSV period when it does not cover the case window",
    )


class CsvGenerator(ProfileGenerator):
    key = "csv"
    name = "CSV profile"
    description = (
        "Values from a column of an uploaded CSV (first column = timestamp), linearly "
        "interpolated to the case timestamps. The same series is used for all targets."
    )
    Params = CsvParams

    def generate(
        self, timestamps: pd.DatetimeIndex, n_elements: int, params: CsvParams
    ) -> np.ndarray:
        if not params.file_id:
            raise CsvProfileError("csv profile: 'file_id' is required (upload a CSV first)")
        df = load_csv(params.file_id)
        if params.column not in df.columns:
            raise CsvProfileError(
                f"csv profile: column '{params.column}' not in file; available: "
                + ", ".join(df.columns)
            )
        s = df[params.column].dropna()
        if len(s) < 2:
            raise CsvProfileError(f"csv profile: column '{params.column}' has < 2 values")
        x = s.index.to_numpy("datetime64[ns]").astype(np.int64)
        y = s.to_numpy(float)
        step = int(np.median(np.diff(x)))
        t = timestamps.to_numpy("datetime64[ns]").astype(np.int64)
        covered = len(t) == 0 or (t[0] >= x[0] and t[-1] <= x[-1] + step)
        if not covered:
            if not params.repeat:
                raise CsvProfileError(
                    f"csv profile: file covers {s.index[0]} – {s.index[-1]}, which does not "
                    f"cover the case window {timestamps[0]} – {timestamps[-1]}"
                )
            span = x[-1] - x[0] + step
            t = x[0] + (t - x[0]) % span
        # periodic extension by one sample so values in the last step interpolate to the first
        xp = np.append(x, x[-1] + step)
        yp = np.append(y, y[0] if not covered else y[-1])
        values = np.interp(t, xp, yp)
        return np.repeat(values[:, None], n_elements, axis=1)
