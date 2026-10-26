import json
import time
from collections.abc import Iterator

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from gridsim.api import create_app
from gridsim.workspace import REPO_ROOT

from .conftest import SAMPLES, make_case

DEMO = "vision-mv-summer-week"
TIME = {"start": "2026-07-01T00:00:00", "end": "2026-07-02T00:00:00", "resolution_minutes": 60}


@pytest.fixture
def client(workspace) -> Iterator[TestClient]:
    with TestClient(create_app()) as c:
        yield c


def wait_done(client: TestClient, run_id: str, timeout: float = 30) -> dict:
    t0 = time.time()
    while time.time() - t0 < timeout:
        info = client.get(f"/api/runs/{run_id}").json()
        if info["status"] in ("succeeded", "failed", "cancelled"):
            return info
        time.sleep(0.05)
    raise AssertionError("run did not finish")


def small_case_body(**kw) -> dict:
    body = json.loads(make_case().model_dump_json())
    body.pop("id")
    body.update(kw)
    return body


@pytest.fixture
def run_id(client: TestClient) -> str:
    case = client.post("/api/cases", json=small_case_body(name="Small")).json()
    r = client.post(f"/api/cases/{case['id']}/runs")
    assert r.status_code == 202, r.text
    info = wait_done(client, r.json()["id"])
    assert info["status"] == "succeeded", info
    return info["id"]


def test_health(client: TestClient) -> None:
    assert client.get("/api/health").json() == {"status": "ok", "pgm_version": "1.13.209"}


def test_networks(client: TestClient) -> None:
    items = client.get("/api/networks").json()
    assert {i["key"] for i in items} == {"vision_mv", "ieee14"}
    topo = client.get("/api/networks/sample/vision_mv").json()
    assert topo["nodes"][0] == {"id": 0, "name": "Rail B", "u_rated": 10500.0}
    assert topo["counts"]["node"] == 47
    assert client.get("/api/networks/sample/nope").status_code == 404

    with open(SAMPLES / "ieee14.json", "rb") as f:
        r = client.post(
            "/api/networks/upload", files={"file": ("ieee.json", f, "application/json")}
        )
    assert r.status_code == 200, r.text
    item = r.json()
    assert item["source"] == "upload" and item["counts"]["node"] == 14
    assert len(client.get("/api/networks").json()) == 3
    assert client.get(f"/api/networks/upload/{item['key']}").json()["counts"]["node"] == 14
    bad = client.post("/api/networks/upload", files={"file": ("x.json", b"nope")})
    assert bad.status_code == 400 and "detail" in bad.json()


def test_profile_generators_and_preview(client: TestClient) -> None:
    gens = {g["key"]: g for g in client.get("/api/profile-generators").json()}
    assert set(gens) == {
        "constant",
        "residential_load",
        "commercial_load",
        "pv",
        "ev_charging",
        "csv",
    }
    assert gens["residential_load"]["params_schema"]["properties"]["seed"]["default"] == 1
    assert gens["ev_charging"]["default_mode"] == "add"
    r = client.post(
        "/api/profiles/preview",
        json={"generator": "pv", "params": {}, "time": TIME, "n_elements": 3},
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body["timestamps"]) == 24 and len(body["series"]) == 3
    assert body["timestamps"][0] == "2026-07-01T00:00:00"
    bad = client.post(
        "/api/profiles/preview", json={"generator": "pv", "params": {"peak": -1}, "time": TIME}
    )
    assert bad.status_code == 400
    assert (
        client.post("/api/profiles/preview", json={"generator": "x", "time": TIME}).status_code
        == 404
    )
    bad_time = {**TIME, "end": "2026-06-01T00:00:00"}
    r = client.post("/api/profiles/preview", json={"generator": "pv", "time": bad_time})
    assert r.status_code == 422 and "end must be after start" in r.json()["detail"]


def test_csv_upload_and_csv_case(client: TestClient) -> None:
    idx = pd.date_range("2026-07-01", periods=96, freq="15min")
    csv = pd.DataFrame({"time": idx, "load_a": np.linspace(0.5, 1.5, 96)}).to_csv(index=False)
    r = client.post("/api/profiles/upload", files={"file": ("p.csv", csv.encode(), "text/csv")})
    assert r.status_code == 200, r.text
    info = r.json()
    assert info["columns"] == ["load_a"] and info["n_rows"] == 96
    assert info["start"] == "2026-07-01T00:00:00"
    params = {"file_id": info["file_id"], "column": "load_a"}
    prev = client.post(
        "/api/profiles/preview", json={"generator": "csv", "params": params, "time": TIME}
    )
    assert prev.json()["series"][0][0] == 0.5

    body = small_case_body(
        name="CSV case",
        profile_assignments=[
            {"id": "c", "generator": "csv", "params": params, "target": {"component": "sym_load"}}
        ],
    )
    case = client.post("/api/cases", json=body).json()
    assert client.post(f"/api/cases/{case['id']}/validate").json()["ok"] is True
    run = client.post(f"/api/cases/{case['id']}/runs").json()
    assert wait_done(client, run["id"])["status"] == "succeeded"
    bad = client.post("/api/profiles/upload", files={"file": ("p.csv", b"a,b\nx,y\n")})
    assert bad.status_code == 400


