from fastapi import APIRouter, File, UploadFile

from gridsim.models import EditableField, NetworkItem, NetworkTopology
from gridsim.networks import NETWORK_SOURCES, load_network
from gridsim.networks.editable import EDITABLE_FIELDS
from gridsim.networks.upload import UploadNetworkSource

router = APIRouter(tags=["networks"])


@router.get("/networks", response_model=list[NetworkItem])
def list_networks() -> list[NetworkItem]:
    return [item for src in NETWORK_SOURCES.all() for item in src.list_items()]


@router.get("/networks/editable-fields", response_model=dict[str, list[EditableField]])
def get_editable_fields() -> dict[str, list[EditableField]]:
    """Per PGM component, the input fields a case may override (`network_overrides`)."""
    return EDITABLE_FIELDS


@router.post("/networks/upload", response_model=NetworkItem)
async def upload_network(file: UploadFile = File(...)) -> NetworkItem:  # noqa: B008
    src = NETWORK_SOURCES.get("upload")
    assert isinstance(src, UploadNetworkSource)
    return src.save(file.filename or "network.json", await file.read())


@router.get("/networks/{source}/{key}", response_model=NetworkTopology)
def get_network(source: str, key: str) -> NetworkTopology:
    return load_network(source, key).topology
