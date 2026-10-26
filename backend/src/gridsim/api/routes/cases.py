from fastapi import APIRouter, Response, status

from gridsim.api.deps import RunnerDep, WorkspaceDep
from gridsim.models import CaseStudy, CaseSummary, ValidationResult
from gridsim.validation import validate_case as _validate

router = APIRouter(tags=["cases"])


@router.get("/cases", response_model=list[CaseSummary])
def list_cases(ws: WorkspaceDep, runner: RunnerDep) -> list[CaseSummary]:
    return [
        CaseSummary(
            id=c.id or "",
            name=c.name,
            description=c.description,
            network=c.network,
            time=c.time,
            updated_at=c.updated_at,
            last_run=runner.last_run(c.id or ""),
        )
        for c in ws.list_cases()
    ]


@router.post("/cases", response_model=CaseStudy, status_code=status.HTTP_201_CREATED)
def create_case(body: CaseStudy, ws: WorkspaceDep) -> CaseStudy:
    return ws.create_case(body)


@router.get("/cases/{case_id}", response_model=CaseStudy)
def get_case(case_id: str, ws: WorkspaceDep) -> CaseStudy:
    return ws.get_case(case_id)


@router.put("/cases/{case_id}", response_model=CaseStudy)
def update_case(case_id: str, body: CaseStudy, ws: WorkspaceDep) -> CaseStudy:
    return ws.update_case(case_id, body)


@router.delete("/cases/{case_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_case(case_id: str, ws: WorkspaceDep, runner: RunnerDep) -> Response:
    ws.get_case(case_id)
    runner.delete_case_runs(case_id)
    ws.delete_case(case_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/cases/{case_id}/validate", response_model=ValidationResult)
def validate_case(case_id: str, ws: WorkspaceDep) -> ValidationResult:
    return _validate(ws.get_case(case_id))
