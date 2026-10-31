import numpy as np
import pandas as pd
import pytest

from gridsim.profiles import PROFILE_GENERATORS, ProfileParamsError
from gridsim.profiles.csv_store import CsvProfileError, save_csv

WEEK = pd.date_range("2026-07-01", periods=7 * 96, freq="15min")
YEAR = pd.date_range("2026-01-01", periods=365 * 24, freq="60min")
BUILTIN = ["constant", "residential_load", "commercial_load", "pv", "ev_charging"]


@pytest.mark.parametrize("key", BUILTIN)
def test_shape_determinism_range(key: str) -> None:
    gen = PROFILE_GENERATORS.get(key)
    a = gen.run(WEEK, 5, {"seed": 3})
    b = gen.run(WEEK, 5, {"seed": 3})
    assert a.shape == (len(WEEK), 5)
    np.testing.assert_array_equal(a, b)
    assert np.all(np.isfinite(a)) and a.min() >= 0 and a.max() <= 2.0
    info = gen.info()
    assert info.key == key and info.params_schema["type"] == "object"


@pytest.mark.parametrize("key", ["residential_load", "commercial_load", "pv", "ev_charging"])
def test_seed_and_element_variation(key: str) -> None:
    gen = PROFILE_GENERATORS.get(key)
    params = {"seed": 1, "share": 1.0} if key == "ev_charging" else {"seed": 1}
    a = gen.run(WEEK, 4, params)
    assert not np.allclose(a[:, 0], a[:, 1]), "elements should differ"
    other = gen.run(WEEK, 4, {**params, "seed": 2})
    assert not np.allclose(a, other)


def test_residential_peak_and_shape() -> None:
    a = PROFILE_GENERATORS.get("residential_load").run(
        YEAR, 50, {"amplitude_jitter": 0, "noise": 0, "time_shift_hours": 0}
    )
    assert 0.95 <= a.max() <= 1.05
    hourly = a[:, 0].reshape(-1, 24).mean(axis=0)
    assert hourly[19] > hourly[3] and hourly[7] > hourly[3]


def test_commercial_weekday_vs_weekend() -> None:
    a = PROFILE_GENERATORS.get("commercial_load").run(WEEK, 1, {"noise": 0})[:, 0]
    weekday_noon = a[(WEEK.day_of_week < 5) & (WEEK.hour == 12)]
    weekend_noon = a[(WEEK.day_of_week >= 5) & (WEEK.hour == 12)]
    assert weekday_noon.min() > 0.9 and weekend_noon.max() < 0.5


def test_pv_night_zero_and_peak() -> None:
    a = PROFILE_GENERATORS.get("pv").run(YEAR, 3, {"peak": 0.8, "cloudiness": 0})
    assert np.all(a[YEAR.hour == 1] == 0)
    assert a.max() <= 0.8 and a.max() > 0.7
    summer = a[(YEAR.month == 6) & (YEAR.hour == 13)].mean()
    winter = a[(YEAR.month == 12) & (YEAR.hour == 13)].mean()
    assert summer > 2 * winter


def test_ev_share_and_binary() -> None:
    a = PROFILE_GENERATORS.get("ev_charging").run(WEEK, 200, {"share": 0.25})
    assert set(np.unique(a)) <= {0.0, 1.0}
    with_ev = (a.max(axis=0) > 0).mean()
    assert 0.1 < with_ev < 0.4
    assert PROFILE_GENERATORS.get("ev_charging").default_mode == "add"


def test_constant_value() -> None:
    a = PROFILE_GENERATORS.get("constant").run(WEEK, 2, {"value": 0.7})
    assert np.all(a == 0.7)


def test_invalid_params() -> None:
    with pytest.raises(ProfileParamsError, match="cloudiness"):
        PROFILE_GENERATORS.get("pv").run(WEEK, 1, {"cloudiness": 3})


def _upload_csv() -> str:
    idx = pd.date_range("2026-07-01", periods=48, freq="30min")
    df = pd.DataFrame({"timestamp": idx, "load_a": np.arange(48.0), "pv": 1.0})
    return save_csv("x.csv", df.to_csv(index=False).encode()).file_id


def test_csv_interpolates_and_repeats() -> None:
    file_id = _upload_csv()
    gen = PROFILE_GENERATORS.get("csv")
    ts = pd.date_range("2026-07-01", periods=96, freq="15min")
    a = gen.run(ts, 2, {"file_id": file_id, "column": "load_a"})
    assert a.shape == (96, 2)
    assert a[0, 0] == 0 and a[1, 0] == 0.5 and a[2, 0] == 1.0
    two_days = pd.date_range("2026-07-01", periods=48, freq="60min")
    rep = gen.run(two_days, 1, {"file_id": file_id, "column": "load_a"})
    assert rep[24, 0] == rep[0, 0]
    with pytest.raises(CsvProfileError, match="does not cover"):
        gen.run(two_days, 1, {"file_id": file_id, "column": "load_a", "repeat": False})
    with pytest.raises(CsvProfileError, match="column 'nope'"):
        gen.run(ts, 1, {"file_id": file_id, "column": "nope"})


def test_fast_for_large_batches() -> None:
    import time

    ts = pd.date_range("2026-01-01", periods=35040, freq="15min")
    t0 = time.perf_counter()
    PROFILE_GENERATORS.get("residential_load").run(ts, 200, {})
    assert time.perf_counter() - t0 < 3.0
