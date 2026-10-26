from collections.abc import AsyncIterator

from fastapi import APIRouter, Query, Response, status
from fastapi.responses import JSONResponse, StreamingResponse

from gridsim.api.deps import RunnerDep, WorkspaceDep
from gridsim.models import RunInfo, ValidationResult
from gridsim.validation import validate_case

router = APIRouter(tags=["runs"])


@router.post(
    "/cases/{case_id}/runs",
    response_model=RunInfo,
    status_code=status.HTTP_202_ACCEPTED,
    responses={422: {"model": ValidationResult, "description": "Case is invalid"}},
)
def start_run(case_id: str, ws: WorkspaceDep, runner: RunnerDep) -> RunInfo | JSONResponse:
    case = ws.get_case(case_id)
    result = validate_case(case)
    if not result.ok:
        errors = "; ".join(i.message for i in result.issues if i.level == "error")
        return JSONResponse(
            status_code=422,
            content={"detail": f"Case is invalid: {errors}", **result.model_dump(mode="json")},
        )
    return runner.submit(case)


@router.get("/runs", response_model=list[RunInfo])
def list_runs(runner: RunnerDep, case_id: str | None = Query(None)) -> list[RunInfo]:
    return runner.list(case_id)


@router.get("/runs/{run_id}", response_model=RunInfo)
def get_run(run_id: str, runner: RunnerDep) -> RunInfo:
    return runner.get(run_id)


@router.post("/runs/{run_id}/cancel", response_model=RunInfo)
def cancel_run(run_id: str, runner: RunnerDep) -> RunInfo:
    return runner.cancel(run_id)


@router.delete("/runs/{run_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_run(run_id: str, runner: RunnerDep) -> Response:
    runner.delete(run_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _sse(event: str, data: str) -> str:
    return f"event: {event}\ndata: {data}\n\n"


@router.get(
    "/runs/{run_id}/events",
    response_class=StreamingResponse,
    response_model=None,
    responses={
        200: {
            "description": "SSE stream: `progress` events with RunInfo JSON, then `done`",
            "content": {"text/event-stream": {"schema": {"type": "string"}}},
        }
    },
)
def run_events(run_id: str, runner: RunnerDep, ws: WorkspaceDep) -> StreamingResponse:
    runner.get(run_id)  # 404 before the stream starts

    async def stream() -> AsyncIterator[str]:
        last: RunInfo | None = None
        try:
            async for info in runner.watch(run_id):
                last = info
                yield _sse("progress", info.model_dump_json())
        except LookupError:  # run deleted while streaming
            pass
        yield _sse("done", last.model_dump_json() if last else "{}")

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
