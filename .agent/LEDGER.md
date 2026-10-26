# Task ledger: Milestone 1 (PoC)

Resume with the `/resume-build` skill. See `docs/agentic-workflow.md` for the protocol.
Only the orchestrator edits this file.

Goal: end-to-end, interactive web app: define case → run time-series PGM power flow → view results.

| id | task | status | deps | owns | done check |
|----|------|--------|------|------|------------|
| T0 | Contracts, repo layout, workflow | done | – | docs/, .agent/, .gitignore | files exist |
| T1 | Backend (models, registries, engine, runner, API, CLI, tests) | done | T0 | backend/ | `cd backend && uv run pytest -q && uv run ruff check .` |
| T2 | Frontend (shell, case editor, run monitor, result views) | done | T0 | frontend/ | `cd frontend && npm run build && npm run lint && npm run test` |
| T3 | Extension scaffolding: CLAUDE.md, add-result-view skill, Makefile | done | T1,T2 | CLAUDE.md, .claude/skills/, Makefile | `make check` |
| T4 | Integration: generated TS types, e2e Playwright test, browser walkthrough | done | T1,T2,T3 | frontend/e2e/, fixes anywhere | `make check && make e2e` |
| T5 | Final checkpoint commit + report | done | T4 | – | git clean |

## Log
- 2026-10-26: T0 done. T1/T2 sub-agents started in parallel (briefs in `.agent/briefs/`).
- Note: T1/T2 journals are `.agent/progress/backend.md` / `frontend.md` (named before the T-id convention).
- T3 drafted by orchestrator (CLAUDE.md, Makefile, add-result-view skill); verify once T1/T2 land.
- T1 done: 46 tests pass, ruff clean; 1-year 15-min run = 1.3 s. Verified by orchestrator.
- T2 done: build/lint/12 unit tests pass; browser-smoked by agent. Verified by orchestrator.
- T4 started: T4a sub-agent (frozen-case endpoint, contract drift guard, Playwright e2e on ports 8100/5180); orchestrator does browser walkthrough on 8000/5173.
- T4 browser walkthrough (orchestrator): cases → editor (network diagram, profile preview) → run (82 ms, 672 steps) → all result views OK; no backend errors. .claude/launch.json added for preview servers.
- T3/T4 done: make check (48 backend + 12 frontend tests, lint, types, drift guards) and make e2e (3 Playwright tests, 7.6 s) verified by orchestrator. T5: milestone 1 committed.

# Milestone 2: Iteration on user feedback

| id | task | status | deps | owns | done check |
|----|------|--------|------|------|------------|
| T6 | In-cell editing of equipment parameters (per-case overrides, amber cells, revert) | done | – | backend/, frontend/, docs/api-contract.md | `make check && make e2e` |
| T7 | Click-to-row: diagram ↔ table jump, flash, filters cleared, reverse centring | done | T6 | frontend/ | `make check && make e2e` |

## Log
- 2026-10-26: profile scale factor shipped (d1d031c). T6 approved by user; sub-agent started.
- T6 done: make check (55 pytest, 17 vitest) + make e2e (4/4) verified by orchestrator; screenshots reviewed light/dark.
- T7 approved by user; sub-agent started.
- T7 done (resumed after usage limit): make check (55 pytest, 26 vitest) + make e2e (7/7) verified by orchestrator; screenshots reviewed.
