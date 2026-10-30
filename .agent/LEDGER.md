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
| T15 | IEC-style symbols: transformer two-circle, generator ~, external grid, shunt | done | T14 | frontend/ (+ maybe shunt b1 in backend topology) | `make check && make e2e` |
| T16 | Disable scroll-wheel zoom in network diagrams (+/− and fit stay) | done | T15 | frontend/ | `make check && make e2e` |
| T17 | Smaller bus nodes (~9 px), scaled rings, keep click area | done | T16 | frontend/ | `make check && make e2e` |
| T18 | User-defined 4-point voltage colour scale (browser setting) | done | T17 | frontend/ | `make check && make e2e` |
| T19 | Time series limit lines always visible (axis includes limits) | done | T18 | frontend/ | `make check && make e2e` |
| T20 | Neutral (within-band) vs not-energised nodes distinct | done | T19 | frontend/ | `make check && make e2e` |
| T21 | GitHub Actions CI: make check + make e2e on PRs | in_progress | T20 | .github/, frontend/playwright.config.ts, Makefile, README | local CI=1 make check && make e2e; then first CI run on PR #6 green |
| T22 | project.md: self-contained rebuild spec for another agent | done | T21 | project.md | completeness cross-check (views, routes, e2e specs, editable fields) |
| T23 | Rewrite project.md as product/feature spec (what, not how) | done | T22 | project.md | every user-visible feature covered; tech-agnostic |
| T26 | Fix CI: pin astral-sh/setup-uv to v10.3.2 | done | T21 | .github/workflows/ci.yml | first real CI run green |
| T27 | CI fix: click fallback near crowded nodes + robust node-size e2e | done (CI green: run 40416566783) | T26 | frontend/ | make check && make e2e; CI run green |
| T28 | Expanded network view (overlay + true full screen), wheel zoom while expanded [sonnet] | done | T27 | frontend/ | make check && CI=1 make e2e |
| T29 | License under Apache-2.0: LICENSE, NOTICE, package metadata, README section [haiku] | done | – | LICENSE, NOTICE, backend/pyproject.toml, frontend/package.json(+lock), README.md | make check |
| T30 | Voltage colours from run limits: 5-stop ramp blue–teal–green(1.0)–yellow–red over u_min/u_max; remove per-browser scale override [sonnet] | done | – | frontend/, project.md | make check && CI=1 make e2e |
| T31 | Add equipment, phase 1: case `network_additions` (node, line, link, sym_load, sym_gen, shunt) + Add/Delete in the element table [opus] | done | – | backend/, frontend/, docs/api-contract.md, project.md | make check && CI=1 make e2e |
| T32 | Add equipment, phase 2: add on the diagram (edit mode: place node, draw line/link between nodes, attach appliance to node), stored diagram positions [opus] | done | T31 | frontend/ (+ addition position field) | make check && CI=1 make e2e |

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
- T15 approved by user; sub-agent started.
- T16 approved by user as a separate task; queued until T15 is committed.
- T15 done: make check (59 pytest — agent reported 60, actual 59 = 58+1; 76 vitest) + make e2e (15/15) verified; screenshots reviewed. Backend change: shunt b1 in topology (needs backend reload). T16 sub-agent started.
- T16 done: make check (59 pytest, 76 vitest) + make e2e (17/17) verified.
- T17 approved by user; sub-agent started.
- T17 done: make check (59 pytest, 76 vitest) + make e2e (19/19) verified; screenshots reviewed. Voltage band scale briefed, awaiting user choice (run limits vs fixed).
- T18 approved by user (browser-stored display setting); sub-agent started.
- T19 approved by user; queued until T18 is committed.
- T18 done: make check (59 pytest, 85 vitest) + make e2e (20/20) verified; screenshots reviewed. Noted: neutral near-white nodes look similar to hollow 'not energised' nodes in light mode. T19 sub-agent started.
- T19 done: make check (59 pytest, 94 vitest) + make e2e (21/21) verified. Neutral vs not-energised fix briefed, awaiting go-ahead.
- T20 approved by user; sub-agent started.
- T20 done: make check (59 pytest, 95 vitest) + make e2e (22/22) verified; screenshots reviewed. PV investigation: demo case applies PV in scale mode on loads (multiplies demand); PV-scale-on-loads warning offered, awaiting decision.
- Issue #5 raised (deferred): warn on PV scale mode on loads.
- PR #6 opened. T21 (CI) approved by user; sub-agent started.
- T21 committed + pushed to PR #6 after local verification (59 pytest, 95 vitest, 22/22 e2e). Awaiting first CI run. Known flaky: node-size.spec 'clear selection' click can hit an appliance.
- T22 (project.md) requested by user; sub-agent started.
- T22 interrupted by usage limit mid-read (backend done, frontend pending); resumed same agent from journal, told to write project.md section by section.
- T22 done: project.md (2,796 lines, 16 sections + appendix) reviewed; cross-check of routes/views/e2e/editable fields passed; orchestrator filled in exact PGM sample paths. Committed locally, not pushed.
- User: project.md misses the mark (describes how, not what). T23 rewrite started.
- T23 done: project.md rewritten as product spec (1,413 lines, 7 sections, 20 feature subsections with numbered requirements + acceptance criteria); reviewed, no stack/code leakage. Committed locally.

