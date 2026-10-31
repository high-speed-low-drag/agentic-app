# GridSim

Time-series load flow studies on [power-grid-model](https://github.com/PowerGridModel/power-grid-model), as a local web app.

```bash
make install
make dev   # http://localhost:5173
```

## Running without make

If `make` isn't available, run the commands it wraps. Prerequisites: [uv](https://docs.astral.sh/uv/) (it provides Python 3.12) and Node 26 (pinned in `frontend/.nvmrc`; with nodenv, run `nodenv install <26.x> && cd frontend && nodenv local <26.x>`).

**Install dependencies** (what `make install` runs):

```bash
cd backend && uv sync && cd ..
```

```bash
cd frontend && npm install && cd ..
```

**Run in development mode** (live reload, same as `make dev`). Use two terminals. In the first, start the backend:

```bash
cd backend && uv run gridsim serve --reload
```

In the second, start the frontend:

```bash
cd frontend && npm run dev
```

Then open http://localhost:5173.

See `docs/architecture.md`, `docs/api-contract.md`, and `docs/agentic-workflow.md` (how the app is built/extended with sub-agents).

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request to `main` and every push to `main`:
`make ci-install` (`uv sync --frozen` + `npm ci`), `make check` (lint, types, unit tests), then `make e2e`
(Playwright, Chromium). Python 3.12 comes via uv; Node comes from `frontend/.nvmrc`. On failure the Playwright
report and traces are uploaded as the `playwright-report` artifact.

Reproduce locally (`make dev` can keep running; e2e uses its own ports 8100/5180):

```bash
make check && make e2e      # add CI=1 to get CI's retries and HTML report
```

## License

Apache License 2.0; see `LICENSE` and `NOTICE`. GridSim depends on
[power-grid-model](https://github.com/PowerGridModel/power-grid-model) (MPL-2.0), used unmodified as a library.
