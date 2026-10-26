"""Storage of uploaded profile CSV files (`<workspace>/uploads/profiles/<file_id>.csv`)."""

from __future__ import annotations

import io
import re
import uuid
from functools import lru_cache
from pathlib import Path

import pandas as pd

from gridsim.models import ProfileUploadInfo
from gridsim.workspace import get_workspace, read_json, write_json_atomic


class CsvProfileError(ValueError):
    """The CSV is unreadable or does not fit the request."""


def parse_csv(content: bytes) -> pd.DataFrame:
    """Parse a CSV whose first column is a timestamp; keep numeric columns only."""
    try:
        df = pd.read_csv(io.BytesIO(content), sep=None, engine="python")
    except Exception as exc:  # noqa: BLE001
        raise CsvProfileError(f"Could not parse CSV: {exc}") from exc
    if df.shape[1] < 2 or len(df) < 2:
        raise CsvProfileError("CSV needs a timestamp column plus at least one value column")
    try:
        index = pd.to_datetime(df.iloc[:, 0])
    except Exception as exc:  # noqa: BLE001
        raise CsvProfileError(f"First column must contain timestamps: {exc}") from exc
    if getattr(index.dt, "tz", None) is not None:
        index = index.dt.tz_localize(None)
    values = df.iloc[:, 1:].apply(pd.to_numeric, errors="coerce")
    values = values.loc[:, values.notna().any()]
    if values.shape[1] == 0:
        raise CsvProfileError("CSV has no numeric value columns")
    values.index = pd.DatetimeIndex(index, name="timestamp")
    values.columns = [str(c) for c in values.columns]
    values = values[~values.index.duplicated()].sort_index()
    return values


def _dir() -> Path:
    return get_workspace().profile_uploads_dir


def save_csv(filename: str, content: bytes) -> ProfileUploadInfo:
    df = parse_csv(content)
    file_id = uuid.uuid4().hex[:12]
    d = _dir()
    d.mkdir(parents=True, exist_ok=True)
    (d / f"{file_id}.csv").write_bytes(content)
    info = ProfileUploadInfo(
        file_id=file_id,
        filename=filename or f"{file_id}.csv",
        columns=list(df.columns),
        n_rows=len(df),
        start=df.index[0].to_pydatetime(),
        end=df.index[-1].to_pydatetime(),
    )
    write_json_atomic(d / f"{file_id}.meta.json", info)
    return info


def get_info(file_id: str) -> ProfileUploadInfo:
    p = _dir() / f"{file_id}.meta.json"
    if not re.fullmatch(r"[0-9a-f]{1,32}", file_id) or not p.exists():
        raise CsvProfileError(f"Unknown profile file '{file_id}'")
    return ProfileUploadInfo.model_validate(read_json(p))


@lru_cache(maxsize=16)
def _load_cached(path: str, mtime: float) -> pd.DataFrame:
    return parse_csv(Path(path).read_bytes())


def load_csv(file_id: str) -> pd.DataFrame:
    get_info(file_id)
    p = _dir() / f"{file_id}.csv"
    return _load_cached(str(p), p.stat().st_mtime)
