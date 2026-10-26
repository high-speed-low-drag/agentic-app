# GridSim HTTP API contract (v0)

This is the source of truth shared by `backend/` and `frontend/`. The backend
implements it with Pydantic models (`backend/src/gridsim/models.py`), and
FastAPI serves the generated OpenAPI spec at `/openapi.json`. The frontend
generates `frontend/src/api/openapi.d.ts` from that spec (`make types`, via the committed
`frontend/openapi.json`).

Conventions:
- All routes are prefixed with `/api`. JSON uses `snake_case`.
- Timestamps are ISO-8601 strings without timezone (naive local time), e.g. `"2026-07-01T00:00:00"`.
- Element ids are PGM integer ids. `name` comes from the network file's `Name`
  field when present, otherwise `"<type> <id>"`.
- Errors: HTTP 4xx with `{"detail": "<message>"}`.

## Meta
`GET /api/health` → `{"status": "ok", "pgm_version": "1.13.209"}`

## Networks
`GET /api/networks` → `NetworkItem[]`
```json
{"source": "sample", "key": "vision_mv", "name": "Vision MV validation network",
 "description": "…", "counts": {"node": 47, "line": 28, "transformer": 22, "sym_load": 21, "sym_gen": 5}}
```
`POST /api/networks/upload` (multipart, field `file`: PGM JSON input file) → `NetworkItem` (source `"upload"`)

`GET /api/networks/{source}/{key}` → `NetworkTopology`
```json
{
  "source": "sample", "key": "vision_mv", "name": "…",
  "nodes":      [{"id": 0, "name": "Rail B", "u_rated": 10500.0}],
  "branches":   [{"id": 47, "type": "line", "name": "R1", "from_node": 0, "to_node": 1, "in_service": true}],
  "appliances": [{"id": 104, "type": "sym_load", "name": "Load1", "node": 26, "p_specified": 1500000.0, "q_specified": 1000000.0, "in_service": true}],
  "sources":    [{"id": 99, "name": "source1", "node": 23, "u_ref": 1.0}],
  "counts": {"node": 47}
}
```
Branch `type` is one of `line | link | transformer | generic_branch | three_winding_transformer` (3-winding: see `nodes` field below).
For `three_winding_transformer` the branch has `from_node`=node_1, `to_node`=node_2 and an extra `node_3`. Appliance `type` covers
`sym_load | sym_gen | asym_load | asym_gen | shunt`. Only `sym_load` and `sym_gen` are profile targets in v0.

## Profile generators
`GET /api/profile-generators` → `ProfileGeneratorInfo[]`
```json
{"key": "residential_load", "name": "Residential load", "description": "…",
 "applies_to": ["sym_load"], "default_mode": "scale",
 "params_schema": { "type": "object", "properties": { "seed": {"type": "integer", "default": 1, "title": "Random seed"} } }}
```
`params_schema` is a JSON Schema (from a Pydantic model). The frontend renders a form from it (number/integer/string/boolean/enum).

v0 generators: `constant` (value), `residential_load`, `commercial_load`, `pv` (clear-sky × cloudiness), `ev_charging`, `csv` (params: `file_id`, `column`).

`POST /api/profiles/preview` body `{"generator": "pv", "params": {…}, "time": TimeSettings, "n_elements": 3}`
→ `{"timestamps": ["…"], "series": [[…], […], […]]}` (one multiplier series per sample element).

`POST /api/profiles/upload` (multipart `file`: CSV, first column is a timestamp) → `{"file_id": "abc123", "filename": "x.csv", "columns": ["load_a", "pv_1"], "n_rows": 35040, "start": "…", "end": "…"}`

## Cases
`CaseStudy`:
```json
{
  "id": "summer-week",               // slug, server-generated on create if absent
  "name": "Summer week", "description": "",
  "study_type": "timeseries_powerflow",
  "network": {"source": "sample", "key": "vision_mv"},
  "time": {"start": "2026-07-01T00:00:00", "end": "2026-07-08T00:00:00", "resolution_minutes": 15},
  "calculation": {"method": "newton_raphson", "error_tolerance": 1e-8, "max_iterations": 20},
  "limits": {"u_min_pu": 0.95, "u_max_pu": 1.05, "loading_max": 1.0},
  "profile_assignments": [
    {"id": "a1", "label": "Household load", "generator": "residential_load", "params": {"seed": 1},
     "target": {"component": "sym_load", "ids": null},     // null = all elements of that component
     "mode": "scale", "magnitude_w": null}
  ],
  "created_at": "…", "updated_at": "…"
}
```
`calculation.method` is one of `newton_raphson | iterative_current | linear | linear_current`.
`resolution_minutes` is an integer from 1 to 1440, and the number of timesteps must be ≤ 100 000.

