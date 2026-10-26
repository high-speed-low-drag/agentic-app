---
name: add-result-view
description: Add a new chart/table/visual to the GridSim results page (e.g. "add a transformer loading duration curve", "show losses over time"). Covers the frontend result-view registry and, when needed, a new backend results endpoint.
---

# Add a result view

Result views are self-contained React components that the Results page
renders from a registry. Adding one should not require editing the Results page.

## 1. Decide whether existing endpoints suffice

These endpoints already exist (see `docs/api-contract.md`, "Results"):
- `summary`: KPIs, per-element extremes, violations
- `timeseries`: raw series per element and field
- `envelope`: min/p05/mean/p95/max across elements per timestep
- `heatmap`: elements × time-buckets matrix
- `snapshot`: all values at one timestep

If one of them gives you the data, skip to step 3. Prefer client-side shaping
(sorting, cumulative sums, duration curves) over new endpoints, unless the
payload would exceed ~5 MB.

## 2. (Optional) New backend endpoint

- Add the query function in `backend/src/gridsim/results/query.py`. Read the run's parquet
  through the existing cached loaders.
- Add a Pydantic response model in `backend/src/gridsim/models.py`, and the route in
  `backend/src/gridsim/api/routes/results.py`. Set `response_model`.
- Document it in `docs/api-contract.md`.
- Add an API test in `backend/tests/` that runs a small study and calls the endpoint.
- Run `make types` to regenerate the frontend types.

## 3. Frontend view

- Create `frontend/src/results/views/<Name>View.tsx`. Export a component that takes
  `ResultViewProps` (`{ runId, summary }`) and fetches its own data with a
  hook from `src/api/hooks.ts` (add one there if needed).
- Use the shared chart wrapper and components (see existing views like
  `VoltageEnvelopeView.tsx` as the reference example). Handle loading, empty and error states.
- Register it with one entry in `frontend/src/results/views/index.ts`:
  `{ id: "<kebab-id>", title: "<Title>", description: "<one line>", component: <Name>View }`.
- Add a Vitest test if the view contains non-trivial data shaping (put the shaping in
  a pure function and test that).

## 4. Verify

- Run `make check` (lint, types, unit tests for both halves).
- Run `make e2e`, or open the app (`make dev`), run the demo case and look at the new view
  in the browser. Check light and dark mode.
