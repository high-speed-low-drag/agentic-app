"""Uploaded PGM JSON networks, stored in `<workspace>/uploads/networks/`."""

from __future__ import annotations

import hashlib
from functools import lru_cache
from pathlib import Path

from power_grid_model import CalculationType
from power_grid_model.validation import validate_input_data

from gridsim.models import NetworkItem
from gridsim.networks.base import LoadedNetwork, load_pgm_json
from gridsim.registry import UnknownKeyError
from gridsim.workspace import get_workspace, now, read_json, slugify, write_json_atomic


class InvalidNetworkError(ValueError):
    """The uploaded file is not a valid PGM input dataset."""


def validate_network_text(text: str, key: str = "upload", name: str = "upload") -> LoadedNetwork:
    """Deserialize and validate a PGM JSON input file; raise InvalidNetworkError if invalid."""
    try:
        net = load_pgm_json("upload", key, name, text)
    except Exception as exc:  # noqa: BLE001 - surface any parse error to the user
        raise InvalidNetworkError(f"Could not read PGM JSON input data: {exc}") from exc
    if "node" not in net.input_data or "source" not in net.input_data:
        raise InvalidNetworkError("Network must contain at least one node and one source")
    errors = validate_input_data(
        net.input_data, calculation_type=CalculationType.power_flow, symmetric=True
    )
    if errors:
        msgs = "; ".join(str(e) for e in errors[:10])
        more = f" (+{len(errors) - 10} more)" if len(errors) > 10 else ""
        raise InvalidNetworkError(f"Invalid network data: {msgs}{more}")
    return net


@lru_cache(maxsize=16)
def _load_cached(path: str, mtime: float, key: str, name: str) -> LoadedNetwork:
    text = Path(path).read_text(encoding="utf-8")
    return load_pgm_json("upload", key, name, text, "Uploaded PGM JSON network")


class UploadNetworkSource:
    key = "upload"

    @property
    def directory(self) -> Path:
        return get_workspace().network_uploads_dir

    def save(self, filename: str, content: bytes) -> NetworkItem:
        """Validate and store an uploaded file; returns its NetworkItem."""
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise InvalidNetworkError("File is not UTF-8 encoded JSON") from exc
        stem = Path(filename or "network").stem
        key = f"{slugify(stem, 'network')}-{hashlib.sha1(content).hexdigest()[:6]}"
        validate_network_text(text, key, stem)
        self.directory.mkdir(parents=True, exist_ok=True)
        (self.directory / f"{key}.json").write_text(text, encoding="utf-8")
        write_json_atomic(
            self.directory / f"{key}.meta.json",
            {"name": stem, "filename": filename, "uploaded_at": now().isoformat()},
        )
        return self.load(key).item()

    def _meta(self, key: str) -> dict[str, str]:
        p = self.directory / f"{key}.meta.json"
        return read_json(p) if p.exists() else {"name": key}

    def list_items(self) -> list[NetworkItem]:
        items = []
        for p in sorted(self.directory.glob("*.json")):
            if p.name.endswith(".meta.json"):
                continue
            try:
                items.append(self.load(p.stem).item())
            except Exception:  # noqa: BLE001 - skip broken files in listings
                continue
        return items

    def load(self, key: str) -> LoadedNetwork:
        path = self.directory / f"{key}.json"
        if "/" in key or not path.exists():
            raise UnknownKeyError(f"Unknown uploaded network '{key}'")
        name = self._meta(key).get("name", key)
        return _load_cached(str(path), path.stat().st_mtime, key, name)
