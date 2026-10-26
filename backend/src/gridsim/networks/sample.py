"""Bundled sample networks (PGM validation cases, see samples/networks/README.md)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from gridsim.models import NetworkItem
from gridsim.networks.base import LoadedNetwork, load_pgm_json
from gridsim.registry import UnknownKeyError

SAMPLES_DIR = Path(__file__).resolve().parents[1] / "samples" / "networks"

SAMPLES: dict[str, tuple[str, str, str]] = {
    # key: (file name, friendly name, description)
    "vision_mv": (
        "vision_mv.json",
        "Vision MV validation network",
        "Medium-voltage (10.5 kV) network fed from a 110 kV source with 47 nodes, cables, "
        "links, transformers, 21 loads and 5 generators (PGM validation case).",
    ),
    "ieee14": (
        "ieee14.json",
        "IEEE 14-bus",
        "Classic IEEE 14-bus transmission test system modelled with generic branches and "
        "voltage-regulated generators (PGM validation case).",
    ),
}


@lru_cache(maxsize=8)
def _load(key: str) -> LoadedNetwork:
    file, name, desc = SAMPLES[key]
    text = (SAMPLES_DIR / file).read_text(encoding="utf-8")
    return load_pgm_json("sample", key, name, text, desc)


class SampleNetworkSource:
    key = "sample"

    def list_items(self) -> list[NetworkItem]:
        return [_load(k).item() for k in SAMPLES]

    def load(self, key: str) -> LoadedNetwork:
        if key not in SAMPLES:
            raise UnknownKeyError(f"Unknown sample network '{key}'")
        return _load(key)
