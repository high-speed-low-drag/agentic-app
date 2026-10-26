# T4a: Integration hardening brief

Repo: GridSim (read `CLAUDE.md`, `docs/architecture.md`, `docs/api-contract.md`). The backend (`backend/`) and the frontend
(`frontend/`) are done and committed. Do not git commit; the orchestrator does that.
Keep `.agent/progress/T4a.md` updated after every sub-step: checklist, verify status, and a precise `Next step:` line.
The orchestrator is browsing the app on ports 8000/5173 at the same time. Do NOT use those ports, and do not kill processes
you did not start.

Work items:
1. **Frozen-case endpoint.** Add `GET /api/runs/{run_id}/case` → the CaseStudy frozen at run time (`runs/<id>/case.json`).
   Include a route, a `response_model`, a test, and a line in docs/api-contract.md under Runs. In the frontend, make the result
   views take limits from this endpoint instead of the live case (keep the 0.95/1.05/1.0 fallback).
2. **Contract drift guard.**
   - `make types` must work: check the Makefile's `types` target, which exports OpenAPI to `frontend/openapi.json` and
     generates `src/api/openapi.d.ts`. Decide whether `frontend/openapi.json` is committed (prefer committed, so the check runs offline).
   - Add `frontend/src/api/contract.check.ts`, compiled by `tsc -b`. It asserts at type level that the main hand-written types
     in `schema.ts` (CaseStudy, RunInfo, ResultSummary, NetworkTopology, ProfileGeneratorInfo, the results payloads) are
     compatible with the generated `components["schemas"][...]`. Use a mutual-assignability helper; you may relax
     nullability where the backend is stricter.
   - Add a backend test asserting that the committed `frontend/openapi.json` equals the freshly exported spec, so a changed
     backend model fails `make check` until `make types` is rerun. Note this in CLAUDE.md under Commands.
3. **Playwright e2e.**
   - Add `@playwright/test` (exact version) with config in `frontend/playwright.config.ts`, tests in `frontend/e2e/`, and a
     script `"e2e": "playwright test"`.
   - Use `webServer` entries:
     - The backend: `cd ../backend && GRIDSIM_WORKSPACE=<tmp dir> uv run gridsim serve --port 8100`.
     - A Vite dev server on port 5180 with the `/api` proxy pointed at 8100 (make the vite proxy target configurable via
       env `GRIDSIM_API`, default 127.0.0.1:8000).
   - Chromium only. Install the browser with `npx playwright install chromium`.
   - Test 1 (the happy path):
     - Open the cases list and see the seeded demo case.
     - Create a new case named "E2E feeder day" on the sample `vision_mv` network.
     - Set a 1-day window at 15 min. Add a residential_load assignment on all sym_load and a pv assignment on sym_gen.
     - Save, validate (no errors), run, wait for success.
     - On the results page, check that the KPI tiles show numbers, and that each tab in RESULT_VIEWS renders (a chart canvas,
       or table rows, is visible).
   - Test 2: validation shows an error for end <= start, or for an invalid resolution.
   - Test 3: the editor's Network tab renders the diagram and the element table.
   - Use stable `data-testid` attributes. Add them to components where needed, keeping changes minimal.
   - Keep the total runtime under ~60 s.
   - Make sure `make e2e` works from the repo root.
4. Run `make check` and `make e2e`. Both must pass.

Done check: `make check && make e2e` from the repo root.
