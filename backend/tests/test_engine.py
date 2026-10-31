import numpy as np
from power_grid_model import PowerGridModel, initialize_array

from gridsim.engine import iter_power_flow
from gridsim.models import CalculationSettings
from gridsim.networks import load_network
from gridsim.results.groups import output_spec


def _update(net, scale: np.ndarray) -> dict:
    base = net.input_data["sym_load"]
    arr = initialize_array("update", "sym_load", (len(scale), len(base)))
    arr["id"] = base["id"]
    arr["p_specified"] = base["p_specified"] * scale[:, None]
    arr["q_specified"] = base["q_specified"] * scale[:, None]
    return {"sym_load": arr}


def test_single_step_batch_equals_plain_calculation() -> None:
    net = load_network("sample", "vision_mv")
    spec = output_spec(set(net.input_data))
    chunks = list(
        iter_power_flow(net.input_data, _update(net, np.ones(1)), 1, CalculationSettings(), spec)
    )
    assert len(chunks) == 1
    ref = PowerGridModel(net.input_data).calculate_power_flow()
    np.testing.assert_allclose(chunks[0].output["node"]["u_pu"][0], ref["node"]["u_pu"], rtol=1e-10)
    np.testing.assert_allclose(
        chunks[0].output["line"]["loading"][0], ref["line"]["loading"], rtol=1e-10
    )


def test_chunks_and_failed_scenarios_become_nan() -> None:
    net = load_network("sample", "vision_mv")
    scale = np.ones(10)
    scale[4] = 1e6  # diverges
    spec = output_spec(set(net.input_data))
    chunks = list(
        iter_power_flow(
            net.input_data, _update(net, scale), 10, CalculationSettings(), spec, chunk_size=3
        )
    )
    assert [(c.start, c.stop) for c in chunks] == [(0, 3), (3, 6), (6, 9), (9, 10)]
    failed = np.concatenate([c.failed for c in chunks])
    assert failed.tolist() == [4]
    u = np.vstack([c.output["node"]["u_pu"] for c in chunks])
    assert np.all(np.isnan(u[4])) and np.all(np.isfinite(np.delete(u, 4, axis=0)))


def test_no_update_broadcasts() -> None:
    net = load_network("sample", "ieee14")
    spec = output_spec(set(net.input_data))
    chunks = list(iter_power_flow(net.input_data, {}, 5, CalculationSettings(), spec))
    u = np.vstack([c.output["node"]["u_pu"] for c in chunks])
    assert u.shape == (5, 14) and np.allclose(u, u[0])
