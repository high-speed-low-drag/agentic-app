# GridSim: rebuild specification

This document is a complete, self-contained build spec for **GridSim**, a local web app for time-series load
flow studies on [power-grid-model](https://github.com/PowerGridModel/power-grid-model) (PGM). A coding agent
with no other context must be able to rebuild every feature from it, with the same behaviour. It is written
as instructions: "must" is binding, exact numbers and strings are binding (tests assert many of them).

## Table of contents

1. Purpose and principles
2. Tech stack (exact versions)
3. Repository layout and commands
4. Domain model and storage
5. HTTP API (complete contract)
6. Engine and algorithms
7. Frontend, page by page
8. Network diagram
9. Results network snapshot
10. Charts
11. Design tokens and formatting
12. Testing
13. CI
14. Agentic build workflow and recommended build order
15. Known pitfalls and decisions
16. Deferred backlog (not part of the rebuild)

Appendix A. Bundled files (sample networks, attribution README, favicon), verbatim

---

## 1. Purpose and principles

GridSim lets an engineer define a **case** (a network + a time window + load/generation profiles + optional
per-case equipment edits), **run** it as a time-series power flow, and **explore the results** (KPIs,
voltage envelope, element time series, loading heatmap, violations, an animated network snapshot), all in a
browser. It runs locally: a FastAPI backend on `127.0.0.1:8000` and a Vite/React frontend on `:5173` in
development, or the backend serving the built frontend in production.

Principles (all binding):

1. **Deterministic runtime, no LLM in the app.** The app is an ordinary web app: forms, buttons, tables,
   charts. There are no LLM calls, no chat UI and no AI features at runtime. Every generator is
   deterministic given its seed.
2. **Built and extended with agentic coding.** The codebase is shaped so a coding agent can extend it safely:
   explicit extension points (registries), typed contracts (Pydantic models, generated TypeScript types with
   drift guards), one-command verification (`make check`, `make e2e`), and recipes in `.claude/skills/`.
   Add features at an extension point: one new module + one registry entry + a test; do not special-case
   inside core code.
3. **Time series = one PGM batch calculation.** The network is built once; the profiles become a PGM
   `update_data` batch with one scenario per timestep. Never loop over timesteps in Python for power flow.
   The batch is calculated in chunks only to report progress and allow cancellation.
4. **Per-case overrides on an unchanged network file.** Equipment edits are stored in the case as
   `network_overrides` (component, id, field, SI value) and written into a *copy* of the input arrays before
   the profiles are applied. Network files (bundled samples, uploads) are never modified. Profiles in
   `scale` mode therefore scale the overridden base values.
5. **Display settings vs study data.** Study data (case, limits, overrides) lives in the backend workspace
   and is frozen into each run. Pure display preferences (the four-point voltage colour scale) live in the
   browser (`localStorage`), apply to every run, and never change results. Result views read limits and
   overrides from the run's **frozen case**, not the live case.

Extension points:

| Extension point   | Backend location                 | Frontend location                        |
|-------------------|----------------------------------|------------------------------------------|
| Network source    | `backend/src/gridsim/networks/`  | generic picker (no change needed)        |
| Profile generator | `backend/src/gridsim/profiles/`  | form generated from the JSON schema      |
| Study type        | `backend/src/gridsim/studies/`   | none                                     |
| Result view       | optional new results endpoint    | `frontend/src/results/views/` registry   |
| Editable field    | `backend/src/gridsim/networks/editable.py` | table columns generated from the API |

---

## 2. Tech stack (exact versions)

Pin these versions (they are the locked versions of the reference build). Use `uv` for Python (the system
Python is too old) and `npm` for the frontend.

### Backend (`backend/pyproject.toml`, `backend/uv.lock`)

| Item | Version |
|------|---------|
| Python | 3.12 (`backend/.python-version` = `3.12`, `requires-python = ">=3.12"`) |
| uv | 0.12.18 (build backend `uv_build>=0.12.18,<0.13.0`) |
| power-grid-model | 1.13.209 |
| fastapi | 0.162.0 (starlette 1.10.0) |
| pydantic | 2.14.1 |
| pandas | 3.1.0 |
| numpy | 2.5.4 (transitive) |
| pyarrow | 26.0.0 |
| python-multipart | 0.0.32 (needed for `UploadFile`) |
| pyyaml | 6.0.3 |
| typer | 0.27.3 |
| uvicorn[standard] | 0.54.0 |
| dev: pytest | 9.1.1 |
| dev: httpx | 0.28.1 (FastAPI `TestClient`) |
| dev: ruff | 0.17.2 |

`pyproject.toml` essentials:

```toml
[project]
name = "gridsim"
version = "0.1.0"
description = "GridSim: time-series load flow studies on power-grid-model"
requires-python = ">=3.12"
dependencies = ["fastapi>=0.162.0", "pandas>=3.1.0", "power-grid-model>=1.13.209", "pyarrow>=26.0.0",
  "pydantic>=2.14.1", "python-multipart>=0.0.32", "pyyaml>=6.0.3", "typer>=0.27.3", "uvicorn[standard]>=0.54.0"]
[project.scripts]
gridsim = "gridsim.cli:app"
[build-system]
requires = ["uv_build>=0.12.18,<0.13.0"]
build-backend = "uv_build"
[dependency-groups]
dev = ["httpx>=0.28.1", "pytest>=9.1.1", "ruff>=0.17.2"]
[tool.ruff]
line-length = 100
target-version = "py312"
[tool.ruff.lint]
select = ["E", "F", "W", "I", "UP", "B", "SIM"]
[tool.pytest.ini_options]
testpaths = ["tests"]
filterwarnings = ["ignore:Using `httpx` with `starlette.testclient`"]
```

No `readme` key (it breaks the build when the file is absent).

### Frontend (`frontend/package.json`, exact versions, no ranges)

| Item | Version |
|------|---------|
| Node | 26 (`frontend/.nvmrc` = `26`; `"engines": {"node": ">=26"}`) |
| react, react-dom | 19.3.1 |
| typescript | 5.9.3 (pinned to 5.9 because openapi-typescript's peer range is `^5`) |
| vite | 8.3.5 |
| @vitejs/plugin-react | 6.1.2 |
| tailwindcss, @tailwindcss/vite | 4.3.3 |
| react-router | 8.5.0 (`createBrowserRouter`, `lazy` routes) |
| @tanstack/react-query | 5.104.5 |
| echarts | 6.1.0 (own thin wrapper, no echarts-for-react) |
| cytoscape | 3.34.4 |
| cytoscape-fcose | 2.2.0 (needs a local `src/types/cytoscape-fcose.d.ts` module declaration) |
| @types/cytoscape | 3.21.9 |
| lucide-react | 1.61.0 (icons) |
| vitest | 5.0.5, jsdom 30.1.3 |
| @testing-library/react 16.3.3, @testing-library/dom 10.4.2, @testing-library/jest-dom 7.0.1 | |
| @playwright/test | 1.64.1 (Chromium only) |
| eslint | 10.13.0, @eslint/js 10.0.1, typescript-eslint 8.72.0 |
| eslint-plugin-react-hooks 7.1.1, eslint-plugin-react-refresh 0.5.7, globals 17.13.0 | |
| openapi-typescript | 7.13.0 |
| @types/node 24.19.2, @types/react 19.3.0, @types/react-dom 19.3.0 | |

`package.json` scripts:

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "lint": "eslint .",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "e2e": "playwright test",
  "types": "openapi-typescript openapi.json -o src/api/openapi.d.ts"
}
```

Config essentials:

- `vite.config.ts`: plugins `react()`, `tailwindcss()`; `server.port = 5173`; proxy `/api` to
  `process.env.GRIDSIM_API || 'http://127.0.0.1:8000'` with `changeOrigin: true`;
  `build.chunkSizeWarningLimit = 2000`; Vitest: `environment: 'jsdom'`, `globals: false`,
  `setupFiles: ['./src/test/setup.ts']` (imports `@testing-library/jest-dom/vitest`), `css: false`,
  `exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**']`.
- TypeScript: `tsconfig.json` references `tsconfig.app.json` (src, DOM, `jsx: react-jsx`, bundler
  resolution, `strict`, `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`,
  `verbatimModuleSyntax`, `noFallthroughCasesInSwitch`, target es2023, `types: ["vite/client"]`),
  `tsconfig.node.json` (vite.config.ts) and `tsconfig.e2e.json` (`playwright.config.ts` and `e2e/`, types
  `node`). `tsc -b` therefore type-checks the app, the config and the e2e specs.
- ESLint flat config: ignore `dist`, `src/api/openapi.d.ts`, `test-results`, `playwright-report`; files
  `**/*.{ts,tsx}` extend `js.configs.recommended`, `tseslint.configs.recommended`,
  `reactHooks.configs.flat.recommended`, `reactRefresh.configs.vite`; rules:
  `react-refresh/only-export-components: ['warn', {allowConstantExport: true}]`,
  `@typescript-eslint/no-unused-vars: ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_'}]`.
  Use ESLint, not the scaffold's oxlint.
- `index.html`: title `GridSim`, favicon `/favicon.svg`, `<div id="root">`, module script `/src/main.tsx`.
- Do not run Prettier (the project has no Prettier config; it would rewrite quotes). Code style: single
  quotes, no semicolons, 2-space indent, long lines allowed (~120-140).

---

## 3. Repository layout and commands

```
.
├── CLAUDE.md                      agent entry point: layout, commands, rules, workflow summary
├── README.md                      quick start + CI section
├── Makefile                       install / ci-install / dev / types / check / e2e / build / serve
├── project.md                     this spec
├── .gitignore                     __pycache__, .venv, caches, node_modules, frontend/dist, workspace/, test-results/, playwright-report/
├── .github/workflows/ci.yml       CI: make check + make e2e
├── .claude/
│   ├── settings.json              SessionStart hook printing unfinished ledger tasks
│   ├── launch.json                preview servers: backend :8000, frontend :5173
│   └── skills/
│       ├── add-result-view/SKILL.md   recipe: add a results view (and optional endpoint)
│       └── resume-build/SKILL.md      recipe: resume the agentic build after an interruption
├── .agent/
│   ├── LEDGER.md                  task ledger (plan + status + log)
│   ├── briefs/<task>.md           full task prompts
│   └── progress/<task>.md         per-task journals written by sub-agents
├── docs/
│   ├── architecture.md            design, extension points, time-series model, storage
│   ├── api-contract.md            the binding HTTP contract (section 5 of this spec)
│   └── agentic-workflow.md        the resumable workflow (section 14)
├── workspace/                     runtime data (gitignored; GRIDSIM_WORKSPACE overrides)
├── backend/
│   ├── pyproject.toml, uv.lock, .python-version
│   ├── src/gridsim/
│   │   ├── __init__.py            __version__ = "0.1.0"
│   │   ├── models.py              all Pydantic API models
│   │   ├── registry.py            generic Registry[T]
│   │   ├── workspace.py           file storage, slugify, atomic JSON, demo seed
│   │   ├── validation.py          validate_case (network, overrides, study checks)
│   │   ├── runner.py              RunManager: thread pool, run.json state, cancel, SSE watch
│   │   ├── cli.py                 typer: serve | run | cases | export-openapi
│   │   ├── api/
│   │   │   ├── app.py             create_app(): routers, error mapping, CORS, SPA mount
│   │   │   ├── deps.py            WorkspaceDep, RunnerDep
│   │   │   └── routes/            health, networks, profiles, cases, runs, results
│   │   ├── networks/              NETWORK SOURCES registry
│   │   │   ├── base.py            LoadedNetwork, NetworkSource protocol, build_topology, load_pgm_json
│   │   │   ├── sample.py          bundled samples (vision_mv, ieee14)
│   │   │   ├── upload.py          uploaded PGM JSON networks
│   │   │   ├── editable.py        EDITABLE_FIELDS registry
│   │   │   └── overrides.py       check_overrides / apply_overrides
│   │   ├── profiles/              PROFILE GENERATORS registry
│   │   │   ├── base.py            ProfileGenerator ABC + vectorised helpers
│   │   │   ├── constant.py, residential.py, commercial.py, pv.py, ev.py, csv_profile.py
│   │   │   └── csv_store.py       uploaded CSV storage + parsing
│   │   ├── studies/               STUDY TYPES registry
│   │   │   ├── base.py            StudyType protocol, RunCancelled, StudyOutcome
│   │   │   └── timeseries_powerflow.py   build_update + validate + run
│   │   ├── engine/pgm_adapter.py  chunked batch power flow (iter_power_flow, pick_chunk_size)
│   │   ├── results/
│   │   │   ├── groups.py          result groups (node/branch/source/appliance), fields, units
│   │   │   ├── writer.py          streaming parquet writer + summary accumulators
│   │   │   ├── summary.py         KPIs, extremes, violation episodes
│   │   │   └── query.py           ResultStore: timeseries / envelope / heatmap / snapshot
│   │   └── samples/networks/      vision_mv.json, ieee14.json, README.md (MPL-2.0 attribution)
│   └── tests/                     conftest + test_api, test_cli, test_engine, test_networks,
│                                  test_overrides, test_profiles, test_registry, test_study
└── frontend/
    ├── package.json, package-lock.json, .nvmrc, vite.config.ts, eslint.config.js, tsconfig*.json
    ├── index.html, public/favicon.svg
    ├── openapi.json               committed OpenAPI export (drift guard input)
    ├── playwright.config.ts
    ├── e2e/                       Playwright specs + helpers.ts + global-teardown.ts
    └── src/
        ├── main.tsx               QueryClient + ToastProvider + RouterProvider
        ├── router.tsx             routes (lazy editor / run pages)
        ├── index.css              Tailwind + design tokens (light/dark)
        ├── api/                   schema.ts (hand-written types), client.ts (fetch), hooks.ts (react-query),
        │                          openapi.d.ts (generated), contract.check.ts (type-level drift guard)
        ├── lib/                   format, time, utils, jsonSchema, solar, voltageScale, useElementWidth
        ├── components/
        │   ├── ui/                Badge, Button(+IconButton), Card, EmptyState/LoadingState/ErrorState,
        │   │                      Field/TextInput/Checkbox, LinkButton, Modal/ConfirmDialog, MultiSelect,
        │   │                      NumberInput, Progress, Select, Spinner, Table, Tabs/Segmented, Toast
        │   ├── layout/            AppShell, HealthIndicator, Page
        │   ├── charts/            EChart wrapper, theme (tokens -> ChartTheme, axes, dataZoom, mix)
        │   ├── network/           NetworkDiagram, graph, symbols, energised, overrides, selection,
        │   │                      useNetworkSelection, ElementTable, EditableCell, EditedMarker,
        │   │                      ElementDetails, NetworkExplorer, Legend, VoltageScaleLegend
        │   ├── SchemaForm.tsx     form from a JSON schema
        │   └── RunStatusBadge.tsx
        ├── pages/                 CasesPage, CaseEditorPage (+ case-editor/*), RunPage, RunsPage, NotFoundPage
        ├── results/               ResultsPanel, KpiTiles, TimeseriesChart, limitLines, useRunContext,
        │                          timestamps, worst, types, views/ (registry + views + README)
        └── test/setup.ts
```

### Make targets (exact recipes)

```make
install:      cd backend && uv sync ; cd frontend && npm install
ci-install:   cd backend && uv sync --frozen ; cd frontend && npm ci
dev:          trap 'kill 0' INT TERM EXIT; (cd backend && uv run gridsim serve --reload) & (cd frontend && npm run dev) & wait
backend:      cd backend && uv run gridsim serve --reload
frontend:     cd frontend && npm run dev
types:        cd backend && uv run gridsim export-openapi ../frontend/openapi.json
              cd frontend && npx openapi-typescript openapi.json -o src/api/openapi.d.ts
check:        check-backend check-frontend
check-backend:  cd backend && uv run ruff check . && uv run ruff format --check . && uv run pytest -q
check-frontend: cd frontend && npm run lint && npm run build && npm run test
e2e:          cd frontend && npm run e2e
build:        cd frontend && npm run build
serve:        build, then cd backend && uv run gridsim serve
```

`make check` must pass before any change is called done. `make e2e` needs
`cd frontend && npx playwright install chromium` once. After any backend model/route change run
`make types` and commit both `frontend/openapi.json` and `frontend/src/api/openapi.d.ts`.

### CLI (`gridsim`, typer, `uv run gridsim ...` from `backend/`)

- `serve [--host 127.0.0.1] [--port 8000] [--reload/--no-reload]`: `uvicorn.run("gridsim.api.app:create_app",
  factory=True, ...)`. API under `/api`; serves `frontend/dist` at `/` if it was built.
- `run <case>`: argument is a path to a case JSON file (if it ends in `.json` and exists) or a case id in the
  workspace. Validates (prints `[level] message` lines to stderr; exit code 2 if invalid), creates a run
  with `RunManager(ws, mark_stale=False)`, executes it synchronously, prints
  `Run <id>: <name> (<n> timesteps)`, progress lines `  {pct:5.1f}%  {message}` (throttled to 0.5 s),
  `Status: <status> in <s> s`, then each KPI as `  {key:22s} {value:.4g}` (floats) and
  `Results: <run dir>`. Exit code 1 if the run did not succeed (prints `Error: ...`).
- `cases`: seeds the demo case if the workspace is empty, then prints `{id:40s} {name}  [{source}/{key}]`.
- `export-openapi <path>`: writes `json.dumps(create_app().openapi(), indent=2) + "\n"`, prints `Wrote <path>`.

### Preview servers (`.claude/launch.json`)

```json
{"version": "0.0.1", "configurations": [
  {"name": "backend", "runtimeExecutable": "uv", "runtimeArgs": ["run", "--project", "backend", "gridsim", "serve", "--port", "8000"], "port": 8000},
  {"name": "frontend", "runtimeExecutable": "npm", "runtimeArgs": ["--prefix", "frontend", "run", "dev"], "port": 5173}]}
```

Port conventions: `make dev` 8000/5173; e2e 8100/5180; manual servers started by sub-agents 8200/5190.

---

## 4. Domain model and storage

All API models live in `backend/src/gridsim/models.py` (Pydantic v2). JSON is `snake_case`. Timestamps are
**naive** ISO-8601 local wall-clock strings without timezone (`"2026-07-01T00:00:00"`); any timezone in
input is dropped (`value.replace(tzinfo=None)`), never converted.

### 4.1 Type aliases and constants

```python
MAX_TIMESTEPS = 100_000
CalculationMethodName = Literal["newton_raphson", "iterative_current", "linear", "linear_current"]
RunStatus = Literal["queued", "running", "succeeded", "failed", "cancelled"]
TERMINAL_STATUSES = frozenset({"succeeded", "failed", "cancelled"})
BranchType = Literal["line", "asym_line", "link", "transformer", "generic_branch", "three_winding_transformer"]
ApplianceType = Literal["sym_load", "sym_gen", "asym_load", "asym_gen", "shunt"]
TargetComponent = Literal["sym_load", "sym_gen"]           # profile targets in v0
ResultComponent = Literal["node", "branch", "source", "appliance"]
EditableFieldKind = Literal["float", "int", "bool"]
ParamValues = dict[str, float | None]   # None = the network file does not set that field (PGM NaN)
```

### 4.2 Models (field: type = default; validation)

Meta and networks:

```python
class Health:            status: str = "ok"; pgm_version: str
class NetworkRef:        source: str   # e.g. "sample" | "upload"
                         key: str
class NetworkItem:       source: str; key: str; name: str; description: str = ""; counts: dict[str, int] = {}
class EditableField:     field: str; label: str
                         unit: str = ""          # display unit
                         scale: float = 1.0      # display value = SI value * scale
                         kind: EditableFieldKind = "float"
                         min: float | None = None   # inclusive, SI
                         max: float | None = None   # inclusive, SI
class TopologyNode:      id: int; name: str; u_rated: float
class TopologyBranch:    id: int; type: BranchType; name: str; from_node: int; to_node: int
                         node_3: int | None = None   # three-winding only (from=node_1, to=node_2)
                         in_service: bool = True
                         params: ParamValues = {}    # file values of the editable fields (SI)
class TopologyAppliance: id: int; type: ApplianceType; name: str; node: int
                         p_specified: float | None = None; q_specified: float | None = None
                         b1: float | None = None     # shunts only: positive-sequence susceptance (S); >0 capacitive, <0 inductive
                         in_service: bool = True; params: ParamValues = {}
class TopologySource:    id: int; name: str; node: int; u_ref: float; params: ParamValues = {}
class NetworkTopology:   source: str; key: str; name: str; nodes: list[TopologyNode]; branches: list[TopologyBranch]
                         appliances: list[TopologyAppliance]; sources: list[TopologySource]; counts: dict[str, int]
```

Case study:

```python
class TimeSettings:
    start: datetime; end: datetime            # tz stripped by a field validator
    resolution_minutes: int = 15              # ge=1, le=1440
    # model validator (after): end <= start  -> ValueError("end must be after start")
    #                          n_timesteps > MAX_TIMESTEPS -> ValueError(
    #   f"time window has {n} timesteps; the maximum is 100000")
    n_timesteps = ceil((end - start) / timedelta(minutes=resolution_minutes))   # property
    timestamps() = pd.date_range(start, periods=n_timesteps, freq=f"{resolution_minutes}min")
    # timesteps are start, start+res, ... with end EXCLUDED

class CalculationSettings:
    method: CalculationMethodName = "newton_raphson"
    error_tolerance: float = 1e-8             # gt=0
    max_iterations: int = 20                  # ge=1, le=1000

class Limits:
    u_min_pu: float = 0.95; u_max_pu: float = 1.05; loading_max: float = 1.0

class ProfileTarget:
    component: TargetComponent = "sym_load"
    ids: list[int] | None = None              # None = all elements of the component

class ProfileAssignment:
    id: str = "a1"; label: str = ""; generator: str
    params: dict[str, Any] = {}
    target: ProfileTarget = ProfileTarget()
    mode: Literal["scale", "add"] = "scale"
    magnitude_w: float | None = None          # required for mode "add" (W)
    factor: float = 1.0                       # ge=0, le=100; multiplies m(t) in both modes

class NetworkOverride:
    component: str                            # PGM component, e.g. "sym_load"
    id: int; field: str
    value: float                              # SI/PGM units; booleans as 0/1

class CaseStudy:
    id: str | None = None                     # slug; server-generated on create if absent
    name: str                                 # min_length=1
    description: str = ""
    study_type: str = "timeseries_powerflow"
    network: NetworkRef; time: TimeSettings
    calculation: CalculationSettings = CalculationSettings()
    limits: Limits = Limits()
    profile_assignments: list[ProfileAssignment] = []
    network_overrides: list[NetworkOverride] = []
    created_at: datetime | None = None; updated_at: datetime | None = None

class ValidationIssue:   level: Literal["error", "warning"]; message: str
class ValidationResult:  ok: bool; n_timesteps: int; issues: list[ValidationIssue] = []
```

Runs and profiles:

```python
class RunInfo:
    id: str; case_id: str; case_name: str
    status: RunStatus = "queued"; progress: float = 0.0; message: str = ""
    n_timesteps: int = 0; n_failed_timesteps: int = 0
    created_at: datetime; started_at: datetime | None = None; finished_at: datetime | None = None
    duration_s: float | None = None; error: str | None = None

class CaseSummary:  id: str; name: str; description: str; network: NetworkRef; time: TimeSettings
                    updated_at: datetime | None; last_run: RunInfo | None = None

class ProfileGeneratorInfo:  key: str; name: str; description: str; applies_to: list[TargetComponent]
                             default_mode: Literal["scale", "add"]; params_schema: dict[str, Any]
class ProfilePreviewRequest: generator: str; params: dict[str, Any] = {}; time: TimeSettings
                             n_elements: int = 3      # ge=1, le=20
class ProfilePreviewResponse: timestamps: list[datetime]; series: list[list[float]]
class ProfileUploadInfo:     file_id: str; filename: str; columns: list[str]; n_rows: int; start: datetime; end: datetime
```

Results:

```python
class Kpis:  u_min_pu: float | None; u_max_pu: float | None; loading_max: float | None
             n_voltage_violations: int; n_loading_violations: int
             energy_import_mwh: float; energy_losses_mwh: float; n_failed_timesteps: int
class NodeExtremes:   id: int; name: str; u_min_pu, u_max_pu, u_mean_pu: float | None; t_u_min, t_u_max: datetime | None
class BranchExtremes: id: int; type: BranchType; name: str; loading_max, loading_mean: float | None; t_loading_max: datetime | None
class Violation: component: Literal["node", "branch"]; id: int; name: str
                 kind: Literal["undervoltage", "overvoltage", "overloading"]
                 start: datetime; end: datetime   # end = LAST violating timestep (inclusive)
                 n_timesteps: int; worst_value: float; limit: float
class ResultSummary: run_id: str; n_timesteps: int; timestamps_start: datetime; resolution_minutes: int
                     kpis: Kpis; nodes: list[NodeExtremes]; branches: list[BranchExtremes]; violations: list[Violation]
class TimeseriesSeries:   id: int; name: str; values: list[float | None]
class TimeseriesResponse: timestamps: list[datetime]; field: str; unit: str; series: list[TimeseriesSeries]
class EnvelopeResponse:   timestamps; field; unit; min, mean, max, p05, p95: list[float | None]
class HeatmapResponse:    timestamps: list[datetime]; ids: list[int]; names: list[str]
                          values: list[list[float | None]]   # per element, per bucket
                          aggregation: Literal["max"] = "max"
class SnapshotResponse:   index: int; timestamp: datetime
                          nodes: dict[str, float | None]      # node id (string) -> u_pu
                          branches: dict[str, float | None]   # branch id (string) -> loading
```

Give fields descriptions with `Field(description=...)` where noted (they appear in the OpenAPI spec but do
not affect behaviour).

### 4.3 Registry (`registry.py`)

```python
class UnknownKeyError(KeyError):           # __str__ returns args[0] (no KeyError quoting)
class Registry[T]:
    def __init__(self, kind: str)          # kind is used in messages, e.g. "profile generator"
    def register(self, key, obj) -> obj    # ValueError(f"{kind} '{key}' is already registered") on duplicates
    def register_as(self, key)             # class decorator: instantiate and register
    def get(self, key) -> T                # UnknownKeyError(f"Unknown {kind} '{key}'. Known: {sorted keys or '(none)'}")
    __contains__, keys() -> list, all() -> list   # insertion order
```

Registries: `NETWORK_SOURCES` (`"network source"`: `sample`, `upload`), `PROFILE_GENERATORS`
(`"profile generator"`: `constant`, `residential_load`, `commercial_load`, `pv`, `ev_charging`, `csv`, in
that order), `STUDY_TYPES` (`"study type"`: `timeseries_powerflow`).

### 4.4 Network sources

`LoadedNetwork` (dataclass): `source, key, name, input_data: dict[str, np.ndarray]` (PGM input dataset with
string component keys), `names: dict[int, str]` (from the file's `Name` fields, keyed by id),
`topology: NetworkTopology`, `description = ""`, `extra = {}`. Properties/methods: `counts`
(`{component: len}` over `input_data`), `name_of(component, id)` (name or `f"{component} {id}"`),
`item()` -> `NetworkItem`.

`NetworkSource` protocol: `key: str`, `list_items() -> list[NetworkItem]`, `load(key) -> LoadedNetwork`.
`load_network(source, key)` = `NETWORK_SOURCES.get(source).load(key)` (raises `UnknownKeyError` -> 404).

`load_pgm_json(source, key, name, raw_json, description="")`: `power_grid_model.utils.json_deserialize`,
names via `parse_names` (reads `data.<component>[].Name` when not null/empty; `json_deserialize` drops
extra fields), then `build_topology`.

`build_topology` rules:
- Component groups: `BRANCH_TYPES = ("line", "asym_line", "link", "transformer", "generic_branch")`,
  `BRANCH3_TYPES = ("three_winding_transformer",)`,
  `APPLIANCE_TYPES = ("sym_load", "sym_gen", "asym_load", "asym_gen", "shunt")`. Output order: nodes; branches
  per type in that order; three-winding; appliances per type in that order; sources.
- Names: `names.get(id, f"{component} {id}")` (nodes: `"node 1"` etc. on IEEE 14).
- Branch `in_service` = all of `from_status`, `to_status` that exist are non-zero. Three-winding:
  `from_node=node_1`, `to_node=node_2`, `node_3`, `in_service` from `status_1..3`, `params` empty.
- Appliance `p_specified`/`q_specified` (if the dtype has them) and `b1` (if present) are
  `float(np.sum(v))` (asym appliances carry 3 phase values), `None` if NaN. `in_service = status != 0`.
- `params`: for each editable field of the component (section 6.8) present in the dtype, the file value as
  float, or `None` when PGM's "not set" marker is present (NaN for floats, the dtype minimum for integers).
  **Never emit NaN** in JSON.
- `counts`: `{component: len}` for every component in the input data.

`sample` source (`networks/sample.py`): files in `samples/networks/`, cached with `lru_cache(8)`:

| key | file | name | description |
|-----|------|------|-------------|
| `vision_mv` | `vision_mv.json` | `Vision MV validation network` | `Medium-voltage (10.5 kV) network fed from a 110 kV source with 47 nodes, cables, links, transformers, 21 loads and 5 generators (PGM validation case).` |
| `ieee14` | `ieee14.json` | `IEEE 14-bus` | `Classic IEEE 14-bus transmission test system modelled with generic branches and voltage-regulated generators (PGM validation case).` |

Unknown key: `UnknownKeyError("Unknown sample network '<key>'")`. Both files are inlined verbatim in
Appendix A. Facts tests rely on:
- vision_mv counts: node 47, line 28, transformer 22, link 2, shunt 3, source 1, sym_gen 5, sym_load 21;
  branch types `{line, link, transformer}`, 52 branches in total. Node 0 = `"Rail B"` (10500 V); node 3 =
  `"KNP 11"`; line 47 = `"R1"` from 0 to 1 (`i_n` 360 A); sym_load 104 = `"Load1"` on node 26, P 1.5 MW,
  Q 1 Mvar; source 99 `"source1"` on node 23 (110 kV), `u_ref` 1.0, `sk` 1e15; transformer 77 `"trafo1"`
  23 -> 22 (`tap_pos` -3, `tap_min` -12, `tap_max` 12); shunts 125 (b1 0), 126 (b1 > 0, capacitor),
  127 (b1 < 0, reactor); voltage levels 110 kV, 10.5 kV, 0.42 kV.
- ieee14: node 14 (all 100 kV, unnamed: `"node 1"`..`"node 14"`), generic_branch 20 (no `sn`, so `params.sn`
  is `null`; branch 101 = node 1 -> node 2 with `r1` 1.938; branch 102 also carries > 1 MW), shunt 1
  (501, b1 0.0019), source 1 (601 on node 1, `u_ref` 1.06), sym_gen 4 (301..304), sym_load 11,
  voltage_regulator 4 (401..404, regulating the 4 generators; node 8 is held at 1.09 pu).

`upload` source (`networks/upload.py`), directory `<workspace>/uploads/networks/`:
- `save(filename, content)`: decode UTF-8 (else `InvalidNetworkError("File is not UTF-8 encoded JSON")`);
  `stem = Path(filename or "network").stem`; `key = f"{slugify(stem, 'network')}-{sha1(content).hexdigest()[:6]}"`;
  validate; write `<key>.json` and `<key>.meta.json` `{"name": stem, "filename", "uploaded_at"}`; return
  `load(key).item()`.
- Validation (`validate_network_text`): parse error -> `InvalidNetworkError("Could not read PGM JSON input
  data: <exc>")`; missing `node` or `source` -> `"Network must contain at least one node and one source"`;
  `validate_input_data(..., calculation_type=power_flow, symmetric=True)` errors ->
  `"Invalid network data: <first 10 joined by '; '>"` plus `" (+N more)"`.
- `list_items()`: every `*.json` except `*.meta.json`, sorted; broken files are skipped.
- `load(key)`: `UnknownKeyError("Unknown uploaded network '<key>'")` if `/` in key or missing; name from meta;
  description `"Uploaded PGM JSON network"`; cached by `(path, mtime)`.

A future `lakehouse` source implements the same protocol and is registered with one line; document this in
the `networks/__init__.py` docstring.

### 4.5 Workspace and file layout (`workspace.py`)

Root = `GRIDSIM_WORKSPACE` env var, default `<repo>/workspace` (repo root = parent of `backend/`). The
`Workspace(root)` constructor creates `cases/`, `runs/`, `uploads/networks/`, `uploads/profiles/`.
`get_workspace()` lazily creates the singleton; `set_workspace(ws | None)` overrides it (app factory, tests).

```
<root>/cases/<case_id>/case.json            CaseStudy (indent 2)
<root>/runs/<run_id>/run.json               RunInfo (persisted on every status change, progress throttled)
<root>/runs/<run_id>/case.json              frozen copy of the case at run creation
<root>/runs/<run_id>/elements.json          {group: {ids, names, types}} per result group
<root>/runs/<run_id>/node.parquet, branch.parquet, source.parquet, appliance.parquet
<root>/runs/<run_id>/summary.json           ResultSummary
<root>/uploads/networks/<key>.json (+ <key>.meta.json)
<root>/uploads/profiles/<file_id>.csv (+ <file_id>.meta.json = ProfileUploadInfo)
```

Helpers:
- `slugify(text, fallback="case")`: NFKD -> ASCII, `[^a-zA-Z0-9]+` -> `-`, strip `-`, lower, cut to 60,
  strip `-` again; empty -> fallback. `"My Case!"` -> `"my-case"`.
- `write_json_atomic(path, data)`: mkdir parents; Pydantic models via `model_dump_json(indent=2)`, else
  `json.dumps(indent=2, default=str)`; write a temp file in the same directory then `os.replace`.
- `now()` = `datetime.now()` with microseconds dropped.
- Errors: `NotFoundError(LookupError)` -> 404, `ConflictError(ValueError)` -> 409.

Cases:
- Case ids must match `[a-z0-9][a-z0-9-]*`, else `NotFoundError("Case '<id>' not found")`.
- `list_cases()`: all `cases/*/case.json`, sorted by `updated_at` descending (None last).
- `create_case`: if `id` is given, `slugify(id)`; existing -> `ConflictError("Case '<id>' already exists")`.
  Else `slugify(name)`, then `-2`, `-3`, ... until free. Sets `created_at = updated_at = now()`.
- `update_case(id, case)`: 404 if missing; keeps `id` and `created_at`, sets `updated_at = now()`.
- `delete_case`: removes the case directory (the route first deletes its runs).

Runs: run ids are `r-YYYYMMDD-HHMMSS-xxxx` (4 lowercase hex chars, `secrets.token_hex(2)`), validated by
`r-[0-9]{8}-[0-9]{6}-[0-9a-f]{4}` (else 404). `run_ids()` lists `runs/*/run.json` names, sorted descending.

### 4.6 Demo case seed

On app startup (`lifespan`) and in `gridsim cases`, if no `cases/*/case.json` exists, create:

```python
CaseStudy(
    name="Vision MV – summer week",      # en dash; slug "vision-mv-summer-week"
    description="Demo: one summer week on the Vision MV validation network with residential load and PV profiles.",
    network=NetworkRef(source="sample", key="vision_mv"),
    time=TimeSettings(start=datetime(2026, 7, 1), end=datetime(2026, 7, 8), resolution_minutes=15),  # 672 steps
    profile_assignments=[
        ProfileAssignment(id="a1", label="Household load", generator="residential_load", params={"seed": 1},
                          target=ProfileTarget(component="sym_load")),
        ProfileAssignment(id="a2", label="Solar PV", generator="pv", params={"seed": 2},
                          target=ProfileTarget(component="sym_gen")),
    ],
)
```

1 July 2026 is a Wednesday. Validating it returns exactly `{"ok": true, "n_timesteps": 672, "issues": []}`.

---

## 5. HTTP API (complete contract, v0)

The contract is binding for both halves. Keep a copy in `docs/api-contract.md`. FastAPI serves the generated
spec at `/openapi.json`; it is exported to `frontend/openapi.json` (committed) and turned into
`frontend/src/api/openapi.d.ts` by `make types`.

### 5.1 Conventions

- All routes are prefixed with `/api`. JSON is `snake_case`. Timestamps are naive ISO strings.
- Element ids are PGM integer ids. `name` is the file's `Name` field, else `"<type> <id>"`.
- Every route has a `response_model`. The operation id is the Python function name
  (`generate_unique_id_function=lambda route: route.name`); tests check that `list_cases`, `start_run`,
  `run_events`, `get_heatmap`, `upload_network` exist, and that every operation declares a 2xx response
  with content (except 204).
- App title `GridSim API`, version `0.1.0`. Router tags: `meta`, `networks`, `profiles`, `cases`, `runs`,
  `results`.
- CORS: allow origins `http://localhost:5173` and `http://127.0.0.1:5173`, credentials, all methods/headers.
- Errors are `{"detail": "<message>"}` (`detail` is always a string). Exception -> status mapping (registered
  as exception handlers, `str(exc)` as detail):

| Exception | Status |
|-----------|--------|
| `NotFoundError`, `UnknownKeyError` | 404 |
| `ConflictError` | 409 |
| `QueryError`, `ProfileParamsError`, `CsvProfileError`, `InvalidNetworkError`, any other `ValueError` | 400 |
| `RequestValidationError` | 422 with `{"detail": "<loc>: <msg>; ...", "errors": [...]}` (loc without `body`/`query`/`path` parts, joined by `.`) |

  Meaning: 404 unknown resource; 409 conflict (duplicate case id, deleting an active run, results of a
  non-succeeded run); 400 bad params or upload; 422 request validation (e.g. `end must be after start`).
- SPA: if `frontend/dist/index.html` exists, mount a catch-all `GET /{path:path}` (not in the schema) that
  404s for `api` and `api/...`, serves existing files inside `dist` (path-traversal safe), and otherwise
  returns `index.html`.

### 5.2 Meta

`GET /api/health` -> `{"status": "ok", "pgm_version": "1.13.209"}` (version from
`importlib.metadata.version("power-grid-model")`).

### 5.3 Networks

- `GET /api/networks` -> `NetworkItem[]`, all sources in registry order (samples first, then uploads).
  ```json
  {"source": "sample", "key": "vision_mv", "name": "Vision MV validation network",
   "description": "…", "counts": {"node": 47, "line": 28, "transformer": 22, "sym_load": 21, "sym_gen": 5}}
  ```
- `GET /api/networks/editable-fields` -> `{component: EditableField[]}` (the registry in section 6.8;
  components not listed have no editable fields). Declare this route **before** `/networks/{source}/{key}`.
  ```json
  {"sym_load": [{"field": "p_specified", "label": "P", "unit": "MW", "scale": 1e-6, "kind": "float", "min": null, "max": null},
                {"field": "status", "label": "In service", "unit": "", "scale": 1.0, "kind": "bool", "min": 0, "max": 1}]}
  ```
- `POST /api/networks/upload` (multipart, field `file`: a PGM JSON input file) -> `NetworkItem` with source
  `"upload"`, HTTP 200. Invalid file -> 400.
- `GET /api/networks/{source}/{key}` -> `NetworkTopology`; unknown -> 404.
  ```json
  {
    "source": "sample", "key": "vision_mv", "name": "…",
    "nodes":      [{"id": 0, "name": "Rail B", "u_rated": 10500.0}],
    "branches":   [{"id": 47, "type": "line", "name": "R1", "from_node": 0, "to_node": 1, "node_3": null, "in_service": true,
                    "params": {"r1": 0.081, "x1": 0.0445, "c1": 2.25e-7, "i_n": 360.0, "from_status": 1.0, "to_status": 1.0}}],
    "appliances": [{"id": 104, "type": "sym_load", "name": "Load1", "node": 26, "p_specified": 1500000.0,
                    "q_specified": 1000000.0, "b1": null, "in_service": true,
                    "params": {"p_specified": 1500000.0, "q_specified": 1000000.0, "status": 1.0}}],
    "sources":    [{"id": 99, "name": "source1", "node": 23, "u_ref": 1.0, "params": {"u_ref": 1.0}}],
    "counts": {"node": 47}
  }
  ```
  Branch `type` is one of `line | asym_line | link | transformer | generic_branch | three_winding_transformer`.
  Appliance `type` covers `sym_load | sym_gen | asym_load | asym_gen | shunt`; only `sym_load` and `sym_gen`
  are profile targets. Shunts carry `b1` (S; > 0 capacitive, < 0 inductive), other appliances `null`.
  `params` holds the file values (SI) of the component's editable fields; a value the file does not set is
  `null` (e.g. IEEE 14 generic branches' `sn`), and a case may still override it. The response must never
  contain `NaN`.

### 5.4 Profile generators

- `GET /api/profile-generators` -> `ProfileGeneratorInfo[]` in registry order.
  ```json
  {"key": "residential_load", "name": "Residential load", "description": "…", "applies_to": ["sym_load"],
   "default_mode": "scale",
   "params_schema": {"type": "object", "properties": {"seed": {"type": "integer", "default": 1, "title": "Random seed"}, "…": {}}}}
  ```
  `params_schema` is `Params.model_json_schema()` (Pydantic JSON Schema). The frontend renders a form from it.
- `POST /api/profiles/preview` body `{"generator": "pv", "params": {…}, "time": TimeSettings, "n_elements": 3}`
  -> `{"timestamps": ["…"], "series": [[…], […], […]]}` (one multiplier series per sample element,
  `n_elements` 1..20). Unknown generator -> 404; invalid params -> 400 (`Invalid parameters for 'pv':
  peak: Input should be greater than or equal to 0`); invalid time -> 422.
- `POST /api/profiles/upload` (multipart `file`: CSV whose first column is a timestamp) ->
  `{"file_id": "abc123def456", "filename": "x.csv", "columns": ["load_a", "pv_1"], "n_rows": 35040, "start": "…", "end": "…"}`.
  Unparseable -> 400.

### 5.5 Cases

- `GET /api/cases` -> `CaseSummary[]` (`id, name, description, network, time, updated_at, last_run`), newest
  `updated_at` first; `last_run` is the newest run of that case or `null`.
- `POST /api/cases` body CaseStudy (`id`, `created_at`, `updated_at` optional) -> CaseStudy, **201**.
  Duplicate explicit id -> 409. Too many timesteps / bad window -> 422.
- `GET /api/cases/{case_id}` -> CaseStudy (404 if missing or the id is not a valid slug).
- `PUT /api/cases/{case_id}` -> CaseStudy (keeps `id`, `created_at`; sets `updated_at`).
- `DELETE /api/cases/{case_id}` -> **204**; deletes all its runs too (active runs are cancelled and deleted when
  they finish). Missing -> 404.
- `POST /api/cases/{case_id}/validate` -> `ValidationResult`, e.g.
  `{"ok": true, "n_timesteps": 672, "issues": [{"level": "error|warning", "message": "…"}]}`.

Full CaseStudy example:

```json
{
  "id": "summer-week", "name": "Summer week", "description": "",
  "study_type": "timeseries_powerflow",
  "network": {"source": "sample", "key": "vision_mv"},
  "time": {"start": "2026-07-01T00:00:00", "end": "2026-07-08T00:00:00", "resolution_minutes": 15},
  "calculation": {"method": "newton_raphson", "error_tolerance": 1e-8, "max_iterations": 20},
  "limits": {"u_min_pu": 0.95, "u_max_pu": 1.05, "loading_max": 1.0},
  "profile_assignments": [
    {"id": "a1", "label": "Household load", "generator": "residential_load", "params": {"seed": 1},
     "target": {"component": "sym_load", "ids": null}, "mode": "scale", "magnitude_w": null, "factor": 1.0}
  ],
  "network_overrides": [
    {"component": "sym_load", "id": 104, "field": "p_specified", "value": 3000000.0}
  ],
  "created_at": "2026-10-26T11:30:00", "updated_at": "2026-10-26T11:30:00"
}
```

### 5.6 Runs

`RunInfo` example:

```json
{"id": "r-20261026-113000-ab12", "case_id": "summer-week", "case_name": "Summer week",
 "status": "running", "progress": 0.42, "message": "Timestep 288/672", "n_timesteps": 672,
 "n_failed_timesteps": 0, "created_at": "…", "started_at": "…", "finished_at": null,
 "duration_s": null, "error": null}
```

- `POST /api/cases/{case_id}/runs` -> RunInfo, **202**. Validates first; if invalid returns **422** with
  `{"detail": "Case is invalid: <error messages joined by '; '>", "ok": false, "n_timesteps": N, "issues": [...]}`
  (declare `responses={422: {"model": ValidationResult}}`). The case is frozen into `runs/<id>/case.json`
  at creation (including `network_overrides`).
- `GET /api/runs?case_id=` -> RunInfo[], newest first (sorted by `(created_at, id)` descending). Unknown
  case id -> `[]`.
- `GET /api/runs/{run_id}` -> RunInfo (404 for unknown or malformed ids).
- `GET /api/runs/{run_id}/case` -> the CaseStudy frozen at run creation. Editing the live case later does not
  change it. Result views read limits, network and overrides from it.
- `POST /api/runs/{run_id}/cancel` -> RunInfo. A finished run returns its unchanged state (e.g. still
  `succeeded`).
- `DELETE /api/runs/{run_id}` -> **204**; a queued/running run -> 409 `"Run '<id>' is running; cancel it first"`.
- `GET /api/runs/{run_id}/events` -> **SSE** (`text/event-stream`, headers `Cache-Control: no-cache`,
  `X-Accel-Buffering: no`). 404 before the stream starts for unknown runs. Polls the run state every 0.25 s
  and sends `event: progress\ndata: <RunInfo JSON>\n\n` whenever the serialised RunInfo changes; after a
  terminal status it sends `event: done\ndata: <last RunInfo JSON or {}>\n\n` and closes. A finished run
  streams exactly one `progress` then `done`. If the run is deleted mid-stream, it ends with `done`.
  Declare the 200 response as `text/event-stream` with schema `{"type": "string"}` and `response_model=None`.

### 5.7 Results (only for succeeded runs; 409 otherwise)

A run whose status is not `succeeded` -> 409 `"Run '<id>' has status '<status>'; no results available"`.

- `GET /api/runs/{run_id}/summary` -> `ResultSummary` (read from `summary.json`).
  ```json
  {
    "run_id": "…", "n_timesteps": 672, "timestamps_start": "…", "resolution_minutes": 15,
    "kpis": {"u_min_pu": 0.97, "u_max_pu": 1.04, "loading_max": 0.83, "n_voltage_violations": 0,
             "n_loading_violations": 0, "energy_import_mwh": 123.4, "energy_losses_mwh": 2.1, "n_failed_timesteps": 0},
    "nodes":    [{"id": 0, "name": "Rail B", "u_min_pu": 0.99, "u_max_pu": 1.01, "u_mean_pu": 1.0, "t_u_min": "…", "t_u_max": "…"}],
    "branches": [{"id": 47, "type": "line", "name": "R1", "loading_max": 0.5, "loading_mean": 0.3, "t_loading_max": "…"}],
    "violations": [{"component": "node", "id": 3, "name": "KNP 11", "kind": "undervoltage",
                    "start": "…", "end": "…", "n_timesteps": 4, "worst_value": 0.93, "limit": 0.95}]
  }
  ```
  Violations are contiguous episodes per element; `end` is the last violating timestep; at most 5000 are
  returned while KPI counts are totals.
- `GET /api/runs/{run_id}/timeseries?component=node|branch|source|appliance&field=<f>&ids=1,2,3` ->
  `{"timestamps": [...], "field": "u_pu", "unit": "pu", "series": [{"id": 1, "name": "…", "values": [1.0, null, …]}]}`.
  `ids` optional (omitted or empty = all elements, in group order); non-integer ids -> 400
  `"ids must be a comma-separated list of integers"`; unknown id -> 400 `"Unknown element id <id>"`;
  unknown field -> 400 `"Unknown field '<f>' for <component>; available: <comma list>"`; unknown component -> 422.
  `values` may contain `null` (failed timesteps).
- `GET /api/runs/{run_id}/envelope?component=node&field=u_pu` ->
  `{"timestamps", "field", "unit", "min", "mean", "max", "p05", "p95"}` aggregated over all elements per timestep.
- `GET /api/runs/{run_id}/heatmap?component=branch&field=loading&max_columns=500` ->
  `{"timestamps", "ids", "names", "values": [[per bucket] per element], "aggregation": "max"}`.
  `max_columns` 1..5000, default 500. Elements sorted by peak value, highest first.
- `GET /api/runs/{run_id}/snapshot?t=<index>` (`t` >= 0, default 0) ->
  `{"index": 12, "timestamp": "…", "nodes": {"<id>": u_pu}, "branches": {"<id>": loading}}` (string keys,
  values may be `null`). `t` out of range -> 400 `"Timestep index <t> out of range 0..<n-1>"`.

Result fields and units:

| Group (`component`) | PGM components | Fields (unit) |
|---|---|---|
| `node` | node | `u_pu` (pu), `u` (V), `u_angle` (rad), `p` (W), `q` (var) |
| `branch` | line, asym_line, link, transformer, generic_branch, three_winding_transformer | `loading` (pu), `p_from` (W), `q_from` (var), `i_from` (A), `s_from` (VA), `p_to` (W), `q_to` (var), `i_to` (A) |
| `source` | source | `p` (W), `q` (var), `i` (A) |
| `appliance` | sym_load, sym_gen, asym_load, asym_gen, shunt | `p` (W), `q` (var), `i` (A) |

For three-winding transformers `*_from` maps to PGM `*_1` and `*_to` to `*_2` (`loading` is native).

---

## 6. Engine and algorithms

### 6.1 Validation (`validation.py`, `studies/timeseries_powerflow.py`, `networks/overrides.py`)

`validate_case(case) -> ValidationResult` runs, in order, collecting issues (`ok` = no `error` issues,
`n_timesteps = case.time.n_timesteps`):

1. Unknown `study_type` -> error `Unknown study type '<t>'`.
2. Load the network; failure -> error `Network: <exc>` (e.g. `Network: Unknown sample network 'x'`).
3. If there are overrides: `check_overrides` (6.9); if none of those are errors, apply them so step 4 sees
   the overridden network.
4. The study type's `validate(case, net)`:
   - no assignments -> warning `No profile assignments: every timestep uses the base network values`;
   - `n_timesteps * total element count > 50_000_000` -> warning
     `Large run: <T> timesteps x <E> elements may take a while`;
   - per assignment, with `label = f"Assignment '{a.label or a.id}'"`:
     - duplicate `id` -> error `<label>: duplicate assignment id '<id>'`;
     - unknown generator -> error `<label>: unknown profile generator '<g>'` (skip the rest);
     - target component not in `applies_to` -> warning
       `<label>: generator '<key>' is intended for <applies_to joined by ', '>`;
     - network has no elements of the component -> warning
       `<label>: network has no <comp> elements; assignment has no effect` (skip the rest);
     - `ids == []` -> warning `<label>: empty target id list; assignment has no effect`;
     - unknown ids -> error `<label>: <comp> ids not in network: [<first 10>]`;
     - mode `add` without `magnitude_w` -> error `<label>: mode 'add' requires magnitude_w (W)`;
     - dry run `gen.run(timestamps, 1, params)`; any exception -> error `<label>: <exc>` (covers invalid
       params and CSV coverage problems).

### 6.2 Batch building (`build_update(case, net, timestamps)`)

```python
n = len(timestamps)
p_q = {}                                   # component -> (p (n, E), q (n, E))
for a in case.profile_assignments:         # list order matters
    comp = a.target.component
    if comp not in net.input_data or len(net.input_data[comp]) == 0: continue
    if comp not in p_q:
        base = net.input_data[comp]        # already has overrides applied (see run)
        p_q[comp] = (np.tile(base["p_specified"].astype(float), (n, 1)),
                     np.tile(base["q_specified"].astype(float), (n, 1)))
    p, q = p_q[comp]
    pos = target_positions(net, comp, a.target.ids)   # all positions if ids is None, else lookup by id
    if len(pos) == 0: continue
    m = PROFILE_GENERATORS.get(a.generator).run(timestamps, len(pos), a.params) * a.factor
    if a.mode == "scale":
        p[:, pos] *= m; q[:, pos] *= m
    else:                                  # "add": active power only
        p[:, pos] += (a.magnitude_w or 0.0) * m
update = {}
for comp, (p, q) in p_q.items():
    arr = initialize_array("update", comp, (n, E)); arr["id"] = ids[None, :]
    arr["p_specified"] = p; arr["q_specified"] = q; update[comp] = arr
```

Rules: overrides are applied **first** (to a copy of the input arrays), then the base values are tiled,
then assignments apply in list order (so two `scale` assignments multiply, `add` adds on top of whatever
was scaled before). Appliances without an assignment keep their base values (they are still in the update
array for that component, at base value). A negative `magnitude_w` in `add` mode models behind-the-meter
generation. `factor` (0..100) multiplies `m(t)` in both modes; a test asserts `factor=2.5` gives exactly
2.5 x the `p_specified` of `factor=1`.

### 6.3 Chunked batch power flow (`engine/pgm_adapter.py`)

```python
def pick_chunk_size(n_steps, n_elements):
    by_progress = ceil(n_steps / 40)
    by_memory = max(96, 2_000_000 // max(n_elements, 1))
    return int(max(1, min(n_steps, max(96, min(2000, by_progress)), by_memory)))

def iter_power_flow(input_data, update, n_steps, settings, output_spec, chunk_size=None, threading=0):
    model = PowerGridModel(input_data)     # built once
    kwargs = dict(calculation_method=settings.method, error_tolerance=settings.error_tolerance,
                  max_iterations=settings.max_iterations, output_component_types=spec)
    if not update:                         # no profiles: one calculation broadcast to every timestep
        single = model.calculate_power_flow(**kwargs) ...; yield chunks with np.repeat(...)
        return
    for start in range(0, n_steps, size):
        stop = min(start + size, n_steps)
        raw = model.calculate_power_flow(update_data={c: a[start:stop] for c, a in update.items()},
                                         continue_on_batch_error=True, threading=threading, **kwargs)
        out = {comp: {attr: np.asarray(raw[comp][attr], float)}}
        err = model.batch_error            # PGM 1.13 does not raise; it stores PowerGridBatchError here
        failed = np.asarray(err.failed_scenarios, int64) if err else []   # chunk-relative
        for every output array: v[failed] = np.nan
        yield ChunkResult(start, stop, out, failed + start, [str(m) for m in err.error_messages or []])
```

`output_spec`: for every group component present, the PGM attributes of the group fields (via the
three-winding mapping), plus `p_3` for three-winding transformers (for losses). Failed (non-converged)
timesteps are recorded (NaN values, `n_failed_timesteps`), never abort the run. Tests: a single-step batch
equals the plain non-batch calculation (`rtol=1e-10`); with `chunk_size=3` over 10 steps the chunks are
`(0,3),(3,6),(6,9),(9,10)`; scaling loads x1e6 at step 4 makes exactly step 4 fail with all-NaN outputs;
an empty update on ieee14 broadcasts identical rows. Performance target: a 1-year 15-min run on vision_mv
finishes well under a minute (reference: ~1.3 s).

### 6.4 Study run (`TimeseriesPowerFlow.run`)

```
ts = case.time.timestamps(); n = len(ts)
net = apply_overrides(net, case.network_overrides)
progress(0.0, "Generating profiles"); update = build_update(case, net, ts); if cancelled: raise RunCancelled
writer = ResultWriter(run_dir, net, n)
for chunk in iter_power_flow(net.input_data, update, n, case.calculation, output_spec(set(net.input_data))):
    writer.write_chunk(chunk)
    progress(0.02 + 0.95 * chunk.stop / n, f"Timestep {chunk.stop}/{n}")
    if cancelled: raise RunCancelled
finally: acc = writer.close()
progress(0.98, "Computing summary"); summary = compute_summary(...); write summary.json
return StudyOutcome(summary, summary.kpis.n_failed_timesteps)
```

Progress values are monotonically increasing.

### 6.5 Result writer (`results/writer.py`)

- Groups and element order: for each group, its components in the order of section 5.7, each component's
  elements in input order. `elements.json` = `{group: {"ids": [...], "names": [...], "types": [...]}}`.
- Each chunk appends to `<group>.parquet` (one `ParquetWriter` per group, zstd) a long-format table:
  `t` (int32, absolute timestep), `id` (int32), for `branch` also `type` (dictionary-encoded string), and one
  float64 column per group field. Rows: timestep-major (`np.repeat(t)`, `np.tile(ids)`).
- Accumulators for the summary (dense `(T, E)` NaN-initialised): `u_pu` (nodes), `loading` (branches),
  `losses_w[t] = sum(p_from + p_to)` over all branches plus `sum(p_3)` of three-winding transformers,
  `source_p_w[t] = sum(source p)`, `failed[t]` bool.

### 6.6 Results summary (`results/summary.py`)

```
dt_h = resolution_minutes / 60
u = where(acc.u_pu > 0, acc.u_pu, NaN)        # de-energised nodes (u = 0) are ignored
per node:   u_min/u_max/u_mean = nanmin/nanmax/nanmean over time; t_u_min/t_u_max = timestamp of nanargmin/nanargmax (None if all NaN)
per branch: loading_max, loading_mean, t_loading_max likewise (type from elements.json)
non-finite values -> null
violations (strict inequalities, NaN never violates):
    undervoltage: u < limits.u_min_pu  (worst = min over the episode, limit = u_min_pu)
    overvoltage:  u > limits.u_max_pu  (worst = max, limit = u_max_pu)
    overloading:  loading > limits.loading_max  (worst = max, limit = loading_max)
episodes = contiguous True runs per element column (find_episodes); start = ts[s], end = ts[stop-1],
           n_timesteps = stop - s
violations sorted by (start, component, id), truncated to MAX_VIOLATIONS = 5000
kpis: u_min_pu = nanmin(u), u_max_pu = nanmax(u), loading_max = nanmax(loading) (null if empty/all NaN)
      n_voltage_violations = #under + #over episodes, n_loading_violations = #overloading episodes (totals, uncapped)
      energy_import_mwh = nansum(source_p_w) * dt_h / 1e6
      energy_losses_mwh = nansum(losses_w) * dt_h / 1e6
      n_failed_timesteps = sum(failed)
summary: run_id, n_timesteps, timestamps_start = case.time.start, resolution_minutes, kpis, nodes, branches, violations
```

`find_episodes(mask)` (T x E bool) returns `(element, start, stop_exclusive)` sorted by element then start:
pad with a zero row on both ends, `diff` along time, `+1` = start, `-1` = stop. Example:
mask `[[0,1],[1,1],[1,0],[0,0],[1,1]]` -> `[(0,1,3),(0,4,5),(1,0,2),(1,4,5)]`. The episode extreme is
vectorised with `np.fmin/fmax.reduceat` on the column-major flattened values (pad one NaN so the stop index
is valid): values `[[5,1],[3,2],[4,9],[9,9],[2,0]]` give minima `[3,2,1,0]` and maxima `[4,2,2,0]`.

### 6.7 Result queries (`results/query.py`, `ResultStore`, singleton `RESULTS`)

- `dense(run_dir, group, field)`: validates the field (else `QueryError`), loads `t, id, field` columns from
  the parquet into a `(T, E)` NaN array ordered by `elements.json` ids; LRU cache of 32 entries keyed by
  `(run_dir, group, field)`, thread-safe; `invalidate(run_dir)` drops a run's entries (on delete).
  Timestamps come from the frozen `case.json` (`TimeSettings.timestamps()`).
- `timeseries`: one series per requested id (or all), values via `to_list` (NaN -> `None`).
- `envelope`: per timestep across elements: `nanmin`, `nanmean`, `nanmax`, and the 5th/95th percentiles
  (`np.percentile` when there is no NaN, else `np.nanpercentile`); an empty group is treated as one
  all-NaN column. Invariant: `min <= p05 <= p95 <= max`.
- `heatmap(max_columns)`: `nb = max(1, min(T, max_columns))`;
  `edges = unique(linspace(0, T, nb + 1).astype(int64)[:-1])`; `buckets = np.fmax.reduceat(values, edges,
  axis=0)` (max per bucket, NaN-ignoring); `timestamps = ts[edges]` (bucket starts); elements ordered by
  peak (`nanmax` over time) descending with NaN peaks last (stable sort). No elements -> empty lists.
- `snapshot(t)`: range check, then `{str(id): u_pu}` and `{str(id): loading}` at row `t`.

### 6.8 Editable-fields registry (`networks/editable.py`)

Helpers: `_f(field, label, unit="", scale=1.0, **kw)` = float field; `_b(field, label)` = bool with
`min=0, max=1`, unit `""`, scale 1.0. Branch status pair: `from_status` "In service (from)", `to_status`
"In service (to)" (the UI shows them as one "In service" toggle that sets both).

| Component | field | label | unit | scale | kind | min | max |
|-----------|-------|-------|------|-------|------|-----|-----|
| `sym_load`, `sym_gen` | `p_specified` | P | MW | 1e-6 | float | – | – |
| | `q_specified` | Q | Mvar | 1e-6 | float | – | – |
| | `status` | In service | | 1 | bool | 0 | 1 |
| `line` | `r1` | R1 | Ω | 1 | float | 0 | – |
| | `x1` | X1 | Ω | 1 | float | – | – |
| | `c1` | C1 | µF | 1e6 | float | 0 | – |
| | `i_n` | Rated current | A | 1 | float | 0 | – |
| | `from_status`, `to_status` | In service (from/to) | | 1 | bool | 0 | 1 |
| `transformer` | `sn` | Rated power | MVA | 1e-6 | float | 0 | – |
| | `tap_pos` | Tap position | | 1 | int | per element `min(tap_min,tap_max)..max(...)` | |
| | `from_status`, `to_status` | | | | bool | 0 | 1 |
| `generic_branch` | `sn` | Rated power | MVA | 1e-6 | float | 0 | – |
| | `r1` | R1 | Ω | 1 | float | – | – |
| | `x1` | X1 | Ω | 1 | float | – | – |
| | `from_status`, `to_status` | | | | bool | 0 | 1 |
| `link` | `from_status`, `to_status` | | | | bool | 0 | 1 |
| `source` | `u_ref` | U ref | pu | 1 | float | 0 | – |

Field order within a component is exactly as listed (tests check
`generic_branch == ["sn", "r1", "x1", "from_status", "to_status"]` and `link == ["from_status", "to_status"]`).
Any other component (node, shunt, three-winding, voltage_regulator, asym_*) has none. To make a new field
editable, add an entry and a test.

### 6.9 Override validation and application (`networks/overrides.py`)

`check_overrides(net, overrides)`: with `label = f"Override {component} '{name}' (id {id}) field '{field}'"`
(name via `net.name_of`), per override in order:
- a repeated `(component, id, field)` -> `<label>: duplicate override` (skip further checks of that one);
- component not in the registry -> `Override on unknown or non-editable component '<c>' (id <id>)`;
- id not in the component's input array -> `Override <c> id <id>: element not in network`;
- field not in the registry for the component or not in the dtype -> `<label>: field is not editable`;
- non-finite value -> `<label>: value must be a finite number`;
- bool not 0/1 -> `<label>: value must be 0 or 1`; int not integral -> `<label>: value must be an integer`;
- below min -> `<label>: value {v:g} is below the minimum {lo:g}`; above max ->
  `<label>: value {v:g} is above the maximum {hi:g}` (transformer `tap_pos` uses the element's tap range,
  e.g. `value 20 is above the maximum 12` on vision_mv transformer 77).
- All issues are errors. Only if there are none (and the list is non-empty): apply them and run
  `validate_input_data(data, calculation_type=power_flow)`; each PGM error becomes
  `After overrides: <error> (<up to 5 element names, quoted>)`. Example: transformer `sn = 0` passes the
  inclusive min 0 but fails PGM (`sn > 0`), giving an `After overrides:` message mentioning `sn`.
- A field whose file value is NaN/null (IEEE 14 `sn`) may be overridden normally.

`apply_overrides(net, overrides)`: no overrides -> return the same object. Otherwise raise `ValueError` with
up to 5 error messages if invalid; copy only the affected component arrays, write each value at the
element's row, rebuild the topology from the copied data, return a new `LoadedNetwork`
(`dataclasses.replace`). The cached network is never mutated (a test checks the original `p_specified`
is still 1.5e6).

Acceptance (backend tests): line 47 `i_n` 360 -> 90 A gives exactly 4 x its `loading_max`; doubling
sym_load 104 `p_specified` doubles its `appliance.parquet` `p` at every timestep (`rel=1e-4`); IEEE 14 with
`sn = 100e6` on generic branch 101 gives `loading == max(s_from, s_to) / 100e6` (> 0.01) while unrated
branches report exactly 0; switching branch 102 off (both statuses 0) gives `|p_from|, |p_to| < 1 W` and
`in_service = false` in the rebuilt topology.

### 6.10 Profile generators

Base class (`profiles/base.py`): class attributes `key, name, description`,
`applies_to = ["sym_load", "sym_gen"]` (default), `default_mode = "scale"` (default), `Params` (a Pydantic
model). `parse_params(raw)` validates `raw or {}`; on error raises `ProfileParamsError(
"Invalid parameters for '<key>': <loc>: <msg>; ...")` (loc `params` if empty). `run(ts, n, raw)` parses,
generates, converts to float and checks the shape `(len(ts), n)` (else `RuntimeError`). `info()` builds
`ProfileGeneratorInfo` with `params_schema = Params.model_json_schema()`.

Vectorised helpers (must be reproduced exactly so seeds give the same output):

```python
def hour_of_day(ts):        return (ts.hour + ts.minute / 60 + ts.second / 3600).to_numpy(float)
def hours_since_start(ts):  return ((ts - ts[0].normalize()) / pd.Timedelta(hours=1)).to_numpy(float)  # zeros(0) if empty
def periodic_gauss(h, mu, width):
    d = (h - mu + 12.0) % 24.0 - 12.0;  return np.exp(-0.5 * (d / width) ** 2)
def sigmoid(x):             return 1 / (1 + np.exp(-x))
def smooth_noise(t_hours, n_elements, rng, corr_hours=2.0):
    # standard normal knots every corr_hours, linearly interpolated
    pos = t_hours / corr_hours; k = floor(pos).astype(int64); frac = (pos - k)[:, None]
    knots = rng.standard_normal((int(k.max()) + 2, n_elements))
    return knots[k] * (1 - frac) + knots[k + 1] * frac        # zeros((0, E)) if empty
def element_shift(rng, n, std_hours):  return rng.normal(0, std_hours, n) if std_hours > 0 else zeros(n)
def element_amplitude(rng, n, jitter): return ones(n) if jitter <= 0 else clip(1 + rng.normal(0, jitter, n), 0.5, 1.5)
```

Every generator uses `rng = np.random.default_rng(params.seed)` and draws in the order shown.

**`constant`** — name `Constant`, description `The same multiplier at every timestep (e.g. 1.0 keeps base
values).`, applies to both. Params: `value: float = 1.0` (title `Value`, description `Multiplier applied at
every timestep`). Output: `full((T, E), value)`.

**`residential_load`** — name `Residential load`, description `Household demand with a morning and a larger
evening peak (peak ≈ 1 in winter), later mornings at weekends, seasonal amplitude and per-element
variation.`, applies to `["sym_load"]`. Params (title in quotes):
`seed: int = 1` "Random seed"; `seasonal_amplitude: float = 0.2` (0..1) "Seasonal amplitude" (description
"Winter/summer difference"); `time_shift_hours: float = 0.75` (0..6) "Time shift (h)" (description "Std dev
of per-element shift"); `amplitude_jitter: float = 0.1` (0..0.5) "Amplitude jitter"; `noise: float = 0.05`
(0..0.5) "Noise level".

```python
shift = element_shift(rng, E, time_shift_hours); amp = element_amplitude(rng, E, amplitude_jitter)
h = hour_of_day(ts)[:, None] - shift[None, :]
weekend = (ts.day_of_week >= 5).astype(float)[:, None]
shape = 0.25 + 0.45 * periodic_gauss(h, 7.5 + 1.5 * weekend, 1.2) + 0.75 * periodic_gauss(h, 19.5, 2.0) \
        + 0.15 * weekend * periodic_gauss(h, 13.0, 2.5)
doy = ts.day_of_year; a = seasonal_amplitude
season = ((1 + a * cos(2π (doy - 15) / 365.25)) / (1 + a))[:, None]
out = shape * season * amp[None, :]
if noise > 0: out *= 1 + noise * smooth_noise(hours_since_start(ts), E, rng, 1.0)
return clip(out, 0, None)
```

**`commercial_load`** — name `Commercial load`, description `Office-type demand: plateau (≈1) during
weekday opening hours, low base level at night and a flat weekend level.`, applies to `["sym_load"]`.
Params: `seed: int = 1`; `open_hour = 8.0` (0..24) "Opening hour"; `close_hour = 18.0` (0..24) "Closing
hour"; `base_level = 0.3` (0..1) "Base level (night)"; `weekend_level = 0.35` (0..1) "Weekend level";
`time_shift_hours = 0.5` (0..6) "Time shift (h)"; `amplitude_jitter = 0.05` (0..0.5) "Amplitude jitter";
`noise = 0.03` (0..0.5) "Noise level". Model validator: `close_hour <= open_hour` ->
`close_hour must be after open_hour`.

```python
shift = element_shift(rng, E, time_shift_hours); amp = element_amplitude(rng, E, amplitude_jitter)
h = hour_of_day(ts)[:, None] - shift[None, :]
open_ = sigmoid((h - open_hour) / 0.4) * sigmoid((close_hour - h) / 0.4)
weekday = base_level + (1 - base_level) * open_
weekend = (ts.day_of_week >= 5)[:, None]
out = where(weekend, weekend_level, weekday) * amp[None, :]
if noise > 0: out *= 1 + noise * smooth_noise(hours_since_start(ts), E, rng, 1.0)
return clip(out, 0, None)
```

**`pv`** — name `Solar PV`, description `Clear-sky PV output from sun elevation (day of year and latitude
give sunrise and sunset), reduced by day-to-day and intra-day cloud variability.`, applies to
`["sym_gen", "sym_load"]`. Params: `seed: int = 1`; `peak: float = 1.0` (ge 0) "Peak multiplier"
(description "At clear-sky max"); `latitude: float = 52.0` (-66..66) "Latitude (°)"; `cloudiness = 0.3`
(0..1) "Cloudiness (0 = always clear)"; `solar_noon_hour = 13.5` (10..15) "Solar noon (local clock hour)".

```python
doy = ts.day_of_year (float); lat = radians(latitude)
decl = radians(23.44) * sin(2π (284 + doy) / 365)
omega = radians(15 * (hour_of_day(ts) - solar_noon_hour))
cosz = sin(lat) sin(decl) + cos(lat) cos(decl) cos(omega)
cosz_max = cos(max(|lat| - radians(23.44), 0))
clear = clip(cosz / cosz_max, 0, 1) ** 1.2                     # (T,)
t_h = hours_since_start(ts); day = (t_h // 24).astype(int64); n_days = day.max() + 1
day_cloud = rng.beta(0.8, 1.6, n_days)                         # shared weather per day
intra = abs(smooth_noise(t_h, E, rng, 1.0)) / 2
cloud = clip(0.75 * day_cloud[day][:, None] + 0.25 * intra, 0, 1)
amp = element_amplitude(rng, E, 0.05)
out = peak * clear[:, None] * (1 - cloudiness * cloud) * amp[None, :]
return clip(out, 0, peak)
```

The frontend's daylight helpers (section 9.4) use exactly this declination/hour-angle geometry.

**`ev_charging`** — name `EV charging`, description `On/off (0/1) home-charging sessions: a share of
elements owns an EV, arriving in the evening and charging for a random duration. Use mode 'add' with the
charger power as magnitude_w.`, applies to `["sym_load"]`, **`default_mode = "add"`**. Params:
`seed = 1`; `share = 0.3` (0..1) "Share of elements with an EV"; `daily_probability = 0.8` (0..1)
"Probability of charging per day"; `arrival_mean_hour = 18.5` (0..24) "Mean arrival hour";
`arrival_std_hours = 1.5` (0..6) "Arrival std dev (h)"; `duration_min_hours = 2.0` (gt 0, le 23)
"Min charge duration (h)"; `duration_max_hours = 5.0` (gt 0, le 23) "Max charge duration (h)". Validator:
max < min -> `duration_max_hours must be >= duration_min_hours`.

```python
if T == 0: return zeros((0, E))
t_h = hours_since_start(ts); day = (t_h // 24).astype(int64); n_days = day.max() + 1
has_ev = rng.random(E) < share
active = (rng.random((n_days, E)) < daily_probability) & has_ev
arrival = clip(rng.normal(arrival_mean_hour, arrival_std_hours, (n_days, E)), 0, 23.99)
dur = rng.uniform(duration_min_hours, duration_max_hours, (n_days, E)); end = arrival + dur
h = hour_of_day(ts)[:, None]
today = active[day] & (h >= arrival[day]) & (h < end[day])
prev = maximum(day - 1, 0)
overnight = (day >= 1)[:, None] & active[prev] & (h + 24 < end[prev])
return (today | overnight).astype(float)                        # values are exactly 0 or 1
```

**`csv`** — name `CSV profile`, description `Values from a column of an uploaded CSV (first column =
timestamp), linearly interpolated to the case timestamps. The same series is used for all targets.`,
applies to both. Params: `file_id: str = ""` "Uploaded file id" (description "From /api/profiles/upload");
`column: str = ""` "Column name"; `repeat: bool = True` "Repeat to cover window" (description "Tile the CSV
period when it does not cover the case window").

```python
if not file_id: raise CsvProfileError("csv profile: 'file_id' is required (upload a CSV first)")
df = load_csv(file_id)
if column not in df: raise CsvProfileError(f"csv profile: column '{column}' not in file; available: {', '.join(df.columns)}")
s = df[column].dropna(); if len(s) < 2: raise CsvProfileError(f"csv profile: column '{column}' has < 2 values")
x = s.index as int64 ns; y = s.values; step = int(median(diff(x))); t = ts as int64 ns
covered = len(t) == 0 or (t[0] >= x[0] and t[-1] <= x[-1] + step)
if not covered:
    if not repeat: raise CsvProfileError(f"csv profile: file covers {s.index[0]} – {s.index[-1]}, which does not cover the case window {ts[0]} – {ts[-1]}")
    span = x[-1] - x[0] + step; t = x[0] + (t - x[0]) % span
xp = append(x, x[-1] + step); yp = append(y, y[0] if not covered else y[-1])
return repeat(interp(t, xp, yp)[:, None], E, axis=1)
```

CSV storage (`profiles/csv_store.py`): `parse_csv(bytes)`: `pd.read_csv(sep=None, engine="python")` (sniffs
the delimiter); parse error -> `Could not parse CSV: <exc>`; fewer than 2 columns or 2 rows ->
`CSV needs a timestamp column plus at least one value column`; first column `pd.to_datetime` (error ->
`First column must contain timestamps: <exc>`), timezone dropped; other columns `to_numeric(errors="coerce")`,
keep columns with any value (none -> `CSV has no numeric value columns`); index named `timestamp`, string
column names, duplicates dropped, sorted. `save_csv`: `file_id = uuid4().hex[:12]`, writes
`<file_id>.csv` and `<file_id>.meta.json` (ProfileUploadInfo; `filename or f"{file_id}.csv"`, `n_rows`,
first/last timestamp). `get_info` requires `file_id` to match `[0-9a-f]{1,32}` and the meta to exist, else
`Unknown profile file '<id>'`. Parsed frames are cached by `(path, mtime)`.

Generator acceptance tests: for every built-in except csv, the output has the right shape, is
deterministic for a seed, finite, within `[0, 2]`; residential/commercial/pv/ev vary per element and per
seed; residential with jitter/noise/shift 0 over a year peaks within `[0.95, 1.05]` and its mean hour 19
and 7 exceed hour 3; commercial weekday noon > 0.9 and weekend noon < 0.5 (noise 0); pv with
`peak 0.8, cloudiness 0` is exactly 0 at 01:00, max in `(0.7, 0.8]`, June 13:00 mean > 2 x December 13:00
mean; ev with `share 0.25` over 200 elements is binary and 10-40 % of elements charge at least once;
pv with `cloudiness 3` raises `ProfileParamsError` mentioning `cloudiness`; a CSV at 30-min resolution
interpolated to 15 min gives `0, 0.5, 1.0`, repeats a 1-day file over 2 days (`rep[24] == rep[0]`),
raises `does not cover` with `repeat=false` and `column 'nope'` for a missing column; residential over
35040 steps x 200 elements takes < 3 s.

### 6.11 Run manager (`runner.py`)

- `RunManager(ws, max_workers=1, mark_stale=True)`: a `ThreadPoolExecutor(max_workers,
  thread_name_prefix="gridsim-run")`, an in-memory `{run_id: _RunState(info, cancel Event, delete_after,
  last_persist)}` guarded by a lock. `RunInfo` objects are replaced, never mutated.
- On construction (server only), `mark_stale_runs()`: every persisted run still `queued`/`running` that is
  not active becomes `failed` with `error="interrupted"` and `finished_at=now()`.
- `create(case)`: new unique run id, mkdir, write the frozen `case.json`, `RunInfo(status="queued",
  message="Queued", case_id=case.id or "adhoc", n_timesteps=case.time.n_timesteps, created_at=now())`,
  register as active, persist. `submit(case)` = create + `executor.submit(execute, id)`.
- `execute(run_id, listener=None)`: if cancelled already, finish. Set `running`, `started_at=now()`,
  `message="Starting"` (forced persist). Progress callback clamps to `[0, 1]`, rounds to 4 decimals, and
  persists at most every `PERSIST_INTERVAL_S = 0.5`. Load the frozen case and network, run the study type.
  Outcomes: success -> `succeeded`, `progress=1.0`, `message=f"Completed {n} timesteps"`,
  `n_failed_timesteps`; `RunCancelled` -> `cancelled`, `"Cancelled"`; any exception -> `failed`,
  `"Failed"`, `error=str(exc) or repr(exc)` (logged). Always `finished_at=now()`,
  `duration_s=round(monotonic elapsed, 3)`; force-persist; remove from active; if `delete_after`, delete the
  run directory.
- `get(id)`: active state or `run.json` (404 if missing). `list(case_id=None)`: all runs, filtered, newest
  first. `last_run(case_id)`.
- `cancel(id)`: not active -> return the persisted info unchanged; else set the event; a queued run becomes
  `cancelled` immediately. The study checks the event after profile generation and after every chunk.
- `delete(id)`: non-terminal -> `ConflictError("Run '<id>' is <status>; cancel it first")`; else invalidate
  the result cache and remove the directory. `delete_case_runs(case_id)`: active runs get
  `delete_after=True` + cancel; others are removed now.
- `watch(id, interval_s=0.25)` (async generator for SSE): yields RunInfo whenever its JSON changes, until and
  including a terminal state.
- `shutdown()` (app lifespan exit): cancel all, `executor.shutdown(wait=True, cancel_futures=True)`, finish
  leftover queued runs as cancelled.

App lifespan: seed the demo case, create `app.state.runner = RunManager(ws, max_workers=max_workers)`;
`app.state.workspace = ws`. `create_app(workspace_root=None, max_workers=1)`: a given root replaces the
active workspace.

### 6.12 NaN and null handling

- PGM "not set" input values (NaN floats, minimum integers) become `null` in topology `params`/`p_specified`/
  `q_specified`/`b1`.
- Failed timesteps are NaN in parquet; all query responses convert NaN to `null` (`None if v != v`).
- Summary: non-finite extremes -> `null`; `nanmin/nanmax` warnings suppressed; all-NaN KPIs -> `null`.
- De-energised nodes report `u = 0` in PGM; the summary ignores `u_pu <= 0` (treated as NaN). The snapshot
  returns the raw value (0.0) for them; the frontend treats them as "not energised" by topology (BFS), not
  by value.
- The frontend formats any non-finite number as `—`.

---

## 7. Frontend, page by page

### 7.1 App plumbing

- `main.tsx`: `QueryClient` with defaults `retry: (count, err) => (status >= 500 || status === 0) ? count < 2 : false`,
  `refetchOnWindowFocus: false`, `staleTime: 5_000`; render
  `<StrictMode><QueryClientProvider><ToastProvider><RouterProvider router/>`.
- `router.tsx` (`createBrowserRouter`), root `/` element `<AppShell/>`, `errorElement: <NotFoundPage/>`,
  `hydrateFallbackElement: <LoadingState/>`. Children: index -> `CasesPage`; `cases/new` and
  `cases/:caseId` -> lazy `CaseEditorPage`; `runs` -> `RunsPage`; `runs/:runId` -> lazy `RunPage`;
  `runs/:runId/results` -> lazy `<RunPage tab="results"/>`; `*` -> `NotFoundPage`. Heavy pages (ECharts,
  Cytoscape) are code-split via `lazy`.
- `api/client.ts`: `API_BASE = '/api'`; `request<T>(path, init)` sets `Content-Type: application/json` for
  non-FormData bodies and `Accept: application/json`; a fetch failure throws `ApiError(0, "Network error:
  <msg>")`; 204 returns `undefined`; non-JSON bodies are kept as text; non-2xx throws
  `ApiError(status, detail, issues)` where `detail = body.detail ?? body ?? statusText` and `issues` are
  extracted from `body.issues`, `body.detail[]` or `body.detail.issues`. `ApiError.message` formats a string
  detail as-is, FastAPI arrays as `loc: msg; ...`, objects via `message` or JSON. `api` object methods:
  `health, listNetworks, getEditableFields, getNetwork(source,key), uploadNetwork(file), listProfileGenerators,
  previewProfile(body, signal), uploadProfileCsv(file), listCases, getCase, createCase, updateCase, deleteCase,
  validateCase, startRun, listRuns(caseId?), getRun, getRunCase, cancelRun, deleteRun, runEventsUrl,
  getSummary, getTimeseries(runId, {component, field, ids}), getEnvelope, getHeatmap(…, maxColumns=500),
  getSnapshot(runId, t)`. Path segments are `encodeURIComponent`-ed; query strings skip empty values.
- `api/schema.ts`: hand-written TS mirror of every model in section 4 (all API types live here), plus
  `PROFILE_TARGET_COMPONENTS = ['sym_load','sym_gen']`, `TERMINAL_RUN_STATUSES`, and
  `RESULT_FIELDS = {node: ['u_pu','u','u_angle','p','q'], branch: ['loading','p_from','q_from','i_from','p_to','q_to','i_to','s_from'], source: ['p','q','i'], appliance: ['p','q','i']}`.
  `JsonSchema` is the subset used by forms (type, title, description, default, minimum, maximum,
  exclusiveMinimum/Maximum, enum, const, format, properties, required, anyOf, oneOf, allOf, $ref, $defs,
  definitions, items).
- `api/hooks.ts`: query keys
  `health | networks | ['network', s, k] | editable-fields | profile-generators | ['profile-preview', body] | cases | ['case', id] | ['runs', caseId|null] | ['run', id] | ['run-case', id] | ['summary', id] | ['timeseries', id, q] | ['envelope', id, c, f] | ['heatmap', id, c, f, m] | ['snapshot', id, t]`.
  Hooks: `useHealth` (refetch every 15 s, no retry), `useNetworks`, `useNetworkTopology` (staleTime ∞),
  `useEditableFields` (∞), `useUploadNetwork` (invalidates networks), `useProfileGenerators` (∞),
  `useProfilePreview(body|null)` (keepPreviousData, no retry, staleTime 60 s, abort signal),
  `useUploadProfileCsv`, `useCases`, `useCase`, `useSaveCase` (PUT if `id && created_at` else POST; writes the
  case cache, invalidates cases), `useDeleteCase` (invalidates cases + runs), `useValidateCase`,
  `useStartRun` (seeds the run cache, invalidates runs + cases), `useRuns` (refetch every 2 s while any run is
  non-terminal), `useRun`, `useRunCase` (staleTime ∞, no retry), `useCancelRun`, `useDeleteRun`,
  `useResultSummary` (∞), `useTimeseries` (enabled only with ids; ∞; keepPreviousData), `useEnvelope`,
  `useHeatmap` (∞), `snapshotQuery(runId, t)` = `queryOptions({queryKey, queryFn, staleTime: Infinity})`,
  `useSnapshot` = `useQuery({...snapshotQuery, placeholderData: keepPreviousData})`.
- `useRunLive(runId, enabled) -> 'sse' | 'polling' | 'idle'`: opens `EventSource(/api/runs/<id>/events)`;
  on `progress` writes the RunInfo into `['run', id]` and finishes on a terminal status; on `done` writes its
  payload (if any) and finishes; `finish` closes and invalidates runs, cases and the run. On `onerror` (or no
  `EventSource`) it falls back to polling `getRun` every 1000 ms and reports `'polling'`.

### 7.2 UI kit (`components/ui/`)

Small own components on the design tokens (section 11), all keyboard accessible:
`Badge` (tones neutral/accent/good/warn/bad, rounded-full, xs), `Button` (variants primary/secondary/ghost/
danger, sizes sm h-7 / md h-9, `icon`, `loading` shows a spinner and disables) and `IconButton` (ghost,
square, `aria-label` = `title` = `label`), `LinkButton` (router Link styled as Button), `Card`/`CardHeader`
(title, description, icon, actions)/`CardBody`, `EmptyState`, `ErrorState` (role alert, `Retry` link),
`LoadingState` (role status, spinner + label, default `Loading…`), `Spinner`, `Field` (label + control +
hint/error; children may be a render function receiving the generated id; required asterisk),
`TextInput`, `TextArea`, `Checkbox`, `NumberInput` (keeps a text draft so `1e-` or `-` are not clobbered;
commits parsed numbers; `integer`, `min`, `max`, `nullable`, `unit` suffix; `aria-invalid` when invalid; on
blur an invalid draft resets), `Select` (native select with chevron, optional disabled placeholder),
`MultiSelect` (searchable checklist with `Filter…`, `All`, `None`, footer `N of M selected`, option hints),
`Modal` (portal, Escape and backdrop close, sizes sm/md/lg/xl, `role="dialog"`) and `ConfirmDialog`
(`Cancel` + confirm button, danger variant), `Progress` (role progressbar, tones, optional animated stripes),
`Table` (see below), `Tabs` (underline, `role="tablist"`/`tab`, `aria-selected`, badge slot, sizes) and
`Segmented` (pill buttons with `aria-pressed`), `Toast` (`ToastProvider`, `useToast().show/success/error`;
max 5 stacked bottom-right; 3.5 s, errors 7 s).

`Table<T>`: columns `{key, header, cell, sortValue?, align?, className?, cellClassName?(row), width?}`;
click a sortable header to toggle asc/desc (nulls last, numeric-aware string compare), `initialSort`;
the scroll wrapper has `data-table-scroll`, `overflow-auto` and `maxHeight`; sticky `thead`; rows carry
`data-testid="table-row"`, `data-row-key`, `data-selected`; a row click is ignored when the target is inside
`input, button, select, textarea, a, label, [role="button"], [contenteditable="true"]`; the selected row
gets `bg-accent-soft`; `empty` text in a full-width cell; `dense` padding.

### 7.3 App shell (`components/layout/`)

- Sidebar `<aside>` 56 px wide (208 px from `lg`): logo tile (accent square with a lucide `Zap`) and
  `GridSim`; nav links `Cases` (`/`, exact) and `Runs` (`/runs`) with icons (labels hidden below `lg`);
  footer text `Time-series load flow studies on power-grid-model.`
- Header (56 px): `GridSim · time-series load flow` and the `HealthIndicator` pill: `Connecting…` while
  loading, `Backend online` + `· PGM <version>` (green pulsing dot, title `power-grid-model <version>`),
  `Backend offline` on error (red).
- `<main className="min-h-0 flex-1 overflow-auto">` is **the scroll container** of every page (the window
  does not scroll; see pitfalls).
- `Page` (`max-w-6xl`, or `max-w-[1600px]` when `wide`, padding 20 px) and `PageHeader` (breadcrumb, h1 title,
  subtitle, actions).
- `NotFoundPage`: EmptyState `Page not found` / `Unexpected error` with a `Back to cases` primary link.

### 7.4 Cases list (`/`)

Header `Cases`, subtitle `Study definitions: network, time window, profiles and limits.`, primary action
`New case` (-> `/cases/new`). Card `data-testid="cases-list"` with loading / error (`Could not load cases`) /
empty (`No cases yet`) states, else a Table sorted by `updated` desc with columns: **Case** (name link +
truncated description), **Network** (`key (source)`), **Time window** (start, then
`<describeWindow> · <resolution> · <N> steps`), **Last run** (status badge + relative time, links to the run;
else `Never run`), **Updated** (relative), and a delete icon button (`Delete case`). Row click opens the
editor. Delete confirms with `Delete case?` / `<name> and all of its runs will be permanently deleted.` /
`Delete`, then toasts `Case deleted`.

### 7.5 Case editor (`/cases/new`, `/cases/:caseId`)

- New case defaults (`defaultCase`): name `New case`, today 00:00 to +7 days at 15 min, default calculation
  and limits, no assignments, no overrides, network = first item of `GET /networks`.
- Draft state lives in the page; dirty = `stableStringify(draft) !== savedJson` (sorted keys). Header title
  = name (or `Untitled case`) with a badge: `Not saved` (new), `Unsaved changes` (dirty) or `Saved`. Subtitle
  `<network key> · <N> timesteps · <k> profile(s)`. Breadcrumb `Cases / <id or new>`.
- Actions: `Validate`, `Save` (disabled when clean and saved), primary `Run` / `Save & run` (when dirty;
  disabled while network/time local issues exist). All of them save first when needed. After creating a case
  the URL is replaced with `/cases/<id>` (keeping `?tab=`), keeping the same editor instance.
- Leaving with unsaved changes: router `useBlocker` (path changes only) shows `Discard unsaved changes?` /
  `Discard changes`; `beforeunload` is also guarded.
- Validation panel (`data-testid="validation-panel"`, `data-ok`): green `Case is valid · N timesteps` or red
  `<n> error(s)`, a warnings badge, then a list of `error`/`warning` badges with messages (errors first),
  dismissable. A 422 on save (e.g. end <= start from Pydantic) shows its message in the panel; a 422 on run
  shows the returned issues and toasts `Case is not valid` / `Fix the issues listed above and try again.`.
  Toasts: `Case saved`, `Case is valid` (`N timesteps`), `Save failed`, `Validation failed`,
  `Could not start run`. Successful run start navigates to `/runs/<id>`.
- Local checks (`localIssues`, shown as an amber strip of buttons linking to the tab, and a dot on the tab):
  `Name is required.`; `Select a network.`; `Resolution must be an integer between 1 and 1440 minutes.`;
  `End must be after start.`; `Too many timesteps (N > 100,000).`; `u_min must be below u_max.`;
  `Profile #i: select a generator.`; `Profile #i: no target elements selected.`;
  `Profile #i: magnitude is required in add mode.`
- Tabs (`?tab=`): `Overview`, `Network`, `Time & calculation`, `Profiles`.

**Overview**: Name (required), Description textarea (placeholder `What question does this study answer?`),
read-only Case ID (`assigned on save`), Study type, Last updated.

**Network**:
- Card `Network`: network Select (`<name> · <source>`; a missing network shows `<key> · <source> (unavailable)`),
  description text, component count badges (`<n> <Humanized component>`), and an `Upload PGM JSON` button
  (hidden file input `.json`). A successful upload toasts `Network uploaded` and switches to it.
- Switching networks clears the overrides; if there are any, confirm first: `Switch network?` /
  `This case has N parameter override(s) on the current network. Switching networks removes them.` /
  `Switch and clear`.
- Card `Topology` (hint `Pan with drag, zoom with + / −; click an element for details. Edit parameters in the
  table: changes apply to this case only, the network file stays unchanged.`) containing the
  `NetworkExplorer`:
  - toolbar: `Layout` Select (`Auto`, `Radial tree (from source)`, `Force-directed`) and `Show appliances`
    checkbox (default on when <= 400 appliances);
  - a grid of the diagram (height 520) and a 280 px details panel (placeholder `Click an element in the diagram
    or table to see its details.`);
  - the element table below.
  The diagram and table use the **file** topology (layout stays put; the table needs file values); the
  details panel, the diagram's status cues and the legend status use the **effective** topology
  (`effectiveTopology(file, overrides)`, memoised per case in `useCaseTopology`).
- Element table (`data-testid="element-table"`, `data-tab`): tabs `Nodes (n)`, `Branches (n)`,
  `Appliances (n)`, `Sources (n)` (tabs with changes show an amber count badge `data-testid="tab-changes-<kind>"`);
  search box `Search name or id…` (matches name substring, exact id, type, first info column); columns `ID`,
  `Name`, `Type` (badge; not for nodes/sources) and info columns: nodes `Rated voltage`; branches `From`, `To`
  (+ `Status` when read-only); appliances `Node` (+ `P`, `Q` when read-only); sources `Node` (+ `u_ref`). Then
  one column per editable field of the components present in the tab, in registry order, header
  `<label> (<unit>)`, with the two branch statuses merged into one `In service` column.
- In-cell editing (with `editing = {fields, overrides, onChange}`):
  - `NumberCell`: input (`aria-label="<label> of <name>"`, e.g. `P of Load1`) showing `SI * scale` (cleaned
    to 12 significant digits), unit suffix, placeholder `—` when the value is null; commit on blur or Enter,
    Escape cancels; parse accepts a comma decimal; errors `Enter a value`, `Not a number`,
    `Must be a whole number`, `Minimum is <formatted>`, `Maximum is <formatted>` (Enter keeps the error, blur
    discards the edit); tooltip `File value: <formatted or "not set">`.
  - `BoolCell`: checkbox `role="switch"`; for branches it sets both statuses.
  - A changed cell gets the `bg-warn-soft` cell background, amber border and text on the input, a revert icon
    button (`aria-label="Revert <label> of <name>"`) and a line `was <file value>` (`data-testid="cell-was"`;
    `was not set` for a null file value; bools `was on`/`was off`).
  - Setting a value equal to the file value (relative tolerance 1e-9) removes the override; a new override is
    appended, an existing one replaced in place.
  - Header: `N change(s)` (`data-testid="override-count"`, amber when > 0; one change per changed cell, the
    status pair counts once), `Changed only` checkbox (filters to elements with overrides; empty text
    `No changed elements in this tab`), `Revert all` (disabled at 0; confirm dialog `Revert all changes?` /
    `This removes all N parameter changes and restores the network file values.` when more than 5).
- Selection (one shared `selected` via `useNetworkSelection`):
  - **Diagram click** (`source: 'diagram'`): select quietly. The table switches to the element's tab and
    highlights the row; if the row is visible under the current filters it is scrolled into view *inside the
    table's own scroll container only* (set `scrollTop` via `scrollTopToShow`, accounting for the sticky header;
    `scrollLeft = 0`). Never call `scrollIntoView` here; no page scroll, no flash, no filter change, no note.
  - **Edit in table** (details panel button; `Show in table` when read-only): the full jump: switch tab; if
    the search or `Changed only` hides the row, clear them and show a dismissable note
    `Filters cleared to show <name>` (`data-testid="filters-cleared-note"`); `scrollIntoView({block:
    'nearest', inline: 'start'})` (smooth unless reduced motion); flash the row once (`row-flash`, 1 s); the
    row's P input is ready to edit.
  - **Table row click** (not on an input): select and, if the diagram is at least partly in the viewport
    (IntersectionObserver), animate (350 ms, `ease-in-out-cubic`; instant with reduced motion) to centre it,
    keeping the zoom unless it is below 0.6 (then 1.2, capped at maxZoom). If off screen, only select.
  - Details-panel neighbour links (node links, appliance list) select with `source: 'details'` (centre only).
  - The selected row shows a `Back to diagram` link (`data-testid="back-to-diagram"`) that scrolls the diagram
    into view.
- Details panel (`ElementDetails`): kind badge and name, close button `Close details`; rows
  (`data-testid="details-row"`, `data-key`): node: `ID`, `Rated voltage`, `Connected branches`, `Sources`,
  `Appliances (n)` list (max 20, clickable); branch: `ID`, `From`, `To`, `Node 3`, `In service` (yes/no);
  appliance: `ID`, `Node`, `P specified`, `Q specified`, `In service`; source: `ID`, `Node`, `u_ref`. Edited
  values are amber with an `edited` chip (`data-testid="edited-marker"`, title `File value: <x>` or
  `File value: not set`). Button `data-testid="show-in-table"`.

**Time & calculation**:
- `Time window` card (`Timesteps run from start (inclusive) to end (exclusive).`): `Start` and `End`
  `datetime-local` inputs (minute precision; stored with `:00` seconds; End error `End must be after start`),
  `Quick duration` buttons `1 day`, `1 week`, `1 month`, `1 year` (keep start, set end), `Resolution`
  Segmented `5 min`, `15 min`, `30 min`, `1 h`, `Custom` (custom shows an integer input 1..1440 `min`; choosing
  Custom from a preset starts at 10), and a summary box `Duration` (`7 d`, `36 h`, `45 min`) and `Timesteps`
  (red above 100,000 with `At most 100,000 timesteps are allowed. Shorten the window or coarsen the
  resolution.`). The timestep count uses wall-clock minutes (DST-agnostic): `ceil(minutes / res)`.
- `Calculation` card: `Method` (`Newton-Raphson`, `Iterative current`, `Linear`, `Linear current`),
  `Error tolerance` and `Max iterations` (disabled for linear methods, hint `Not used by linear methods`).
- `Limits` card (`Thresholds used to flag violations in the results.`): `u min` (pu; error
  `Must be below u max`), `u max` (pu), `Loading max` (hint `<pct> % of rating`).

**Profiles**:
- Intro text: `Assignments apply in list order. Scale multiplies base p/q; Add adds magnitude × m(t).
  Appliances without an assignment keep their base values.` and `Add profile` (primary). Empty state
  `No profile assignments` / `Without profiles every timestep uses the base load / generation, so all
  timesteps are identical.`
- `Add profile` appends `{id: 'a' + 6 random base-36 chars, label 'New profile', target sym_load all,
  mode scale, factor 1}` with the `residential_load` generator applied (or the first generator).
- Each assignment card (`data-testid="profile-assignment"`): number circle, label input
  (`aria-label="Assignment label"`), mode badge, `<n> <component>` badge, `Move up`, `Move down`,
  `Remove assignment` (confirm `Remove profile assignment?`). Body (two columns from `xl`):
  - `Generator` Select (hint = description). Choosing a generator (`withGenerator`): params reset to the
    schema defaults, mode = `default_mode`, label replaced if it was empty/`New profile`/the old key, target
    component kept if allowed else the first of `applies_to` (ids reset), add-mode magnitude defaults to
    `-5000` W for keys containing `pv`, else `5000` W.
  - csv generator (detected by `file_id` + `column` properties): dashed box with `Upload CSV` (`.csv`), then
    `<filename> · <rows> rows · <start> – <end>` (or the file id, or the hint `First column must be a timestamp;
    other columns are multiplier series.`); toast `CSV uploaded` / `<filename>: <n> columns, <rows> rows`; the
    first column is preselected; `file_id` is hidden from the form and `column` becomes a Select of the
    uploaded columns.
  - Parameter form (`SchemaForm`, section 7.8).
  - `Target component` Select (`Symmetric loads`, `Symmetric generators`, limited to `applies_to`);
    `Mode` Segmented `Scale`/`Add` (hint `p(t) = p_base · factor · m(t)` or `p(t) += magnitude · factor ·
    m(t)`); `Scale factor` (`data-testid="profile-factor"`, unit `×`, 0..100, hint `Multiplies the whole
    profile, e.g. 2 = twice the peak (stress test)`); in add mode `Magnitude` (W, nullable; hint
    `<fmtPowerW> per element at m = 1. Negative = behind-the-meter generation (e.g. rooftop PV).`).
  - Targets Segmented `All <component> (<n>)` / `Selected elements` (switching to selected preselects all);
    then a `MultiSelect` of the component's appliances from the **effective** topology: label = name, hint =
    current P (amber when edited, with an `edited` chip titled `File value: P <x>[, in service|out of
    service]`) and muted italic `out of service` when the appliance is out of service (still selectable;
    `data-testid="target-hint"`).
  - Preview (`ProfilePreview`): `POST /profiles/preview` with 3 sample elements over the case window clipped to
    the first 7 days (`Preview (first 7 days)`), debounced 450 ms, the `factor` applied client-side (no
    refetch), ECharts lines `Sample 1..3`, y-axis `multiplier` (not scaled), 180 px tall, spinner while
    fetching, `Preview failed` error. Disabled for csv until a file is chosen.

### 7.6 Run page (`/runs/:runId`, `/runs/:runId/results`)

- Header: breadcrumb `Runs / <id>` (mono), title = case name + status badge (`data-testid="run-status"`,
  `data-status`), subtitle `Started <time> · <N> timesteps · <elapsed>`; actions `Edit case` (link) and,
  while running, `Cancel run` (danger; toast `Cancellation requested`).
- Status badge labels: `Queued`, `Running <pct>%` (spinning icon), `Succeeded`, `Failed`, `Cancelled`; tones
  neutral/accent/good/bad/warn.
- Progress card (hidden on `/results` for a succeeded run): message (or `Waiting to start…`), `<pct> %`, a
  live indicator `live` (SSE, title `Live updates via server-sent events`) or `polling`; a Progress bar (tone by
  status, animated while running); stats `Created`, `Finished`, `Elapsed` (ticks every 500 ms while running),
  `Failed timesteps` (red when > 0); the `error` text in a red box.
- Live updates: `useRunLive` while the run is not terminal (SSE first, polling fallback).
- Succeeded: a `Results` heading and the `ResultsPanel`. Failed/cancelled: `No results: this run failed.` /
  `No results: this run was cancelled.`

### 7.7 Runs list (`/runs`) and results panel

- Runs list: header `Runs`, `All simulation runs, newest first.`; empty `No runs yet` / `Open a case and press
  Run to start a time-series load flow.` with `Go to cases`. Columns: **Run** (mono id link), **Case** (link to
  the case), **Status** (badge; running shows the badge plus a progress bar), **Timesteps**, **Failed steps**
  (red when > 0), **Created**, **Duration**, and actions: `Results` (ghost link to `/runs/<id>/results`,
  succeeded only) and `Delete run` (disabled while active; confirm `Delete run?`; toast `Run deleted`). Row click
  opens the run. The list refreshes every 2 s while a run is active.
- `ResultsPanel`: loads the summary (`Loading results…` / `Could not load results`), then `KpiTiles`, then a Card
  `data-testid="result-views"` with a Tabs strip of all `RESULT_VIEWS` (selected via `?view=<id>`, default the
  first), the view description, and the active view inside `data-testid="result-view-<id>"`. Views receive
  `{runId, summary}` and fetch their own data.
- KPI tiles (`data-testid="kpi-tile"`, value `data-testid="kpi-value"`), 2/4/8 columns:

| Tile | Value | Sub line | Tone |
|------|-------|----------|------|
| Min voltage | `fmtPu(u_min_pu) pu` | `limit 0.95` | bad if below `u_min_pu` else good |
| Max voltage | `fmtPu(u_max_pu) pu` | `limit 1.05` | bad if above |
| Max loading | `fmtPct` | `limit 100 %` | bad if above `loading_max` |
| Voltage violations | count | `episodes` / `none` | bad if > 0 |
| Loading violations | count | `episodes` / `none` | bad if > 0 |
| Energy import | `fmtMwh` | – | – |
| Energy losses | `fmtMwh` | `<x.xx> % of import` | – |
| Failed timesteps | count | `of <N>` | bad if > 0 |

  Unknown extra numeric KPIs get a humanized tile. Limits come from the run's frozen case
  (`useRunContext`), defaulting to 0.95/1.05/1.0.
- `useRunContext(runId)`: run -> frozen case (`GET /runs/{id}/case`) -> topology of its network; returns
  `{run, case, limits, topology (effective, frozen overrides applied), fileTopology, effective,
  topologyLoading, topologyError}`.

Result view registry (`results/views/index.ts`; the results page renders exactly these, in this order):

| id | title | description |
|----|-------|-------------|
| `voltage-envelope` | Voltage envelope | `Spread of node voltages (min / p05 / mean / p95 / max) over time, against the case limits.` |
| `timeseries` | Element time series | `Plot any result field for selected nodes, branches, sources or appliances.` |
| `loading-heatmap` | Loading heatmap | `Branch loading per element and time bucket, worst branches first.` |
| `violations` | Violations | `Limit violation episodes and per-element extremes.` |
| `snapshot` | Network snapshot | `The network coloured by voltage and loading at one timestep, with playback.` |

Views:
- **Voltage envelope**: `GET envelope(node, u_pu)`; stacked area bands `min – max` (opacity 0.14) and
  `p05 – p95` (0.3) in series colour 1 (drawn as a transparent base line plus a stacked difference), a `mean`
  line (width 2); dashed red limit markLines labelled `u_min 0.95` / `u_max 1.05` at the end; y-axis `u [pu]`
  with 3-decimal labels and range from `axisRangeWithLimits(min(min), max(max), [u_min, u_max])`; tooltip lists
  max/p95/mean/p05/min; dataZoom; height 400; wrapper `data-testid="voltage-envelope-chart"` with
  `data-y-min`/`data-y-max`.
- **Element time series**: left column (260 px): `Component` Segmented (`Nodes`, `Branches`, `Sources`,
  `Appliances`; switching resets the field to the first), `Field` Select (`<label> · <field>`), `Elements`
  MultiSelect (nodes hint `<u_min>–<u_max>`, branches `fmtPct(loading_max)`, appliances type; sources and
  appliances from the run topology), default = worst 5 (nodes by max |1 − u| over min/max, branches by
  `loading_max`, else the first 5) with hint `Default: worst 5 from the summary`. Right: `TimeseriesChart`
  (height 420) with limit lines for node `u_pu` (voltage) and branch `loading` (loading), or
  `Select one or more elements to plot.`
- **Loading heatmap**: `GET heatmap(branch, loading, 500)`; `Top 25` (default) / `Top 50` / `All` Segmented;
  caption `<n> branches · <k> time buckets (max per bucket) · sorted by peak loading`; category y-axis with the
  worst branch at the top (names truncated at 110 px), x-axis bucket start times; visualMap 0..1.2,
  horizontal, labels in %, colours `[dark ? '#1f2b3a' : '#eef4fc', '#86b6ef', '#2a78d6', '#eda100', bad]`;
  tooltip `<name> / <time> / max loading <x.x %>`; x dataZoom; height `max(260, rows*16 + 120)`; empty state
  `No branches in this network`.
- **Violations**: sub-tabs `Violation episodes (n)` (default when any), `Node extremes (n)`,
  `Branch extremes (n)`; hint `Click a row to plot that element over time.` Episodes table: Element, Type,
  Kind (badge; undervoltage bad, overvoltage warn, overloading bad), Start, End, Steps (default sort desc),
  Worst (red), Limit; empty `No violations` / `All voltages and loadings stayed within the case limits.` Node
  extremes: Node, u min (red below limit; default sort asc), at, u mean, u max (red above), at. Branch
  extremes: Branch, Type, Max loading (red above; default sort desc), at, Mean loading. Row click opens a Modal
  (`xl`) titled `<name> · voltage|loading` with a `TimeseriesChart` (height 380) of `u_pu` or `loading` with
  the corresponding limit lines.
- **Network snapshot**: section 9.

### 7.8 JSON-schema form (`lib/jsonSchema.ts`, `components/SchemaForm.tsx`)

- `deref` resolves `$ref` into `#/$defs/...` or `#/definitions/...` (wrapper keywords win) and single-element
  `allOf`, up to depth 10.
- `fieldSpec`: `anyOf`/`oneOf` with a `null` variant -> nullable and unwrapped when one variant remains;
  array `type` with `null` likewise; `enum` -> `enum` kind (string values humanized as labels: `_` -> space,
  first letter upper-case); `const` -> single-option enum; `number`/`integer`/`string`/`boolean`; else
  `unsupported` (edited as JSON text). Title = schema title or the humanized key.
- `fieldsFromSchema` keeps declaration order; `defaultsFromSchema` takes every declared default (required
  booleans without default become `false`).
- `validateField`: empty required non-nullable without default -> `Required`; numbers: `Must be a number`,
  `Must be an integer`, `Must be ≥ <min>`, `Must be ≤ <max>`, `Must be > <x>`, `Must be < <x>`.
- `SchemaForm`: grid (1/2/3 columns); no fields -> `This generator has no parameters.`; `hidden` names;
  `renderField` override hook. Field hint = description and `Range <lo> … <hi>` (or `≥ lo` / `≤ hi`);
  required asterisk when there is no default. Number inputs are nullable (clearing falls back to the default);
  booleans are checkboxes; enums Selects (with `—` for nullable); strings text inputs.

---

## 8. Network diagram (`components/network/NetworkDiagram.tsx` + `graph.ts`, `symbols.ts`, `energised.ts`, `Legend.tsx`)

One shared Cytoscape component is used by the case editor (`NetworkExplorer`) and the results snapshot.
Layout runs once per element set + layout choice; colours, statuses, changed markers and selection are
applied in place (no re-layout).

### 8.1 Props

`topology` (drives the layout), `selected`, `onSelect(ref | null)`, `overlay?: {nodeColor(id), branchColor(id),
branchWidth(id)}`, `overlayKey` (re-applies overlay styles, e.g. the timestep), `showAppliances = true`,
`showSources = true`, `layout: 'auto' | 'tree' | 'force' = 'auto'`, `height = 480`, `legend` (bottom-left),
`corner` (bottom-right, non-interactive), `changed?: Set<'kind:id'>`, `statusTopology` (the topology whose
statuses are drawn, default `topology`), and a ref handle `{centerOn(ref) -> bool, scrollIntoView()}`.

### 8.2 Elements (`buildElements`)

- Element ids: `cyId(kind, id) = kind[0] + id` (`n0`, `b47`, `a104`, `s99`); `parseCyId` reverses it
  (`/^([nbas])(-?\d+)$/`).
- Bus nodes: data `{id, label: name, kind: 'node', eid, u_rated, sub: '<kV> kV', energised: 1}`.
- Branches whose end nodes exist: data `{kind: 'branch', eid, btype, label: name, in_service: 0|1, leg: 0}`,
  class `branch`.
  - Three-winding transformer (with a valid `node_3`): a hub node `t<id>` (`kind: 'hub'`, `sym: 'xfmr3'`,
    `u1/u2/u3` = the three rated voltages, classes `hub sym`) and three legs `b<id>_0..2` from the hub to
    node_1/2/3 (only leg 0 carries the label and `leg: 0`).
  - Two-winding transformer: the edge (classes `branch xfmr`, data `xf: 'xf<id>'`) plus an overlay symbol node
    `xf<id>` with `{kind: 'branch', eid, sym: 'xfmr', edge: 'b<id>', u_from, u_to, angle: 0}`, classes
    `xfmr-symbol sym`, `grabbable: false`. The symbol node is excluded from the layout
    (`cy.elements().not('.xfmr-symbol').layout(...)`).
  - Others: one edge.
- Sources (if shown): node `s<id>` (`kind: 'source'`, `sym: 'grid'`, classes `source sym`) + dotted stub edge
  `xs<id>` (`kind: 'stub'`, class `stub`).
- Appliances (if shown): node `a<id>` (`kind: 'appliance'`, `atype`, `in_service`); generators
  (`type` contains `gen`) classes `appliance gen sym` with `sym: 'gen'`; shunts `appliance shunt sym` with
  `sym: 'shunt'`, `shunt: shuntKind(b1)`; loads `appliance load` (a plain triangle); plus a stub edge
  `xa<id>` carrying `in_service`.

### 8.3 Layout

- `auto`: breadthfirst if `branches <= nodes` (radial/tree-like) and there are sources, else fcose.
  `tree` forces breadthfirst, `force` fcose.
- breadthfirst: `roots` = the nodes of all sources, `directed: false`, `spacingFactor: 1.1`, `animate: false`,
  `fit: true`, `padding: 24`, `circle: false`.
- fcose: `quality: elements > 1500 ? 'draft' : 'default'`, `randomize: true`, `animate: false`, `fit: true`,
  `padding: 24`, `nodeRepulsion: 6000`, `idealEdgeLength: stub ? 10 : 50`, `edgeElasticity: stub ? 0.9 :
  0.45`, `numIter: 2500`. Register fcose once (`cytoscape.use(fcose)`).
- Cytoscape options: `minZoom 0.05`, `maxZoom 6`, **`userZoomingEnabled: false`** (the wheel scrolls the page;
  this also disables pinch-zoom), `userPanningEnabled: true`, `boxSelectionEnabled: false`,
  `selectionType: 'single'`. No wheel handler or `preventDefault` on the container. Resize with a
  ResizeObserver.
- Zoom controls, top-right stacked buttons: `Zoom in` (zoom × 1.25), `Zoom out` (× 0.8), both around the
  centre (`renderedPosition` = container centre), and `Fit` (title `Fit to view`, `cy.fit(undefined, 24)`).

### 8.4 Colours

- Voltage-level colour of a bus (editor): distinct `u_rated` values sorted descending; level `i` ->
  `theme.series[i % 8]` (so the highest level is series 1 blue, next series 2 orange, ...).
- Branch-type colour: line/asym_line `fg2`, link `muted`, transformer/three-winding `series[6]` (purple),
  generic_branch `series[3]` (amber); width 1.8 for lines, 2.6 for other types.
- Snapshot overlay: node colour from the voltage scale (section 9.2), branch colour `loadingColor`
  (section 9.3), branch width `null ? 1 : 1.5 + min(1.5, loading) * 3`.

### 8.5 Stylesheet (exact; `t` = chart theme, `resultNodes` = an overlay node colour is present)

Bus-node constants: `NODE_SIZE = 9`, `NODE_CHANGED_SIZE = 11`, `NODE_BORDER = 1`, `NODE_CHANGED_BORDER = 2`,
`NODE_SELECTED_BORDER = 2`, `NODE_SELECTED_OVERLAY = 3`, `NODE_HOLLOW_BORDER = 1.5`, `NODE_LABEL_MARGIN = 1.5`,
`NODE_HIT_RADIUS = 7`. Symbol sizes (model px): `xfmr 28, xfmr3 28, grid 24, gen 18, shunt 18`.

Rules, in this order (later rules win):

| Selector | Style |
|----------|-------|
| `node` | 9×9, `background-color: data(color)`, border 1 px `resultNodes ? fg2 : surface`, label `data(label)`, font 9, colour fg2, `text-valign: bottom`, `text-margin-y: 1.5`, `min-zoomed-font-size: 7`, text background surface @ 0.7, padding 1px |
| `node.hub` | 8×8 diamond, `series[6]`, no label |
| `node.source` | round-rectangle 16×16, background fg, font 8 |
| `node.appliance` | 7×7, no border, background muted, no label |
| `node.load` | triangle |
| `node.gen` | ellipse, `series[2]` |
| `node.shunt` | rectangle |
| `node.sym` | ellipse, `width/height: data(sz)`, background surface at opacity 0, `background-image: data(img)`, `background-fit: contain`, background width/height 86 %, `background-clip: none`, `background-image-containment: over`, no border |
| `node.xfmr-symbol` | background width/height 100 %, no label |
| `edge` | `width: data(width)`, `line-color: data(color)`, `curve-style: bezier`, no label, opacity 0.9 |
| `edge.stub` | width 0.8, colour axis, dotted |
| `:selected` | `overlay-color: accent`, `overlay-opacity: 0.25`, `overlay-padding: 5` |
| `node.changed` | border warn 2 px opacity 1, 11×11 |
| `node.appliance.changed` | 10×10, border 2.5 |
| `node.sym.changed` | size `data(sz)`, border 2 px warn |
| `edge.changed` | `underlay-color: warn`, `underlay-opacity: 0.55`, `underlay-padding: 4` |
| `node[kind = "node"][energised = 0]` | not energised: background opacity 0, `background-image` = the muted × (`notEnergisedSvg`), fit contain, clip none, border 1.5 **dashed** muted opacity 1, label colour muted, **italic** |
| `node[kind = "node"][energised = 0].changed` | border warn 2 px (keeps the dashes and the changed size) |
| `node.appliance[in_service = 0], node.hub[in_service = 0]` | hollow: background opacity 0, border 1.2 muted |
| `node.sym[in_service = 0]` | border 0 (the symbol draws its own off variant) |
| `node.sym.changed[in_service = 0]` | border 2 warn |
| `edge.stub[in_service = 0]` | dashed `[3, 2]`, muted, width 0.8 |
| `edge.branch[in_service = 0]` | out of service: width **1.5**, colour muted, dashed with `line-dash-pattern [6, 5]`, opacity 1 |
| `edge.branch[in_service = 0][leg = 0]` | label **`off`**, font 8 weight 600, colour fg2, `text-rotation: none`, text background surface opacity 1, padding 1.5px, roundrectangle, text border 1 px muted, `min-zoomed-font-size: 5` |
| `edge.branch.xfmr[in_service = 0][leg = 0]` | `text-margin-y: -19` (lift the marker clear of the transformer symbol) |
| `edge.branch.changed[in_service = 0]` | thin amber underlay: padding 1.5, opacity 0.4; text border warn |
| `node:selected` | border accent 3 |
| `node[kind = "node"]:selected` | border 2, `overlay-padding: 3` |
| `node.sym:selected` | border 2, opacity 1 |

Status cues are applied after the overlay so they win over the loading colour/width and the changed halo.
The changed and selected cues still layer on top.

### 8.6 Hit testing and selection

- Bus nodes are only 9 px. On `tap` on the background **or an edge**, select the nearest visible bus node
  whose rendered position is within `NODE_HIT_RADIUS = 7` rendered px of the click (any zoom); this gives a
  ~14 px target. (Cytoscape's own hit area is the node size plus ~2 px a side; `overlay-padding` does not
  affect hit testing.) A programmatic tap without a position skips this.
- Otherwise: background -> `onSelect(null)`; a hub or anything with `kind: 'branch'` (edge, leg, transformer
  symbol) -> `{kind: 'branch', id: eid}`; stubs are ignored; else `parseCyId`.
- Selection sync: unselect all, then select the element (`[kind = "branch"][eid = id]` for branches, so a
  transformer's edge and symbol both select).
- Tooltips: on mouseover of a node/edge with `data('tip')` set the container `title` (`Out of service`,
  `Not energised`), cleared on mouseout.

### 8.7 Symbols (`symbols.ts`, pure, SVG data URIs `data:image/svg+xml;charset=utf-8,<encoded>`)

Palette `{stroke, surface, muted}`; stroke width `SW = 1.8` on a 24-unit grid (transformers 36).

- `transformerSvg(from, to, p, {off, angle})`: 36×36; two circles r 8.5 at (13,18) and (23,18): first two
  surface-filled circles, then two stroked circles in the from/to voltage-level colours (`off`: both muted and
  dashed `3 2`); a non-zero `angle` wraps everything in `rotate(angle 18 18)`.
- `transformer3Svg([c1,c2,c3], p, {off})`: 36×36; circles r 8 at (18,12), (12.2,22), (23.8,22), coloured by
  node_1/2/3.
- `generatorSvg`: circle r 10 at (12,12) (fill surface, or none when off) and a sine path
  `M6 12 C7.5 7.5 10.5 7.5 12 12 S16.5 16.5 18 12` (round caps). Stroke `series[2]` (green), muted when off.
- `externalGridSvg`: a square from 2.5 to 21.5, diagonal hatching (`x + y = k` for `k = 10, 15, ..., < 43`,
  stroke 1.1, clipped to the square), square outline SW. Stroke fg.
- `shuntSvg(kind)`: `capacitor` = lead lines `M12 2V9.5M12 14.5V22` and plates `M5 9.5H19M5 14.5H19` (width
  2.4); `reactor` = a coil `M12 2V4.5A3.4 3.4 0 0 1 12 9.5A3.4 3.4 0 0 1 12 14.5A3.4 3.4 0 0 1 12 19.5V22`;
  `generic` = leads `M12 2V6M12 18V22` and a box 8,6 8×12; plus (not when off) a faint surface plate
  `rect x4 y2 16×20 rx3 opacity 0.85`. Stroke fg2. `shuntKind(b1)`: null/non-finite/0 -> `generic`, > 0
  `capacitor`, < 0 `reactor`.
- `notEnergisedSvg(p)`: `M6.5 6.5L17.5 17.5M17.5 6.5L6.5 17.5` in `muted`, width 3, round caps.
- `paintSymbol(node)`: builds the image from the node's `sym`, voltage levels and `in_service` (`off`), and
  stores `img` and `variant: 'off' | 'on'` in node data (tests read `variant`). Repaint on theme change, on
  status change and when a transformer's angle changes.
- Placement: after layout (`layoutstop`), on every bus node `position` event (drag), each 2-winding symbol is
  moved to the midpoint of its edge's end nodes and rotated to `quantisedAngle(dx, dy)` (degrees,
  `atan2`, rounded to 5°, −180 -> 180, 0 for a zero vector).
- Zoom: on `zoom`, `sz = SYMBOL_SIZE[sym] * symbolScale(zoom)` where
  `symbolScale(z) = round(f * 20) / 20` with `f = z < 0.7 ? 0.7 / z : z > 1.8 ? 1.8 / z : 1` (rendered size
  stays between 0.7 and 1.8 times the base size).

### 8.8 Statuses (`energised.ts`)

- Constants: `OOS_WIDTH = 1.5`, `OOS_LABEL = 'off'`, `OOS_TIP = 'Out of service'`,
  `ISLANDED_TIP = 'Not energised'`.
- `branchInService(b) = b.in_service && from_status != 0 && to_status != 0` (missing statuses count as on).
- `energisedNodes(topo)`: undirected adjacency over in-service branches (three-winding: connect all three nodes
  when in service; else only windings whose `status_i` param is 1, if present); BFS from the nodes of sources
  whose `params.status` is not 0. Returns the set of reached node ids.
- Applied from `statusTopology` (the effective topology in the editor; the frozen run topology on the
  snapshot): branch edges, hubs and transformer symbols get `in_service` and `tip`; appliances and their stubs
  get `in_service`; bus nodes get `energised` and `tip`.
- Container data attributes (test hooks): `data-testid="network-diagram"`, `data-changed-count`,
  `data-out-of-service-count` (branches + appliances off), `data-not-energised-count`,
  `data-selected="<kind>:<id>"`.
- Changed markers: `changed` keys `kind:id`; branches mark `[kind = "branch"][eid = id], [kind = "hub"][eid = id]`.

### 8.9 Legends (`Legend.tsx`, bottom-left box `max-w-[70%]`, `bg-surface/90`, blur)

- `TopologyLegend` (editor): voltage levels (first 8) as dots `<kV> kV`; a divider; non-transformer branch
  types as line swatches (`Line`, `Link`, `Generic branch`, `Asymmetric line`); `SymbolLegend`; `Changed`
  (amber ring) when anything changed; `StatusLegend` of the effective topology.
- `SymbolLegend`: `<img>` icons (`data-testid="legend-symbol"`, `data-symbol=<label>`) for `Transformer`
  (highest two levels' colours), `Generator`, `External grid`, and `Capacitor` / `Reactor` / `Shunt` for the
  shunt kinds present.
- `StatusLegend` (`data-testid="status-legend"`, shown only when needed): `Out of service` (dashed line) when
  any branch/appliance is off; `Not energised` (italic, a dashed muted ring with the × icon,
  `data-testid="legend-not-energised"`) when any node is islanded.
- `GradientLegend(label, stops, ticks)`: 128 px gradient bar with ticks.
- Legend and `corner` share one absolutely positioned bottom flex row (`justify-between`, `items-end`), so the
  clock never overlaps the legend.

### 8.10 Theme regeneration and test hooks

- Theme changes (light/dark) re-run the style effect: `cy.style(stylesheet(theme, ...))`, recolour nodes and
  edges and repaint all symbols in place, with no re-layout.
- In dev/test builds (`import.meta.env.DEV`), `window.__gridsimCy` is the most recently created Cytoscape
  instance (deleted on destroy) and `window.__gridsimEcharts` is the `echarts` module (for
  `getInstanceByDom`).

---

## 9. Results network snapshot (`results/views/NetworkSnapshotView.tsx`)

Layout: a toolbar row, then a grid of the diagram (height 540, appliances hidden) and a 260 px details panel.

### 9.1 Toolbar, time and playback

- Buttons `Play`/`Pause` (primary icon button), `Previous timestep`, `Next timestep`; a range input
  (`aria-label="Timestep"`, 0..n−1) wrapped in the `DaylightTrack`; a label block: the timestamp
  (`fmtDateTime`) and `step <t+1> / <n>` (`data-testid="snapshot-step"`, spinner while fetching); a speed
  Segmented.
- Initial timestep: the timestep of the node with the lowest `u_min_pu` (`t_u_min`), else 0.
- Speeds (`playback.ts`): `BASE_STEP_MS = 600`, multipliers `[1, 2, 4, 8, 16]`, labels `1×`..`16×`, values
  `600 / m` ms (600, 300, 150, 75, 37.5), default 2× (300 ms). Prefetch count
  `max(2, round(2 * log2(m)))` = 2, 2, 4, 6, 8.
- Never skip a frame: the frame is "ready" when the current timestep's own snapshot is loaded
  (`!isFetching && !isPlaceholderData`); `shownAt` records `performance.now()` when it became ready; while
  playing and ready, a timeout of `nextFrameDelay(stepMs, shownAt, now) = max(0, stepMs − (now − shownAt))`
  advances `t` (wrapping to 0 after the last step). Fetch time of cached frames therefore does not add to the
  interval; an uncached frame is waited for.
- While playing, prefetch the next `prefetch` snapshots (`(t + i) % n`) with `queryClient.prefetchQuery(
  snapshotQuery(runId, i))`; snapshots have `staleTime: Infinity`, so prefetched data is reused as-is.
  Reference: ~24.5 steps/s at 16× on the demo week.
- The Segmented must fit 5 options at ~1280 px and wrap cleanly on narrower widths (the toolbar is
  `flex-wrap`, the slider `min-w-40 flex-1`).

### 9.2 Voltage colour scale (`lib/voltageScale.ts`, `VoltageScaleLegend.tsx`)

- `VoltageScale = [fullUnder, bandLow, bandHigh, fullOver]` (pu), `DEFAULT_VOLTAGE_SCALE = [0.90, 0.95, 1.05,
  1.10]`, bounds `SCALE_MIN_PU = 0.5`, `SCALE_MAX_PU = 1.5`, `EDGE_TINT = 0.28`, storage key
  `gridsim.voltageScale.v1`.
- `voltageColor(u, scale, theme)`:
  ```
  u null/undefined/NaN -> theme.axis
  bandLow <= u <= bandHigh -> theme.voltMid (exactly)
  u < bandLow:  u <= fullUnder -> voltUnder; else mix(voltMid, voltUnder, 0.28 + 0.72 * (bandLow - u) / (bandLow - fullUnder))
  u > bandHigh: u >= fullOver  -> voltOver;  else mix(voltMid, voltOver,  0.28 + 0.72 * (u - bandHigh) / (fullOver - bandHigh))
  ```
  `mix(a, b, f)` interpolates two `#rrggbb` colours channel-wise with `round`, `f` clamped to [0, 1] (non-hex
  input: `f < 0.5 ? a : b`).
- `validateScale(s)` messages: `Enter four values.`, `Enter four numbers.`,
  `Values must be between 0.5 and 1.5 pu.`, `Values must be strictly ascending.`; null when valid.
- `matchLimits(scale, uMin, uMax)`: band = run limits, outer values keep their current gaps, rounded to 4
  decimals.
- Persistence: `loadScale` reads `localStorage` in try/catch; missing, unparsable or invalid -> defaults.
  `saveScale` writes in try/catch. A module-level store with `useSyncExternalStore` (`useVoltageScale() ->
  [scale, set]`) keeps the legend, popover and diagram in sync and listens to `storage` events for the key.
  `setVoltageScale` ignores invalid scales (returns false). It is a browser display setting: it applies to
  every run and never changes results.
- Legend (`data-testid="voltage-legend"`): label `u`, a 160 px bar of three equal sections: a blue ramp
  (`voltUnder` -> 28 % tint), a flat neutral section (`data-testid="voltage-legend-band"`, title `within band`)
  and a red ramp (28 % tint -> `voltOver`); ticks (`data-testid="voltage-tick"`) at the four values with 2
  decimals at 0, 1/3, 2/3, 1 of the bar; caption `within band`; an icon button `Edit scale` (sliders icon,
  `aria-expanded`).
- Popover (`role="dialog"`, `aria-label="Voltage colour scale"`, `data-testid="voltage-scale-popover"`, opens
  above the legend, 256 px): title `Voltage colour scale`; four NumberInputs (pu, step 0.01, 0.5..1.5) labelled
  `Full blue below`, `Band from`, `Band to`, `Full red above`; valid drafts apply immediately (also during
  playback); invalid ones show `<message> Not applied.` (`role="alert"`, `data-testid="voltage-scale-error"`)
  and change nothing; buttons `Match run limits` (title `Band 0.95–1.05 pu from the run's case limits`) and
  `Reset to defaults`; note `Saved in this browser; applies to every run.`. Escape or a click outside closes it.
- Neutral colour: `--c-volt-mid` is a clearly filled grey (`#d6d5cf` light, `#5a5954` dark), so a within-band
  node never looks like the hollow "not energised" node; result-coloured nodes keep the fg2 ring (8.5).

### 9.3 Loading colour scale (`graph.ts`)

```
loadingColor(l): null/non-finite -> axis
  l <= 0.6 -> mix(axis, good, l / 0.6)
  l <= 1.0 -> mix(good, '#eda100', (l - 0.6) / 0.4)
  else     -> mix('#eda100', bad, min(1, (l - 1) / 0.2))
```

Loading legend: `GradientLegend('loading', [loadingColor(0), (0.6), (1), (1.2)], ['0%', '60%', '100%', '120%'])`.
Legend row = `VoltageScaleLegend`, the loading gradient, `StatusLegend` of the run topology.

### 9.4 Daylight clock (`lib/solar.ts`, `views/clock.ts`, `SnapshotClock.tsx`)

- Same geometry as the backend PV generator: `doy` from the local calendar date (1 = 1 Jan);
  `decl = 23.44° · sin(2π(284 + doy)/365)`; `c = −tan(lat) · tan(decl)`; `c <= −1` polar day (sunrise 0,
  sunset 24, 24 h); `c >= 1` polar night (null, null, 0 h); else `half = acos(c) / 15°` hours, sunrise
  `noon − half`, sunset `noon + half`. `isDaylight(ts) = sin φ sin δ + cos φ cos δ cos(15°(hour − noon)) > 0`.
  Defaults `DEFAULT_LATITUDE = 52`, `DEFAULT_SOLAR_NOON = 13.5`.
- Latitude source (`solarSource(assignments)`): the first `pv` assignment of the **frozen run case** gives
  `latitude`/`solar_noon_hour` (defaults when missing); label `Daylight from PV profile (lat 52°, solar noon
  13:30)` or `Daylight from default latitude 52° (no PV profile)` (used as tooltips).
- `fmtClockHour(h)`: wrap to the day, `HH:MM`. `clockLabels(ms)`: `time` `HH:MM` (24 h), `date`
  `Sun 5 Jul 2026` (weekday, day, month abbreviation, year), `hour` fractional.
- Timestep time: `timestepTime(summary, t) = toDate(timestamps_start) + t · resolution_minutes · 60 000`.
- `SnapshotClock` (`data-testid="snapshot-clock"`, `data-daylight="day|night"`, `pointer-events: none`,
  title = source label): a 112 px SVG dial: ring radius 36, width 9, night arc `var(--c-night)`, daylight arc
  from sunrise to sunset `var(--c-daylight)` (full ring for polar day), 24 tick lines in surface colour (1.5 px
  every 6 h, else 0.75), labels `00`, `06`, `12`, `18` at radius 36 + 4.5 + 7, midnight at the top, clockwise;
  a hand (fg, 2 px, round) to radius `36 − 4.5 − 4` and a centre dot r 3. Beside it: `HH:MM`
  (`data-testid="clock-time"`, mono, lg), the date (`data-testid="clock-date"`), a badge
  (`data-testid="clock-daylight"`) `Daylight` (warn tokens) or `Night` (surface-3), and
  `Sunrise 05:18 · sunset 21:54` (or `Sun up all day` / `No sunrise`). `compact` (diagram narrower than
  560 px, measured with a ResizeObserver) shows only the digital time. It sits in the diagram's bottom-right
  `corner` slot and updates on every frame and scrub.
- Acceptance: at lat 52 on 21 June with noon 13.5, sunrise ≈ 05:15 and sunset ≈ 21:45 (±15 min), matching
  `acos(−tan φ tan δ)/15` around 13.5; 21 December is shorter; a polar case returns all-day/no daylight; on the
  demo week step 8 (index 8 = 02:00) is `Night` and step 52 (13:00) is `Daylight`.

### 9.5 Daylight-shaded slider (`DaylightTrack.tsx`, `trackLayout`)

- The native range input stays (accessibility, keyboard). Under it, a 8 px strip (`bg-night`) inset by
  `THUMB_INSET_PX = 8` on both sides (half the 16 px thumb), so fraction 0 = first timestep and 1 = last.
- `trackLayout(startMs, stepMs, n, lat, noon)`: calendar days from the first to the last timestep;
  `mode = days > MAX_DAY_BANDS (31) ? 'months' : 'days'`.
  - days: per day a daylight segment from sunrise to sunset (`bg-daylight`, `data-daylight-segment`), a
    divider at each midnight after the start (1 px, surface colour), weekday labels (`Sun`..`Sat`).
  - months: dividers at month starts, month labels (`Jan`..`Dec`), and a seasonal shade per month with opacity
    `0.15 + 0.85 · (mean daylight hours / 24)`.
- Labels are drawn only when the per-day (per-month) width is at least `MIN_LABEL_PX = 28`
  (`data-testid="daylight-labels"`). Wrapper `data-testid="daylight-track"`, `data-mode`, title = source label.

### 9.6 Details and status on the snapshot

- The diagram gets `topology = fileTopology` (layout), `statusTopology = ` the run topology (frozen overrides
  applied), `changed` = elements with frozen overrides, `overlay`, `overlayKey = t`.
- Details panel uses `ElementDetails` on the run topology with edit markers, plus an extra box
  (`data-testid="snapshot-value"`): `Voltage at this timestep` `<u> pu` for nodes, `Loading at this timestep`
  `<x.x %>` for branches; an out-of-service branch shows `Out of service — no flow`, a non-energised node
  `Not energised`. Placeholder `Click a node or branch to inspect its value.`.

---

## 10. Charts

- `EChart` wrapper: `echarts.init(el, undefined, {renderer: 'canvas'})` once, ResizeObserver -> `resize()`,
  `setOption(option, {notMerge: true, lazyUpdate: true})` on change, `onEvents` map, `loading` ->
  `showLoading({text: '', color: '#2a78d6', maskColor: 'rgba(0,0,0,0)'})`, default height 320, disposed on
  unmount.
- `useChartTheme()`: reads the CSS tokens via `getComputedStyle(document.documentElement)` into
  `{dark, bg, surface, fg, fg2, muted, grid, axis, border, accent, good, warn, bad, series[8], voltUnder,
  voltMid, voltOver}` with light fallbacks; cached per `prefers-color-scheme` + `data-theme`; subscribes to
  the colour-scheme media query (`useSyncExternalStore`).
- `baseOption`: transparent background, series colours, text fg2 12 px Inter, 300 ms animation, tooltip on
  surface with border and `box-shadow: 0 4px 16px rgba(0,0,0,.12); border-radius: 8px;`, legend roundRect
  12×4. `timeAxis`: axis line axis colour, no ticks, muted labels with `hideOverlap`, no split lines.
  `valueAxis(extra)`: `scale: true`, no axis line/ticks, muted labels, grid split lines. `dataZoom`: an
  `inside` zoom (throttle 50) plus a 22 px `slider` at bottom 8 (filler accent at 0.12 / 0.18 dark), x axis
  only. There is no y-axis zoom.
- `TimeseriesChart({data, limits, height = 360, loading})`: one line per series (`showSymbol: false`,
  `connectNulls: false`, `sampling: 'lttb'`, width 1.6), scroll legend at the top, axis tooltip formatted by
  unit (loading as `x.x %`), y-axis name `<Field label> [<unit>]`, labels `%` for loading / 3 decimals for pu;
  grid `left 64, right 24, top 56, bottom 64`; dataZoom. The first series carries the limit `markLine`s
  (dashed, `theme.bad`, width 1, label `{b}` at `insideEndTop`, font 10, `silent`). Wrapper
  `data-testid="timeseries-chart"` with `data-y-min`/`data-y-max`.
- **Limit lines are always visible**: ECharts does not widen an auto-fit axis for markLines, so whenever there
  are limits set the y-axis `min`/`max` from
  ```
  axisRangeWithLimits(dataMin, dataMax, limits, padFrac = 0.05):
    vals = finite values of [dataMin, dataMax, ...limits]; none -> null (keep auto)
    lo, hi = min, max; span = hi - lo
    pad = span > 0 ? span * padFrac : (|lo| * padFrac || padFrac)
    return {min: lo - pad, max: hi + pad}
  seriesExtent(series) -> {min, max} over finite values (nulls when none)
  ```
  Without limits the axis auto-fits (`scale: true`).
- Limit labels: `fmtLimitPu(v)` = 2 decimals if exact, else 3 (`0.90`, `1.10`, `0.955`); `fmtLimitPct(v)` =
  whole percent if exact else 1 decimal (`100%`, `82.5%`). `voltageLimitLines(limits)` ->
  `u_min 0.95`, `u_max 1.05`; `loadingLimitLines(limits)` -> `limit 100%`. Limits always come from the run's
  frozen case, never from the display scale.
- Charts using limits: Element time series (node u_pu, branch loading), the Violations focus modal, the
  Voltage envelope (its own range computation from `min`/`max`).

---

## 11. Design tokens and formatting

### 11.1 CSS custom properties (`src/index.css`)

`@import 'tailwindcss';` then tokens on `:root` (light). Dark values apply under
`@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) {...} }` and again under
`:root[data-theme='dark']`. `color-scheme` is `light` / `dark` accordingly.

| Token | Light | Dark |
|-------|-------|------|
| `--c-bg` | `#f6f6f4` | `#0f0f0e` |
| `--c-surface` | `#ffffff` | `#1a1a19` |
| `--c-surface-2` | `#f9f9f7` | `#201f1e` |
| `--c-surface-3` | `#f0efec` | `#2a2a28` |
| `--c-border` | `#e3e2dc` | `#2f2f2c` |
| `--c-border-strong` | `#c9c8c0` | `#45443f` |
| `--c-fg` | `#111110` | `#f0efec` |
| `--c-fg-2` | `#52514e` | `#c3c2b7` |
| `--c-fg-muted` | `#898781` | `#8f8d86` |
| `--c-accent` | `#2a78d6` | `#3987e5` |
| `--c-accent-hover` | `#256abf` | `#5598e7` |
| `--c-accent-fg` | `#ffffff` | `#ffffff` |
| `--c-accent-soft` | `#e6f0fc` | `#17283d` |
| `--c-good` | `#0a7d0a` | `#2fbf2f` |
| `--c-good-soft` | `#e5f4e5` | `#15291a` |
| `--c-warn` | `#a86a00` | `#f0b13a` |
| `--c-warn-soft` | `#fdf3dc` | `#30260f` |
| `--c-warn-border` | `#e9c47c` | `#6e5320` |
| `--c-bad` | `#c43030` | `#ef6b6b` |
| `--c-bad-soft` | `#fbe9e9` | `#3a1818` |
| `--c-info-soft` | `#eaeefc` | `#1c2133` |
| `--c-ring` | `rgba(42, 120, 214, 0.35)` | `rgba(57, 135, 229, 0.45)` |
| `--c-shadow` | `rgba(17, 17, 16, 0.06)` | `rgba(0, 0, 0, 0.4)` |
| `--c-chart-grid` | `#e8e7e1` | `#2c2c2a` |
| `--c-chart-axis` | `#c3c2b7` | `#45443f` |
| `--c-series-1` | `#2a78d6` | `#3987e5` |
| `--c-series-2` | `#eb6834` | `#d95926` |
| `--c-series-3` | `#1baf7a` | `#199e70` |
| `--c-series-4` | `#eda100` | `#c98500` |
| `--c-series-5` | `#e87ba4` | `#d55181` |
| `--c-series-6` | `#008300` | `#008300` |
| `--c-series-7` | `#6250d6` | `#9085e9` |
| `--c-series-8` | `#e34948` | `#e66767` |
| `--c-volt-under` | `#2a78d6` | `#3987e5` |
| `--c-volt-mid` | `#d6d5cf` | `#5a5954` |
| `--c-volt-over` | `#d03b3b` | `#e66767` |
| `--c-daylight` | `#f2c35b` | `#b98220` |
| `--c-night` | `#bdbcb4` | `#3d3d39` |

`@theme inline` maps them to Tailwind colours (`--color-bg`, `--color-surface`, `--color-surface-2/3`,
`--color-border(-strong)`, `--color-fg(-2)`, `--color-fg-muted`, `--color-accent(-hover/-fg/-soft)`,
`--color-good(-soft)`, `--color-warn(-soft/-border)`, `--color-bad(-soft)`, `--color-info-soft`,
`--color-ring`, `--color-daylight`, `--color-night`) so utilities like `bg-surface`, `text-fg-muted`,
`border-warn-border`, `bg-daylight` work. Fonts: `--font-sans: 'Inter', system-ui, -apple-system, 'Segoe UI',
sans-serif`, `--font-mono: ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace`.

Base: `html, body, #root {height: 100%}`; body background `--c-bg`, colour `--c-fg`, 14 px, line-height 1.45,
antialiased. `.tabular {font-variant-numeric: tabular-nums}`. `::selection` accent-soft. Keyframes
`toast-in` (fade + 8 px rise), `progress-stripes` (background-position 0 -> 24px), `row-flash` (0-35 %
`color-mix(in srgb, var(--c-accent) 35%, transparent)`, 100 % accent-soft), `.row-flash {animation: row-flash 1s
ease-out 1}` disabled under `prefers-reduced-motion: reduce`.

Amber "changed" cues use warn tokens: `--c-warn` text/rings, `--c-warn-soft` backgrounds, `--c-warn-border`
borders. The chart theme's light fallback values equal the light tokens. The neutral voltage colour is
theme-dependent (light grey vs dark grey), which is why the voltage tests compare against the token they read.

### 11.2 Number, unit and time formatting (`lib/format.ts`, `lib/time.ts`)

- Any non-finite or missing value renders as `—` (`DASH`).
- `fmtPu(v, d = 3)` = `v.toFixed(3)`; `fmtPct(v, d = 1)` = `(v * 100).toFixed(1) + ' %'` (e.g. `83.0 %`);
  `fmtNum(v, d = 2)` locale with max `d` fraction digits; `fmtInt` rounded locale.
- `fmtMwh`: `>= 1000` -> `<x/1000, max 2 dp> GWh`; else `MWh` with max 3 dp below 10, else 1 dp.
- `fmtPowerW`: `|v| >= 1e6` -> `MW` (max 3 dp), `>= 1e3` -> `kW` (max 2 dp), else `W` (max 1 dp);
  `fmtVar` = same with `var`; VA likewise; `fmtKv(V)` -> `<V/1000, max 3 dp> kV`.
- `fmtUnit(v, unit)`: pu -> fmtPu; W -> fmtPowerW; var; VA; V -> kV; A -> `<1 dp> A`; rad -> degrees with 2 dp
  and `°`; `-`/empty -> 3 dp; else `<3 dp> <unit>`.
- `fmtDuration(s)`: `< 1` -> `<ms> ms`; `< 60` -> `<1 dp> s`; `< 60 min` -> `<m> m <s> s`; else `<h> h <m> m`.
- `fmtDateTime` (`Intl.DateTimeFormat` with year numeric, month short, day numeric, hour/minute 2-digit, user
  locale), `fmtDate`; `fmtRelative`: `just now` (< 60 s), `<n> min ago`, `<n> h ago`, `<n> d ago` (< 7 d), then
  the date; future times absolute.
- `toDate(ts)`: strings with `Z` or an offset are parsed natively; naive strings as local time
  (`parseNaive`, regex `YYYY-MM-DD[T ]HH:MM[:SS[.fff]]`). `toNaive(Date)` -> `YYYY-MM-DDTHH:MM:SS`.
- `FIELD_LABELS`: `u_pu`/`u` Voltage, `u_angle` Voltage angle, `p` Active power, `q` Reactive power,
  `i` Current, `loading` Loading, `p_from` `P (from side)`, `q_from` `Q (from side)`, `i_from`
  `I (from side)`, `p_to` `P (to side)`, `q_to` `Q (to side)`, `i_to` `I (to side)`, `s_from` `S (from side)`.
  `humanize(s)`: `_` -> space, capitalise.
- Equipment values (`overrides.ts`): `toDisplay(si) = clean(si * scale)`, `fromDisplay(d) = clean(d / scale)`
  with `clean(v) = Number(v.toPrecision(12))`; `formatValue(si, f)`: null -> `—`; bool -> `in service` /
  `out of service`; int -> rounded; else 6 significant digits, plus ` <unit>`.
- Time helpers: `MAX_TIMESTEPS = 100_000`, `RESOLUTION_PRESETS = [5, 15, 30, 60]`, duration presets
  `1d` (+1 day), `1w` (+7 days), `1m` (+1 calendar month), `1y` (+1 year); `describeWindow` -> `<d> d` (>= 2
  days, 1 dp max), `<h> h` (>= 1 h), else `<m> min`; `formatResolution` -> `<h> h` for multiples of 60 else
  `<m> min`; `computeTimesteps` uses wall-clock minute differences (`Date.UTC` of the local fields).
- Utilities: `cn(...)` joins truthy class names; `useDebounced(value, 400)`; `stableStringify` (sorted keys);
  `randomId(prefix)`; `errorMessage(e)`.

---

## 12. Testing

### 12.1 What runs

- `make check` = backend `ruff check .`, `ruff format --check .`, `pytest -q` (59 tests in the reference build)
  + frontend `npm run lint` (ESLint), `npm run build` (`tsc -b` over app, config and e2e, then `vite build`),
  `npm run test` (Vitest, 95 tests). It must pass before any change is called done.
- `make e2e` = `cd frontend && npm run e2e` (Playwright, Chromium, 22 tests, roughly 1-2 min).

### 12.2 Playwright config (`frontend/playwright.config.ts`)

```ts
const API_PORT = 8100, WEB_PORT = 5180
// workers re-evaluate this file and inherit the env, so the workspace is created once
process.env.GRIDSIM_E2E_WORKSPACE ??= mkdtempSync(join(tmpdir(), 'gridsim-e2e-'))
export default defineConfig({
  testDir: './e2e', globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false, workers: 1, forbidOnly: !!process.env.CI, retries: process.env.CI ? 1 : 0,
  timeout: 45_000, expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: { baseURL: `http://127.0.0.1:${WEB_PORT}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    { command: `cd ../backend && GRIDSIM_WORKSPACE='${workspace}' uv run gridsim serve --port ${API_PORT}`,
      url: `http://127.0.0.1:${API_PORT}/api/health`, reuseExistingServer: false, timeout: 120_000, stdout: 'ignore', stderr: 'pipe' },
    { command: `npx vite --port ${WEB_PORT} --strictPort --host 127.0.0.1`, env: { GRIDSIM_API: `http://127.0.0.1:${API_PORT}` },
      url: `http://127.0.0.1:${WEB_PORT}`, reuseExistingServer: false, timeout: 120_000, stdout: 'ignore' },
  ],
})
```

`global-teardown.ts` removes `GRIDSIM_E2E_WORKSPACE` if its path contains `gridsim-e2e-`. The e2e run never
touches `make dev` (8000/5173) or `./workspace`. Tests run against the Vite dev server, so the dev-only hooks
`window.__gridsimCy` and `window.__gridsimEcharts` exist. Specs may set `GRIDSIM_SHOTS=<dir>` to save
light/dark screenshots (`page.emulateMedia({colorScheme})`). Helpers (`e2e/helpers.ts`):
`DEMO_CASE = 'Vision MV – summer week'`; `openEditorTab(page, name)` clicks the tab and waits for
`aria-selected="true"`; `newCase(page, name, network = 'sample/vision_mv')` goes to `/cases/new`, fills `Name`,
opens `Network` and selects the option value `sample/<key>` in the `Network` select. A common
`clickInDiagram(id)` zooms the Cytoscape instance to 2.5, centres the element and clicks its rendered position
with the real mouse. Most specs that run use a 1-day window starting `2026-07-01T00:00` (96 steps).

### 12.3 Acceptance tests per feature (write these; they mirror the reference suite)

Backend (pytest; every test gets an isolated workspace through an autouse fixture that sets
`GRIDSIM_WORKSPACE` and `set_workspace`; `make_case()` = vision_mv, 2026-07-01 for 1 day at 60 min,
residential on sym_load + pv on sym_gen):
- registry: register/get/all/keys/contains; the unknown-key message `Unknown thing 'zz'. Known: a`; duplicates
  and the decorator.
- networks: sample listing and counts, vision_mv names and topology facts, IEEE 14 default names and
  appliance types `{sym_load, sym_gen, shunt}`, shunt `b1` signs (126 > 0, 127 < 0, loads null), unknown
  network/source errors, upload round-trip (`my_grid.json` -> key `my-grid-xxxxxx`), invalid uploads
  (`{not json`, and `u_rated: -1` -> `Invalid network data`).
- engine: section 6.3 tests.
- profiles: section 6.10 tests.
- study: `find_episodes` and episode extremes (6.6), a 24-step end-to-end study (4 parquet files, 24 × 47 node
  rows, branch types, monotone progress ending > 0.9, KPI sanity: `0.9 < u_min <= u_max < 1.1`, losses
  between 0 and import, 47 nodes, 52 branches, node 3 named `KNP 11`, envelope ordering, heatmap peaks sorted
  descending), violations with tight limits `0.99/1.03/0.3`, validation errors (unknown generator,
  `not in network`, `magnitude_w`), the factor test.
- overrides: section 6.9 tests, plus the editable-fields endpoint (exact `p_specified` field JSON; link
  fields), topology `params` (load 104 `{p_specified: 1.5e6, q_specified: 1e6, status: 1.0}`; line 47 has
  `r1, x1, c1, i_n, from_status, to_status`; source params `{u_ref}`), the frozen case keeps the overrides, a
  run with an unknown override id is 422 mentioning `element not in network`, IEEE 14 JSON contains
  `"sn":null` and no `NaN`.
- API: health equals `{"status": "ok", "pgm_version": "1.13.209"}`; networks + upload + 400 on garbage;
  generators set and `seed` default 1 and `ev_charging` default mode `add`; preview (24 timestamps, 3 series,
  first timestamp `2026-07-01T00:00:00`, 400 bad params, 404 unknown generator, 422 `end must be after
  start`); CSV upload (96 rows at 15 min, column `load_a`, first value 0.5) used in a valid, runnable case and
  400 on a bad CSV; case CRUD (only the demo case initially with `last_run` null, `My Case!` -> `my-case`, then
  `my-case-2`, explicit duplicate -> 409, PUT updates, the demo validates to exactly
  `{"ok": true, "n_timesteps": 672, "issues": []}`, an unknown generator gives an error issue and a 422 run
  start with `issues` and `detail`, delete 204 then 404, more than 100 000 steps -> 422); run lifecycle
  (progress 1.0, 24 steps, duration set, `case_id` filter, `last_run` in the case list, cancel of a finished
  run returns `succeeded`, delete, unknown id 404); frozen case unaffected by later edits; cancel of a long
  run (until 2027-04-01 at 5 min) -> `cancelled`, summary 409, case delete removes the run; SSE event order
  (`progress` first, `done` last with the succeeded RunInfo; a finished run streams one progress + done; 404
  for unknown); results endpoints (section 5.7 shapes, 400/422 cases, heatmap 6 buckets × 52 branches,
  snapshot t=12 at `2026-07-01T12:00:00`, t=24 -> 400); OpenAPI completeness (operation ids, 2xx content);
  **`test_committed_openapi_is_current`**: `frontend/openapi.json` equals `json.loads(json.dumps(create_app().
  openapi()))` (message `frontend/openapi.json is stale: run \`make types\` and commit the result`); SPA
  fallback does not shadow `/api` (with a fake `dist`).
- CLI: `cases` lists the demo id; `run <file>` prints `Status: succeeded` and `energy_import_mwh` and writes
  one `summary.json`; `export-openapi` writes a spec containing `/api/cases`.

Frontend unit tests (Vitest, jsdom):
- `SchemaForm.test.tsx`: one control per property with titles; emits typed values; shows range errors.
- `lib/jsonSchema.test.ts`: property types, `$ref`, `Optional[]`; defaults; range and integer validation.
- `lib/time.test.ts`: `computeTimesteps` (end excluded, partial last interval rounds up, 0 for empty/inverted/
  invalid, ignores DST); datetime-local round trip; duration presets.
- `lib/solar.test.ts`: local day of year; 21 June lat 52 noon 13.5 (±15 min of 05:15/21:45, equal to the
  formula); 21 Dec shorter; polar day/night; `isDaylight` agrees with sunrise/sunset; `solarSource` from the
  first pv assignment else defaults.
- `lib/voltageScale.test.ts`: exactly neutral at 1.00 and 1.04; 0.93 partial blue; visible tint just outside
  the band; 0.88 full blue, 1.07 partial red, 1.12 full red; null -> axis; custom band; `validateScale`
  accepts defaults, rejects non-ascending, out-of-range and non-finite; `matchLimits`; persistence falls back
  on missing/garbage/invalid JSON, round-trips, and `useVoltageScale` stores valid and ignores invalid scales.
- `components/network/energised.test.ts`: radial isolation; ring stays energised; second source; either end
  status 0 = off and switched-off sources skipped.
- `components/network/overrides.test.ts`: set/replace/remove; status pair reverts and counts once; unit
  round trip without float noise (`1.5e6 W` -> `1.5 MW` -> back); parsing with validation; tab columns merge
  the status pair; `effectiveTopology` (edited P/Q with file values, equal-to-file not edited, appliance and
  branch out of service, source `u_ref` and branch params, unknown ids and mismatched components ignored);
  null file values (override kept, `fileValue` returns null).
- `components/network/selection.test.ts`: `tableRows` resolve node names; `matchesSearch`; `filtersToClear`
  (nothing, search, changed-only for unchanged vs changed, both, null without a row); `focusZoom`;
  `selectionEffects` per source and reveal; `scrollTopToShow` cases.
- `components/network/symbols.test.ts`: transformer SVG contains both colours; 3-winding three colours;
  capacitor for b1 > 0, reactor for b1 < 0; off variant uses the muted colour; × uses only the muted colour;
  valid data URIs (`data:image/svg+xml`); `symbolScale`; `quantisedAngle`.
- `results/limitLines.test.ts`: limits outside widen; inside keep data + padding; one-sided loading limit;
  limits alone with no data; null with neither; flat range padding; `seriesExtent`; labels
  (`u_min 0.90`, `0.955`, `limit 100%`, `82.5%`).
- `results/useRunContext.test.ts`: `runTopology` applies frozen overrides; returns the file topology without.
- `results/views/clock.test.ts`: time/date of a timestep index; a week gives 7 daylight bands, 7 weekday labels
  and day dividers; <= 31 days per-day, beyond months; a year has 12 months shaded more in summer; polar night
  has no bands.
- `results/views/playback.test.ts`: labels `1×..16×` and ms `600, 300, 150, 75, 37.5`; each step halves;
  prefetch grows with speed; `nextFrameDelay` subtracts elapsed time, never below 0.

End-to-end specs (`frontend/e2e/*.spec.ts`, 22 tests):

| Spec | Behaviour asserted |
|------|--------------------|
| `happy-path` | Cases list shows the demo case link; create `E2E feeder day` on vision_mv; Start `2026-07-01T00:00` + `1 day` + `15 min` gives End `2026-07-02T00:00`; add residential on all sym_load and pv on all sym_gen; Save -> URL `/cases/e2e-feeder-day` and `Saved`; Validate -> `data-ok="true"` and `96 timesteps`; Run -> `/runs/r-…` succeeded within 30 s; `/results` shows >= 8 KPI values each containing a digit; every result tab (>= 5) shows a canvas or table rows. |
| `validation` | End before start: inline `End must be after start`, banner button `End must be after start.`, Run disabled; Validate shows `data-ok="false"` with the server message and the badge stays `Not saved`. |
| `network` | Demo case Network tab: select value `sample/vision_mv`, diagram canvas visible, > 5 table rows. |
| `overrides` | `P of Load1` is `1.5`; set `3` + Enter: `data-changed`, cell `bg-warn-soft`, `was 1.5 MW`, `1 change`, tab badge `1`, diagram `data-changed-count="1"`; `Changed only` shows 1 row; save + run succeeds and the frozen case has exactly `[{component: 'sym_load', id: 104, field: 'p_specified', value: 3e6}]`; revert restores `1.5`, removes the cues, `0 changes`, `Unsaved changes`. |
| `click-to-row` (4) | Diagram click on `a104`: `data-selected="appliance:104"`, details filled, Appliances tab active, one selected row `Load1` with `bg-accent-soft`, no flash, row inside its table box, no note, page scroll unchanged (±2 px), diagram still in viewport. `Edit in table`: row scrolls into the viewport, P editable to `2`; clicking an input in another row keeps the selection; `Back to diagram` brings the diagram into view. Filters: with `Changed only` on, a diagram click leaves it on (0 rows, no note, no scroll); `Edit in table` unchecks it, shows `Filters cleared to show Load1`, row in view; `Dismiss note`. Table row click on a branch selects `b<id>`, centres it (< 5 px), and `Edit in table` from the Nodes tab returns to the Branches tab row. |
| `effective-values` | IEEE 14 `P of sym_gen 301` 40 -> 25; Profiles pv on sym_gen: `All sym_gen (4)`, `Selected elements` shows `25 MW` with an `edited` marker titled `File value: P 40 MW` (none on 302); details panel `P specified` `25 MW` with `File value: 40 MW` (no marker on Q); revert restores 40 MW everywhere. |
| `generic-branch` | IEEE 14 `Rated power of generic_branch 101` is empty with placeholder `—`; set 100: amber, `was not set`, tooltip `File value: not set`; uncheck `In service of generic_branch 102`: amber and its edge `line-style` dashed (101 solid); `2 changes`; run; Branch extremes row for 101 has a loading > 0 %; snapshot draws 102 dashed and 101 solid. |
| `playback` | Demo run, Network snapshot at 1280 px: `/ 672`; the 5 speed buttons are on one row; `2×` pressed by default; at `16×` play 2 s then pause: advanced >= 25 steps and the label equals `step <t+1> / 672`. |
| `out-of-service` | IEEE 14 branch between `node 1` and `node 2` switched off: edge dashed, colour = `--c-fg-muted`, width ≈ 1.5, label `off`; `data-out-of-service-count="1"`; legend `Out of service`; same on the snapshot with the loading overlay (another branch is solid and not muted); tapping it shows `Out of service — no flow`. |
| `clock` | Demo snapshot: clock at the bottom-right inside the diagram (< 16 px from both edges, right half, below the zoom controls); time matches the step; daylight track `data-mode="days"` with 7 segments, label `Wed`, title matching `PV profile (lat 52°`; step index 8 -> `step 9 / 672`, `02:00`, `Wed 1 Jul 2026`, `Night`; 52 -> `13:00`, `Daylight`, `Sunrise HH:MM · sunset HH:MM`; playback advances the clock in sync with the label. |
| `symbols` (2) | vision_mv: `.xfmr-symbol` count = transformer count, `trafo1`'s symbol within 0.5 px of its edge midpoint, `img` is an SVG data URI, legend has Transformer/Generator/External grid; at zoom 0.25 the symbol renders > 15 px wide; clicking the symbol selects `branch:<id>` and shows `Transformer`; switching it off sets `variant: 'off'` and keeps the `off` label; editing another transformer's `Tap position` gives the changed class and a border > 0; on the snapshot the transformer edge colour differs from the type colour (`--c-series-7`). IEEE 14: 4 `node.gen.sym`, 1 `node.source.sym`, 1 `node.shunt.sym` with `shunt = 'capacitor'`; legend Generator/External grid/Capacitor. |
| `wheel-zoom` (2) | Viewport 1280×600; editor hint contains `zoom with + / −`; a wheel of 300 px over the diagram scrolls the page (sum of window and ancestor `scrollTop`) and leaves `cy.zoom()` unchanged; `Zoom in` increases and `Zoom out` decreases the zoom. Same on the results snapshot. |
| `node-size` (2) | At zoom 1 a bus node is 8-10 px wide with a 1 px border; a `changed` node is 10-12 px; a real click 5 px off-centre (direction away from neighbours) selects the node at zoom 1 and 0.5; same size/ring/click on the snapshot; IEEE 14 node 8-10 px. (Known flake: the "clear selection" click at the diagram corner can hit an appliance.) |
| `voltage-scale` | Clear localStorage; IEEE 14 1-day run; at the shown step node 8 is in (1.08, 1.1); ticks `0.90 0.95 1.05 1.10`, `within band`; node 8 reddish, a ~1.01 node exactly neutral; set `Full red above` 1.15 then `Band to` 1.10: ticks update, node 8 neutral; `Band from` 1.12 -> error containing `ascending`, nothing changes; reload keeps the setting; `Match run limits` -> `0.90 0.95 1.05 1.10`; `Reset to defaults` restores and stores `[0.9,0.95,1.05,1.1]`; Escape closes. |
| `limit-lines` | Limits 0.9/1.1 saved; Violations -> Node extremes -> first row: the focus chart's y range is below 0.9 and above 1.1, `data-y-min` matches the ECharts option, markLine labels include `u_min 0.90` and `u_max 1.10`, both limits lie strictly inside the plotted pixel range; the same for the voltage envelope. |
| `neutral-vs-islanded` | Pick the in-service branch whose removal islands the fewest nodes (preferring a transformer) using `energisedNodes`; switch it off: the islanded node has `border-style: dashed`, background opacity 0, an SVG background image, italic muted label; `data-not-energised-count` matches; legend icon dashed. On the snapshot the islanded node keeps that style while a within-band energised node has `background-color = --c-volt-mid`, opacity 1, solid border, normal font and no image; legend `Not energised`; the legend band colour equals `--c-volt-mid`. |

### 12.4 Contract drift guards

- `frontend/openapi.json` is committed and regenerated by `make types`; the backend test above fails while it
  is stale.
- `frontend/src/api/contract.check.ts` is compiled by `tsc -b` (never imported at runtime). It asserts at type
  level that each hand-written type in `schema.ts` is mutually assignable with the generated
  `components['schemas'][...]` after loosening:

```ts
import type { components } from './openapi'
import type * as S from './schema'
type G = components['schemas']
type KnownKeys<T> = keyof { [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K] }
type Loose<T> = T extends readonly (infer U)[] ? Loose<U>[]
  : T extends object ? ([KnownKeys<T>] extends [never] ? Record<string, unknown> : { [K in KnownKeys<T>]-?: Loose<NonNullable<T[K]>> })
  : NonNullable<T>
type Compatible<A, B> = [Loose<A>] extends [Loose<B>]
  ? [Loose<B>] extends [Loose<A>] ? true : { error: 'generated type is not assignable to hand-written type'; got: Loose<B> }
  : { error: 'hand-written type is not assignable to generated type'; got: Loose<A> }
type Expect<T extends true> = T
type GeneratorInfo = Omit<S.ProfileGeneratorInfo, 'params_schema'> & { params_schema: Record<string, unknown> }
export type ContractChecks = [
  Expect<Compatible<S.Health, G['Health']>>, Expect<Compatible<S.NetworkItem, G['NetworkItem']>>,
  Expect<Compatible<S.NetworkTopology, G['NetworkTopology']>>, Expect<Compatible<S.EditableField, G['EditableField']>>,
  Expect<Compatible<S.NetworkOverride, G['NetworkOverride']>>, Expect<Compatible<GeneratorInfo, G['ProfileGeneratorInfo']>>,
  Expect<Compatible<S.ProfilePreviewRequest, G['ProfilePreviewRequest']>>, Expect<Compatible<S.ProfilePreviewResponse, G['ProfilePreviewResponse']>>,
  Expect<Compatible<S.ProfileUploadResponse, G['ProfileUploadInfo']>>, Expect<Compatible<S.CaseStudy, G['CaseStudy']>>,
  Expect<Compatible<S.CaseSummary, G['CaseSummary']>>, Expect<Compatible<S.ValidationResult, G['ValidationResult']>>,
  Expect<Compatible<S.RunInfo, G['RunInfo']>>, Expect<Compatible<S.ResultSummary, G['ResultSummary']>>,
  Expect<Compatible<S.TimeseriesResponse, G['TimeseriesResponse']>>, Expect<Compatible<S.EnvelopeResponse, G['EnvelopeResponse']>>,
  Expect<Compatible<S.HeatmapResponse, G['HeatmapResponse']>>, Expect<Compatible<S.SnapshotResponse, G['SnapshotResponse']>>,
]
```

  Optionality and nullability are deliberately ignored (the backend fills defaults); index signatures next to
  known keys are ignored; free-form objects compare as `Record<string, unknown>`. Note `HeatmapResponse.
  aggregation` must be the literal `'max'` on both sides.

---

## 13. CI (`.github/workflows/ci.yml`)

```yaml
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
permissions:
  contents: read
jobs:
  check-and-e2e:
    name: make check + make e2e
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      UV_PYTHON: "3.12"
    steps:
      - uses: actions/checkout@v7
      - uses: astral-sh/setup-uv@v10
        with:
          enable-cache: true
          cache-dependency-glob: backend/uv.lock
          python-version: "3.12"
      - uses: actions/setup-node@v7
        with:
          node-version-file: frontend/.nvmrc
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - name: Install dependencies
        run: make ci-install
      - name: make check
        run: make check
      - name: Install Playwright Chromium
        working-directory: frontend
        run: npx playwright install --with-deps chromium
      - name: make e2e
        run: make e2e
      - name: Upload Playwright report
        if: failure()
        uses: actions/upload-artifact@v7
        with:
          name: playwright-report
          path: |
            frontend/playwright-report/
            frontend/test-results/
          retention-days: 7
          if-no-files-found: ignore
```

No secrets and no `pull_request_target`. `make ci-install` installs exactly from the lockfiles
(`uv sync --frozen`, `npm ci`). Node comes from `frontend/.nvmrc` (one source of truth with local
development). Reproduce locally with `make check && make e2e` (add `CI=1` for CI's retries and HTML report);
nothing may depend on the local machine (absolute paths, `./workspace`, a running dev server). README gets a
short `CI` section saying this.

---

## 14. Agentic build workflow and recommended build order

Build GridSim the way it was built: an **orchestrator** session plans and verifies; **sub-agents** implement.
Sessions can stop at any moment (usage limits, resets, context compaction), so all state that matters lives on
disk and in git, never only in an agent's context. Keep this workflow in `docs/agentic-workflow.md` and a
summary in `CLAUDE.md`.

### 14.1 Durable state

| What | Where | Written by |
|------|-------|------------|
| Task ledger (plan, status, log) | `.agent/LEDGER.md` | orchestrator only |
| Task briefs (full prompts) | `.agent/briefs/<task-id>.md` | orchestrator |
| Progress journals | `.agent/progress/<task-id>.md` | the sub-agent doing the task |
| Checkpoints | git commits `checkpoint(<task-id>): <summary>` | orchestrator only |
| Contracts | `docs/api-contract.md`, `docs/architecture.md` | orchestrator |

Ledger table columns: `| id | task | status | deps | owns | done check |`, statuses `todo`, `in_progress`,
`done`; a `## Log` section with one dated line per event (started, done with test counts, issues raised).

### 14.2 Rules

1. **Brief in a file before the agent starts.** Re-spawning an interrupted agent = "run
   `.agent/briefs/<id>.md`, continue from `.agent/progress/<id>.md`".
2. **Every task has an executable done check** (usually `make check && make e2e`). Done means the check
   passes, not that the agent said so. The orchestrator re-runs it itself before checkpointing.
3. **Journal after every sub-step**: checklist, verification status, decisions/deviations, and a precise
   `Next step:` line, so an interruption costs at most one sub-step.
4. **Tasks are idempotent and file-disjoint.** Parallel tasks own separate directories; shared files
   (contracts, ledger, CLAUDE.md) are orchestrator-only. Tasks touching the same files are serialised
   (queued until the previous one is committed).
5. **Only the orchestrator commits**, after the done check passes (plus `wip(<id>): <state>` checkpoints before
   long waits). While any sub-agent is running, stage explicit paths only: **never `git commit -a` or
   `git add -A`**, which would sweep an agent's in-progress edits into another commit.
6. **Bounded tasks**: each fits one agent run; split bigger ones. At most 2 sub-agents in parallel.
7. **Lean orchestrator context**: agents return short reports; details go into their journals.
8. **All implementation runs in background sub-agents, even small changes**; the main session stays available
   to the user.
9. **Go-ahead gate**: before sending a task to build, give the user a 1–2 paragraph brief (what changes and
   why, approach and trade-offs, files touched, how it is verified) and wait for an explicit go-ahead. Each
   task needs its own approval. Ideas that are not approved become GitHub issues labelled `deferred`.
10. Briefs tell sub-agents: read `CLAUDE.md` first; do not git commit; keep the journal; ports 8000/5173 may be
    in use by the user's `make dev`, so use 8200/5190 for manual servers and stop what you start; report
    concisely (what changed, test results, screenshot paths, deviations, whether `make dev` needs a restart).
    Visual tasks require light and dark screenshots saved to a scratch directory.

### 14.3 Session-start hook and resume protocol

`.claude/settings.json`:

```json
{"hooks": {"SessionStart": [{"hooks": [{"type": "command",
  "command": "f=\"$CLAUDE_PROJECT_DIR/.agent/LEDGER.md\"; if [ -f \"$f\" ] && grep -qE '\\| (in_progress|todo) \\|' \"$f\"; then echo 'Unfinished agentic build tasks found (run /resume-build to continue):'; cat \"$f\"; fi"}]}]}}
```

Skill `.claude/skills/resume-build/SKILL.md` (`/resume-build`):
1. Load state: `cat .agent/LEDGER.md`, `git log --oneline -15 && git status --short`,
   `ls .agent/progress/ .agent/briefs/`.
2. Make sure no sub-agent is still running (wait for notifications instead of re-spawning; two agents on one
   task clobber each other).
3. For each `in_progress` task: run its done check; if it passes, mark it `done`, add a log line and commit
   `checkpoint(<id>): …` (explicit paths); if not, re-spawn a background sub-agent: "Your task brief is in
   `.agent/briefs/<id>.md`. Read it fully. Your previous run was interrupted. Read `.agent/progress/<id>.md` and
   continue from its `Next step`. Do not redo checked items. Keep updating the progress file."
4. Start ready `todo` tasks (all deps done), at most 2 at a time and only if file-disjoint; write the brief
   first.
5. After each completion verify with the done check yourself, update the ledger, checkpoint.
6. If usage runs low: make the ledger and journals current and commit a `wip(<id>)` checkpoint.

Skill `.claude/skills/add-result-view/SKILL.md`: (1) check whether `summary`, `timeseries`, `envelope`,
`heatmap` or `snapshot` already give the data (prefer client-side shaping unless the payload would exceed
~5 MB); (2) optionally add a backend endpoint: query in `results/query.py` via the cached loaders, a Pydantic
response model, a route with `response_model`, contract docs, an API test, `make types`; (3) create
`frontend/src/results/views/<Name>View.tsx` taking `ResultViewProps`, fetching through a hook in
`api/hooks.ts`, handling loading/empty/error, using the shared chart wrapper (reference:
`VoltageEnvelopeView`), and register one entry `{id, title, description, component}`; add a Vitest test for
non-trivial shaping; (4) verify with `make check`, `make e2e` and a light/dark look in the browser. Also keep
`frontend/src/results/views/README.md` describing this contract.

`CLAUDE.md` content: one paragraph on what GridSim is (deterministic, no LLM at runtime), pointers to the two
docs, the layout, the commands (section 3), and the rules: add features at extension points; an API shape
change means updating the Pydantic model, the contract doc, `make types` and the frontend in the same change;
never loop over timesteps in Python; use `uv run` and `npm`; the workflow summary (sub-agents, go-ahead gate,
ledger, briefs/journals, orchestrator-only checkpoints, `/resume-build`).

### 14.4 Recommended build order

Each task's done check is `make check && make e2e` unless stated; checkpoint after each.

**Milestone 1: proof of concept**

| id | Task | Done check |
|----|------|-----------|
| M1.0 | Contracts and repo skeleton: `docs/architecture.md`, `docs/api-contract.md` (section 5), `docs/agentic-workflow.md`, `.agent/` ledger, `.gitignore`, sample networks + attribution README | files exist |
| M1.1 | Backend (`backend/` only): models, registry, workspace + demo seed, network sources, profile generators, study type, engine, results writer/summary/queries, runner, API with SSE and SPA mount, CLI, all backend tests of 12.3 (except overrides) | `cd backend && uv run pytest -q && uv run ruff check . && uv run ruff format --check .`; a 1-year 15-min vision_mv run well under a minute |
| M1.2 | Frontend (`frontend/` only, in parallel with M1.1): tokens, UI kit, API layer, shell + health, cases list, case editor (overview, network picker/upload/diagram/details/table, time & calculation, profiles with schema form, preview, CSV), run page (SSE + polling), runs list, results panel + the five views + README | `cd frontend && npm run build && npm run lint && npm run test` |
| M1.3 | Extension scaffolding: `CLAUDE.md`, `add-result-view` skill, Makefile | `make check` |
| M1.4 | Integration: frozen-case endpoint used by result views; `make types`, committed `openapi.json`, `contract.check.ts`, `test_committed_openapi_is_current`; Playwright config and the `happy-path`, `validation`, `network` specs; `launch.json` | `make check && make e2e` |

**Milestone 2: equipment editing and selection**

| id | Task |
|----|------|
| M2.1 | Profile scale `factor` (model 0..100, `build_update`, UI field, preview applies it client-side, backend test) |
| M2.2 | Per-case overrides: editable-fields registry + endpoint, topology `params`, `network_overrides`, check/apply, study applies them first; in-cell editing, amber cues, revert, `N changes`, `Changed only`, `Revert all`, diagram changed marker, network-switch confirm; `overrides.spec` |
| M2.3 | Click-to-row and quiet diagram selection: `selection.ts`, `useNetworkSelection`, table handles `select`/`reveal`, `Edit in table`, flash, filter note, `Back to diagram`, row click centring, `window.__gridsimCy`; `click-to-row.spec` (4 tests, final behaviour of section 7.5) |
| M2.4 | Effective values everywhere: `effectiveTopology`, profile target hints, details markers; `effective-values.spec` |
| M2.5 | Generic branches editable (`sn`, `r1`, `x1`, status), null params end-to-end ("not set"), results snapshot uses the frozen overrides (`runTopology`); `generic-branch.spec` |

**Milestone 3: diagram and snapshot polish**

| id | Task |
|----|------|
| M3.1 | Snapshot playback speeds 1×–16×, prefetch, never-skip timing; `playback.spec` |
| M3.2 | Out-of-service and not-energised cues (`energisedNodes`, styles, `off` marker, status legend, details text); `out-of-service.spec` |
| M3.3 | Voltage tokens `--c-volt-under/mid/over` (under blue, over red) |
| M3.4 | 24 h clock and daylight-shaded slider (`solar.ts`, `clock.ts`, `SnapshotClock`, `DaylightTrack`, diagram `corner` slot); `clock.spec` |
| M3.5 | IEC symbols (+ shunt `b1` in the topology backend model, `make types`); `symbols.spec` |
| M3.6 | Disable wheel zoom (+/− and fit stay; hint text); `wheel-zoom.spec` |
| M3.7 | 9 px bus nodes, size constants, nearest-node hit fallback; `node-size.spec` |
| M3.8 | Four-point voltage colour scale (localStorage, legend, popover); `voltage-scale.spec` |
| M3.9 | Limit lines always visible (`limitLines.ts`, labels with values); `limit-lines.spec` |
| M3.10 | Neutral fill `#d6d5cf` / `#5a5954` vs dashed-× not-energised nodes; `neutral-vs-islanded.spec` |

**Milestone 4: delivery**

| id | Task | Done check |
|----|------|-----------|
| M4.1 | GitHub Actions CI (section 13), `make ci-install`, `.nvmrc`, Playwright CI settings, README CI section | `CI=1 make check && CI=1 make e2e` locally, then the first CI run on the PR is green |
| M4.2 | Final review: cross-check that every route, result view, editable field and e2e spec of this document exists | checklist complete |

When building directly to the final state, implement the end behaviour described in sections 4–13 at each
step (for example, M2.3 implements quiet diagram selection from the start).

---

## 15. Known pitfalls and decisions

- **IEEE 14 has no branch ratings.** Its 20 `generic_branch` elements have no `sn`, so PGM reports
  `loading = 0` for all of them while the flows are real (the first branch carries ~158 MVA). This is the
  standard IEEE 14 data. The app lets a case override `sn` (topology `params.sn` is `null`, shown as "not set");
  showing unrated loading as "no value" is deferred (issue #1).
- **Generic branches** are fully editable (`sn` MVA, `r1`, `x1` Ω, in service) even though the file values may
  be NaN; validation accepts overriding a null file value.
- **Voltage regulators** (`voltage_regulator`, 4 on IEEE 14) are controls attached to an appliance
  (`regulated_object`), not branches; they have no from/to nodes and are not in the topology. They are used in
  every run (node 8 sits at 1.09 pu). Showing/editing them is deferred (issue #2).
- **PV in scale mode on loads multiplies demand** (load = base × other profiles × pv(t)): demand is zero at
  night. For rooftop PV use `add` mode with a negative magnitude. The demo case uses PV on `sym_gen`; a
  warning is deferred (issue #5).
- **De-energised nodes** report `u = 0` in PGM; the summary ignores `u <= 0`, and the frontend decides "not
  energised" from the topology BFS, not from the values.
- **PGM 1.13 with `continue_on_batch_error=True` does not raise**: read `model.batch_error.failed_scenarios`
  (chunk-relative) and overwrite those outputs with NaN.
- `json_deserialize` drops extra fields like `Name`; parse names separately from the raw JSON.
- **Cytoscape ignores `overlay-padding` for hit testing**, so small nodes need the nearest-node tap fallback
  (7 rendered px) for a ~14 px click target.
- **Wheel zoom swallowed the page scroll** in the diagrams; keep `userZoomingEnabled: false` and zoom with the
  buttons.
- **The `<main>` element is the scroll container** (the shell is `h-full` flex). Page-scroll tests must sum
  `window.scrollY` and the ancestors' `scrollTop`; quiet selection must never call `scrollIntoView` (it scrolls
  `<main>`), only set the table container's `scrollTop`.
- **The neutral voltage colour is theme-dependent** (`#d6d5cf` light, `#5a5954` dark); it must be clearly
  filled so it is never confused with the hollow not-energised style, and result-coloured nodes use the fg2 ring.
  Tests read the token instead of hard-coding it.
- **Network switch clears overrides** (they refer to element ids of the old network); confirm first.
- **The diagram and the table use the file topology**, the details panel and statuses the effective one; a
  re-layout on every edit would move the diagram.
- **`npm ci` vs `npm install`**: CI uses `make ci-install` (`uv sync --frozen`, `npm ci`) so builds match the
  lockfiles; `make install` stays for local use.
- **Never `git commit -a` / `git add -A` while agents are running**: it once swept a task's WIP into another
  commit; stage explicit paths.
- TypeScript is pinned to 5.9 because `openapi-typescript` 7 has a peer range of `^5`.
- Do not run Prettier on the frontend (no config; it would reformat quotes).
- Request-validation 422s are flattened to a string `detail` plus `errors`; the editor shows a 422 from Save in
  the validation panel rather than only a toast.
- Known e2e flake: in `node-size.spec`, the "clear selection" click at the diagram's top-left corner can land
  on an appliance glyph (CI retries once).
- **Sample-network attribution**: `vision_mv.json` and `ieee14.json` come from the power-grid-model
  validation test data (`tests/data/power_flow/...`), licensed MPL-2.0; ship
  `backend/src/gridsim/samples/networks/README.md` with `SPDX-FileCopyrightText: Contributors to the Power Grid
  Model project <powergridmodel@lfenergy.org>` and `SPDX-License-Identifier: MPL-2.0`, and note that extra
  fields such as `Name` and `id_reference` are ignored by `json_deserialize` while GridSim reads `Name` for
  display.

---

## 16. Deferred backlog (not part of the rebuild unless asked)

These are open GitHub issues labelled `deferred`. Do not implement them in the rebuild.

1. **#1 Unrated branches show 0 % loading (IEEE 14 has no branch ratings).** Proposed fix: mark branches
   without a rating (missing/zero `sn` on generic branches, missing `i_n` on lines) as unrated with `null`
   loading, excluded from loading violations and `loading_max`; a validation warning "N branches have no
   rating, so loading can't be calculated for them"; the Max loading tile counts rated branches and notes
   "N of M branches unrated"; heatmap/time series show "no value"; a "Set rating for all unrated branches" bulk
   action as normal overrides. Tests: null loading, the warning, `sn = 100 MVA` gives flow/100 MVA, a browser
   test.
2. **#2 Show and edit voltage regulators.** Add a `regulators` list to `NetworkTopology` (id, name,
   `regulated_object`, its type and node, `u_ref`, in service); add `voltage_regulator` to `EDITABLE_FIELDS`
   (`u_ref` pu, `status`); a "Regulators" table tab with editing and a link to the regulated object; a "V" badge
   on the regulated generator and "Voltage regulated to X pu" in its details. Tests: 4 regulators on IEEE 14;
   `u_ref` 1.05 on 404 moves node 8 to 1.05 pu; switching it off releases node 8. (OLTC/transformer tap
   regulators are a larger follow-up.)
3. **#3 Zoomable timeline for the snapshot slider on long runs.** A window picker (day/week/month/whole run),
   an overview strip, previous/next timestep and day buttons, "jump to worst" (from `t_u_min`,
   `t_loading_max`), daylight bands inside week/month windows. Tests for the index mapping and a 1-year hourly
   browser test.
4. **#4 Snapshot clock polish.** Use 24-hour time in the toolbar label and other result timestamps (today it
   shows e.g. `Jul 1, 2026, 01:00 PM` in en-US); the ~290×125 px clock card can hide nodes at the bottom-right:
   make it smaller/translucent, collapsible, or fit the diagram above the legend/clock bar.
5. **#5 Warn when a generation profile (PV) is applied to loads in scale mode.** Add a generator `kind`
   (`demand` | `generation` | `neutral`: pv generation; residential, commercial, ev demand; constant, csv
   neutral); a validation warning for generation + `sym_load` + `scale`: "Solar PV in scale mode multiplies
   load demand by the PV curve. For rooftop PV use Add with a negative magnitude."; an inline hint with a
   one-click "Switch to Add (−X W)"; optionally default PV on loads to add mode.

---

## Appendix A. Bundled files (verbatim)

Create these files byte-for-byte; tests depend on their contents.

### A.1 `backend/src/gridsim/samples/networks/README.md`

```markdown
# Sample networks

These PGM JSON input files (serialization format version 1.0) are copied from the validation
test data of the [power-grid-model](https://github.com/PowerGridModel/power-grid-model)
repository (`tests/data/power_flow/...`):

| File             | Origin in the PGM repository                                   |
|------------------|----------------------------------------------------------------|
| `vision_mv.json` | Vision MV validation case (PGM repo `tests/data/power_flow/vision-validation-network/input.json`) |
| `ieee14.json`    | IEEE 14-bus validation case (PGM repo `tests/data/power_flow/ieee14/input.json`) |

SPDX-FileCopyrightText: Contributors to the Power Grid Model project <powergridmodel@lfenergy.org>

SPDX-License-Identifier: MPL-2.0

Extra fields such as `Name` and `id_reference` (in `vision_mv.json`) are ignored by
`power_grid_model.utils.json_deserialize`; GridSim reads `Name` separately for display.
```

### A.2 `frontend/public/favicon.svg`

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#2a78d6"/><path d="M18 4 9 18h6l-2 10 10-15h-6z" fill="#fff"/></svg>

```

### A.3 `backend/src/gridsim/samples/networks/ieee14.json` (PGM validation data, MPL-2.0)

```json
{
  "version": "1.0",
  "type": "input",
  "is_batch": false,
  "attributes": {},
  "data": {
    "node": [
      {"id": 1, "u_rated": 100000.0},
      {"id": 2, "u_rated": 100000.0},
      {"id": 3, "u_rated": 100000.0},
      {"id": 4, "u_rated": 100000.0},
      {"id": 5, "u_rated": 100000.0},
      {"id": 6, "u_rated": 100000.0},
      {"id": 7, "u_rated": 100000.0},
      {"id": 8, "u_rated": 100000.0},
      {"id": 9, "u_rated": 100000.0},
      {"id": 10, "u_rated": 100000.0},
      {"id": 11, "u_rated": 100000.0},
      {"id": 12, "u_rated": 100000.0},
      {"id": 13, "u_rated": 100000.0},
      {"id": 14, "u_rated": 100000.0}
    ],
    "generic_branch": [
      {"id": 101, "from_node": 1, "to_node": 2, "from_status": 1, "to_status": 1, "r1": 1.938, "x1": 5.917, "g1": 0.0, "b1": 0.000528, "k": 1.0, "theta": 0.0},
      {"id": 102, "from_node": 1, "to_node": 5, "from_status": 1, "to_status": 1, "r1": 5.403, "x1": 22.304, "g1": 0.0, "b1": 0.000492, "k": 1.0, "theta": 0.0},
      {"id": 103, "from_node": 2, "to_node": 3, "from_status": 1, "to_status": 1, "r1": 4.699, "x1": 19.797, "g1": 0.0, "b1": 0.000438, "k": 1.0, "theta": 0.0},
      {"id": 104, "from_node": 2, "to_node": 4, "from_status": 1, "to_status": 1, "r1": 5.811, "x1": 17.632, "g1": 0.0, "b1": 0.00034, "k": 1.0, "theta": 0.0},
      {"id": 105, "from_node": 2, "to_node": 5, "from_status": 1, "to_status": 1, "r1": 5.695, "x1": 17.388, "g1": 0.0, "b1": 0.000346, "k": 1.0, "theta": 0.0},
      {"id": 106, "from_node": 3, "to_node": 4, "from_status": 1, "to_status": 1, "r1": 6.701, "x1": 17.103, "g1": 0.0, "b1": 0.000128, "k": 1.0, "theta": 0.0},
      {"id": 107, "from_node": 4, "to_node": 5, "from_status": 1, "to_status": 1, "r1": 1.335, "x1": 4.211, "g1": 0.0, "b1": 0.0, "k": 1.0, "theta": 0.0},
      {"id": 108, "from_node": 4, "to_node": 7, "from_status": 1, "to_status": 1, "r1": 0.0, "x1": 20.912, "g1": 0.0, "b1": 0.0, "k": 0.978, "theta": 0.0},
      {"id": 109, "from_node": 4, "to_node": 9, "from_status": 1, "to_status": 1, "r1": 0.0, "x1": 55.618, "g1": 0.0, "b1": 0.0, "k": 0.969, "theta": 0.0},
      {"id": 110, "from_node": 5, "to_node": 6, "from_status": 1, "to_status": 1, "r1": 0.0, "x1": 25.202, "g1": 0.0, "b1": 0.0, "k": 0.932, "theta": 0.0},
      {"id": 111, "from_node": 6, "to_node": 11, "from_status": 1, "to_status": 1, "r1": 9.498, "x1": 19.89, "g1": 0.0, "b1": 0.0, "k": 1.0, "theta": 0.0},
      {"id": 112, "from_node": 6, "to_node": 12, "from_status": 1, "to_status": 1, "r1": 12.291, "x1": 25.581, "g1": 0.0, "b1": 0.0, "k": 1.0, "theta": 0.0},
      {"id": 113, "from_node": 6, "to_node": 13, "from_status": 1, "to_status": 1, "r1": 6.615, "x1": 13.027, "g1": 0.0, "b1": 0.0, "k": 1.0, "theta": 0.0},
      {"id": 114, "from_node": 7, "to_node": 8, "from_status": 1, "to_status": 1, "r1": 0.0, "x1": 17.615, "g1": 0.0, "b1": 0.0, "k": 1.0, "theta": 0.0},
      {"id": 115, "from_node": 7, "to_node": 9, "from_status": 1, "to_status": 1, "r1": 0.0, "x1": 11.001, "g1": 0.0, "b1": 0.0, "k": 1.0, "theta": 0.0},
      {"id": 116, "from_node": 9, "to_node": 10, "from_status": 1, "to_status": 1, "r1": 3.181, "x1": 8.45, "g1": 0.0, "b1": 0.0, "k": 1.0, "theta": 0.0},
      {"id": 117, "from_node": 9, "to_node": 14, "from_status": 1, "to_status": 1, "r1": 12.711, "x1": 27.038, "g1": 0.0, "b1": 0.0, "k": 1.0, "theta": 0.0},
      {"id": 118, "from_node": 10, "to_node": 11, "from_status": 1, "to_status": 1, "r1": 8.205, "x1": 19.207, "g1": 0.0, "b1": 0.0, "k": 1.0, "theta": 0.0},
      {"id": 119, "from_node": 12, "to_node": 13, "from_status": 1, "to_status": 1, "r1": 22.092, "x1": 19.988, "g1": 0.0, "b1": 0.0, "k": 1.0, "theta": 0.0},
      {"id": 120, "from_node": 13, "to_node": 14, "from_status": 1, "to_status": 1, "r1": 17.093, "x1": 34.802, "g1": 0.0, "b1": 0.0, "k": 1.0, "theta": 0.0}
    ],
    "sym_load": [
      {"id": 201, "node": 2, "status": 1, "type": 0, "p_specified": 21700000.0, "q_specified": 12700000.0},
      {"id": 202, "node": 3, "status": 1, "type": 0, "p_specified": 94200000.0, "q_specified": 19000000.0},
      {"id": 203, "node": 4, "status": 1, "type": 0, "p_specified": 47800000.0, "q_specified": -3900000.0},
      {"id": 204, "node": 5, "status": 1, "type": 0, "p_specified": 7600000.0, "q_specified": 1600000.0},
      {"id": 205, "node": 6, "status": 1, "type": 0, "p_specified": 11200000.0, "q_specified": 7500000.0},
      {"id": 206, "node": 9, "status": 1, "type": 0, "p_specified": 29500000.0, "q_specified": 16600000.0},
      {"id": 207, "node": 10, "status": 1, "type": 0, "p_specified": 9000000.0, "q_specified": 5800000.0},
      {"id": 208, "node": 11, "status": 1, "type": 0, "p_specified": 3500000.0, "q_specified": 1800000.0},
      {"id": 209, "node": 12, "status": 1, "type": 0, "p_specified": 6100000.0, "q_specified": 1600000.0},
      {"id": 210, "node": 13, "status": 1, "type": 0, "p_specified": 13500000.0, "q_specified": 5800000.0},
      {"id": 211, "node": 14, "status": 1, "type": 0, "p_specified": 14900000.0, "q_specified": 5000000.0}
    ],
    "sym_gen": [
      {"id": 301, "node": 2, "status": 1, "type": 0, "p_specified": 40000000.0, "q_specified": 0.0},
      {"id": 302, "node": 3, "status": 1, "type": 0, "p_specified": 0.0, "q_specified": 0.0},
      {"id": 303, "node": 6, "status": 1, "type": 0, "p_specified": 0.0, "q_specified": 0.0},
      {"id": 304, "node": 8, "status": 1, "type": 0, "p_specified": 0.0, "q_specified": 0.0}
    ],
    "voltage_regulator": [
      {"id": 401, "regulated_object": 301, "status": 1, "u_ref": 1.045},
      {"id": 402, "regulated_object": 302, "status": 1, "u_ref": 1.01},
      {"id": 403, "regulated_object": 303, "status": 1, "u_ref": 1.07},
      {"id": 404, "regulated_object": 304, "status": 1, "u_ref": 1.09}
    ],
    "shunt": [
      {"id": 501, "node": 9, "status": 1, "g1": 0.0, "b1": 0.0019, "g0": 0.0, "b0": 0.0019}
    ],
    "source": [
      {"id": 601, "node": 1, "status": 1, "u_ref": 1.06, "sk": 1e40, "rx_ratio": 0.1, "z01_ratio": 1.0}
    ]
  }
}
```

### A.4 `backend/src/gridsim/samples/networks/vision_mv.json` (PGM validation data, MPL-2.0)

```json
{
  "version": "1.0",
  "type": "input",
  "is_batch": false,
  "attributes": {},
  "data": {
    "node":
      [
        {"id": 0, "u_rated": 10500.0, "id_reference": {"table": "Nodes", "key": {"Number": 1}}, "Name": "Rail B"},
        {"id": 1, "u_rated": 10500.0, "id_reference": {"table": "Nodes", "key": {"Number": 2}}, "Name": "KNP 1"},
        {"id": 2, "u_rated": 10500.0, "id_reference": {"table": "Nodes", "key": {"Number": 3}}, "Name": "KNP 21"},
        {"id": 3, "u_rated": 10500.0, "id_reference": {"table": "Nodes", "key": {"Number": 4}}, "Name": "KNP 11"},
        {"id": 4, "u_rated": 10500.0, "id_reference": {"table": "Nodes", "key": {"Number": 5}}, "Name": "KNP 2"},
        {"id": 5, "u_rated": 10500.0, "id_reference": {"table": "Nodes", "key": {"Number": 6}}, "Name": "KNP 3"},
        {"id": 6, "u_rated": 10500.0, "id_reference": {"table": "Nodes", "key": {"Number": 7}}, "Name": "KNP 4"},
        {"id": 7, "u_rated": 10500.0, "id_reference": {"table": "Nodes", "key": {"Number": 8}}, "Name": "KNP 5"},
        {"id": 8, "u_rated": 10500.0, "id_reference": {"table": "Nodes", "key": {"Number": 9}}, "Name": "KNP 12"},
        {"id": 9, "u_rated": 10500.0, "id_reference": {"table": "Nodes", "key": {"Number": 10}}, "Name": "KNP 13"},
        {"id": 10, "u_rated": 10500.0, "id_reference": {"table": "Nodes", "key": {"Number": 11}}, "Name": "KNP 14"},
        {"id": 11, "u_rated": 10500.0, "id_reference": {"table": "Nodes", "key": {"Number": 12}}, "Name": "KNP 15"},
        {"id": 12, "u_rated": 10500.0, "id_reference": {"table": "Nodes", "key": {"Number": 13}}, "Name": "KNP 22"},
        {"id": 13, "u_rated": 10500.0, "id_reference": {"table": "Nodes", "key": {"Number": 14}}, "Name": "KNP 23"},
        {"id": 14, "u_rated": 10500.0, "id_reference": {"table": "Nodes", "key": {"Number": 15}}, "Name": "KNP 24"},
        {"id": 15, "u_rated": 10500.0, "id_reference": {"table": "Nodes", "key": {"Number": 16}}, "Name": "KNP 25"},
        {"id": 16, "u_rated": 10500.0, "id_reference": {"table": "Nodes", "key": {"Number": 17}}, "Name": "KNP 31"},
        {"id": 17, "u_rated": 10500.0, "id_reference": {"table": "Nodes", "key": {"Number": 18}}, "Name": "KNP 32"},
        {"id": 18, "u_rated": 10500.0, "id_reference": {"table": "Nodes", "key": {"Number": 19}}, "Name": "KNP 33"},
        {"id": 19, "u_rated": 10500.0, "id_reference": {"table": "Nodes", "key": {"Number": 20}}, "Name": "KNP 34"},
        {"id": 20, "u_rated": 10500.0, "id_reference": {"table": "Nodes", "key": {"Number": 21}}, "Name": "KNP 35"},
        {"id": 21, "u_rated": 10500.0, "id_reference": {"table": "Nodes", "key": {"Number": 30}}, "Name": "KNP 5.1"},
        {"id": 22, "u_rated": 10500.0, "id_reference": {"table": "Nodes", "key": {"Number": 22}}, "Name": "Rail A"},
        {"id": 23, "u_rated": 110000.0, "id_reference": {"table": "Nodes", "key": {"Number": 24}}, "Name": "node_m1"},
        {"id": 24, "u_rated": 10500.0, "id_reference": {"table": "Nodes", "key": {"Number": 23}}, "Name": "node1"},
        {"id": 25, "u_rated": 10500.0, "id_reference": {"table": "Nodes", "key": {"Number": 25}}, "Name": "node2"},
        {"id": 26, "u_rated": 10500.0, "id_reference": {"table": "Nodes", "key": {"Number": 26}}, "Name": "node3"},
        {"id": 27, "u_rated": 420.0, "id_reference": {"table": "Nodes", "key": {"Number": 27}}, "Name": "KNP 1 (LS)"},
        {"id": 28, "u_rated": 420.0, "id_reference": {"table": "Nodes", "key": {"Number": 28}}, "Name": "KNP 21 (LS)"},
        {"id": 29, "u_rated": 420.0, "id_reference": {"table": "Nodes", "key": {"Number": 29}}, "Name": "KNP 11 (LS)"},
        {"id": 30, "u_rated": 420.0, "id_reference": {"table": "Nodes", "key": {"Number": 31}}, "Name": "KNP 2 (LS)"},
        {"id": 31, "u_rated": 420.0, "id_reference": {"table": "Nodes", "key": {"Number": 32}}, "Name": "KNP 3 (LS)"},
        {"id": 32, "u_rated": 420.0, "id_reference": {"table": "Nodes", "key": {"Number": 33}}, "Name": "KNP 4 (LS)"},
        {"id": 33, "u_rated": 420.0, "id_reference": {"table": "Nodes", "key": {"Number": 34}}, "Name": "KNP 12 (LS)"},
        {"id": 34, "u_rated": 420.0, "id_reference": {"table": "Nodes", "key": {"Number": 35}}, "Name": "KNP 13 (LS)"},
        {"id": 35, "u_rated": 420.0, "id_reference": {"table": "Nodes", "key": {"Number": 36}}, "Name": "KNP 14 (LS)"},
        {"id": 36, "u_rated": 420.0, "id_reference": {"table": "Nodes", "key": {"Number": 37}}, "Name": "KNP 15 (LS)"},
        {"id": 37, "u_rated": 420.0, "id_reference": {"table": "Nodes", "key": {"Number": 38}}, "Name": "KNP 22 (LS)"},
        {"id": 38, "u_rated": 420.0, "id_reference": {"table": "Nodes", "key": {"Number": 39}}, "Name": "KNP 23 (LS)"},
        {"id": 39, "u_rated": 420.0, "id_reference": {"table": "Nodes", "key": {"Number": 40}}, "Name": "KNP 24 (LS)"},
        {"id": 40, "u_rated": 420.0, "id_reference": {"table": "Nodes", "key": {"Number": 41}}, "Name": "KNP 25 (LS)"},
        {"id": 41, "u_rated": 420.0, "id_reference": {"table": "Nodes", "key": {"Number": 42}}, "Name": "KNP 31 (LS)"},
        {"id": 42, "u_rated": 420.0, "id_reference": {"table": "Nodes", "key": {"Number": 43}}, "Name": "KNP 32 (LS)"},
        {"id": 43, "u_rated": 420.0, "id_reference": {"table": "Nodes", "key": {"Number": 44}}, "Name": "KNP 33 (LS)"},
        {"id": 44, "u_rated": 420.0, "id_reference": {"table": "Nodes", "key": {"Number": 45}}, "Name": "KNP 34 (LS)"},
        {"id": 45, "u_rated": 420.0, "id_reference": {"table": "Nodes", "key": {"Number": 46}}, "Name": "KNP 35 (LS)"},
        {"id": 46, "u_rated": 420.0, "id_reference": {"table": "Nodes", "key": {"Number": 47}}, "Name": "KNP 5.1 (LS)"}
      ],
    "line":
      [
        {"id": 47, "from_node": 0, "to_node": 1, "from_status": 1, "to_status": 1, "r1": 0.081, "x1": 0.044500000000000005, "c1": 2.25e-07, "tan1": 0.0004, "r0": 0.4075, "x0": 0.05, "c0": 2.25e-07, "tan0": 0.0, "i_n": 360.0, "id_reference": {"table": "Cables", "key": {"Number": 1}}, "Name": "R1"},
        {"id": 48, "from_node": 0, "to_node": 2, "from_status": 1, "to_status": 1, "r1": 0.081, "x1": 0.044500000000000005, "c1": 2.25e-07, "tan1": 0.0004, "r0": 0.4075, "x0": 0.05, "c0": 2.25e-07, "tan0": 0.0, "i_n": 360.0, "id_reference": {"table": "Cables", "key": {"Number": 2}}, "Name": "R21"},
        {"id": 49, "from_node": 0, "to_node": 3, "from_status": 1, "to_status": 1, "r1": 0.081, "x1": 0.044500000000000005, "c1": 2.25e-07, "tan1": 0.0004, "r0": 0.4075, "x0": 0.05, "c0": 2.25e-07, "tan0": 0.0, "i_n": 360.0, "id_reference": {"table": "Cables", "key": {"Number": 3}}, "Name": "R11"},
        {"id": 50, "from_node": 1, "to_node": 4, "from_status": 1, "to_status": 1, "r1": 0.0324, "x1": 0.0178, "c1": 9e-08, "tan1": 0.0004, "r0": 0.163, "x0": 0.02, "c0": 9e-08, "tan0": 0.0, "i_n": 360.0, "id_reference": {"table": "Cables", "key": {"Number": 4}}, "Name": "K12"},
        {"id": 51, "from_node": 4, "to_node": 5, "from_status": 1, "to_status": 1, "r1": 0.0324, "x1": 0.0178, "c1": 9e-08, "tan1": 0.0004, "r0": 0.163, "x0": 0.02, "c0": 9e-08, "tan0": 0.0, "i_n": 360.0, "id_reference": {"table": "Cables", "key": {"Number": 5}}, "Name": "K23"},
        {"id": 52, "from_node": 5, "to_node": 6, "from_status": 1, "to_status": 1, "r1": 0.0324, "x1": 0.0178, "c1": 9e-08, "tan1": 0.0004, "r0": 0.163, "x0": 0.02, "c0": 9e-08, "tan0": 0.0, "i_n": 360.0, "id_reference": {"table": "Cables", "key": {"Number": 6}}, "Name": "K34"},
        {"id": 53, "from_node": 6, "to_node": 7, "from_status": 1, "to_status": 1, "r1": 0.0324, "x1": 0.0178, "c1": 9e-08, "tan1": 0.0004, "r0": 0.163, "x0": 0.02, "c0": 9e-08, "tan0": 0.0, "i_n": 360.0, "id_reference": {"table": "Cables", "key": {"Number": 7}}, "Name": "K35"},
        {"id": 54, "from_node": 3, "to_node": 8, "from_status": 1, "to_status": 1, "r1": 0.0324, "x1": 0.0178, "c1": 9e-08, "tan1": 0.0004, "r0": 0.163, "x0": 0.02, "c0": 9e-08, "tan0": 0.0, "i_n": 360.0, "id_reference": {"table": "Cables", "key": {"Number": 8}}, "Name": "K1112"},
        {"id": 55, "from_node": 8, "to_node": 9, "from_status": 1, "to_status": 1, "r1": 0.0324, "x1": 0.0178, "c1": 9e-08, "tan1": 0.0004, "r0": 0.163, "x0": 0.02, "c0": 9e-08, "tan0": 0.0, "i_n": 360.0, "id_reference": {"table": "Cables", "key": {"Number": 9}}, "Name": "K1213"},
        {"id": 56, "from_node": 9, "to_node": 10, "from_status": 1, "to_status": 1, "r1": 0.0324, "x1": 0.0178, "c1": 9e-08, "tan1": 0.0004, "r0": 0.163, "x0": 0.02, "c0": 9e-08, "tan0": 0.0, "i_n": 360.0, "id_reference": {"table": "Cables", "key": {"Number": 10}}, "Name": "K1314"},
        {"id": 57, "from_node": 10, "to_node": 11, "from_status": 1, "to_status": 1, "r1": 0.0324, "x1": 0.0178, "c1": 9e-08, "tan1": 0.0004, "r0": 0.163, "x0": 0.02, "c0": 9e-08, "tan0": 0.0, "i_n": 360.0, "id_reference": {"table": "Cables", "key": {"Number": 11}}, "Name": "K1415"},
        {"id": 58, "from_node": 2, "to_node": 12, "from_status": 1, "to_status": 1, "r1": 0.0324, "x1": 0.0178, "c1": 9e-08, "tan1": 0.0004, "r0": 0.163, "x0": 0.02, "c0": 9e-08, "tan0": 0.0, "i_n": 360.0, "id_reference": {"table": "Cables", "key": {"Number": 12}}, "Name": "K2122"},
        {"id": 59, "from_node": 12, "to_node": 13, "from_status": 1, "to_status": 1, "r1": 0.0324, "x1": 0.0178, "c1": 9e-08, "tan1": 0.0004, "r0": 0.163, "x0": 0.02, "c0": 9e-08, "tan0": 0.0, "i_n": 360.0, "id_reference": {"table": "Cables", "key": {"Number": 13}}, "Name": "K2223"},
        {"id": 60, "from_node": 13, "to_node": 14, "from_status": 1, "to_status": 1, "r1": 0.0324, "x1": 0.0178, "c1": 9e-08, "tan1": 0.0004, "r0": 0.163, "x0": 0.02, "c0": 9e-08, "tan0": 0.0, "i_n": 360.0, "id_reference": {"table": "Cables", "key": {"Number": 14}}, "Name": "K2324"},
        {"id": 61, "from_node": 14, "to_node": 15, "from_status": 1, "to_status": 1, "r1": 0.0324, "x1": 0.0178, "c1": 9e-08, "tan1": 0.0004, "r0": 0.163, "x0": 0.02, "c0": 9e-08, "tan0": 0.0, "i_n": 360.0, "id_reference": {"table": "Cables", "key": {"Number": 15}}, "Name": "K2425"},
        {"id": 62, "from_node": 0, "to_node": 16, "from_status": 1, "to_status": 1, "r1": 0.081, "x1": 0.044500000000000005, "c1": 2.25e-07, "tan1": 0.0004, "r0": 0.4075, "x0": 0.05, "c0": 2.25e-07, "tan0": 0.0, "i_n": 360.0, "id_reference": {"table": "Cables", "key": {"Number": 16}}, "Name": "R31"},
        {"id": 63, "from_node": 16, "to_node": 17, "from_status": 1, "to_status": 1, "r1": 0.0324, "x1": 0.0178, "c1": 9e-08, "tan1": 0.0004, "r0": 0.163, "x0": 0.02, "c0": 9e-08, "tan0": 0.0, "i_n": 360.0, "id_reference": {"table": "Cables", "key": {"Number": 17}}, "Name": "K3132"},
        {"id": 64, "from_node": 17, "to_node": 18, "from_status": 1, "to_status": 1, "r1": 0.19440000000000002, "x1": 0.1068, "c1": 5.4e-07, "tan1": 0.0004, "r0": 0.9779999999999999, "x0": 0.12, "c0": 5.4e-07, "tan0": 0.0, "i_n": 360.0, "id_reference": {"table": "Cables", "key": {"Number": 18}}, "Name": "K3233"},
        {"id": 65, "from_node": 18, "to_node": 19, "from_status": 1, "to_status": 1, "r1": 0.0324, "x1": 0.0178, "c1": 9e-08, "tan1": 0.0004, "r0": 0.163, "x0": 0.02, "c0": 9e-08, "tan0": 0.0, "i_n": 360.0, "id_reference": {"table": "Cables", "key": {"Number": 19}}, "Name": "K3334"},
        {"id": 66, "from_node": 19, "to_node": 20, "from_status": 1, "to_status": 1, "r1": 0.0324, "x1": 0.0178, "c1": 9e-08, "tan1": 0.0004, "r0": 0.163, "x0": 0.02, "c0": 9e-08, "tan0": 0.0, "i_n": 360.0, "id_reference": {"table": "Cables", "key": {"Number": 20}}, "Name": "K3435"},
        {"id": 67, "from_node": 15, "to_node": 20, "from_status": 0, "to_status": 1, "r1": 0.0324, "x1": 0.0178, "c1": 9e-08, "tan1": 0.0004, "r0": 0.163, "x0": 0.02, "c0": 9e-08, "tan0": 0.0, "i_n": 360.0, "id_reference": {"table": "Cables", "key": {"Number": 21}}, "Name": "K2535"},
        {"id": 68, "from_node": 11, "to_node": 15, "from_status": 1, "to_status": 0, "r1": 0.324, "x1": 0.17800000000000002, "c1": 9e-07, "tan1": 0.0004, "r0": 1.63, "x0": 0.2, "c0": 9e-07, "tan0": 0.0, "i_n": 360.0, "id_reference": {"table": "Cables", "key": {"Number": 22}}, "Name": "K1525"},
        {"id": 69, "from_node": 5, "to_node": 9, "from_status": 1, "to_status": 0, "r1": 0.0324, "x1": 0.0178, "c1": 9e-08, "tan1": 0.0004, "r0": 0.163, "x0": 0.02, "c0": 9e-08, "tan0": 0.0, "i_n": 360.0, "id_reference": {"table": "Cables", "key": {"Number": 23}}, "Name": "K313"},
        {"id": 70, "from_node": 7, "to_node": 11, "from_status": 1, "to_status": 0, "r1": 0.0324, "x1": 0.0178, "c1": 9e-08, "tan1": 0.0004, "r0": 0.163, "x0": 0.02, "c0": 9e-08, "tan0": 0.0, "i_n": 360.0, "id_reference": {"table": "Cables", "key": {"Number": 24}}, "Name": "K515"},
        {"id": 71, "from_node": 9, "to_node": 13, "from_status": 1, "to_status": 0, "r1": 0.0324, "x1": 0.0178, "c1": 9e-08, "tan1": 0.0004, "r0": 0.163, "x0": 0.02, "c0": 9e-08, "tan0": 0.0, "i_n": 360.0, "id_reference": {"table": "Cables", "key": {"Number": 25}}, "Name": "K1323"},
        {"id": 72, "from_node": 13, "to_node": 18, "from_status": 0, "to_status": 1, "r1": 0.0324, "x1": 0.0178, "c1": 9e-08, "tan1": 0.0004, "r0": 0.163, "x0": 0.02, "c0": 9e-08, "tan0": 0.0, "i_n": 360.0, "id_reference": {"table": "Cables", "key": {"Number": 26}}, "Name": "K2333"},
        {"id": 73, "from_node": 0, "to_node": 24, "from_status": 1, "to_status": 1, "r1": 0.1, "x1": 0.1, "c1": 2e-07, "tan1": 0.0004, "r0": 0.1, "x0": 0.1, "c0": 2e-07, "tan0": 0.0, "i_n": 1000.0, "id_reference": {"table": "Lines", "key": {"Number": 1}}, "Name": "line1"},
        {"id": 76, "from_node": 24, "to_node": 25, "from_status": 1, "to_status": 1, "r1": 0.1, "x1": 0.5, "c1": 0.0, "tan1": 0.0004, "r0": 0.1, "x0": 0.5, "c0": 0.0, "tan0": 0.0, "i_n": 1000.0, "id_reference": {"table": "Reactance coils", "key": {"Number": 1}}, "Name": "reactance1"}
      ],
    "link":
      [
        {"id": 74, "from_node": 7, "to_node": 21, "from_status": 1, "to_status": 1, "id_reference": {"table": "Links", "key": {"Number": 4}}, "Name": "55.1"},
        {"id": 75, "from_node": 0, "to_node": 22, "from_status": 1, "to_status": 1, "id_reference": {"table": "Links", "key": {"Number": 1}}, "Name": "Dwarskoppelveld :)"}
      ],
    "transformer":
      [
        {"id": 77, "from_node": 23, "to_node": 22, "from_status": 1, "to_status": 1, "u1": 110000.0, "u2": 10500.0, "sn": 44000000.0, "uk": 0.134, "pk": 10000.0, "i0": 0.010002593413710266, "p0": 2000.0, "winding_from": 1, "winding_to": 2, "clock": 1, "tap_side": 0, "tap_pos": -3, "tap_min": -12, "tap_max": 12, "tap_nom": 0, "tap_size": 1320.0, "uk_min": 0.134, "uk_max": 0.134, "pk_min": 10000.0, "pk_max": 10000.0, "r_grounding_from": 0.0, "x_grounding_from": 0.0, "id_reference": {"table": "Transformers", "key": {"Number": 2}}, "Name": "trafo1"},
        {"id": 78, "from_node": 1, "to_node": 27, "from_status": 1, "to_status": 1, "u1": 10750.0, "u2": 420.0, "sn": 1000000.0, "uk": 0.2, "pk": 0.0, "i0": 0.0, "p0": 0.0, "winding_from": 2, "winding_to": 1, "clock": 5, "tap_side": 0, "tap_pos": 3, "tap_min": 5, "tap_max": 1, "tap_nom": 3, "tap_size": 250.0, "uk_min": 0.2, "uk_max": 0.2, "pk_min": 0.0, "pk_max": 0.0, "r_grounding_to": 0.0, "x_grounding_to": 0.0, "id_reference": {"table": "Transformers", "key": {"Number": 1}}},
        {"id": 79, "from_node": 2, "to_node": 28, "from_status": 1, "to_status": 1, "u1": 10750.0, "u2": 420.0, "sn": 1000000.0, "uk": 0.06, "pk": 8800.0, "i0": 0.00097, "p0": 970.0, "winding_from": 2, "winding_to": 1, "clock": 5, "tap_side": 0, "tap_pos": 3, "tap_min": 5, "tap_max": 1, "tap_nom": 3, "tap_size": 250.0, "uk_min": 0.06, "uk_max": 0.06, "pk_min": 8800.0, "pk_max": 8800.0, "r_grounding_to": 0.0, "x_grounding_to": 0.0, "id_reference": {"table": "Transformers", "key": {"Number": 3}}},
        {"id": 80, "from_node": 3, "to_node": 29, "from_status": 1, "to_status": 1, "u1": 10750.0, "u2": 420.0, "sn": 160000.0, "uk": 0.04, "pk": 1905.0, "i0": 0.001625, "p0": 260.0, "winding_from": 2, "winding_to": 1, "clock": 5, "tap_side": 0, "tap_pos": 3, "tap_min": 5, "tap_max": 1, "tap_nom": 3, "tap_size": 250.0, "uk_min": 0.04, "uk_max": 0.04, "pk_min": 1905.0, "pk_max": 1905.0, "r_grounding_to": 0.0, "x_grounding_to": 0.0, "id_reference": {"table": "Transformers", "key": {"Number": 4}}},
        {"id": 81, "from_node": 4, "to_node": 30, "from_status": 1, "to_status": 1, "u1": 10750.0, "u2": 420.0, "sn": 1000000.0, "uk": 0.06, "pk": 8800.0, "i0": 0.00097, "p0": 970.0, "winding_from": 2, "winding_to": 1, "clock": 5, "tap_side": 0, "tap_pos": 3, "tap_min": 5, "tap_max": 1, "tap_nom": 3, "tap_size": 250.0, "uk_min": 0.06, "uk_max": 0.06, "pk_min": 8800.0, "pk_max": 8800.0, "r_grounding_to": 0.0, "x_grounding_to": 0.0, "id_reference": {"table": "Transformers", "key": {"Number": 5}}},
        {"id": 82, "from_node": 5, "to_node": 31, "from_status": 1, "to_status": 1, "u1": 10750.0, "u2": 420.0, "sn": 1000000.0, "uk": 0.06, "pk": 8800.0, "i0": 0.00097, "p0": 970.0, "winding_from": 2, "winding_to": 1, "clock": 5, "tap_side": 0, "tap_pos": 3, "tap_min": 5, "tap_max": 1, "tap_nom": 3, "tap_size": 250.0, "uk_min": 0.06, "uk_max": 0.06, "pk_min": 8800.0, "pk_max": 8800.0, "r_grounding_to": 0.0, "x_grounding_to": 0.0, "id_reference": {"table": "Transformers", "key": {"Number": 6}}},
        {"id": 83, "from_node": 6, "to_node": 32, "from_status": 1, "to_status": 1, "u1": 10750.0, "u2": 420.0, "sn": 1000000.0, "uk": 0.06, "pk": 8800.0, "i0": 0.00097, "p0": 970.0, "winding_from": 2, "winding_to": 1, "clock": 5, "tap_side": 0, "tap_pos": 3, "tap_min": 5, "tap_max": 1, "tap_nom": 3, "tap_size": 250.0, "uk_min": 0.06, "uk_max": 0.06, "pk_min": 8800.0, "pk_max": 8800.0, "r_grounding_to": 0.0, "x_grounding_to": 0.0, "id_reference": {"table": "Transformers", "key": {"Number": 7}}},
        {"id": 84, "from_node": 8, "to_node": 33, "from_status": 1, "to_status": 1, "u1": 10750.0, "u2": 420.0, "sn": 1600000.0, "uk": 0.06, "pk": 12900.0, "i0": 0.000875, "p0": 1400.0, "winding_from": 2, "winding_to": 1, "clock": 5, "tap_side": 0, "tap_pos": 3, "tap_min": 5, "tap_max": 1, "tap_nom": 3, "tap_size": 250.0, "uk_min": 0.06, "uk_max": 0.06, "pk_min": 12900.0, "pk_max": 12900.0, "r_grounding_to": 0.0, "x_grounding_to": 0.0, "id_reference": {"table": "Transformers", "key": {"Number": 8}}},
        {"id": 85, "from_node": 9, "to_node": 34, "from_status": 1, "to_status": 1, "u1": 10750.0, "u2": 420.0, "sn": 1000000.0, "uk": 0.06, "pk": 8800.0, "i0": 0.00097, "p0": 970.0, "winding_from": 2, "winding_to": 1, "clock": 5, "tap_side": 0, "tap_pos": 3, "tap_min": 5, "tap_max": 1, "tap_nom": 3, "tap_size": 250.0, "uk_min": 0.06, "uk_max": 0.06, "pk_min": 8800.0, "pk_max": 8800.0, "r_grounding_to": 0.0, "x_grounding_to": 0.0, "id_reference": {"table": "Transformers", "key": {"Number": 9}}},
        {"id": 86, "from_node": 10, "to_node": 35, "from_status": 1, "to_status": 1, "u1": 10750.0, "u2": 420.0, "sn": 1000000.0, "uk": 0.06, "pk": 8800.0, "i0": 0.00097, "p0": 970.0, "winding_from": 2, "winding_to": 1, "clock": 5, "tap_side": 0, "tap_pos": 3, "tap_min": 5, "tap_max": 1, "tap_nom": 3, "tap_size": 250.0, "uk_min": 0.06, "uk_max": 0.06, "pk_min": 8800.0, "pk_max": 8800.0, "r_grounding_to": 0.0, "x_grounding_to": 0.0, "id_reference": {"table": "Transformers", "key": {"Number": 10}}},
        {"id": 87, "from_node": 11, "to_node": 36, "from_status": 1, "to_status": 1, "u1": 10750.0, "u2": 420.0, "sn": 160000.0, "uk": 0.04, "pk": 1905.0, "i0": 0.001625, "p0": 260.0, "winding_from": 2, "winding_to": 1, "clock": 5, "tap_side": 0, "tap_pos": 3, "tap_min": 5, "tap_max": 1, "tap_nom": 3, "tap_size": 250.0, "uk_min": 0.04, "uk_max": 0.04, "pk_min": 1905.0, "pk_max": 1905.0, "r_grounding_to": 0.0, "x_grounding_to": 0.0, "id_reference": {"table": "Transformers", "key": {"Number": 11}}},
        {"id": 88, "from_node": 12, "to_node": 37, "from_status": 1, "to_status": 1, "u1": 10750.0, "u2": 420.0, "sn": 2500000.0, "uk": 0.06, "pk": 20000.0, "i0": 0.00086, "p0": 2150.0, "winding_from": 2, "winding_to": 1, "clock": 5, "tap_side": 0, "tap_pos": 3, "tap_min": 5, "tap_max": 1, "tap_nom": 3, "tap_size": 250.0, "uk_min": 0.06, "uk_max": 0.06, "pk_min": 20000.0, "pk_max": 20000.0, "r_grounding_to": 0.0, "x_grounding_to": 0.0, "id_reference": {"table": "Transformers", "key": {"Number": 12}}},
        {"id": 89, "from_node": 13, "to_node": 38, "from_status": 1, "to_status": 1, "u1": 10750.0, "u2": 420.0, "sn": 160000.0, "uk": 0.04, "pk": 1905.0, "i0": 0.001625, "p0": 260.0, "winding_from": 2, "winding_to": 1, "clock": 5, "tap_side": 0, "tap_pos": 3, "tap_min": 5, "tap_max": 1, "tap_nom": 3, "tap_size": 250.0, "uk_min": 0.04, "uk_max": 0.04, "pk_min": 1905.0, "pk_max": 1905.0, "r_grounding_to": 0.0, "x_grounding_to": 0.0, "id_reference": {"table": "Transformers", "key": {"Number": 13}}},
        {"id": 90, "from_node": 14, "to_node": 39, "from_status": 1, "to_status": 1, "u1": 10750.0, "u2": 420.0, "sn": 1000000.0, "uk": 0.06, "pk": 8800.0, "i0": 0.00097, "p0": 970.0, "winding_from": 2, "winding_to": 1, "clock": 5, "tap_side": 0, "tap_pos": 3, "tap_min": 5, "tap_max": 1, "tap_nom": 3, "tap_size": 250.0, "uk_min": 0.06, "uk_max": 0.06, "pk_min": 8800.0, "pk_max": 8800.0, "r_grounding_to": 0.0, "x_grounding_to": 0.0, "id_reference": {"table": "Transformers", "key": {"Number": 14}}},
        {"id": 91, "from_node": 15, "to_node": 40, "from_status": 1, "to_status": 1, "u1": 10750.0, "u2": 420.0, "sn": 1000000.0, "uk": 0.06, "pk": 8800.0, "i0": 0.00097, "p0": 970.0, "winding_from": 2, "winding_to": 1, "clock": 5, "tap_side": 0, "tap_pos": 3, "tap_min": 5, "tap_max": 1, "tap_nom": 3, "tap_size": 250.0, "uk_min": 0.06, "uk_max": 0.06, "pk_min": 8800.0, "pk_max": 8800.0, "r_grounding_to": 0.0, "x_grounding_to": 0.0, "id_reference": {"table": "Transformers", "key": {"Number": 15}}},
        {"id": 92, "from_node": 16, "to_node": 41, "from_status": 1, "to_status": 1, "u1": 10750.0, "u2": 420.0, "sn": 160000.0, "uk": 0.04, "pk": 1905.0, "i0": 0.001625, "p0": 260.0, "winding_from": 2, "winding_to": 1, "clock": 5, "tap_side": 0, "tap_pos": 3, "tap_min": 5, "tap_max": 1, "tap_nom": 3, "tap_size": 250.0, "uk_min": 0.04, "uk_max": 0.04, "pk_min": 1905.0, "pk_max": 1905.0, "r_grounding_to": 0.0, "x_grounding_to": 0.0, "id_reference": {"table": "Transformers", "key": {"Number": 16}}},
        {"id": 93, "from_node": 17, "to_node": 42, "from_status": 1, "to_status": 1, "u1": 10750.0, "u2": 420.0, "sn": 160000.0, "uk": 0.04, "pk": 1905.0, "i0": 0.001625, "p0": 260.0, "winding_from": 2, "winding_to": 1, "clock": 5, "tap_side": 0, "tap_pos": 3, "tap_min": 5, "tap_max": 1, "tap_nom": 3, "tap_size": 250.0, "uk_min": 0.04, "uk_max": 0.04, "pk_min": 1905.0, "pk_max": 1905.0, "r_grounding_to": 0.0, "x_grounding_to": 0.0, "id_reference": {"table": "Transformers", "key": {"Number": 17}}},
        {"id": 94, "from_node": 18, "to_node": 43, "from_status": 1, "to_status": 1, "u1": 10750.0, "u2": 420.0, "sn": 160000.0, "uk": 0.04, "pk": 1905.0, "i0": 0.001625, "p0": 260.0, "winding_from": 2, "winding_to": 1, "clock": 5, "tap_side": 0, "tap_pos": 3, "tap_min": 5, "tap_max": 1, "tap_nom": 3, "tap_size": 250.0, "uk_min": 0.04, "uk_max": 0.04, "pk_min": 1905.0, "pk_max": 1905.0, "r_grounding_to": 0.0, "x_grounding_to": 0.0, "id_reference": {"table": "Transformers", "key": {"Number": 18}}},
        {"id": 95, "from_node": 19, "to_node": 44, "from_status": 1, "to_status": 1, "u1": 10750.0, "u2": 420.0, "sn": 160000.0, "uk": 0.04, "pk": 1905.0, "i0": 0.001625, "p0": 260.0, "winding_from": 2, "winding_to": 1, "clock": 5, "tap_side": 0, "tap_pos": 3, "tap_min": 5, "tap_max": 1, "tap_nom": 3, "tap_size": 250.0, "uk_min": 0.04, "uk_max": 0.04, "pk_min": 1905.0, "pk_max": 1905.0, "r_grounding_to": 0.0, "x_grounding_to": 0.0, "id_reference": {"table": "Transformers", "key": {"Number": 19}}},
        {"id": 96, "from_node": 20, "to_node": 45, "from_status": 1, "to_status": 1, "u1": 10750.0, "u2": 420.0, "sn": 160000.0, "uk": 0.04, "pk": 1905.0, "i0": 0.001625, "p0": 260.0, "winding_from": 2, "winding_to": 1, "clock": 5, "tap_side": 0, "tap_pos": 3, "tap_min": 5, "tap_max": 1, "tap_nom": 3, "tap_size": 250.0, "uk_min": 0.04, "uk_max": 0.04, "pk_min": 1905.0, "pk_max": 1905.0, "r_grounding_to": 0.0, "x_grounding_to": 0.0, "id_reference": {"table": "Transformers", "key": {"Number": 20}}},
        {"id": 97, "from_node": 21, "to_node": 46, "from_status": 1, "to_status": 1, "u1": 10750.0, "u2": 420.0, "sn": 2500000.0, "uk": 0.06, "pk": 20000.0, "i0": 0.00086, "p0": 2150.0, "winding_from": 2, "winding_to": 1, "clock": 5, "tap_side": 0, "tap_pos": 3, "tap_min": 5, "tap_max": 1, "tap_nom": 3, "tap_size": 250.0, "uk_min": 0.06, "uk_max": 0.06, "pk_min": 20000.0, "pk_max": 20000.0, "r_grounding_to": 0.0, "x_grounding_to": 0.0, "id_reference": {"table": "Transformers", "key": {"Number": 21}}},
        {"id": 98, "from_node": 25, "to_node": 26, "from_status": 1, "to_status": 1, "u1": 10500.0, "u2": 10500.0, "sn": 20000000.0, "uk": 0.05, "pk": 9000.0, "i0": 0.0009093266739736605, "p0": 1000.0, "winding_from": 0, "winding_to": 0, "clock": 0, "tap_side": 0, "tap_pos": 0, "tap_min": -12, "tap_max": 12, "tap_nom": 0, "tap_size": 500.0, "uk_min": 0.04, "uk_max": 0.06, "pk_min": 8000.0, "pk_max": 10000.0, "r_grounding_from": 0.0, "x_grounding_from": 0.0, "r_grounding_to": 0.0, "x_grounding_to": 0.0, "id_reference": {"table": "Special transformers", "key": {"Number": 2}}, "Name": "special_yd11"}
      ],
    "source":
      [
        {"id": 99, "node": 23, "status": 1, "u_ref": 1.0, "sk": 1e+15, "rx_ratio": 0.1, "z01_ratio": 3.0, "id_reference": {"table": "Sources", "key": {"Node.Number": 24, "Subnumber": 1}}, "Name": "source1"}
      ],
    "sym_gen":
      [
        {"id": 100, "node": 0, "status": 1, "type": 0, "p_specified": 500000.0, "q_specified": 164342.05258943158, "id_reference": {"table": "Synchronous generators", "key": {"Node.Number": 1, "Subnumber": 3}}, "Name": "syngen1"},
        {"id": 101, "node": 37, "status": 1, "type": 0, "p_specified": 1000000.0, "q_specified": 0.0, "id_reference": {"table": "Synchronous generators", "key": {"Node.Number": 38, "Subnumber": 2}}},
        {"id": 102, "node": 46, "status": 1, "type": 0, "p_specified": 500000.0, "q_specified": 0.0, "id_reference": {"table": "Synchronous generators", "key": {"Node.Number": 47, "Subnumber": 2}}},
        {"id": 103, "node": 18, "status": 1, "type": 0, "p_specified": 800000.0, "q_specified": 0.0, "id_reference": {"table": "Wind turbines", "key": {"Node.Number": 19, "Subnumber": 2}}, "Name": "wind1"},
        {"id": 128, "node": 12, "status": 1, "type": 0, "p_specified": 500000.0, "q_specified": 0.0, "id_reference": {"table": "Pvs", "key": {"Node.Number": 13, "Subnumber": 2}}, "Name": "pv1"}
      ],
    "sym_load":
      [
        {"id": 104, "node": 26, "status": 1, "type": 0, "p_specified": 1500000.0, "q_specified": 1000000.0, "id_reference": {"table": "Loads", "key": {"Node.Number": 26, "Subnumber": 1}}, "Name": "Load1"},
        {"id": 105, "node": 27, "status": 1, "type": 0, "p_specified": 800000.0, "q_specified": 0.0, "id_reference": {"table": "Loads", "key": {"Node.Number": 27, "Subnumber": 1}}},
        {"id": 106, "node": 28, "status": 1, "type": 0, "p_specified": 800000.0, "q_specified": 0.0, "id_reference": {"table": "Loads", "key": {"Node.Number": 28, "Subnumber": 1}}},
        {"id": 107, "node": 29, "status": 1, "type": 0, "p_specified": 100000.0, "q_specified": 0.0, "id_reference": {"table": "Loads", "key": {"Node.Number": 29, "Subnumber": 1}}},
        {"id": 108, "node": 30, "status": 1, "type": 0, "p_specified": 950000.0, "q_specified": 0.0, "id_reference": {"table": "Loads", "key": {"Node.Number": 31, "Subnumber": 1}}},
        {"id": 109, "node": 31, "status": 1, "type": 0, "p_specified": 950000.0, "q_specified": 0.0, "id_reference": {"table": "Loads", "key": {"Node.Number": 32, "Subnumber": 1}}},
        {"id": 110, "node": 32, "status": 1, "type": 0, "p_specified": 950000.0, "q_specified": 0.0, "id_reference": {"table": "Loads", "key": {"Node.Number": 33, "Subnumber": 1}}},
        {"id": 111, "node": 33, "status": 1, "type": 0, "p_specified": 1500000.0, "q_specified": 0.0, "id_reference": {"table": "Loads", "key": {"Node.Number": 34, "Subnumber": 1}}},
        {"id": 112, "node": 34, "status": 1, "type": 0, "p_specified": 950000.0, "q_specified": 0.0, "id_reference": {"table": "Loads", "key": {"Node.Number": 35, "Subnumber": 1}}},
        {"id": 113, "node": 35, "status": 1, "type": 0, "p_specified": 950000.0, "q_specified": 0.0, "id_reference": {"table": "Loads", "key": {"Node.Number": 36, "Subnumber": 1}}},
        {"id": 114, "node": 36, "status": 1, "type": 0, "p_specified": 100000.0, "q_specified": 0.0, "id_reference": {"table": "Loads", "key": {"Node.Number": 37, "Subnumber": 1}}},
        {"id": 115, "node": 37, "status": 1, "type": 0, "p_specified": 2450000.0, "q_specified": 0.0, "id_reference": {"table": "Loads", "key": {"Node.Number": 38, "Subnumber": 1}}},
        {"id": 116, "node": 38, "status": 1, "type": 0, "p_specified": 100000.0, "q_specified": 0.0, "id_reference": {"table": "Loads", "key": {"Node.Number": 39, "Subnumber": 1}}},
        {"id": 117, "node": 39, "status": 1, "type": 0, "p_specified": 950000.0, "q_specified": 0.0, "id_reference": {"table": "Loads", "key": {"Node.Number": 40, "Subnumber": 1}}},
        {"id": 118, "node": 40, "status": 1, "type": 0, "p_specified": 800000.0, "q_specified": 0.0, "id_reference": {"table": "Loads", "key": {"Node.Number": 41, "Subnumber": 1}}},
        {"id": 119, "node": 41, "status": 1, "type": 0, "p_specified": 100000.0, "q_specified": 0.0, "id_reference": {"table": "Loads", "key": {"Node.Number": 42, "Subnumber": 1}}},
        {"id": 120, "node": 42, "status": 1, "type": 0, "p_specified": 100000.0, "q_specified": 0.0, "id_reference": {"table": "Loads", "key": {"Node.Number": 43, "Subnumber": 1}}},
        {"id": 121, "node": 43, "status": 1, "type": 0, "p_specified": 100000.0, "q_specified": 0.0, "id_reference": {"table": "Loads", "key": {"Node.Number": 44, "Subnumber": 1}}},
        {"id": 122, "node": 44, "status": 1, "type": 0, "p_specified": 100000.0, "q_specified": 0.0, "id_reference": {"table": "Loads", "key": {"Node.Number": 45, "Subnumber": 1}}},
        {"id": 123, "node": 45, "status": 1, "type": 0, "p_specified": 100000.0, "q_specified": 0.0, "id_reference": {"table": "Loads", "key": {"Node.Number": 46, "Subnumber": 1}}},
        {"id": 124, "node": 46, "status": 1, "type": 0, "p_specified": 2450000.0, "q_specified": 0.0, "id_reference": {"table": "Loads", "key": {"Node.Number": 47, "Subnumber": 1}}}
      ],
    "shunt":
      [
        {"id": 125, "node": 0, "status": 1, "g1": 0.0, "b1": 0.0, "g0": 0.0, "b0": -0.14285714285714285, "id_reference": {"table": "Zigzag transformers", "key": {"Node.Number": 1, "Subnumber": 1}}, "Name": "zz1"},
        {"id": 126, "node": 0, "status": 1, "g1": 0.0, "b1": 0.018140589569160998, "g0": 0.0, "b0": 0.0, "id_reference": {"table": "Capacitors", "key": {"Node.Number": 1, "Subnumber": 2}}, "Name": "shunt1"},
        {"id": 127, "node": 20, "status": 1, "g1": 0.0, "b1": -0.00272108843537415, "g0": 0.0, "b0": 0.0, "id_reference": {"table": "Reactors", "key": {"Node.Number": 21, "Subnumber": 2}}, "Name": "rcoil1"}
      ]
  }
}
```
