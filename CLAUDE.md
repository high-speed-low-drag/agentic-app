# GridSim

A local web app for time-series load flow studies on
[power-grid-model](https://github.com/PowerGridModel/power-grid-model).
Users define a case (network + time window + profiles), run it, and explore
results, all through the web UI. **The runtime is deterministic: no LLM calls
and no chat UI.** AI is used to *build and extend* the app with agentic coding.

Read `docs/architecture.md` (design and extension points) and
`docs/api-contract.md` (HTTP API, the binding backend↔frontend contract) before
making changes.

## Layout
- `backend/`: Python 3.12, uv, FastAPI, PGM. Package `backend/src/gridsim/`.
  - Registries (extension points): `networks/` (network sources), `profiles/` (profile
    generators), `studies/` (study types).
  - `engine/pgm_adapter.py` (batch power flow), `runner.py` (jobs), `results/`
    (queries), `workspace.py` (file storage), `api/` (routes), `cli.py`.
- `frontend/`: Vite + React + TS + Tailwind + ECharts + Cytoscape.
  - `src/api/`: types, client, react-query hooks. `src/results/views/`: result-view registry.
- `workspace/`: runtime data (gitignored). Override with `GRIDSIM_WORKSPACE`.
- `.agent/`: agentic build state (ledger, briefs, progress journals).

## Commands
- `make install`: install deps. `make dev`: backend :8000 + frontend :5173.
- `make check`: lint + types + unit tests for both halves. **Must pass before you call a change done.**
- `make e2e`: Playwright end-to-end tests (own backend :8100 + Vite :5180, temp workspace; needs
  `cd frontend && npx playwright install chromium` once).
- `make types`: after any backend model/route change, re-export `frontend/openapi.json` (committed) and
  regenerate `frontend/src/api/openapi.d.ts`. Drift guards in `make check`: backend test
  `test_committed_openapi_is_current` fails while `openapi.json` is stale, and
  `frontend/src/api/contract.check.ts` fails `tsc -b` while `schema.ts` disagrees with the generated types.
- `cd backend && uv run gridsim run <case_id>`: headless run, for checking numbers without the UI.

## Rules
- Add features at the extension points: one new module + one registry entry + a test. Don't
  special-case inside core code.
- Change an API shape → update the Pydantic model, `docs/api-contract.md`, run `make types`,
  and fix the frontend in the same change.
- Never loop over timesteps in Python for power flow. Use PGM batch `update_data`.
- Use `uv run` for Python (system Python is too old) and `npm` for the frontend.
- Recipes: `.claude/skills/add-result-view/`. Add more skills as new extension patterns emerge.

## Agentic build workflow
Multi-step work is orchestrated with sub-agents and must survive usage limits/resets.
Follow `docs/agentic-workflow.md`:
- **All implementation runs in background sub-agents, even small changes.** The main session only
  orchestrates (plans, briefs, verifies, commits), so it stays available to the user.
- **Go-ahead gate:** before sending a task to build, give the user a 1–2 paragraph brief: what changes and why,
  the approach and trade-offs, the files touched, and how it is verified. Then wait for the user's explicit
  go-ahead. Each task needs its own approval.
- The ledger `.agent/LEDGER.md` is the plan and status.
- Briefs go in `.agent/briefs/`, and journals in `.agent/progress/`.
- Only the orchestrator commits `checkpoint(<id>)` after the task's done check passes.
- Resume with `/resume-build`.
