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
`GET /api/networks/editable-fields` → `{component: EditableField[]}`: per PGM component, the input fields a case may
override with `network_overrides` (components not listed have none).
```json
{"sym_load": [{"field": "p_specified", "label": "P", "unit": "MW", "scale": 1e-6, "kind": "float", "min": null, "max": null},
              {"field": "status", "label": "In service", "unit": "", "scale": 1.0, "kind": "bool", "min": 0, "max": 1}]}
```
`kind` is `float | int | bool`; `display value = SI value * scale`; `min`/`max` (inclusive, SI) are optional.
v0 fields: `sym_load`/`sym_gen` `p_specified, q_specified, status`; `line` `r1, x1, c1, i_n, from_status, to_status`;
`transformer` `sn, tap_pos, from_status, to_status`; `generic_branch` `sn, r1, x1, from_status, to_status`; `link` `from_status, to_status`; `source` `u_ref`.
`transformer.tap_pos` is an integer within the element's `tap_min..tap_max`. The UI shows `from_status`/`to_status` as
one "in service" toggle that sets both.

`GET /api/networks/addable-fields` → `AddableComponentSpec[]`: the components a case may add with `network_additions`, in
form order, with the fields the "add element" form shows and the PGM attributes filled automatically.
```json
[{"component": "line", "label": "Line", "kind": "branch",
  "fields": [{"field": "from_node", "label": "From node", "unit": "", "scale": 1.0, "kind": "node", "required": true, "default": null, "min": null, "max": null},
             {"field": "r1", "label": "R1", "unit": "Ω", "scale": 1.0, "kind": "float", "required": true, "default": 0.206, "min": 0, "max": null}],
  "fixed": {"from_status": 1.0, "to_status": 1.0, "tan1": 0.0}}]
```
`component` is one of `node | line | link | sym_load | sym_gen | shunt`; `kind` (`node | branch | appliance`) is the element
table tab. Field `kind` is `float | int | bool | node` (`node` = a node id reference); `default` is the SI value the form
prefills (`null` = none; the UI prefills node `u_rated` from the network). v0 defaults: line = 1 km 10 kV XLPE 3x1x150 mm² Al
cable (R1 0.206 Ω, X1 0.11 Ω, C1 0.33 µF, I_n 315 A); load/generator P 0.1 MW, Q 0; shunt G1 0. `fixed`: branch statuses 1,
appliance `status` 1, load/gen `type` 0 (const power), line `tan1` 0, shunt `g1` 0; an addition's `attrs` may override them.

`POST /api/networks/upload` (multipart, field `file`: PGM JSON input file) → `NetworkItem` (source `"upload"`)

`GET /api/networks/{source}/{key}` → `NetworkTopology`
```json
{
  "source": "sample", "key": "vision_mv", "name": "…",
  "nodes":      [{"id": 0, "name": "Rail B", "u_rated": 10500.0}],
  "branches":   [{"id": 47, "type": "line", "name": "R1", "from_node": 0, "to_node": 1, "in_service": true,
                  "params": {"r1": 0.2, "x1": 0.1, "c1": 1e-6, "i_n": 360.0, "from_status": 1.0, "to_status": 1.0}}],
  "appliances": [{"id": 104, "type": "sym_load", "name": "Load1", "node": 26, "p_specified": 1500000.0, "q_specified": 1000000.0, "in_service": true,
                  "params": {"p_specified": 1500000.0, "q_specified": 1000000.0, "status": 1.0}}],
  "sources":    [{"id": 99, "name": "source1", "node": 23, "u_ref": 1.0, "params": {"u_ref": 1.0}}],
  "counts": {"node": 47},
  "max_id": 128
}
```
Branch `type` is one of `line | link | transformer | generic_branch | three_winding_transformer` (3-winding: see `nodes` field below).
For `three_winding_transformer` the branch has `from_node`=node_1, `to_node`=node_2 and an extra `node_3`. Appliance `type` covers
`sym_load | sym_gen | asym_load | asym_gen | shunt`. Only `sym_load` and `sym_gen` are profile targets in v0.
Shunt appliances also carry `b1`, the positive-sequence susceptance in S (> 0 capacitive, < 0 inductive; `null` for other
appliance types), which the diagram uses to draw a capacitor or reactor symbol.
`max_id` is the largest PGM id over all components of the file (including ones the topology does not list, e.g. voltage
regulators); the UI gives new elements ids above it. Branches, appliances and sources carry `params`: the network file values (SI units) of that component's editable fields
(empty when it has none). A field the file does not set (PGM NaN, e.g. `sn` of IEEE 14's generic branches) is `null`;
a case may still override it.

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
     "mode": "scale", "magnitude_w": null, "factor": 1.0}   // factor: 0..100, multiplies m(t) (stress tests, e.g. 2 = twice the peak)
  ],
  "network_overrides": [                                   // default []; edits on top of the unchanged network file
    {"component": "sym_load", "id": 104, "field": "p_specified", "value": 3000000.0}   // value in SI/PGM units, bools 0/1
  ],
  "network_additions": [                                   // default []; new elements on top of the unchanged network file
    {"component": "node", "id": 129, "name": "New node 1", "attrs": {"u_rated": 10500.0}, "position": null},
    {"component": "line", "id": 130, "name": "New line 1",
     "attrs": {"from_node": 5, "to_node": 129, "r1": 0.206, "x1": 0.11, "c1": 3.3e-7, "i_n": 315.0}, "position": null}
  ],
  "created_at": "…", "updated_at": "…"
}
```
Overrides are written into a copy of the network's input data before profiles are applied, so `scale` profiles scale the
overridden base value. Validation reports, naming the element and field: unknown/non-editable component, unknown id,
non-editable field, duplicates, out-of-range or non-integer/non-boolean values, and PGM `validate_input_data` failures
after the overrides (prefixed `After overrides:`). The run's frozen `case.json` contains the overrides.
Additions (`NetworkAddition`: `component`, `id`, `name` (non-empty), `attrs` = PGM input attributes in SI units with node
references as ids and booleans 0/1, optional `position: {x, y}` for the diagram, stored as-is) are appended to copies of the
input arrays **before** the overrides, so overrides, profile targets (`ids`) and results may refer to added elements, which
appear under their `name`. Validation reports, naming the new element: duplicate id, id already used by any element of the
network (ids are unique across components), missing required or unknown attribute, non-finite or out-of-range values, a node
reference that is neither a file node nor an added node, a line/link with from = to node, PGM `validate_input_data`
failures after the additions (prefixed `After additions:`), and a warning for a link between nodes of different `u_rated`.
When an addition has an error, the override and study checks are skipped. The run's frozen `case.json` contains the additions.
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