# Milestone 3: Planned work (stored 2026-10-26; nothing built until each item gets a brief and the user's go-ahead)

| id | task | status | deps | owns | done check |
|----|------|--------|------|------|------------|
| T24 | Pluggable data sources: network + profile sources behind interfaces (DB/lakehouse ready), source config, reference adapter | proposed | – | backend/ (networks/, profiles/, new sources/), frontend pickers | make check && make e2e + adapter conformance tests |
| T25 | Pluggable load-flow engine seam: engine interface at study level, PGM as the only implementation, conformance tests vs PGM | proposed (decision pending) | T24 | backend/ (engine/, studies/) | make check && make e2e + engine conformance suite |

## Planning notes
- T24/T25 assessment (2026-10-26): data sources = high value, extends existing NetworkSource pattern (profiles need a ProfileSource beside generators). Engine pluggability = costly: the internal model, editable fields, overrides, topology and results schema are all PGM-shaped, and PGM batch is the performance core. Recommended: build T24; for T25 add a thin seam + conformance tests only, second engine only on concrete need. project.md section 2 ("power-grid-model is the only solver") must change if T25 goes ahead.
- Open questions for tomorrow: which database/lakehouse (Databricks/Delta, Snowflake, Postgres/Timescale, other)? read-only or also write results back? which engine candidates and why (pandapower, OpenDSS, other)?

## CIM/CDPSM direction (proposed 2026-10-26; replaces the T24/T25 framing if confirmed; waiting for the user's technical document)
| id | task | status | deps | notes |
|----|------|--------|------|-------|
| C1 | Define the supported CIM subset (CDPSM-based profile): classes and attributes the app supports; mRID identity; units | proposed | user's CIM doc | decision record in docs/ |
| C2 | Canonical network model + storage keyed by mRID (one table per CIM class; lakehouse-friendly), with versioned datasets | proposed | C1 | supersedes T24's network half |
| C3 | CIM import/export (RDF/XML per CGMES/CDPSM, the target version per C1); convert bundled samples or use CIM sample feeders | proposed | C1, C2 | |
| C4 | Engine adapter interface + CIM→PGM adapter, plus a conformance suite vs today's PGM results | proposed | C2 | supersedes T25 |
| C5 | Profiles and time series keyed by mRID (external profile sources; CIM-aligned load groups where they fit) | proposed | C2 | supersedes T24's profile half |
| C6 | Results aligned to CIM State Variables (SvVoltage, SvPowerFlow, plus loading), columnar by mRID × timestep; SV export for a timestep | proposed | C4 | |
| C7 | Equipment overrides expressed against mRID + CIM attribute; export as a CIM difference model | proposed | C2 | |
| C8 | Diagram positions from the CIM DiagramLayout profile when present; auto-layout otherwise | proposed | C3 | |
| C9 | Frontend migration: string mRIDs, CIM class names and labels; project.md constraints updated | proposed | C2–C6 | |
- Assessment: CIM as the canonical semantic model plus interchange and storage format = yes. CIM as the in-memory compute or time-series format = no: an engine-native model is built per run, and time series are kept columnar.

