# GridSim architecture

GridSim is a local web app for **time-series load flow studies** on top of
[power-grid-model](https://github.com/PowerGridModel/power-grid-model) (PGM).

Design principles:

1. **Deterministic runtime.** The app is a normal web app: forms, buttons,
   charts. There are no LLM calls at runtime.
2. **Built and extended with agentic coding.** The codebase is shaped so a
   coding agent (Claude Code) can add capabilities safely: explicit extension
   points (registries), typed contracts, one-command verification
   (`make check`), and recipes in `.claude/skills/`.
3. **Time series = PGM batch calculation.** The network is built once, and
   profiles become a PGM `update_data` batch (one scenario per timestep). We do
   not loop over timesteps in Python.

```
frontend/ (React + Vite + TS)                     backend/ (FastAPI + PGM)
┌──────────────────────────────┐   /api (JSON,    ┌──────────────────────────────────┐
│ Cases · Case editor          │   SSE progress)  │ api/        HTTP routes          │
│ Run monitor · Results        │ ───────────────► │ networks/   NETWORK SOURCES  (reg)│
│ results/views/   (registry)  │                  │ profiles/   PROFILE GENERATORS(reg)│
└──────────────────────────────┘                  │ studies/    STUDY TYPES      (reg)│
                                                  │ engine/     PGM adapter          │
                                                  │ workspace   file storage         │
                                                  │ runner      background jobs      │
                                                  └───────────────┬──────────────────┘
                                                                  ▼
                                   workspace/ cases/<id>/case.json
                                              runs/<id>/run.json, summary.json, *.parquet
                                              uploads/networks/*.json, uploads/profiles/*.csv
```

## Extension points

| Extension point     | Backend location                     | Frontend location               |
|---------------------|--------------------------------------|---------------------------------|
| Network source      | `backend/src/gridsim/networks/`      | (generic picker)                |
| Profile generator   | `backend/src/gridsim/profiles/`      | (form generated from JSON schema)|
| Study type          | `backend/src/gridsim/studies/`       | —                               |
| Result view         | (optional new results endpoint)      | `frontend/src/results/views/`   |

Each extension is a self-contained module that registers itself in a registry.
Adding a feature should mean adding a file plus a test, not editing core code.

**Network sources** sit behind one interface (`list_items`, `load`). Today they
are `sample` (networks bundled from the PGM repo test data) and `upload` (PGM
JSON files). A future `lakehouse` source will implement the same interface.

## Time-series model

- A case has a time window (`start`, `end`, `resolution_minutes`, all customisable).
  The timesteps are `start, start+res, …` with `end` excluded.
- **Profile assignments** map a profile generator to target appliances
  (`sym_load` / `sym_gen`). A generator produces a dimensionless multiplier
  series for each target element (it may vary per element, deterministic with a seed).
  - `mode: "scale"`: `p(t) = p_base * m(t)`, `q(t) = q_base * m(t)`.
  - `factor` (default 1) multiplies `m(t)` in both modes, for stress tests (e.g. 2× peak load).
  - `mode: "add"`: `p(t) += magnitude_w * m(t)` (negative magnitude means
    behind-the-meter generation, e.g. rooftop PV on a load).
  - Assignments apply in list order. Appliances without an assignment keep
    their base values.
- **Network overrides** (`case.network_overrides`) edit equipment parameters per case on top of the unchanged
  network file. The editable fields per component are a registry in `networks/editable.py`
  (`GET /api/networks/editable-fields`); `networks/overrides.py` validates them and writes them into a
  copy of the input arrays before `build_update`, so profiles scale the overridden base values.
- The engine runs `calculate_power_flow(update_data=batch,
  continue_on_batch_error=True)` in chunks, so it can report progress. Failed
  (non-converged) timesteps are recorded rather than aborting the run.

## Storage (file-based, for now)

`GRIDSIM_WORKSPACE` (default `<repo>/workspace`, gitignored):

- `cases/<case_id>/case.json`: the CaseStudy document.
- `runs/<run_id>/run.json`: run metadata/status.
- `runs/<run_id>/case.json`: frozen copy of the case at run time.
- `runs/<run_id>/node.parquet`, `branch.parquet`, `source.parquet`, `appliance.parquet`: long-format results.
- `runs/<run_id>/summary.json`: KPIs, per-element extremes, violations.

The storage layer is isolated in `workspace.py`, so a DB or lakehouse backend can replace it.
