# GridSim

Time-series load flow studies on [power-grid-model](https://github.com/PowerGridModel/power-grid-model), as a local web app.

```bash
make install
make dev   # http://localhost:5173
```

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
