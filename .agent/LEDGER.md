# Task ledger: Milestone 1 (PoC)

Resume with the `/resume-build` skill. See `docs/agentic-workflow.md` for the protocol.
Only the orchestrator edits this file.

Goal: end-to-end, interactive web app: define case → run time-series PGM power flow → view results.

| id | task | status | deps | owns | done check |
|----|------|--------|------|------|------------|
| T0 | Contracts, repo layout, workflow | done | – | docs/, .agent/, .gitignore | files exist |
| T1 | Backend (models, registries, engine, runner, API, CLI, tests) | in_progress | T0 | backend/ | `cd backend && uv run pytest -q && uv run ruff check .` |
| T2 | Frontend (shell, case editor, run monitor, result views) | in_progress | T0 | frontend/ | `cd frontend && npm run build && npm run lint && npm run test` |
| T3 | Extension scaffolding: CLAUDE.md, add-result-view skill, Makefile | todo | T1,T2 | CLAUDE.md, .claude/skills/, Makefile | `make check` |
| T4 | Integration: generated TS types, e2e Playwright test, browser walkthrough | todo | T1,T2,T3 | frontend/e2e/, fixes anywhere | `make check && make e2e` |
| T5 | Final checkpoint commit + report | todo | T4 | – | git clean |

## Log
- 2026-10-26: T0 done. T1/T2 sub-agents started in parallel (briefs in `.agent/briefs/`).
- Note: T1/T2 journals are `.agent/progress/backend.md` / `frontend.md` (named before the T-id convention).
