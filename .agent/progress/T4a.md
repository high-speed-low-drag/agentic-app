# T4a progress — integration hardening

- [x] 1. Frozen-case endpoint: GET /api/runs/{id}/case (routes/runs.py, response_model=CaseStudy), test_run_frozen_case, api-contract.md line; frontend api.getRunCase + useRunCase, useRunContext reads limits + network from it (DEFAULT_LIMITS fallback kept)
- [x] 2. Contract drift guard: `make types` works; frontend/openapi.json committed (package.json `types` now reads the file); src/api/contract.check.ts (Loose<> + mutual assignability, 16 types); backend test_committed_openapi_is_current; CLAUDE.md Commands. schema.ts HeatmapResponse.aggregation tightened to 'max' (found by the guard).
- [x] 3. Playwright 1.64.1 e2e: playwright.config.ts (backend :8100 temp workspace, vite :5180 via GRIDSIM_API), tsconfig.e2e.json, e2e/{happy-path,validation,network}.spec.ts + helpers + global-teardown; data-testids added; vitest excludes e2e/
- [x] 4. make check + make e2e pass

Verify status: make check PASS (backend 48 tests, frontend lint/build/12 tests); make e2e PASS (3 tests, ~7.8 s wall)
Bug fixed: Validate/Save with an invalid time window only showed a "Save failed" toast; the 422 message now appears in the validation panel (CaseEditorPage.ensureSaved).
Next step: DONE — report to orchestrator.