# Milestone 4: Demonstration cases (started 2026-10-27)

| id | task | status | deps | owns | done check |
|----|------|--------|------|------|------------|
| D1 | Explore 2–3 demo-ready cases (Vision MV summer PV, Vision MV winter peak, IEEE 14 rated) with visible voltage/loading violations | done | – | scratchpad only (no app code, no user workspace) | each case runs with 0 failed timesteps and shows violations; results reported |
| D2 | Ship the chosen demo cases in the app (e.g. seeded demo cases) | done | D1 | backend workspace seed, tests | make check && make e2e |
- 2026-10-27: D1 requested by the user ("start now"); exploration sub-agent started. Shipping (D2) is gated on the user's go-ahead.
- D1 done: 3 cases verified headless by orchestrator (summer PV: u_max 1.060, load 115%, 120 V + 49 L episodes; winter peak: u_min 0.921, load 141%, 7 V + 78 L; IEEE14 N-1: load 151%, 48 L, 0 V); 0 failed timesteps. Case JSONs in scratchpad d1/. D2 brief pending go-ahead.
- D2 approved by user (keep existing summer-week demo); sub-agent started.
- D2 done: make check (69 pytest, 95 vitest) + make e2e (23/23) verified. Note: user's running make dev (--reload) seeded the 3 demos into the worktree workspace during the build (intended behaviour). CI fix (setup-uv tag) briefed, awaiting go-ahead.
- T26 approved by user (Auto-fix stays off); sub-agent started.
- T26 committed + pushed; first real CI run triggered.
- T26 done (setup passes; CI: make check green, e2e 22/23). T27 approved by user; sub-agent started.
- T27 done: root cause = Cytoscape stale container-offset cache after <main> scroll on slow CI (fixed via cache invalidation on pointerdown) + click fallback for non-selectable targets. make check (69 pytest, 95 vitest), CI=1 make e2e 24/24 verified. Pushed with README + model-choice commits.
- T28 approved by user (Sonnet); sub-agent started.
- CI run 40416566783 on df6c40a: SUCCESS (first fully green CI). T28 done: make check (69 pytest, 95 vitest) + CI=1 make e2e (28/28) verified; screenshots reviewed. Pushed.
- T29 (Apache-2.0 licence) approved by user; haiku sub-agent started.
- T29 done: LICENSE (verbatim apache.org text, body matches on-disk Playwright copy), NOTICE, pyproject license (wheel METADATA License-Expression: Apache-2.0), package.json license, README section. package-lock.json left unchanged (npm --package-lock-only added unrelated nested entries; reverted). make check (69 pytest, 95 vitest) verified.
- T30 approved by user (fixed 1.0 pu green, flat blue/red beyond limits); sonnet sub-agent started.
- T30 done: 5-stop voltage ramp from run limits, override removed. make check (69 pytest, 88 vitest) + CI=1 make e2e (28/28) verified by orchestrator; screenshots reviewed. Committed, not pushed.
- T31/T32 (add equipment: table, then diagram) requested by user with a standing go-ahead for both phases; T31 opus sub-agent started.
- T31 done: addable registry + additions apply/check, Add/Delete in element table, NetworkTopology.max_id. make check (88 pytest, 100 vitest) + CI=1 make e2e (29/29) verified by orchestrator; screenshots reviewed. Deferred issues #7 (transformers/sources/asym), #8 (delete file elements) filed. Committed, not pushed.
- T32 brief written; opus sub-agent started.
- T32 done: 'Add on diagram' edit mode (node/line/link/load/gen/shunt), editMode.ts state machine, placement.ts, deterministic layouts (seeded force, fixed tree box, origin-shifted) so stored positions match in snapshot; Modal consumes Esc. make check (88 pytest, 120 vitest) + CI=1 make e2e (31/31) verified by orchestrator; screenshots reviewed. Deferred: drag added node to update position. Committed, not pushed.
