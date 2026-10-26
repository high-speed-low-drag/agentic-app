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
| T8 | Diagram clicks select quietly; only Edit in table jumps | done | T7 | frontend/ | `make check && make e2e` |
| T9 | Bug: show override-applied equipment values in profiles list and details panel | done | T8 | frontend/ | `make check && make e2e` |
| T10 | Generic branches editable (sn, R, X, in service) + results snapshot uses frozen overrides | done | T9 | backend/, frontend/ | `make check && make e2e` |
| T11 | Snapshot playback 8×/16×, proportional speeds, prefetch | done | – | frontend/ | `make check && make e2e` |
| T12 | Strong out-of-service cue (branches, appliances, islanded nodes) in both diagrams | done | T11 | frontend/ | `make check && make e2e` |
| T13 | Voltage colours: overvoltage red, undervoltage blue | done | T12 | frontend/ | `make check && make e2e` |
| T14 | Snapshot 24h day/night clock + daylight-shaded slider | done | T13 | frontend/ | `make check && make e2e` |

## Log
- 2026-10-26: profile scale factor shipped (d1d031c). T6 approved by user; sub-agent started.
- T6 done: make check (55 pytest, 17 vitest) + make e2e (4/4) verified by orchestrator; screenshots reviewed light/dark.
- T7 approved by user; sub-agent started.
- T7 done (resumed after usage limit): make check (55 pytest, 26 vitest) + make e2e (7/7) verified by orchestrator; screenshots reviewed.
- T8 approved by user; sub-agent started.
- T8 done: make check (55 pytest, 31 vitest) + make e2e (8/8) verified by orchestrator.
- T9 (bug fix) approved by user; sub-agent started.
- T9 done: make check (55 pytest, 36 vitest) + make e2e (9/9) verified by orchestrator. Found: results Network snapshot ignores frozen-case overrides (not fixed).
- Issue #1 raised (deferred): unrated branches show 0% loading. T10 approved by user; sub-agent started.
- Issue #2 raised (deferred): show/edit voltage regulators.
- T10 done: make check (58 pytest, 40 vitest) + make e2e (10/10) verified by orchestrator. Issue #1 partly addressed (ratings now settable).
- T11 approved by user; sub-agent started.
- T12 approved by user; queued until T11 is committed (both touch NetworkSnapshotView.tsx).
- T11 done: make check (58 pytest, 44 vitest) + make e2e (11/11) verified; 16x measured ~24.5 steps/s. T12 sub-agent started.
- T13 approved by user; queued until T12 is committed (snapshot view + legend).
- T12 done: make check (58 pytest, 48 vitest) + make e2e (12/12) verified; screenshots reviewed. T13 sub-agent started.
- T14 approved by user; queued until T13 is committed. Issue #3 raised (deferred): zoomable timeline.
- T13 done: make check (58 pytest, 58 vitest) + make e2e (12/12) verified. Orchestrator's commit -a swept T13 WIP into a brief commit; split it before checkpointing, and added an explicit-paths rule to docs/agentic-workflow.md. T14 sub-agent started.
- T14 done: make check (58 pytest, 69 vitest) + make e2e (13/13) verified; screenshots reviewed. Noted: toolbar time uses 12h AM/PM while clock uses 24h; clock card covers part of diagram.
- Issue #4 raised (deferred): clock polish (24h toolbar time, card covers diagram).
