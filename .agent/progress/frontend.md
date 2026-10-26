# Frontend progress journal

Task: build GridSim web frontend in `frontend/` (see docs/architecture.md, docs/api-contract.md). Don't touch backend/ or docs/. No git commits.

## Checklist
- [x] Scaffold Vite react-ts (create-vite 9.3.1), deps installed (TS pinned ~5.9 because openapi-typescript peer ^5)
- [ ] Config: vite (tailwind, proxy /api, vitest), eslint, package scripts (lint/test/types), exact versions
- [ ] Design tokens + UI components (src/components/ui)
- [ ] API layer: src/api/schema.ts, client.ts, hooks.ts
- [ ] App shell + routing + health indicator
- [ ] Cases list page
- [ ] Case editor (overview, network+diagram, time/calc, profiles, validate, run)
- [ ] Run page (SSE + polling)
- [ ] Results page + views registry (5 views + README)
- [ ] Runs list page
- [ ] Unit tests (vitest)
- [ ] build / lint / test green
- [ ] Smoke test against backend if available

## Verification status
build: n/a | lint: n/a | test: n/a

## Decisions
- ESLint (flat config) replaces scaffold's oxlint.

## Next step
Write frontend/vite.config.ts, eslint.config.js, scripts.
