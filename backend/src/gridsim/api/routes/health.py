from importlib.metadata import version

from fastapi import APIRouter

from gridsim.models import Health

router = APIRouter(tags=["meta"])


@router.get("/health", response_model=Health)
def health() -> Health:
    return Health(status="ok", pgm_version=version("power-grid-model"))
