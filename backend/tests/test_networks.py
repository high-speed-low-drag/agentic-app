import pytest

from gridsim.networks import NETWORK_SOURCES, load_network
from gridsim.networks.upload import InvalidNetworkError
from gridsim.registry import UnknownKeyError

from .conftest import SAMPLES


def test_list_samples() -> None:
    items = {i.key: i for i in NETWORK_SOURCES.get("sample").list_items()}
    assert set(items) == {"vision_mv", "ieee14"}
    assert items["vision_mv"].counts["node"] == 47
    assert items["vision_mv"].counts["sym_load"] == 21


def test_vision_topology_names() -> None:
    net = load_network("sample", "vision_mv")
    topo = net.topology
    assert len(topo.nodes) == 47
    assert topo.nodes[0].name == "Rail B" and topo.nodes[0].u_rated == 10500.0
    line = next(b for b in topo.branches if b.id == 47)
    assert line.type == "line" and line.name == "R1" and (line.from_node, line.to_node) == (0, 1)
    load = next(a for a in topo.appliances if a.id == 104)
    assert load.type == "sym_load" and load.name == "Load1" and load.p_specified == 1.5e6
    assert topo.sources[0].name == "source1"
    assert {b.type for b in topo.branches} == {"line", "link", "transformer"}


def test_ieee14_generic_branch_default_names() -> None:
    topo = load_network("sample", "ieee14").topology
    assert len(topo.nodes) == 14
    assert {b.type for b in topo.branches} == {"generic_branch"}
    assert topo.nodes[0].name == "node 1"
    assert {a.type for a in topo.appliances} == {"sym_load", "sym_gen", "shunt"}


def test_shunt_susceptance_in_topology() -> None:
    shunts = {
        a.id: a
        for a in load_network("sample", "vision_mv").topology.appliances
        if a.type == "shunt"
    }
    assert shunts[126].b1 is not None and shunts[126].b1 > 0  # capacitor
    assert shunts[127].b1 is not None and shunts[127].b1 < 0  # reactor
    load = next(
        a for a in load_network("sample", "vision_mv").topology.appliances if a.type == "sym_load"
    )
    assert load.b1 is None


def test_unknown_network() -> None:
    with pytest.raises(UnknownKeyError):
        load_network("sample", "nope")
    with pytest.raises(UnknownKeyError):
        load_network("lakehouse", "x")


def test_upload_roundtrip() -> None:
    src = NETWORK_SOURCES.get("upload")
    item = src.save("my_grid.json", (SAMPLES / "ieee14.json").read_bytes())
    assert item.source == "upload" and item.key.startswith("my-grid-")
    assert [i.key for i in src.list_items()] == [item.key]
    assert len(src.load(item.key).topology.nodes) == 14


def test_upload_invalid() -> None:
    src = NETWORK_SOURCES.get("upload")
    with pytest.raises(InvalidNetworkError):
        src.save("bad.json", b"{not json")
    bad = (SAMPLES / "ieee14.json").read_text().replace('"u_rated": 100000.0', '"u_rated": -1.0')
    with pytest.raises(InvalidNetworkError, match="Invalid network data"):
        src.save("bad.json", bad.encode())