def test_cases_crud_and_validate(client: TestClient) -> None:
    cases = client.get("/api/cases").json()
    assert [c["id"] for c in cases] == [DEMO] and cases[0]["last_run"] is None
    r = client.post("/api/cases", json=small_case_body(name="My Case!"))
    assert r.status_code == 201
    case = r.json()
    assert case["id"] == "my-case" and case["created_at"]
    assert (
        client.post("/api/cases", json=small_case_body(name="My Case!")).json()["id"] == "my-case-2"
    )
    assert (
        client.post("/api/cases", json={**small_case_body(name="x"), "id": "my-case"}).status_code
        == 409
    )

    case["description"] = "changed"
    r = client.put("/api/cases/my-case", json=case)
    assert r.status_code == 200 and r.json()["description"] == "changed"
    assert client.get("/api/cases/my-case").json()["description"] == "changed"

    v = client.post(f"/api/cases/{DEMO}/validate").json()
    assert v == {"ok": True, "n_timesteps": 672, "issues": []}
    case["profile_assignments"][0]["generator"] = "nope"
    client.put("/api/cases/my-case", json=case)
    v = client.post("/api/cases/my-case/validate").json()
    assert v["ok"] is False and v["issues"][0]["level"] == "error"
    r = client.post("/api/cases/my-case/runs")
    assert r.status_code == 422 and r.json()["issues"] and "detail" in r.json()

    assert client.delete("/api/cases/my-case").status_code == 204
    assert client.get("/api/cases/my-case").status_code == 404
    assert client.delete("/api/cases/my-case").status_code == 404
    too_long = small_case_body(
        name="long", time={**TIME, "end": "2030-01-01T00:00:00", "resolution_minutes": 1}
    )
    assert client.post("/api/cases", json=too_long).status_code == 422


def test_runs_lifecycle(client: TestClient, run_id: str) -> None:
    info = client.get(f"/api/runs/{run_id}").json()
    assert info["progress"] == 1.0 and info["n_timesteps"] == 24 and info["duration_s"] is not None
    case_id = info["case_id"]
    assert [r["id"] for r in client.get(f"/api/runs?case_id={case_id}").json()] == [run_id]
    assert client.get("/api/runs?case_id=other").json() == []
    assert len(client.get("/api/runs").json()) == 1
    summary = next(c for c in client.get("/api/cases").json() if c["id"] == case_id)
    assert summary["last_run"]["id"] == run_id
    assert client.post(f"/api/runs/{run_id}/cancel").json()["status"] == "succeeded"
    assert client.delete(f"/api/runs/{run_id}").status_code == 204
    assert client.get(f"/api/runs/{run_id}").status_code == 404
    assert client.get("/api/runs/r-20990101-000000-0000").status_code == 404


def test_run_frozen_case(client: TestClient, run_id: str) -> None:
    info = client.get(f"/api/runs/{run_id}").json()
    live = client.get(f"/api/cases/{info['case_id']}").json()
    frozen = client.get(f"/api/runs/{run_id}/case").json()
    assert frozen["id"] == live["id"] and frozen["limits"] == live["limits"]
    # Editing the live case afterwards does not change the frozen copy.
    live["limits"] = {"u_min_pu": 0.9, "u_max_pu": 1.1, "loading_max": 0.8}
    assert client.put(f"/api/cases/{live['id']}", json=live).status_code == 200
    frozen2 = client.get(f"/api/runs/{run_id}/case").json()
    assert frozen2["limits"] == frozen["limits"] != live["limits"]
    assert client.get("/api/runs/r-20990101-000000-0000/case").status_code == 404
    assert client.get("/api/runs/bad-id/case").status_code == 404


def test_cancel_run(client: TestClient) -> None:
    body = small_case_body(
        name="Long", time={**TIME, "end": "2027-04-01T00:00:00", "resolution_minutes": 5}
    )
    case = client.post("/api/cases", json=body).json()
    run = client.post(f"/api/cases/{case['id']}/runs").json()
    t0 = time.time()
    while client.get(f"/api/runs/{run['id']}").json()["status"] == "queued":
        assert time.time() - t0 < 10
        time.sleep(0.01)
    client.post(f"/api/runs/{run['id']}/cancel")
    info = wait_done(client, run["id"])
    assert info["status"] == "cancelled"
    assert client.get(f"/api/runs/{run['id']}/summary").status_code == 409
    assert client.delete(f"/api/cases/{case['id']}").status_code == 204
    assert client.get(f"/api/runs/{run['id']}").status_code == 404


