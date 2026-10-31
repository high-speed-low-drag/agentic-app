"""Network sources (extension point).

A network source provides PGM input networks behind one interface
(`gridsim.networks.base.NetworkSource`): a `key`, `list_items()` and `load(key)`.

To add a source (e.g. a lakehouse):

1. Create `networks/lakehouse.py` with a class having `key = "lakehouse"`,
   `list_items() -> list[NetworkItem]` (cheap listing, with `counts`) and
   `load(key) -> LoadedNetwork`. Build the `LoadedNetwork` from a PGM input
   dataset with `networks.base.build_topology(...)` (or `load_pgm_json` if you
   have PGM JSON text). Cache loads; they are called for every run/validation.
2. Register it below: `NETWORK_SOURCES.register("lakehouse", LakehouseSource())`.
3. Add a test in `tests/test_networks.py`.

The API (`/api/networks`) and cases (`network: {source, key}`) pick it up automatically.
"""

from gridsim.networks.base import LoadedNetwork, NetworkSource
from gridsim.networks.sample import SampleNetworkSource
from gridsim.networks.upload import UploadNetworkSource
from gridsim.registry import Registry

NETWORK_SOURCES: Registry[NetworkSource] = Registry("network source")
NETWORK_SOURCES.register("sample", SampleNetworkSource())
NETWORK_SOURCES.register("upload", UploadNetworkSource())


def load_network(source: str, key: str) -> LoadedNetwork:
    """Load a network by source + key (raises UnknownKeyError)."""
    return NETWORK_SOURCES.get(source).load(key)


__all__ = ["NETWORK_SOURCES", "LoadedNetwork", "NetworkSource", "load_network"]
