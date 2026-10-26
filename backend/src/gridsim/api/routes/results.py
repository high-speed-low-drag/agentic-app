from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Query

from gridsim.api.deps import RunnerDep
from gridsim.models import (
    EnvelopeResponse,
    HeatmapResponse,
    ResultComponent,
    ResultSummary,
    SnapshotResponse,
    TimeseriesResponse,
)
from gridsim.results import RESULTS, QueryError
from gridsim.workspace import ConflictError, read_json

router = APIRouter(tags=["results"])


def _succeeded_dir(runner: RunnerDep, run_id: str) -> Path:
    info = runner.get(run_id)
    if info.status != "succeeded":
        raise ConflictError(f"Run '{run_id}' has status '{info.status}'; no results available")
    return runner.run_dir(run_id)


def _parse_ids(ids: str | None) -> list[int] | None:
    if ids is None or ids.strip() == "":
        return None
    try:
        return [int(x) for x in ids.split(",") if x.strip()]
    except ValueError:
        raise QueryError("ids must be a comma-separated list of integers") from None


@router.get("/runs/{run_id}/summary", response_model=ResultSummary)
def get_summary(run_id: str, runner: RunnerDep) -> ResultSummary:
    d = _succeeded_dir(runner, run_id)
    return ResultSummary.model_validate(read_json(d / "summary.json"))


@router.get("/runs/{run_id}/timeseries", response_model=TimeseriesResponse)
def get_timeseries(
    run_id: str,
    runner: RunnerDep,
    component: ResultComponent,
    field: str,
    ids: Annotated[str | None, Query(description="Comma-separated element ids")] = None,
) -> TimeseriesResponse:
    return RESULTS.timeseries(_succeeded_dir(runner, run_id), component, field, _parse_ids(ids))


@router.get("/runs/{run_id}/envelope", response_model=EnvelopeResponse)
def get_envelope(
    run_id: str, runner: RunnerDep, component: ResultComponent, field: str
) -> EnvelopeResponse:
    return RESULTS.envelope(_succeeded_dir(runner, run_id), component, field)


@router.get("/runs/{run_id}/heatmap", response_model=HeatmapResponse)
def get_heatmap(
    run_id: str,
    runner: RunnerDep,
    component: ResultComponent,
    field: str,
    max_columns: Annotated[int, Query(ge=1, le=5000)] = 500,
) -> HeatmapResponse:
    return RESULTS.heatmap(_succeeded_dir(runner, run_id), component, field, max_columns)


@router.get("/runs/{run_id}/snapshot", response_model=SnapshotResponse)
def get_snapshot(
    run_id: str, runner: RunnerDep, t: Annotated[int, Query(ge=0)] = 0
) -> SnapshotResponse:
    return RESULTS.snapshot(_succeeded_dir(runner, run_id), t)
