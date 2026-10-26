from fastapi import APIRouter, File, UploadFile

from gridsim.models import (
    ProfileGeneratorInfo,
    ProfilePreviewRequest,
    ProfilePreviewResponse,
    ProfileUploadInfo,
)
from gridsim.profiles import PROFILE_GENERATORS
from gridsim.profiles.csv_store import save_csv

router = APIRouter(tags=["profiles"])


@router.get("/profile-generators", response_model=list[ProfileGeneratorInfo])
def list_profile_generators() -> list[ProfileGeneratorInfo]:
    return [g.info() for g in PROFILE_GENERATORS.all()]


@router.post("/profiles/preview", response_model=ProfilePreviewResponse)
def preview_profile(body: ProfilePreviewRequest) -> ProfilePreviewResponse:
    gen = PROFILE_GENERATORS.get(body.generator)
    ts = body.time.timestamps()
    values = gen.run(ts, body.n_elements, body.params)
    return ProfilePreviewResponse(
        timestamps=list(ts.to_pydatetime()),
        series=[values[:, i].tolist() for i in range(body.n_elements)],
    )


@router.post("/profiles/upload", response_model=ProfileUploadInfo)
async def upload_profile_csv(file: UploadFile = File(...)) -> ProfileUploadInfo:  # noqa: B008
    return save_csv(file.filename or "profile.csv", await file.read())
