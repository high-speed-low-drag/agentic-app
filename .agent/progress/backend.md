# Backend progress journal (agent: backend)

Scope: only `backend/` (+ this file). Do not commit. Contract: docs/api-contract.md (binding).

## Checklist (all done)
- [x] pyproject fixes (readme line removed, scripts -> gridsim.cli:app, ruff + pytest config)
- [x] models.py, registry.py, workspace.py (+ demo seed), validation.py
- [x] networks/ (base, sample, upload) + samples README (MPL-2.0 attribution)
- [x] profiles/ (constant, residential, commercial, pv, ev, csv) + csv_store
- [x] engine/pgm_adapter.py (chunked, failed scenarios -> NaN)
- [x] results/ (groups, writer, summary, query)
- [x] studies/ (timeseries_powerflow)
- [x] runner.py, api/ (app factory, routers, SSE, SPA mount), cli.py
- [x] tests (46), ruff clean
- [x] serve on :8000 + curl /api/cases returns seeded demo case (server stopped)
- [x] 1-year 15-min vision_mv CLI run: 1.26 s study time, 2.2 s wall

## Verification status
- `cd backend && uv run pytest -q`: 46 passed (~1.5 s)
- `uv run ruff check . && uv run ruff format --check .`: clean

## Decisions / deviations
- PGM 1.13: continue_on_batch_error=True does not raise; read `model.batch_error.failed_scenarios`.
- Added dep python-multipart (UploadFile). CLI uses RunManager(mark_stale=False).
- Branch type Literal also allows `asym_line` (additive).
- 422 on run start: {detail, ok, n_timesteps, issues}. Request validation 422 flattened to
  {detail: str, errors: [...]}. Domain errors: 404 unknown, 409 conflict/not-succeeded, 400 bad input.
- Upload network returns 200 (contract unspecified); violations list capped at 5000 (kpi counts are totals).
- results/ is a package; run dir also has elements.json (ids/names/types per group).

## Next step
None - backend complete. Possible follow-ups: frontend integration issues only.