- `GET /api/cases` → `CaseSummary[]` (`id, name, description, network, time, updated_at, last_run: RunInfo|null`)
- `POST /api/cases` body CaseStudy (id/created_at/updated_at optional) → CaseStudy (201)
- `GET /api/cases/{id}` → CaseStudy
- `PUT /api/cases/{id}` → CaseStudy
- `DELETE /api/cases/{id}` → 204 (also deletes its runs)
- `POST /api/cases/{id}/validate` → `{"ok": true, "n_timesteps": 672, "issues": [{"level": "error|warning", "message": "…"}]}`

## Runs
`RunInfo`:
```json
{"id": "r-20261026-113000-ab12", "case_id": "summer-week", "case_name": "Summer week",
 "status": "queued|running|succeeded|failed|cancelled",
 "progress": 0.42, "message": "Timestep 288/672", "n_timesteps": 672,
 "n_failed_timesteps": 0, "created_at": "…", "started_at": "…", "finished_at": null,
 "duration_s": null, "error": null}
```
- `POST /api/cases/{id}/runs` → RunInfo (202). Validates first and returns 422 with issues if invalid.
- `GET /api/runs?case_id=` → RunInfo[] (newest first)
- `GET /api/runs/{run_id}` → RunInfo
- `GET /api/runs/{run_id}/case` → CaseStudy frozen at run creation (`runs/<id>/case.json`); result views read limits/network from it
- `POST /api/runs/{run_id}/cancel` → RunInfo
- `DELETE /api/runs/{run_id}` → 204
- `GET /api/runs/{run_id}/events`: **SSE** stream. It sends `event: progress` with `data: RunInfo` JSON on each change, and ends after a terminal status with `event: done`.

## Results (only for succeeded runs; 409 otherwise)
`GET /api/runs/{run_id}/summary` → `ResultSummary`
```json
{
  "run_id": "…", "n_timesteps": 672, "timestamps_start": "…", "resolution_minutes": 15,
  "kpis": {"u_min_pu": 0.97, "u_max_pu": 1.04, "loading_max": 0.83, "n_voltage_violations": 0,
           "n_loading_violations": 0, "energy_import_mwh": 123.4, "energy_losses_mwh": 2.1,
           "n_failed_timesteps": 0},
  "nodes":    [{"id": 0, "name": "Rail B", "u_min_pu": 0.99, "u_max_pu": 1.01, "u_mean_pu": 1.0, "t_u_min": "…", "t_u_max": "…"}],
  "branches": [{"id": 47, "type": "line", "name": "R1", "loading_max": 0.5, "loading_mean": 0.3, "t_loading_max": "…"}],
  "violations": [{"component": "node|branch", "id": 3, "name": "KNP 11", "kind": "undervoltage|overvoltage|overloading",
                  "start": "…", "end": "…", "n_timesteps": 4, "worst_value": 0.93, "limit": 0.95}]
}
```
Violations are contiguous episodes per element. `end` is the last violating timestep.

`GET /api/runs/{run_id}/timeseries?component=node|branch|source|appliance&field=<f>&ids=1,2,3`
→ `{"timestamps": ["…"], "field": "u_pu", "unit": "pu", "series": [{"id": 1, "name": "…", "values": [1.0, …]}]}`
(`values` entries may be `null` for failed timesteps.)
Fields: node `u_pu, u, u_angle, p, q`; branch `loading, p_from, q_from, i_from, p_to, q_to, i_to, s_from`; source `p, q, i`; appliance `p, q, i`.

`GET /api/runs/{run_id}/envelope?component=node&field=u_pu`
→ `{"timestamps": […], "field": "u_pu", "unit": "pu", "min": […], "mean": […], "max": […], "p05": […], "p95": […]}` (aggregated across all elements per timestep)

`GET /api/runs/{run_id}/heatmap?component=branch&field=loading&max_columns=500`
→ `{"timestamps": […], "ids": [47, …], "names": ["R1", …], "values": [[…per timestamp…], …per element…], "aggregation": "max"}`
Timesteps are aggregated (max) into at most `max_columns` buckets. Elements are sorted by peak value, highest first.

`GET /api/runs/{run_id}/snapshot?t=<index>` → `{"index": 12, "timestamp": "…", "nodes": {"<id>": u_pu}, "branches": {"<id>": loading}}`
(keys are string ids; values may be null)

## Implementation notes (v0 backend)
- Branch `type` may also be `asym_line`.
- Error codes: 404 unknown resource · 409 conflict (duplicate case id, deleting an active run, results of a non-succeeded run) · 400 bad params/upload · 422 validation (`detail` is always a string; `POST /cases/{id}/runs` 422 also carries `ok, n_timesteps, issues`).
- `timeseries` `ids` is optional (omitted = all elements). `heatmap` `max_columns` defaults to 500 (1..5000).
- `csv` generator params: `file_id`, `column`, `repeat` (default true). `ev_charging` defaults to `add` mode (0/1 output, needs `magnitude_w`).
- `summary.violations` is capped at 5000 episodes; the KPI counts are always totals.
