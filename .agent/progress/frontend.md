# Frontend progress journal

Task: build GridSim web frontend in `frontend/` (see docs/architecture.md, docs/api-contract.md). Don't touch backend/ or docs/. No git commits.

## Checklist
- [x] Scaffold Vite react-ts (create-vite 9.3.1), deps installed (TS pinned ~5.9 because openapi-typescript peer ^5)
- [x] Config: vite (tailwind, proxy /api, vitest), eslint, package scripts (lint/test/types), exact versions
- [x] Design tokens + UI components (src/components/ui)
- [x] API layer: src/api/schema.ts, client.ts, hooks.ts
- [x] App shell + routing + health indicator
- [x] Cases list page
- [x] Case editor (pages/CaseEditorPage.tsx + pages/case-editor/*)
- [x] Run page (SSE + polling)
- [x] Results page + views registry (5 views + README)
- [x] Runs list page
- [x] Unit tests (vitest)
- [x] build / lint / test green
- [x] Smoke test against backend (browser: cases, editor tabs, diagram, preview, save/validate, run+SSE, all 5 result views, delete). Servers stopped; test case/run cleaned up.

## Verification status
build: PASS | lint: PASS (0 problems) | test: PASS (12 tests)

## Decisions
- Backend notes: asym_line branch type added; 422 run issues read from top-level `issues`.
- ESLint (flat config) replaces scaffold's oxlint.
- Own ECharts wrapper (components/charts/EChart.tsx) instead of echarts-for-react; theme from CSS vars (charts/theme.ts).
- Network diagram: components/network/ (graph.ts pure helpers, NetworkDiagram.tsx cytoscape+fcose/breadthfirst).
- Run limits: no frozen-case endpoint in contract -> GET /api/cases/{run.case_id}, fallback 0.95/1.05/1.0.

## Next step
DONE. Final report delivered. Optional follow-ups: swap schema.ts to re-export from generated openapi.d.ts; e2e tests.