def test_sse_events(client: TestClient) -> None:
    run = client.post(f"/api/cases/{DEMO}/runs").json()
    with client.stream("GET", f"/api/runs/{run['id']}/events") as r:
        assert r.headers["content-type"].startswith("text/event-stream")
        text = "".join(r.iter_text())
    events = [blk for blk in text.strip().split("\n\n") if blk]
    names = [e.split("\n")[0] for e in events]
    assert names[0] == "event: progress" and names[-1] == "event: done"
    last = json.loads(events[-1].split("\n")[1].removeprefix("data: "))
    assert last["status"] == "succeeded" and last["id"] == run["id"]
    # a finished run streams its final state and done immediately
    with client.stream("GET", f"/api/runs/{run['id']}/events") as r:
        again = "".join(r.iter_text())
    assert again.count("event: progress") == 1 and "event: done" in again
    assert client.get("/api/runs/r-20990101-000000-0000/events").status_code == 404


def test_results_endpoints(client: TestClient, run_id: str) -> None:
    s = client.get(f"/api/runs/{run_id}/summary").json()
    assert s["n_timesteps"] == 24 and s["resolution_minutes"] == 60
    assert s["timestamps_start"] == "2026-07-01T00:00:00"
    assert set(s["kpis"]) >= {"u_min_pu", "energy_import_mwh", "energy_losses_mwh"}
    assert s["nodes"][0]["name"] == "Rail B"

    ts = client.get(f"/api/runs/{run_id}/timeseries?component=node&field=u_pu&ids=0,3").json()
    assert ts["unit"] == "pu" and [x["id"] for x in ts["series"]] == [0, 3]
    assert len(ts["series"][0]["values"]) == len(ts["timestamps"]) == 24
    for comp, field in [("branch", "s_from"), ("source", "p"), ("appliance", "q")]:
        r = client.get(f"/api/runs/{run_id}/timeseries?component={comp}&field={field}")
        assert r.status_code == 200 and r.json()["series"], (comp, field)
    assert client.get(f"/api/runs/{run_id}/timeseries?component=node&field=zz").status_code == 400
    assert client.get(f"/api/runs/{run_id}/timeseries?component=xx&field=p").status_code == 422
    assert (
        client.get(f"/api/runs/{run_id}/timeseries?component=node&field=u&ids=9999").status_code
        == 400
    )

    env = client.get(f"/api/runs/{run_id}/envelope?component=node&field=u_pu").json()
    assert all(len(env[k]) == 24 for k in ("min", "mean", "max", "p05", "p95"))
    assert env["min"][0] <= env["p05"][0] <= env["p95"][0] <= env["max"][0]

    hm = client.get(
        f"/api/runs/{run_id}/heatmap?component=branch&field=loading&max_columns=6"
    ).json()
    assert hm["aggregation"] == "max" and len(hm["timestamps"]) == 6
    assert len(hm["ids"]) == len(hm["names"]) == len(hm["values"]) == 52
    assert max(hm["values"][0]) >= max(hm["values"][-1])

    snap = client.get(f"/api/runs/{run_id}/snapshot?t=12").json()
    assert snap["index"] == 12 and snap["timestamp"] == "2026-07-01T12:00:00"
    assert "0" in snap["nodes"] and "47" in snap["branches"]
    assert client.get(f"/api/runs/{run_id}/snapshot?t=24").status_code == 400


def test_openapi_complete(client: TestClient) -> None:
    spec = client.get("/openapi.json").json()
    ops = {op["operationId"] for p in spec["paths"].values() for op in p.values()}
    assert {"list_cases", "start_run", "run_events", "get_heatmap", "upload_network"} <= ops
    for path, methods in spec["paths"].items():
        for method, op in methods.items():
            codes = [c for c in op["responses"] if c.startswith("2")]
            assert codes, (path, method)
            content = op["responses"][codes[0]].get("content")
            if codes[0] != "204":
                assert content, (path, method)


def test_committed_openapi_is_current() -> None:
    """`frontend/openapi.json` must match the backend. If this fails, run `make types`."""
    committed = REPO_ROOT / "frontend" / "openapi.json"
    assert committed.exists(), "frontend/openapi.json missing: run `make types`"
    fresh = json.loads(json.dumps(create_app().openapi()))
    assert json.loads(committed.read_text(encoding="utf-8")) == fresh, (
        "frontend/openapi.json is stale: run `make types` and commit the result"
    )


def test_spa_fallback_does_not_shadow_api(tmp_path, monkeypatch) -> None:
    import gridsim.api.app as app_module

    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>spa</html>")
    (dist / "assets" / "app.js").write_text("console.log(1)")
    monkeypatch.setattr(app_module, "FRONTEND_DIST", dist)
    with TestClient(app_module.create_app()) as c:
        assert c.get("/").text == "<html>spa</html>"
        assert c.get("/cases/abc").text == "<html>spa</html>"
        assert c.get("/assets/app.js").text == "console.log(1)"
        assert c.get("/api/health").json()["status"] == "ok"
        assert c.get("/api/nope").status_code == 404
