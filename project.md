# GridSim: product and feature specification

This document describes **what** GridSim is and does, as a product requirements document. It is written so that a
team or coding agent with no other context can build the same product, with the same behaviour and user experience,
using its own technical choices. It does not prescribe a tech stack, code structure or internal interfaces; only the
few fixed constraints in section 2 are binding on the implementation.

Conventions:

- **Must** marks a binding requirement; **should** marks a strong recommendation.
- Text in `code style` is a user-visible label, message or value that should appear exactly as written (punctuation
  included, e.g. `…` is a single ellipsis character and `–` an en dash).
- Requirement ids (e.g. `CASE-3`) are for reference in tests and reviews.
- "pu" is per unit (voltage relative to the node's rated voltage; loading relative to the branch rating).

## Table of contents

1. Product overview
2. Fixed constraints
3. Concepts and glossary
4. Features
   - 4.1 Application shell
   - 4.2 Cases list
   - 4.3 Case editor (general)
   - 4.4 Network selection and upload
   - 4.5 Network explorer
   - 4.6 Equipment parameter editing
   - 4.7 Time and calculation settings
   - 4.8 Profiles
   - 4.9 Validation
   - 4.10 Running a case
   - 4.11 Runs list
   - 4.12 Results summary and KPIs
   - 4.13 Result view: Voltage envelope
   - 4.14 Result view: Element time series
   - 4.15 Result view: Loading heatmap
   - 4.16 Result view: Violations and extremes
   - 4.17 Result view: Network snapshot
   - 4.18 Network diagram: symbols, colours and status cues
   - 4.19 Charts and limit lines
   - 4.20 Formatting of numbers, units and times
5. Non-functional requirements
6. Data handled
7. Out of scope and future work

---

## 1. Product overview

### 1.1 What GridSim is

GridSim is a local web application for **time-series load flow studies** on electrical power networks. An engineer
picks a network, describes how loads and generation vary over a time window, optionally changes equipment
parameters for this study only, runs a power flow for every timestep, and explores the results in the browser:
headline KPIs, voltage spread, per-element time series, a loading heatmap, a list of limit violations and an
animated network diagram coloured by voltage and loading.

### 1.2 Who it is for

- **Distribution and transmission planning engineers** who want to know whether a network stays within voltage and
  thermal limits over a day, a week or a year, for example with more PV, EV charging or higher demand.
- **Students and researchers** who want a quick, visual way to run quasi-static time-series power flows on
  standard test networks without writing code.
- **Tool builders** who need a reference product that can later read networks from other sources (for example a
  database or lakehouse) and gain new profile types or result views.

Users are assumed to understand power-flow concepts (per unit, loading, P/Q, rated voltage); the app does not teach
them, but labels, units and hints must make every value unambiguous.

### 1.3 Core journey

1. **Define a case.** Create a case, choose a network (a bundled sample or an uploaded file), set the time window
   and resolution, assign load and generation profiles to network elements, set voltage and loading limits, and
   optionally edit equipment parameters (for example a load's P or a line's rated current) for this case only.
2. **Run.** Validate the case and start a run. The run takes a frozen copy of the case, computes a power flow for
   every timestep and reports progress live; it can be cancelled.
3. **Explore results.** See KPI tiles (min/max voltage, max loading, violation counts, energy import and losses,
   failed timesteps) and switch between five result views: voltage envelope, element time series, loading heatmap,
   violations and extremes, and the network snapshot with playback.

The user can then edit the case and run again; every run keeps its own frozen inputs and results, so earlier runs
stay valid and comparable.

### 1.4 First-run experience

On first start with an empty workspace the app must create one demo case so there is something to open and run
immediately (see `CASE-9`): **`Vision MV – summer week`**, one summer week (1 July 2026 00:00 to 8 July 2026 00:00 at
15 min, 672 timesteps) on the Vision MV sample network, with a residential load profile on all loads and a solar PV
profile on all generators. It must validate without errors or warnings.

---

## 2. Fixed constraints

These are the only implementation constraints. Everything else is open to the builder.

1. **Local web app.** GridSim runs on the user's own machine and is used through a web browser. It needs no
   internet connection, no account and no sign-in. A single user is assumed.
2. **power-grid-model is the only solver.** Power flow uses the open-source
   [power-grid-model](https://github.com/PowerGridModel/power-grid-model) (PGM) engine. There is no other solver and
   no hand-written power flow. Network files use PGM's JSON input format, and the calculation methods offered are
   the ones PGM provides.
3. **Deterministic, no AI at runtime.** The application is an ordinary deterministic tool: forms, buttons, tables
   and charts. It contains no AI or LLM features, no chat and no calls to model providers. The same case always
   produces the same results (every random profile is driven by a user-visible seed).
4. **Bundled sample networks.** Two networks ship with the app, both taken from PGM's validation test data and
   licensed MPL-2.0 (the attribution "Contributors to the Power Grid Model project" and the MPL-2.0 licence
   identifier must ship with them):
   - **Vision MV validation network**: a 10.5 kV medium-voltage network fed from a 110 kV source; 47 nodes,
     28 lines, 22 transformers, 2 links, 3 shunts, 1 source, 21 loads and 5 generators; voltage levels 110 kV,
     10.5 kV and 0.42 kV.
   - **IEEE 14-bus**: the classic 14-bus transmission test system modelled with 20 generic branches, 11 loads,
     4 generators held at set voltages by 4 voltage regulators, 1 shunt (a capacitor) and 1 source; all 14 nodes
     are rated 100 kV and unnamed in the file (the app names them `node 1` … `node 14`).
5. **Pluggable network sources.** Networks come from *sources*. The product must support at least two (bundled
   samples and user uploads) and must be structured so a further source, such as a database or lakehouse, can be
   added later without changing how cases, runs or the UI work. The network picker lists networks from all
   sources and identifies a network by its source plus a key.

---

## 3. Concepts and glossary

| Term | Meaning |
|------|---------|
| **Network** | An electrical network in PGM input form: nodes (buses), branches (lines, links, transformers, generic branches, three-winding transformers), appliances (loads, generators, shunts) and sources (connections to an external grid). Identified by *source* + *key* (e.g. sample `vision_mv`). Element ids are the integer ids from the file; element names come from the file's `Name` field, otherwise `<type> <id>` (e.g. `node 3`, `sym_gen 301`). Network files are never modified by the app. |
| **Network source** | Where networks come from: `sample` (bundled), `upload` (files the user uploaded) and, in future, other sources such as a database. |
| **Case study (case)** | A saved study definition: name, description, study type (time-series power flow), network, time window, calculation settings, limits, an ordered list of profile assignments, a list of equipment overrides and a list of added elements (section 4.6a). A case can be edited and run any number of times. |
| **Time window** | Start (inclusive), end (exclusive) and resolution in whole minutes (1 to 1440). Timesteps are start, start + resolution, … up to but not including end; a partial last interval still counts as a timestep, so the count is `ceil((end − start) / resolution)`. At most **100 000** timesteps per case. Times are local wall-clock times with no time zone; daylight-saving changes are ignored (every day has 24 h). |
| **Profile generator** | A built-in, deterministic function that produces a dimensionless multiplier series `m(t)` for a number of elements over the case timestamps (e.g. residential load, solar PV, EV charging, CSV). Each generator declares its own parameters, their types, defaults, ranges and help texts. |
| **Profile assignment** | One entry in a case's profile list: a generator with its parameter values, a target (a component type, `sym_load` or `sym_gen`, and either all of its elements or a chosen subset), a mode (scale or add), a scale factor and, in add mode, a magnitude. |
| **Scale mode** | `p(t) = p_base · factor · m(t)` and the same for `q(t)`: the element's base P and Q are multiplied by the profile. |
| **Add mode** | `p(t) += magnitude · factor · m(t)`: a power in W per element is added to active power only (Q unchanged). A negative magnitude models behind-the-meter generation (e.g. rooftop PV on a load). |
| **Factor** | A scale factor from 0 to 100 (default 1) that multiplies `m(t)` in both modes; used for stress tests (e.g. 2 = twice the peak). |
| **Assignment order** | Assignments apply in list order. Two scale assignments on the same element multiply; an add assignment adds on top of whatever was scaled before it. Elements without any assignment keep their base values at every timestep. Base values are the file values with the case's equipment overrides applied. |
| **Equipment override** | A per-case change of one editable parameter of one element (component type, element id, field, value in SI units), e.g. load 104's P = 3 MW. The network file stays unchanged; overrides are applied to a copy of the network before profiles. A value equal to the file value is not an override. |
| **File value / effective value** | The file value is what the network file says (possibly *not set*). The effective value is the file value with the case's overrides applied. |
| **Not set** | A parameter the network file leaves unspecified (e.g. IEEE 14 generic branches have no rated power). Shown as `—` / `not set`; a case may still override it. |
| **Limits** | Per-case thresholds used to flag violations: `u min` (default 0.95 pu), `u max` (default 1.05 pu) and `loading max` (default 1.0 = 100 % of rating). Limits only affect result classification, never the power flow itself. |
| **Run** | One execution of a case. A run freezes a **copy of the case** (including limits and overrides) at the moment it starts; later edits to the case never change an existing run or its results. A run has a status: `queued`, `running`, `succeeded`, `failed` or `cancelled`. |
| **Failed timestep** | A timestep whose power flow did not converge or was otherwise invalid. Failed timesteps have no values ("no value", shown as `—` or a gap in charts); they are counted but never abort the run. |
| **Loading** | Branch utilisation relative to its rating: `max(|S_from|, |S_to|) / S_rated` for branches rated in power, or the equivalent current-based ratio `max(|I_from|, |I_to|) / I_rated` for lines rated in current. 1.0 = 100 %. As computed by the engine; a branch without a rating reports 0 (see section 7). |
| **Violation episode** | A maximal run of consecutive timesteps during which one element is outside a limit of one kind: **undervoltage** (`u < u min`), **overvoltage** (`u > u max`) or **overloading** (`loading > loading max`). Comparisons are strict, so a value exactly at a limit is not a violation; a missing value never violates and ends an episode. An element can have several episodes. |
| **Extremes** | Per-element statistics over the whole run: for nodes min, mean and max voltage and the times of the min and max; for branches max and mean loading and the time of the max. |
| **Energised** | A node is energised when it is connected to an in-service source through in-service branches. Nodes cut off by switched-off branches or sources are **not energised** (islanded). Energisation is decided from the (effective) topology, not from result values. Not-energised nodes have zero voltage in the engine; they are excluded from voltage KPIs, extremes and violations. |
| **In service / out of service** | Elements carry a status. A branch is in service only when both its ends are switched on. Out-of-service elements carry no flow. |

---

## 4. Features

Each feature gives a user story, numbered requirements, defaults and edge cases, and acceptance criteria. Acceptance
criteria are written so they can be turned directly into automated end-to-end or unit tests.

### 4.1 Application shell

**User story.** As a user I want a consistent frame with navigation and a visible backend status, so I always know
where I am and whether the app can run studies.

Requirements:

- `SHELL-1` A left sidebar shows the product name `GridSim` with a lightning-bolt logo and two navigation entries,
  `Cases` (home) and `Runs`, with icons. On narrow screens the sidebar collapses to icons only. A footer line reads
  `Time-series load flow studies on power-grid-model.`
- `SHELL-2` A header shows `GridSim · time-series load flow` and a health indicator: `Connecting…` while the first
  check is pending; `Backend online · PGM <version>` with a green pulsing dot when the calculation service responds
  (tooltip `power-grid-model <version>`); `Backend offline` in red when it does not. The status is re-checked
  periodically (about every 15 s).
- `SHELL-3` Pages have a breadcrumb, a title, an optional subtitle and right-aligned actions.
- `SHELL-4` Unknown URLs show `Page not found` with a primary `Back to cases` link; unexpected errors show
  `Unexpected error` with the same link.
- `SHELL-5` Every page has a stable URL: cases list, new case, case editor (with the active tab in the URL), runs
  list, run page, run results (with the selected result view in the URL). Reloading or sharing a URL restores the
  same screen.
- `SHELL-6` Short confirmations and errors appear as toasts at the bottom right (at most 5 stacked; success and info
  about 3.5 s, errors about 7 s).
- `SHELL-7` Loading states show a spinner with a label (default `Loading…`); load errors show a message with a
  `Retry` action; empty lists show a titled empty state with guidance.

Acceptance criteria:

- Given the backend is running, when the app opens, then the header shows `Backend online` and the PGM version.
- Given the backend is stopped, when the next health check runs, then the header shows `Backend offline`.
- Given any page, when I navigate to `/does-not-exist`, then I see `Page not found` and `Back to cases` returns to
  the cases list.

### 4.2 Cases list

**User story.** As a user I want to see all my cases with their network, window and last run, so I can open,
create or delete them.

Requirements:

- `CASE-1` The home page is titled `Cases` with the subtitle `Study definitions: network, time window, profiles and
  limits.` and a primary `New case` action that opens a new, unsaved case in the editor.
- `CASE-2` Cases are listed in a sortable table, most recently updated first, with columns:
  - **Case**: the name as a link, with the description truncated below it;
  - **Network**: `<key> (<source>)`, e.g. `vision_mv (sample)`;
  - **Time window**: the start date and time, then `<duration> · <resolution> · <N> steps` (e.g.
    `7 d · 15 min · 672 steps`);
  - **Last run**: the status badge of the newest run plus its relative time, linking to that run; `Never run`
    otherwise;
  - **Updated**: relative time (`just now`, `5 min ago`, `3 h ago`, `2 d ago`, then a date);
  - a delete icon button (`Delete case`).
- `CASE-3` Clicking a row (outside its links and buttons) opens the case editor.
- `CASE-4` Deleting asks for confirmation: title `Delete case?`, text `<name> and all of its runs will be
  permanently deleted.`, buttons `Cancel` and `Delete` (danger style). On confirm the case and **all its runs and
  results** are deleted, the list refreshes and a toast says `Case deleted`. Runs still in progress are cancelled
  and removed when they stop.
- `CASE-5` States: while loading, a loading indicator; on error, `Could not load cases` with retry; with no cases,
  the empty state `No cases yet` / `Create a case to pick a network, define a time window and assign load /
  generation profiles.`
- `CASE-6` Case ids are short, readable slugs derived from the name on first save (`My Case!` → `my-case`); a
  clash adds a numeric suffix (`my-case-2`, `my-case-3`, …). The id never changes afterwards, even when the case is
  renamed.
- `CASE-7` The last-run badge shows the run's status as `Queued`, `Running <pct>%`, `Succeeded`, `Failed` or
  `Cancelled`; the list is refreshed when a run starts or finishes.
- `CASE-8` Cases persist across app restarts (section 5.2).
- `CASE-9` When the workspace has no cases at start-up, the demo case of section 1.4 is created.

Acceptance criteria:

- Given a fresh workspace, when I open the app, then the list shows exactly one case, `Vision MV – summer week`, with
  `Never run`.
- Given a case with two runs, when I look at the list, then **Last run** shows the newer run's status and links to
  it.
- Given the delete dialog for case X, when I press `Cancel`, then nothing is deleted; when I press `Delete`, then X
  and its runs disappear from the cases and runs lists and `Case deleted` is shown.
- Given two new cases both named `My Case!`, when both are saved, then their ids are `my-case` and `my-case-2`.

### 4.3 Case editor (general)

**User story.** As a user I want one editor for a case, organised in tabs, that tells me what is wrong before I
run and protects me from losing unsaved work.

Requirements:

- `EDIT-1` The editor has four tabs, kept in the URL: `Overview`, `Network`, `Time & calculation`, `Profiles`.
- `EDIT-2` A new case starts with: name `New case`; start today at 00:00, end 7 days later, resolution 15 min;
  calculation method Newton-Raphson, error tolerance 1e-8, max iterations 20; limits 0.95 / 1.05 / 1.0; no
  profiles; no overrides; the first available network selected.
- `EDIT-3` The header shows the case name (or `Untitled case` when empty) and a state badge: `Not saved` (never
  saved), `Unsaved changes` (differs from the saved version) or `Saved`. The subtitle reads
  `<network key> · <N> timesteps · <k> profile(s)`. The breadcrumb is `Cases / <id>` (or `new`).
- `EDIT-4` Actions: `Validate`, `Save` (disabled when there is nothing to save) and a primary `Run`, labelled
  `Save & run` when there are unsaved changes. Every action saves first when needed. After the first save of a new
  case the URL changes to the case's own address without losing the editor state or the current tab.
- `EDIT-5` Leaving the editor (navigating elsewhere in the app, closing or reloading the tab) with unsaved changes
  asks first: `Discard unsaved changes?` with `Discard changes` to leave anyway.
- `EDIT-6` The editor runs **local checks** continuously and lists them in an amber strip; each item is a button
  that opens the tab it belongs to, and tabs with issues show a dot. Local checks and their messages:
  - `Name is required.`
  - `Select a network.`
  - `Resolution must be an integer between 1 and 1440 minutes.`
  - `End must be after start.`
  - `Too many timesteps (N > 100,000).`
  - `u_min must be below u_max.`
  - `Profile #i: select a generator.`
  - `Profile #i: no target elements selected.`
  - `Profile #i: magnitude is required in add mode.`
- `EDIT-7` `Run` is disabled while there are local network or time-window issues (no network, bad resolution, end
  not after start, too many timesteps).
- `EDIT-8` The **Overview** tab has `Name` (required), `Description` (multi-line; placeholder
  `What question does this study answer?`), the read-only case id (`assigned on save` before the first save), the
  study type (`timeseries_powerflow`; the only study type) and the last-updated time.
- `EDIT-9` Toasts: `Case saved`; `Case is valid` with `N timesteps`; `Save failed`, `Validation failed` and
  `Could not start run` with the reason. Starting a run successfully navigates to the run page.

Acceptance criteria:

- Given a new case, when I change nothing, then the badge shows `Not saved`; after `Save` it shows `Saved` and the URL
  is `/cases/new-case` (or the slug of the name); after editing the name it shows `Unsaved changes` and the button
  reads `Save & run`.
- Given unsaved changes, when I click `Cases` in the sidebar, then `Discard unsaved changes?` appears and `Cancel`
  keeps me in the editor with my changes.
- Given an end time before the start, then the strip shows `End must be after start.`, clicking it opens
  `Time & calculation`, and `Run` is disabled.

### 4.4 Network selection and upload

**User story.** As a user I want to pick one of the bundled networks or upload my own PGM JSON file, and be told
clearly if the file is not usable.

Requirements:

- `NET-1` The `Network` tab has a `Network` card (description `Pick a bundled sample or upload a power-grid-model
  JSON input file.`) with a network picker listing every network from every source, samples first, each labelled
  `<name> · <source>`. Below it: the network's description and one count badge per component type present
  (e.g. `47 Node`, `28 Line`, `21 Sym load`).
- `NET-2` Bundled samples are listed with these names and descriptions:

  | Name | Description |
  |------|-------------|
  | `Vision MV validation network` | `Medium-voltage (10.5 kV) network fed from a 110 kV source with 47 nodes, cables, links, transformers, 21 loads and 5 generators (PGM validation case).` |
  | `IEEE 14-bus` | `Classic IEEE 14-bus transmission test system modelled with generic branches and voltage-regulated generators (PGM validation case).` |

- `NET-3` An `Upload PGM JSON` button accepts a `.json` file in PGM's JSON input format. On success the network is
  added to the list under the `upload` source (named after the file name without extension, description
  `Uploaded PGM JSON network`), a toast says `Network uploaded` with its name, and the case switches to it.
  Uploading the same content again must not create a confusing duplicate (the key is derived from the file name
  plus a content fingerprint).
- `NET-4` An uploaded file is validated before it is accepted; rejected files are not stored and a toast
  `Upload failed` gives the reason:

  | Problem | Message |
  |---------|---------|
  | Not UTF-8 text | `File is not UTF-8 encoded JSON` |
  | Not parseable as PGM JSON input | `Could not read PGM JSON input data: <parser message>` |
  | No node or no source | `Network must contain at least one node and one source` |
  | PGM input validation errors for a symmetric power flow | `Invalid network data: <first 10 errors joined by '; '>` plus ` (+N more)` when there are more |

- `NET-5` Element names are read from the file's `Name` fields where present and non-empty; otherwise the name is
  `<component> <id>` (e.g. `node 1`).
- `NET-6` Switching to another network removes the case's equipment overrides and added elements, because they refer
  to elements of the old network. When there are any, confirm first: title `Switch network?`, text `This case has N
  parameter override(s) [and M new element(s)] on the current network. Switching networks removes them.`, button
  `Switch and clear`. Cancel keeps the current network, overrides and additions.
- `NET-7` If a case refers to a network that no longer exists (e.g. a deleted upload), the picker shows
  `<key> · <source> (unavailable)` and validation reports the network error (section 4.9).
- `NET-8` Uploaded networks persist across restarts and are never modified by the app.
- `NET-9` Network loading errors show `Could not load networks` / `Could not load topology` with retry.

Acceptance criteria:

- Given the demo case, when I open `Network`, then the picker shows `Vision MV validation network · sample` and the
  badges include 47 nodes and 21 loads.
- Given a valid PGM JSON file `my_grid.json`, when I upload it, then `Network uploaded` appears, the picker shows
  `my_grid · upload` selected, and the explorer shows its topology.
- Given a file containing `{not json`, when I upload it, then `Upload failed` explains that the PGM JSON could not be
  read, and the network list is unchanged.
- Given a network file with a node whose rated voltage is −1, when I upload it, then the message starts with
  `Invalid network data`.
- Given a case with one override, when I pick another network and confirm `Switch and clear`, then the override
  count is 0; when I cancel instead, the network and override stay.

### 4.5 Network explorer

**User story.** As a user I want to see the network as a diagram with familiar electrical symbols next to a table
of all elements, select an element in either and see its details, without the page jumping around.

Layout: a `Topology` card (hint `Pan with drag, zoom with + / −; click an element for details. Edit parameters in
the table: changes apply to this case only, the network file stays unchanged.`) containing a toolbar, the diagram
(about 520 px tall) with a details panel (about 280 px wide) beside it, and the element table below.

Requirements, diagram:

- `EXP-1` The diagram draws nodes (buses) as small dots, branches as lines between them, sources and appliances as
  symbols connected to their node with short dotted stubs, using the symbols and colours of section 4.18.
- `EXP-2` Toolbar: `Layout` with `Auto`, `Radial tree (from source)` and `Force-directed`, and a `Show appliances`
  checkbox. `Auto` uses the radial tree when the network is radial-like (no more branches than nodes) and has a
  source, otherwise force-directed. `Show appliances` is on by default when the network has at most 400
  appliances.
- `EXP-3` The layout is computed once per network and layout choice. Edits, selection, status changes, theme
  changes and result colouring update the diagram in place; nodes never jump because of an edit.
- `EXP-4` **Zoom by buttons only.** Top-right buttons `Zoom in` (×1.25), `Zoom out` (×0.8), both around the centre,
  and `Fit` (`Fit to view`). The mouse wheel and touchpad scroll the page, never zoom the diagram; pinch zoom is
  disabled too. Dragging the background pans. Zoom is limited to a sensible range (about 0.05× to 6×).
- `EXP-5` Clicking a node, branch, transformer symbol, source or appliance selects it; clicking the empty
  background clears the selection. Small bus dots have a generous click target: a click within about 7 screen
  pixels of a dot's centre selects that node at any zoom level, even if it lands on a line. Clicking a transformer
  symbol selects the transformer branch. The selected element is highlighted with an accent halo.
- `EXP-6` Hovering an out-of-service element shows the tooltip `Out of service`; hovering a not-energised node
  shows `Not energised`.
- `EXP-7` A legend at the bottom-left lists what the diagram uses (section 4.18): voltage levels (up to 8, as
  `<kV> kV` dots), branch types present (`Line`, `Link`, `Generic branch`, `Asymmetric line`), symbols present
  (`Transformer`, `Generator`, `External grid`, `Capacitor` / `Reactor` / `Shunt`), `Changed` when there are edits,
  and `Out of service` / `Not energised` only when they occur.

Requirements, element table:

- `EXP-8` Tabs `Nodes (n)`, `Branches (n)`, `Appliances (n)` and `Sources (n)`. A tab with edited elements shows an
  amber badge with the number of changes in it.
- `EXP-9` A search box (`Search name or id…`) filters rows by name substring, exact id, type or the first info
  column. Columns are sortable.
- `EXP-10` Columns: `ID`, `Name`, `Type` (as a badge, for branches and appliances) and info columns: nodes
  `Rated voltage`; branches `From`, `To` (node names); appliances `Node`; sources `Node`. Then one column per
  editable parameter of the component types in that tab (section 4.6), headed `<label> (<unit>)`. Where a tab has
  no editable parameter the table shows read-only status/value columns instead (branches `Status`; appliances `P`,
  `Q`; sources `u_ref`).
- `EXP-11` The table scrolls inside its own box with a sticky header.

Requirements, details panel:

- `EXP-12` With nothing selected the panel reads `Click an element in the diagram or table to see its details.`
- `EXP-13` For a selected element the panel shows a kind badge, the name, a `Close details` button and rows:
  - node: `ID`, `Rated voltage`, `Connected branches`, `Sources`, and `Appliances (n)` as a clickable list (first
    20);
  - branch: `ID`, `From`, `To`, `Node 3` (three-winding only), `In service` (yes/no);
  - appliance: `ID`, `Node`, `P specified`, `Q specified`, `In service`;
  - source: `ID`, `Node`, `u_ref`.
  Values come from the **effective** network (overrides applied). An edited value is shown in amber with an
  `edited` chip whose tooltip is `File value: <x>` (or `File value: not set`). Neighbour links (nodes, appliances)
  select that element.
- `EXP-14` An `Edit in table` button (`Show in table` when the element has nothing editable) jumps to the element's
  table row (`EXP-16`).

Requirements, diagram ↔ table behaviour:

- `EXP-15` **Quiet select (diagram click).** Selecting in the diagram switches the table to the element's tab and
  highlights its row. If the row is visible under the current search and filters it is scrolled into view **inside
  the table box only**: the page itself must not scroll, there is no flash, no filter is changed and no note
  appears. If the filters hide the row, nothing else happens.
- `EXP-16` **Edit in table (explicit jump).** Switches to the element's tab; if the search or `Changed only` hides
  the row, clears them and shows a dismissable note `Filters cleared to show <name>`; scrolls the row into the
  viewport (smoothly unless the user prefers reduced motion); flashes the row once (about 1 s); and leaves the
  first editable input of the row ready to edit.
- `EXP-17` **Table row click.** Clicking a row (not one of its inputs) selects the element; if the diagram is at
  least partly visible on screen it animates (about 350 ms, instant with reduced motion) to centre the element,
  keeping the zoom unless it is below 0.6 (then zooming to about 1.2). If the diagram is off screen, it only
  selects. Clicking an input in another row does not change the selection.
- `EXP-18` The selected row shows a `Back to diagram` link that scrolls the diagram into view.
- `EXP-19` The diagram and the table are laid out from the network file; status cues, the legend status and the
  details panel reflect the effective network (overrides applied), so editing never re-lays out the diagram.

Acceptance criteria:

- Given the demo case's Network tab, then the diagram shows a canvas, the table has more than 5 rows and the picker
  value is the Vision MV sample.
- Given the diagram, when I click load `Load1`, then the details panel shows `Load1`, the `Appliances` tab is active,
  exactly one row (`Load1`) is highlighted and lies inside the table's visible area, the page scroll position is
  unchanged (±2 px), no note is shown and the row does not flash.
- Given `Changed only` is on and `Load1` is unchanged, when I click `Load1` in the diagram, then the filter stays
  on, the table shows 0 rows, there is no note and nothing scrolls; when I then press `Edit in table`, then
  `Changed only` is cleared, `Filters cleared to show Load1` appears, the row is in view and its P is editable.
- Given the `Branches` tab, when I click a branch row, then the diagram selects that branch and centres it (within
  5 px).
- Given the pointer over the diagram, when I scroll the wheel by 300 px, then the page scrolls and the diagram zoom is
  unchanged; `Zoom in` increases and `Zoom out` decreases the zoom.
- Given zoom 1 and 0.5, when I click 5 px off a bus dot's centre (away from neighbours), then that node is
  selected.

### 4.6 Equipment parameter editing

**User story.** As a user I want to change equipment parameters (a load's P, a line's rated current, a transformer
tap, switching a branch off) for this case only, directly in the table, and always see what I changed and what the
file says.

Requirements:

- `OVR-1` Editing happens **in the table cells** of the network explorer. Each change is stored as an override in
  the case (component, element id, parameter, value in SI units). The network file is never changed.
- `OVR-2` Editable parameters per component type, in this column order, with display units (values are stored in
  SI units and shown in the display unit):

  | Component | Parameter (column label) | Display unit | Kind | Allowed range |
  |-----------|--------------------------|--------------|------|---------------|
  | Symmetric load, symmetric generator | `P` | MW | number | any |
  | | `Q` | Mvar | number | any |
  | | `In service` | – | on/off | – |
  | Line | `R1` | Ω | number | ≥ 0 |
  | | `X1` | Ω | number | any |
  | | `C1` | µF | number | ≥ 0 |
  | | `Rated current` | A | number | ≥ 0 |
  | | `In service` | – | on/off (both ends) | – |
  | Transformer | `Rated power` | MVA | number | ≥ 0 (and > 0 for a valid network) |
  | | `Tap position` | – | whole number | the element's own tap range, from the lower to the higher of its two tap limits (checked at validation) |
  | | `In service` | – | on/off (both ends) | – |
  | Generic branch | `Rated power` | MVA | number | ≥ 0 |
  | | `R1` | Ω | number | any |
  | | `X1` | Ω | number | any |
  | | `In service` | – | on/off (both ends) | – |
  | Link | `In service` | – | on/off (both ends) | – |
  | Source | `U ref` | pu | number | ≥ 0 |

  Other components (nodes, shunts, three-winding transformers, asymmetric appliances, voltage regulators) have no
  editable parameters. The set of editable parameters must be easy to extend (a new parameter = a declared label,
  unit, kind and range; the table picks it up).
- `OVR-3` A branch's two end statuses are shown and edited as **one** `In service` switch that sets both ends; it
  counts as one change.
- `OVR-4` Number cells show the effective value in the display unit (no floating-point noise: 1.5e6 W shows as
  `1.5` MW and converts back exactly), with the unit as a suffix. Each input has an accessible name
  `<label> of <element name>`, e.g. `P of Load1`. The tooltip reads `File value: <value>` (or `File value: not set`).
- `OVR-5` A number edit is committed on Enter or when the cell loses focus; Escape cancels. A comma is accepted as a
  decimal separator. Invalid input shows an inline error and is not committed: `Enter a value`, `Not a number`,
  `Must be a whole number`, `Minimum is <value>`, `Maximum is <value>`. Enter keeps the error visible for
  correction; leaving the cell discards the invalid edit.
- `OVR-6` **Missing file values.** A parameter the file does not set is shown as an empty input with the
  placeholder `—`; it can be given a value like any other.
- `OVR-7` **Changed cues.** A changed cell has an amber background, amber border and text, a revert icon button
  (`Revert <label> of <name>`) and a small line below it: `was <file value with unit>` (`was not set` for a missing
  file value; `was on` / `was off` for switches). Changed elements are also marked in the diagram (section 4.18) and
  in the details panel (`edited` chip).
- `OVR-8` Setting a value equal to the file value (relative tolerance 1e-9) removes the override, so the cell is no
  longer marked as changed.
- `OVR-9` The table header shows `N change(s)` (amber when N > 0; one per changed cell), a `Changed only` filter
  (empty text `No changed elements in this tab`) and `Revert all` (disabled at 0). `Revert all` with more than 5
  changes asks `Revert all changes?` / `This removes all N parameter changes and restores the network file
  values.`; with 5 or fewer it reverts immediately.
- `OVR-10` Overrides take effect in the study: they are applied to the network before profiles, so scale-mode
  profiles scale the edited base values. The profile target list (section 4.8) and the details panel show edited
  values.
- `OVR-11` Overrides are part of study data: they are saved with the case, frozen into each run and shown on the
  results network snapshot.
- `OVR-12` Switching the case to another network clears all overrides (with confirmation; `NET-6`).
- `OVR-13` Overrides are validated (section 4.9); after applying them the network as a whole is re-validated, so
  e.g. a transformer rated power of 0, which passes the "≥ 0" check, is still reported as invalid.

Acceptance criteria:

- Given the demo case, when I set `P of Load1` from `1.5` to `3` and press Enter, then the cell is amber, shows
  `was 1.5 MW`, the header says `1 change`, the `Appliances` tab badge shows 1, the diagram marks one changed
  element and the badge says `Unsaved changes`; `Changed only` shows exactly one row.
- Given that change saved and run, then the run's frozen case contains exactly one override: load 104, P,
  3 000 000 W; and the run's load P is twice the unedited run's at every timestep.
- Given that change, when I press `Revert P of Load1`, then the cell shows `1.5`, the amber cues disappear and the
  header shows `0 changes`.
- Given IEEE 14, then `Rated power of generic_branch 101` is empty with placeholder `—`; when I enter `100`, then the
  cell is amber with `was not set` and tooltip `File value: not set`, and a run reports a non-zero loading for
  branch 101 equal to its apparent power flow divided by 100 MVA.
- Given IEEE 14, when I switch off `In service of generic_branch 102`, then it counts as one change, the branch is
  drawn as out of service, and in a run its flows are zero (|P| < 1 W at both ends).
- Given Vision MV transformer `trafo1` (tap range −12…12), when I enter a tap position of 20 and validate, then
  validation reports the error `Override transformer 'trafo1' (id 77) field 'tap_pos': value 20 is above the
  maximum 12` and the case cannot run.
- Given Vision MV line `R1` (rated current 360 A), when its rated current is set to 90 A, then its max loading in a
  run is exactly 4× that of the unedited run.

### 4.6a Adding equipment

**User story.** As a user I want to add new equipment (a node, a line or link, a load, generator or shunt) to the
network of this case only, from the element table, then edit, run and delete it like any other element, without
changing the network file.

Requirements:

- `ADD-1` New elements are stored in the case as **additions** (component, a new PGM id, name, attributes in SI
  units with node references as ids, optional diagram position). The network file is never changed. Additions are
  saved with the case, frozen into each run and applied before overrides and profiles.
- `ADD-2` Addable components: node, line, link, symmetric load, symmetric generator, shunt. Each table tab except
  `Sources` has a button: `Add node`, `Add branch` (type Line or Link) or `Add appliance` (type Load, Generator or
  Shunt). The set of addable components and their form fields is a declared registry (new component = one entry).
- `ADD-3` The add dialog (`Add node` / `Add branch` / `Add appliance`) shows a type selector when the tab offers more
  than one type, a name prefilled unique (`New node 1`, `New line 1`, `New load 1`, …), node selectors searchable by
  name or id (new nodes included), and the type's fields with display units and defaults:

  | Type | Fields (display unit, default) | Filled automatically |
  |------|--------------------------------|----------------------|
  | Node | Rated voltage (kV, the most common rated voltage of the network) | – |
  | Line | From node, To node, R1 (Ω, 0.206), X1 (Ω, 0.11), C1 (µF, 0.33), Rated current (A, 315) — a 1 km 10 kV XLPE 3x1x150 mm² Al cable | in service at both ends, tan δ 0 |
  | Link | From node, To node | in service at both ends |
  | Load, Generator | Node, P (MW, 0.1), Q (Mvar, 0) | in service, constant power |
  | Shunt | Node, G1 (µS, 0, optional), B1 (µS) | in service |

- `ADD-4` The dialog validates inline: `Enter a name`, `Select a node`, `Unknown node`, `Required`,
  `Must differ from the from node`, `Minimum is <value>`. The add button (`Add <type>`) appends the element with
  id = 1 + the largest id of the network file (all components) and of the case's additions.
- `ADD-5` Added elements appear in the table with a `New` badge, in the diagram (laid out automatically, marked as
  changed) and in the details panel. Each counts as one change in `N change(s)`, the tab badge and `Changed only`.
- `ADD-6` Added elements are edited in the same table cells as file elements; an edit changes the addition's own
  values (no override, no `was …` cue). Their profile targeting, effective values and results work like file
  elements, and results show them by name.
- `ADD-7` Only added elements have a delete button (`Delete <name>`), with confirmation `Delete <name>?`. Deleting an
  added node also deletes the new elements connected to it; the confirmation lists them (`Deleting this node also
  deletes the new elements connected to it: …`, button `Delete N elements`). Deleting removes overrides and profile
  target ids that referred to the deleted elements. File elements cannot be deleted (switch them out of service).
- `ADD-8` `Revert all` also removes all additions and always asks first when there are any. Switching networks
  removes additions together with overrides (`NET-6`).
- `ADD-9` Additions are validated (section 4.9, `VAL-4a`).

Acceptance criteria:

- Given a new case on Vision MV, when I add a node, then the dialog prefills `New node 1` and `10.5` kV, and the
  Nodes tab shows `New node 1` with a `New` badge; its id is 129.
- Given that node, when I add a line from `KNP 3` to `New node 1`, then R1 is prefilled `0.206` Ω; choosing the same
  node twice shows `Must differ from the from node`.
- Given a load of 2 MW on `New node 1`, then the header says `3 changes`, the diagram shows and marks the three new
  elements, and after saving and running, the run succeeds, the frozen case contains the three additions, the
  summary lists `New node 1` and the element time series offers `New load 1`.
- Given those additions, when I press `Delete New node 1`, then the confirmation lists `New line 1` and
  `New load 1`; when I delete only `New load 1` and save, then the case keeps two additions.

### 4.7 Time and calculation settings

**User story.** As a user I want to set the study window and resolution quickly with presets or precisely by hand,
see how many timesteps that gives, and choose solver options and limits.

Requirements, time window (card `Time window`, note `Timesteps run from start (inclusive) to end (exclusive).`):

- `TIME-1` `Start` and `End` are date-time inputs with minute precision. `End` shows `End must be after start` when
  it is not after the start.
- `TIME-2` `Quick duration` presets `1 day`, `1 week`, `1 month` (one calendar month) and `1 year` (one calendar
  year) keep the start and set the end accordingly.
- `TIME-3` `Resolution` presets `5 min`, `15 min`, `30 min`, `1 h` and `Custom`. Custom reveals a whole-minute
  input from 1 to 1440 (`min`); choosing Custom from a preset starts at 10 minutes.
- `TIME-4` A summary shows `Duration` (e.g. `7 d`, `36 h`, `45 min`) and `Timesteps` (the count from section 3,
  computed on wall-clock minutes so daylight-saving changes do not alter it). Above 100 000 the count is red with
  `At most 100,000 timesteps are allowed. Shorten the window or coarsen the resolution.`
- `TIME-5` The server enforces the same rules: end after start (`end must be after start`), resolution 1…1440 and at
  most 100 000 timesteps (`time window has <N> timesteps; the maximum is 100000`). Time-zone information in
  incoming times is dropped, never converted.

Requirements, calculation (card `Calculation`):

- `CALC-1` `Method`: `Newton-Raphson` (default), `Iterative current`, `Linear`, `Linear current` (PGM's power-flow
  methods).
- `CALC-2` `Error tolerance` (default 1e-8, must be > 0) and `Max iterations` (default 20, whole number 1…1000).
  Both are disabled for the linear methods with the hint `Not used by linear methods`.

Requirements, limits (card `Limits`, note `Thresholds used to flag violations in the results.`):

- `LIM-1` `u min` (pu, default 0.95), `u max` (pu, default 1.05) and `Loading max` (default 1.0, with the hint
  `<pct> % of rating`, e.g. `100 % of rating`).
- `LIM-2` `u min` must be below `u max` (`Must be below u max`; local check `u_min must be below u_max.`).
- `LIM-3` Limits change only how results are classified (KPI tones, violations, limit lines); they never change the
  power flow. Results always use the limits frozen into the run, not the case's current limits.

Acceptance criteria:

- Given Start `2026-07-01 00:00`, when I press `1 day` and `15 min`, then End is `2026-07-02 00:00` and Timesteps is
  96.
- Given a window of 1 h 50 min at 15 min, then Timesteps is 8 (partial last interval rounds up).
- Given a window spanning a daylight-saving change, then the timestep count equals the wall-clock minutes divided by
  the resolution.
- Given a year at 1 min, then Timesteps is red with the 100,000 message and `Run` is disabled; saving such a case is
  rejected by the server with the timestep message.
- Given method `Linear`, then `Error tolerance` and `Max iterations` are disabled.

### 4.8 Profiles

**User story.** As a user I want to describe how demand and generation vary over time by assigning ready-made
profile types (or my own CSV data) to all or some loads and generators, tune their parameters, and preview the
result before running.

#### 4.8.1 Assignment list

- `PROF-1` The `Profiles` tab explains: `Assignments apply in list order. Scale multiplies base p/q; Add adds
  magnitude × m(t). Appliances without an assignment keep their base values.` A primary `Add profile` button
  appends an assignment. With no assignments the tab shows `No profile assignments` / `Without profiles every
  timestep uses the base load / generation, so all timesteps are identical.`
- `PROF-2` A new assignment uses the `Residential load` generator (or the first available one) with its default
  parameters, label `Residential load`, target all symmetric loads, mode scale, factor 1, and a unique id.
- `PROF-3` Each assignment is a card with its position number, an editable label (`Assignment label`), a mode badge,
  a `<n> <component>` badge giving the number of targeted elements, and `Move up`, `Move down` and
  `Remove assignment` (confirm `Remove profile assignment?`). Order matters (`PROF-11`).

#### 4.8.2 Generator and parameters

- `PROF-4` `Generator` picker, with the generator's description as a hint. Choosing a generator resets its
  parameters to the generator's defaults and sets the mode to its default mode; it replaces the label if the label
  was empty, `New profile` or the previous generator's key (the new label is the generator's name); it keeps the
  target component if the generator allows it, otherwise switches to the first allowed component (and resets the
  selection). In add mode the magnitude defaults to −5000 W for PV-type generators and 5000 W otherwise.
- `PROF-5` **Schema-driven parameter forms.** Each generator declares its parameters as a machine-readable schema
  (name, type, title, description, default, minimum/maximum, allowed values, nullable). The editor renders the form
  from that declaration with no per-generator UI code: numbers and integers as number inputs, booleans as
  checkboxes, enumerations as pickers (values humanised: `_` → space, first letter capitalised), strings as text
  inputs, in declaration order, in a responsive grid of 1 to 3 columns. The hint under each field is its
  description plus the range (`Range <lo> … <hi>`, `≥ <lo>` or `≤ <hi>`). A required field without default is
  marked with an asterisk; clearing a number falls back to its default. A generator without parameters shows
  `This generator has no parameters.` Adding a generator with its schema must make it appear in the picker with a
  working form.
- `PROF-6` Inline field validation messages: `Required`, `Must be a number`, `Must be an integer`, `Must be ≥ <min>`,
  `Must be ≤ <max>`, `Must be > <x>`, `Must be < <x>`. The server re-validates parameters; an error reads
  `Invalid parameters for '<generator>': <parameter>: <reason>` (e.g. `Invalid parameters for 'pv': peak: Input
  should be greater than or equal to 0`).
- `PROF-7` Built-in generators. Every generator returns a multiplier `m(t)` per targeted element and timestep, is
  deterministic for a given seed and parameters, and (except CSV) gives values in about 0…2. "Per-element
  variation" means each element gets its own small random time shift and amplitude so elements do not move in
  lockstep.

  | Generator | Applies to | Default mode | Behaviour |
  |-----------|-----------|--------------|-----------|
  | `Constant` | loads, generators | scale | The same multiplier at every timestep (1.0 keeps base values). |
  | `Residential load` | loads | scale | Household demand: base level, a morning peak (about 07:30, later at weekends) and a larger evening peak (about 19:30), an extra midday bump at weekends; seasonal amplitude (higher in winter, peak ≈ 1 in winter); per-element time shift and amplitude; smooth noise. |
  | `Commercial load` | loads | scale | Office-type demand: a plateau of ≈ 1 between opening and closing hour on weekdays with smooth ramps, a low base level at night and a flat level all weekend; per-element variation and smooth noise. |
  | `Solar PV` | generators, loads | scale | Clear-sky output from the sun's elevation for the date and latitude (so sunrise and sunset follow the season), peaking at solar noon, reduced by cloudiness: a shared day-to-day cloud level plus per-element intra-day variability. Exactly 0 at night; never above `peak`. |
  | `EV charging` | loads | **add** | On/off (exactly 0 or 1) home charging sessions: a share of elements owns an EV; on each day an owner charges with some probability, arriving around a mean evening hour (normal spread) and charging for a random duration between a min and max; sessions may run past midnight. Intended for add mode with the charger power as magnitude. |
  | `CSV profile` | loads, generators | scale | Values from one column of an uploaded CSV, linearly interpolated to the case timestamps; the same series for all targeted elements. |

  Parameters (label, default, range):

  | Generator | Parameters |
  |-----------|------------|
  | Constant | `Value` 1.0 (`Multiplier applied at every timestep`) |
  | Residential load | `Random seed` 1; `Seasonal amplitude` 0.2 (0…1, `Winter/summer difference`); `Time shift (h)` 0.75 (0…6, `Std dev of per-element shift`); `Amplitude jitter` 0.1 (0…0.5); `Noise level` 0.05 (0…0.5) |
  | Commercial load | `Random seed` 1; `Opening hour` 8 (0…24); `Closing hour` 18 (0…24, must be after opening: `close_hour must be after open_hour`); `Base level (night)` 0.3 (0…1); `Weekend level` 0.35 (0…1); `Time shift (h)` 0.5 (0…6); `Amplitude jitter` 0.05 (0…0.5); `Noise level` 0.03 (0…0.5) |
  | Solar PV | `Random seed` 1; `Peak multiplier` 1.0 (≥ 0, `At clear-sky max`); `Latitude (°)` 52 (−66…66); `Cloudiness (0 = always clear)` 0.3 (0…1); `Solar noon (local clock hour)` 13.5 (10…15) |
  | EV charging | `Random seed` 1; `Share of elements with an EV` 0.3 (0…1); `Probability of charging per day` 0.8 (0…1); `Mean arrival hour` 18.5 (0…24); `Arrival std dev (h)` 1.5 (0…6); `Min charge duration (h)` 2 (> 0, ≤ 23); `Max charge duration (h)` 5 (> 0, ≤ 23; `duration_max_hours must be >= duration_min_hours`) |
  | CSV profile | `Uploaded file id`; `Column name`; `Repeat to cover window` on (`Tile the CSV period when it does not cover the case window`) |

  The PV sun geometry is the standard one: declination `δ = 23.44° · sin(2π (284 + day of year) / 365)`, hour angle
  `15° · (clock hour − solar noon)`, `cos z = sin φ sin δ + cos φ cos δ cos(hour angle)`; clear-sky output is
  `cos z` normalised by its yearly maximum at that latitude, clipped at 0 and shaped slightly (exponent 1.2). The
  results clock and slider (section 4.17) use the same geometry so "daylight" in the UI matches PV output.

#### 4.8.3 CSV profiles

- `PROF-8` For the CSV generator the parameter form is replaced by an upload box: `Upload CSV` (`.csv`), then the
  file summary `<filename> · <rows> rows · <start> – <end>`, or the hint `First column must be a timestamp; other
  columns are multiplier series.` before an upload. On upload a toast says `CSV uploaded` / `<filename>: <n>
  columns, <rows> rows`, the first value column is preselected and `Column name` becomes a picker of the file's
  columns.
- `PROF-9` CSV rules: the delimiter is detected automatically; the first column holds timestamps (time zones are
  dropped); other columns are parsed as numbers, non-numeric cells are ignored, columns with no numbers are dropped;
  rows are sorted by time and duplicate timestamps removed. Upload errors: `Could not parse CSV: <reason>`;
  `CSV needs a timestamp column plus at least one value column`; `First column must contain timestamps: <reason>`;
  `CSV has no numeric value columns`.
- `PROF-10` Interpolation and coverage: values are linearly interpolated to the case timestamps; the file's last
  value holds for one file step after its last timestamp. If the file does not cover the case window and `Repeat to
  cover window` is on, the file period is tiled (repeated) to cover it; if it is off, validation fails with
  `csv profile: file covers <first> – <last>, which does not cover the case window <start> – <end>`. Other errors:
  `csv profile: 'file_id' is required (upload a CSV first)`, `csv profile: column '<c>' not in file; available:
  <columns>`, `csv profile: column '<c>' has < 2 values`.

#### 4.8.4 Target, mode, factor

- `PROF-11` `Target component`: `Symmetric loads` or `Symmetric generators`, limited to what the generator applies
  to. Targets: `All <component> (<n>)` (default) or `Selected elements`; switching to selected preselects all, then
  a searchable checklist (`Filter…`, `All`, `None`, footer `N of M selected`) lists the component's elements by name.
- `PROF-12` **Edited values in the target list.** Each element in the checklist shows its current (effective) P as a
  hint. If P was edited the value is amber with an `edited` chip whose tooltip gives the file value (e.g.
  `File value: P 40 MW`; it also mentions `in service` / `out of service` when the status was edited). Out-of-service
  elements show a muted italic `out of service` but stay selectable.
- `PROF-13` `Mode`: `Scale` (hint `p(t) = p_base · factor · m(t)`) or `Add` (hint `p(t) += magnitude · factor ·
  m(t)`). In add mode a `Magnitude` (W) is required, with the hint `<power> per element at m = 1. Negative =
  behind-the-meter generation (e.g. rooftop PV).`
- `PROF-14` `Scale factor` (`×`, 0…100, default 1; hint `Multiplies the whole profile, e.g. 2 = twice the peak
  (stress test)`) multiplies `m(t)` in both modes. A factor of 2.5 must give exactly 2.5× the factor-1 power.
- `PROF-15` Application rules (the semantics the results depend on):
  1. Overrides are applied to the network first; their values are the base `p_base`, `q_base`.
  2. Assignments apply in list order to their targeted elements: scale multiplies both P and Q by
     `factor · m(t)`; add adds `magnitude · factor · m(t)` to P only.
  3. Elements without an assignment keep their base P and Q at every timestep.
  4. An assignment targeting a component the network does not have, or an empty selection, has no effect (with a
     warning, section 4.9).

#### 4.8.5 Preview

- `PROF-16` Each assignment shows a live preview chart `Preview (first 7 days)` of the generator's multiplier for 3
  sample elements (`Sample 1` … `Sample 3`) over the case window clipped to its first 7 days, y-axis `multiplier`,
  with the scale factor applied. The preview refreshes shortly (about 0.5 s) after parameters change; changing only
  the factor updates it instantly without recomputation. It shows a spinner while loading and `Preview failed` on
  error; for CSV it is disabled until a file and column are chosen.

Acceptance criteria:

- Given the demo case, then `Profiles` shows two assignments, `Household load` (Residential load on all 21 loads)
  and `Solar PV` (Solar PV on all 5 generators), both in scale mode.
- Given a new assignment, when I choose `EV charging`, then the mode switches to `Add` and `Magnitude` is 5000 W.
- Given `Solar PV` with peak 0.8 and cloudiness 0 on a summer day, then the preview is 0 at 01:00 and its maximum is
  above 0.7 and at most 0.8; the June 13:00 mean is more than twice the December 13:00 mean.
- Given `Residential load` with jitter, noise and shift 0 over a year, then its peak is within 0.95…1.05 and the
  mean at 19:00 and 07:00 exceeds the mean at 03:00.
- Given `Commercial load` with noise 0, then weekday noon is above 0.9 and weekend noon below 0.5.
- Given `EV charging` with share 0.25 over 200 elements, then all values are 0 or 1 and 10–40 % of elements charge at
  least once.
- Given PV with cloudiness 3, then the form shows a range error and the server reports `Invalid parameters for 'pv':
  cloudiness: …`.
- Given a CSV at 30 min with values 0, 1, … interpolated to 15 min, then the series reads 0, 0.5, 1.0, …; a one-day
  file over a two-day case repeats (step 24 h equals step 0) when `Repeat` is on and fails with `does not cover`
  when off; an unknown column fails with `column 'nope' not in file`.
- Given IEEE 14 with `P of sym_gen 301` edited from 40 to 25 MW, when I target `Selected elements` of symmetric
  generators, then 301 shows `25 MW` with an `edited` chip titled `File value: P 40 MW` and 302 shows no chip.
- Given the same seed and parameters, then two previews and two runs produce identical values; a different seed
  produces different values.

### 4.9 Validation

**User story.** As a user I want to check a case before running it and get clear, specific messages that tell me
which assignment, element or field is wrong, separated into blocking errors and advisory warnings.

Requirements:

- `VAL-1` Validation runs on demand (`Validate`) and automatically before every run. A run cannot start while there
  are errors; warnings never block.
- `VAL-2` The result panel shows either a green `Case is valid · N timesteps` or a red `<n> error(s)`, plus a
  warnings count badge, then the list of issues, each with an `error` or `warning` badge and its message, errors
  first. The panel can be dismissed.
- `VAL-3` Server-side checks, in order (messages exact; `<label>` is `Assignment '<label or id>'`):

  | Check | Level | Message |
  |-------|-------|---------|
  | Unknown study type | error | `Unknown study type '<t>'` |
  | Network cannot be loaded | error | `Network: <reason>` (e.g. `Network: Unknown sample network 'x'`) |
  | Override checks (below) | error | see `VAL-4` |
  | No profile assignments | warning | `No profile assignments: every timestep uses the base network values` |
  | Very large study (timesteps × elements > 50 million) | warning | `Large run: <T> timesteps x <E> elements may take a while` |
  | Duplicate assignment id | error | `<label>: duplicate assignment id '<id>'` |
  | Unknown generator | error | `<label>: unknown profile generator '<g>'` |
  | Target component not intended for the generator | warning | `<label>: generator '<key>' is intended for <components>` |
  | Network has no elements of the target component | warning | `<label>: network has no <component> elements; assignment has no effect` |
  | Empty selection | warning | `<label>: empty target id list; assignment has no effect` |
  | Selected ids not in network | error | `<label>: <component> ids not in network: [<first 10 ids>]` |
  | Add mode without magnitude | error | `<label>: mode 'add' requires magnitude_w (W)` |
  | Generator fails on the case window (invalid parameters, CSV coverage, …) | error | `<label>: <reason>` |

- `VAL-4` Override checks, each an error, with `<label>` = `Override <component> '<name>' (id <id>) field '<field>'`:

  | Check | Message |
  |-------|---------|
  | Same element and field overridden twice | `<label>: duplicate override` |
  | Component has no editable parameters | `Override on unknown or non-editable component '<c>' (id <id>)` |
  | Element id not in the network | `Override <c> id <id>: element not in network` |
  | Field not editable for the component | `<label>: field is not editable` |
  | Not a finite number | `<label>: value must be a finite number` |
  | On/off value other than 0/1 | `<label>: value must be 0 or 1` |
  | Whole-number field with a fraction | `<label>: value must be an integer` |
  | Below / above the allowed range | `<label>: value <v> is below the minimum <lo>` / `<label>: value <v> is above the maximum <hi>` |
  | The network with all overrides applied fails PGM's input validation | `After overrides: <PGM error> (<up to 5 element names>)` |

- `VAL-4a` Addition checks, with `<label>` = `New <component> '<name>' (id <id>)`; all errors except the last row:

  | Check | Message |
  |-------|---------|
  | Same id twice among the additions | `<label>: duplicate id among the new elements` |
  | Id used by an element of the network file | `<label>: id is already used by '<name>' in the network` |
  | Attribute not offered for the component | `<label>: unknown attribute '<a>'` |
  | Not a finite number | `<label>: '<a>' must be a finite number` |
  | Required attribute missing | `<label>: missing required attribute '<a>' (<label>)` |
  | Node reference to neither a file node nor an added node | `<label>: <field> <id> is not a node of the network` |
  | Line or link with the same node at both ends | `<label>: from node and to node must differ` |
  | Below / above the allowed range, status other than 0/1 | `<label>: '<a>' <v> is below the minimum <lo>` / … / `<label>: 'status' must be 0 or 1` |
  | The network with all additions fails PGM's input validation | `After additions: <PGM error> (<up to 5 element names>)` |
  | Link between nodes of different rated voltage (warning) | `<label>: connects nodes of different rated voltage (<u1> kV and <u2> kV)` |

  Additions are checked first; when one has an error, the override and assignment checks are skipped (they would
  only repeat it). Overrides and assignments may refer to added elements.
  The assignment checks see the network with additions and overrides applied.
- `VAL-5` Saving a case whose time window is invalid is rejected with the server's message (e.g. `end must be after
  start`), shown in the validation panel, not only as a toast.
- `VAL-6` Starting a run of an invalid case is rejected with `Case is invalid: <errors joined by '; '>`; the editor
  shows the returned issues in the panel and toasts `Case is not valid` / `Fix the issues listed above and try
  again.`
- `VAL-7` Client-side local checks (section 4.3, `EDIT-6`) give immediate feedback without a server round trip; the
  server checks remain authoritative.

Acceptance criteria:

- Given the demo case, when I validate, then the result is valid with 672 timesteps and no issues at all.
- Given an end before the start, when I press `Validate`, then the panel is not OK, shows the server message, and
  the badge stays `Not saved` for a new case.
- Given an assignment with an unknown generator, then validation lists an error and starting a run is rejected with
  the issues listed.
- Given an assignment in add mode with an empty magnitude, then the local check `Profile #1: magnitude is required in
  add mode.` appears and the server error mentions `magnitude_w`.
- Given an override on an element id that does not exist, then starting a run is rejected with a message containing
  `element not in network`.
- Given a transformer rated power override of 0, then validation reports an `After overrides:` error that mentions
  the rated power field.

### 4.10 Running a case

**User story.** As a user I want to start a run, watch its progress, cancel it if needed, and know that its results
belong to exactly the inputs I ran.

Requirements:

- `RUN-1` `Run` (or `Save & run`) saves the case if needed, validates it and starts a run, then opens the run page.
  The run gets a unique, time-ordered id (e.g. `r-20261026-113000-ab12`).
- `RUN-2` **Frozen copy.** At start the run stores a complete copy of the case (network reference, window,
  calculation settings, limits, profiles and overrides). Results, limit lines, KPI tones and the results diagram
  always use this frozen copy. Editing or deleting overrides in the live case afterwards changes nothing in the run.
- `RUN-3` The whole time series is one batch calculation on the engine: the network is built once and every
  timestep is a scenario of the batch. It is processed in chunks only to report progress and allow cancellation.
- `RUN-4` The run page header shows breadcrumb `Runs / <id>`, the case name as title with a status badge
  (`Queued`, `Running <pct>%` with a spinning icon, `Succeeded`, `Failed`, `Cancelled`; tones neutral, accent, good,
  bad, warn), subtitle `Started <time> · <N> timesteps · <elapsed>`, and actions `Edit case` and, while active,
  `Cancel run` (danger style; toast `Cancellation requested`).
- `RUN-5` A progress card shows the current message (`Queued`, `Starting`, `Generating profiles`,
  `Timestep <k>/<N>`, `Computing summary`, `Completed <N> timesteps`, or `Waiting to start…`), the percentage, a
  progress bar (animated while running, coloured by status), and stats `Created`, `Finished`, `Elapsed` (ticking
  while running) and `Failed timesteps` (red when > 0). Progress never goes backwards. Errors are shown in a red box.
- `RUN-6` Progress updates are pushed live to the page (indicator `live`, tooltip `Live updates via server-sent
  events` or equivalent); if live updates are unavailable the page falls back to polling about once a second
  (indicator `polling`).
- `RUN-7` **Cancel.** Cancelling stops the run at the next chunk boundary (or immediately when still queued); its
  status becomes `Cancelled` and it has no results. Cancelling a finished run changes nothing.
- `RUN-8` **Failed timesteps.** Non-converging timesteps are recorded with no values and counted; the run still
  succeeds. Any other error fails the run with status `Failed` and the error text.
- `RUN-9` After success the page shows a `Results` heading and the results (section 4.12 onward). Failed and
  cancelled runs show `No results: this run failed.` / `No results: this run was cancelled.`
- `RUN-10` Runs execute one at a time in the background; further runs queue. The UI stays responsive while a run is
  active, and a run continues if the user navigates away.
- `RUN-11` If the app is stopped while a run is active, on the next start that run is marked `Failed` with the error
  `interrupted`.
- `RUN-12` Performance: a 1-year run at 15 min (35 040 timesteps) on Vision MV must complete in a few seconds on a
  typical laptop (reference: about 1.3 s for the calculation) and must stay well under a minute.

Acceptance criteria:

- Given a new 1-day, 15-min case on Vision MV with residential load on all loads and PV on all generators, when I
  press `Run`, then I land on the run page and the status reaches `Succeeded` within 30 s with 96 timesteps.
- Given a long run (several months at 5 min), when I press `Cancel run`, then the status becomes `Cancelled` and no
  results are offered.
- Given a succeeded run, when I edit the case's limits and overrides, then the run's results, KPI tones and limit
  lines are unchanged.
- Given a run in which load P is multiplied by 10⁶ at one timestep, then exactly that timestep is failed, has no
  values, and the run still succeeds with `Failed timesteps` = 1.

### 4.11 Runs list

**User story.** As a user I want one list of all runs so I can open results, watch active runs and clean up old
ones.

Requirements:

- `RUNS-1` The `Runs` page (`All simulation runs, newest first.`) lists every run with columns **Run** (id link),
  **Case** (link to the case), **Status** (badge; a progress bar while running), **Timesteps**, **Failed steps**
  (red when > 0), **Created**, **Duration**, and actions `Results` (succeeded runs only, opens the results) and
  `Delete run`.
- `RUNS-2` Clicking a row opens the run page. The list refreshes automatically (about every 2 s) while any run is
  active.
- `RUNS-3` `Delete run` is disabled while the run is queued or running. Deleting asks `Delete run?` / `Run <id> and
  its results will be permanently deleted.`; on confirm the run and its results are removed and a toast says
  `Run deleted`. (The server rejects deleting an active run with `Run '<id>' is running; cancel it first`.)
- `RUNS-4` Empty state: `No runs yet` / `Open a case and press Run to start a time-series load flow.` with a
  `Go to cases` link.

Acceptance criteria:

- Given two older succeeded runs and a newly started run, then the new run is on top with a moving progress bar,
  its delete action is disabled, and it changes to `Succeeded` without a reload.
- Given a succeeded run, when I press `Results`, then the run's results page opens.

### 4.12 Results summary and KPIs

**User story.** As a user I want the headline answers at a glance (did voltages and loadings stay within limits,
how much energy came in and was lost) before I dig into details.

Results are available only for succeeded runs. They are computed from the run's frozen case.

Requirements:

- `KPI-1` Eight KPI tiles, laid out in 2, 4 or 8 columns depending on width:

  | Tile | Value | Sub line | Tone |
  |------|-------|----------|------|
  | `Min voltage` | lowest node voltage over all energised nodes and timesteps, `0.973 pu` | `limit <u min>` (e.g. `limit 0.95`) | bad if below `u min`, else good |
  | `Max voltage` | highest node voltage, `1.042 pu` | `limit <u max>` | bad if above `u max`, else good |
  | `Max loading` | highest branch loading over all branches and timesteps, `83.0 %` | `limit <loading max>` (e.g. `limit 100 %`) | bad if above `loading max`, else good |
  | `Voltage violations` | number of undervoltage + overvoltage episodes | `episodes`, or `none` when 0 | bad if > 0 |
  | `Loading violations` | number of overloading episodes | `episodes` / `none` | bad if > 0 |
  | `Energy import` | energy drawn from the source(s), MWh or GWh | – | – |
  | `Energy losses` | energy lost in all branches, MWh or GWh | `<x.xx> % of import` | – |
  | `Failed timesteps` | number of failed timesteps | `of <N>` | bad if > 0 |

- `KPI-2` Definitions (Δt = resolution in hours; sums skip failed timesteps):
  - Voltage KPIs consider only energised nodes (a node with zero voltage is treated as not energised and ignored).
  - `Energy import = Σ_t (Σ sources P(t)) · Δt`, in MWh. Export (negative source power) reduces it.
  - `Energy losses = Σ_t (Σ branches (P_from(t) + P_to(t)), including the third winding of three-winding
    transformers) · Δt`, in MWh.
  - Violation counts are totals of episodes (section 3), never truncated.
- `KPI-3` A KPI without any value (e.g. every timestep failed) shows `—`.
- `KPI-4` Below the tiles a tab strip offers the five result views in this order, with the selected view kept in
  the URL (default the first) and a one-line description of the selected view:

  | View | Description |
  |------|-------------|
  | `Voltage envelope` | `Spread of node voltages (min / p05 / mean / p95 / max) over time, against the case limits.` |
  | `Element time series` | `Plot any result field for selected nodes, branches, sources or appliances.` |
  | `Loading heatmap` | `Branch loading per element and time bucket, worst branches first.` |
  | `Violations` | `Limit violation episodes and per-element extremes.` |
  | `Network snapshot` | `The network coloured by voltage and loading at one timestep, with playback.` |

  New result views must be addable without changing the others (a view = title, description and content).
- `KPI-5` Loading and error states: `Loading results…` and `Could not load results`.

Acceptance criteria:

- Given a succeeded 1-day demo-network run, then there are at least 8 KPI values, each containing a digit, and every
  result tab shows a chart or a table with rows.
- Given limits 0.99 / 1.03 / 0.3 on Vision MV, then violation counts are non-zero and the related tiles are red.
- Given any run, then `0 ≤ Energy losses ≤ Energy import` for a network that only imports, and the losses sub line
  equals losses / import in percent with 2 decimals.

### 4.13 Result view: Voltage envelope

**User story.** As a user I want to see how the spread of all node voltages moves over time relative to my limits.

Requirements:

- `ENV-1` For every timestep, over all nodes: min, 5th percentile (p05), mean, 95th percentile (p95) and max of the
  node voltage in pu (missing values ignored). Invariant: `min ≤ p05 ≤ p95 ≤ max`.
- `ENV-2` Drawn as two shaded bands in one colour, `min – max` (light) and `p05 – p95` (darker), and a solid `mean`
  line. The tooltip lists max, p95, mean, p05 and min at the hovered time.
- `ENV-3` The case's voltage limits are drawn as dashed red horizontal lines labelled `u_min 0.95` and `u_max 1.05`
  (section 4.19), and the y-axis (`u [pu]`, 3-decimal labels) always includes both limits.
- `ENV-4` The time axis can be zoomed and panned (inside the chart and with a slider below it).

Acceptance criteria:

- Given limits 0.90 / 1.10 and voltages within 0.95…1.05, then both limit lines are visible strictly inside the
  plotted area, labelled `u_min 0.90` and `u_max 1.10`.

### 4.14 Result view: Element time series

**User story.** As a user I want to plot any result quantity for the elements I choose.

Requirements:

- `TS-1` Controls: `Component` (`Nodes`, `Branches`, `Sources`, `Appliances`; switching resets the field), `Field`
  (`<label> · <field>`) and `Elements` (searchable multi-select). Fields and units per component:

  | Component | Fields (unit) |
  |-----------|---------------|
  | Nodes | Voltage `u_pu` (pu), Voltage `u` (V), Voltage angle `u_angle` (rad, shown in degrees), Active power `p` (W), Reactive power `q` (var) |
  | Branches | Loading `loading` (pu, shown in %), `P (from side)`, `Q (from side)`, `I (from side)`, `S (from side)`, `P (to side)`, `Q (to side)`, `I (to side)` (W, var, A, VA) |
  | Sources | Active power `p` (W), Reactive power `q` (var), Current `i` (A) |
  | Appliances (loads, generators, shunts) | Active power `p` (W), Reactive power `q` (var), Current `i` (A) |

  Three-winding transformers report winding 1 as "from" and winding 2 as "to".
- `TS-2` Element hints in the picker: nodes `<u min>–<u max>` over the run, branches their max loading, appliances
  their type.
- `TS-3` Default selection: the worst 5 (nodes by largest deviation |1 − u| at their min or max, branches by max
  loading; otherwise the first 5), hinted `Default: worst 5 from the summary`.
- `TS-4` One line per element with a scrollable legend; the tooltip formats values in the field's unit (loading as
  `x.x %`); the y-axis is named `<Field label> [<unit>]`. Failed timesteps are gaps, not interpolated.
- `TS-5` Node voltage (`u_pu`) shows the voltage limit lines and branch loading shows the loading limit line
  (`limit 100%`), always within the visible y-range.
- `TS-6` With no elements selected: `Select one or more elements to plot.`

Acceptance criteria:

- Given a Vision MV run, when I open the view, then it plots 5 node voltage series by default.
- Given `Branches` / `Loading`, then the y-axis shows percent and the `limit 100%` line is visible.

### 4.15 Result view: Loading heatmap

**User story.** As a user I want to see which branches are heavily loaded and when, across a long run, in one
picture.

Requirements:

- `HEAT-1` Rows are branches, columns are time buckets. For long runs timesteps are grouped into at most 500
  roughly equal buckets (fewer when there are fewer timesteps); each cell shows the **maximum** loading of that
  branch within the bucket (missing values ignored). Column labels are bucket start times.
- `HEAT-2` Branches are ordered by peak loading over the run, highest first, with the worst branch at the top;
  branches with no value at all come last.
- `HEAT-3` `Top 25` (default), `Top 50` or `All` branches; caption `<n> branches · <k> time buckets (max per bucket)
  · sorted by peak loading`.
- `HEAT-4` Colour scale from 0 to 120 % with labels in percent: a pale neutral (light blue-grey) at 0, through light
  and mid blue, to amber near the limit and red at and beyond 120 %. The tooltip reads `<name>`, `<time>`,
  `max loading <x.x %>`. The time axis can be zoomed.
- `HEAT-5` A network without branches shows `No branches in this network`.

Acceptance criteria:

- Given a 1-day hourly run on Vision MV with up to 6 buckets requested, then the heatmap has 6 buckets × 52
  branches and the row peaks are in descending order.

### 4.16 Result view: Violations and extremes

**User story.** As a user I want a list of every limit violation with its start, end, duration and worst value, and
per-element extremes, so I can find problem elements and inspect them.

**Violations vs extremes.** *Violation episodes* are events: they exist only when a limit was crossed, one row per
contiguous period per element and kind, and depend on the run's limits. *Extremes* are statistics: one row per
element (every node, every branch) with its min/mean/max over the whole run and when they occurred, whether or not
any limit was crossed. A network with no violations still has a full extremes table.

Requirements:

- `VIOL-1` Sub-tabs `Violation episodes (n)` (selected by default when there are any), `Node extremes (n)` and
  `Branch extremes (n)`, with the hint `Click a row to plot that element over time.`
- `VIOL-2` Episodes table: `Element`, `Type`, `Kind` (badge: `undervoltage` red, `overvoltage` amber, `overloading`
  red), `Start`, `End` (the **last** violating timestep, inclusive), `Steps` (number of timesteps; default sort
  descending), `Worst` (in red: the lowest voltage for undervoltage, the highest voltage or loading otherwise) and
  `Limit`. Empty: `No violations` / `All voltages and loadings stayed within the case limits.`
- `VIOL-3` At most 5000 episodes are listed (sorted by start, then component, then id); the KPI counts are totals.
- `VIOL-4` Node extremes: `Node`, `u min` (red below the limit; default sort ascending), `at`, `u mean`, `u max` (red
  above the limit), `at`. Branch extremes: `Branch`, `Type`, `Max loading` (red above the limit; default sort
  descending), `at`, `Mean loading`. Not-energised nodes and failed timesteps are ignored; an element without values
  shows `—`.
- `VIOL-5` Clicking a row opens a large dialog `<name> · voltage` or `<name> · loading` with that element's time
  series and the relevant limit lines, always visible.

Acceptance criteria:

- Given a mask of violations over time for one element `0,1,1,0,1` (timesteps 0…4), then there are 2 episodes:
  steps 1–2 (2 steps) and step 4 (1 step), each with its own worst value.
- Given a node exactly at `u min` for the whole run, then it has no undervoltage episode.
- Given limits 0.90 / 1.10, when I open the first node-extremes row, then the dialog chart's y-range extends below
  0.9 and above 1.1 and shows lines labelled `u_min 0.90` and `u_max 1.10`.

### 4.17 Result view: Network snapshot

**User story.** As a user I want to see the network diagram coloured by voltage and loading at any timestep, play
the run as an animation, know what time of day and whether it is daylight, and inspect any element's value.

Layout: a toolbar row; below it the diagram (about 540 px tall; appliances hidden) with a details panel (about
260 px) beside it. The diagram uses the same layout, symbols and status cues as the editor's explorer (section
4.18), laid out from the network file, with statuses and changed markers from the run's frozen case.

#### 4.17.1 Timestep, playback and speed

- `SNAP-1` Toolbar: `Play`/`Pause`, `Previous timestep`, `Next timestep`, a timestep slider (accessible name
  `Timestep`, keyboard operable), the timestamp and `step <t+1> / <N>` (a small spinner while the frame loads), and
  a speed selector.
- `SNAP-2` The initial timestep is the time of the lowest node voltage in the run (the worst undervoltage moment),
  or the first timestep when unknown.
- `SNAP-3` Speeds `1×`, `2×`, `4×`, `8×`, `16×`; `2×` is the default. 1× advances one timestep every 600 ms and each
  step up halves the interval (600, 300, 150, 75, 37.5 ms). Playback wraps from the last to the first timestep.
- `SNAP-4` **No skipped frames.** Playback advances only when the current timestep's data is shown: each frame is
  displayed for at least the interval, and a frame that is still loading is waited for, not skipped. Time spent
  loading an already-prefetched frame does not add to the interval. While playing, upcoming frames are prefetched
  (more at higher speeds) and loaded frames are reused.
- `SNAP-5` Target: at 16× on the demo week, playback reaches about 25 timesteps per second.
- `SNAP-6` The five speed options fit on one row at about 1280 px wide; on narrower widths the toolbar wraps cleanly
  and the slider takes the remaining width.

#### 4.17.2 Day/night clock

- `SNAP-7` A clock card sits in the bottom-right corner of the diagram, never overlapping the legend, and never
  intercepts clicks. It shows a 24-hour dial (midnight at the top, clockwise, labels `00`, `06`, `12`, `18`, hour
  ticks, thicker every 6 h) with the night part of the ring in a muted night tone and the daylight arc from sunrise
  to sunset in a warm daylight tone (the full ring for polar day), a hand pointing at the current time, and beside
  it: the time `HH:MM` (24 h), the date (`Wed 1 Jul 2026`), a badge `Daylight` (warm) or `Night` (neutral), and
  `Sunrise HH:MM · sunset HH:MM` (or `Sun up all day` / `No sunrise`). When the diagram is narrower than about
  560 px only the digital time is shown. It updates on every frame and while scrubbing.
- `SNAP-8` Daylight uses the same sun geometry as the PV profile (section 4.8.2): sunrise/sunset are
  `solar noon ∓ acos(−tan φ · tan δ) / 15°` hours, with polar day and polar night handled; a timestep is daylight
  when the sun's elevation is above 0. Latitude and solar noon come from the first Solar PV assignment of the run's
  frozen case, else the defaults 52° and 13:30. The source is stated in a tooltip: `Daylight from PV profile (lat
  52°, solar noon 13:30)` or `Daylight from default latitude 52° (no PV profile)`.

#### 4.17.3 Daylight-shaded slider

- `SNAP-9` The timestep slider sits on a shaded strip aligned so its left end is the first timestep and its right
  end the last (inset by half the thumb width). For runs of up to 31 calendar days the strip shows, per day, a
  daylight segment from sunrise to sunset on a night-coloured background, a thin divider at each midnight and
  weekday labels (`Sun` … `Sat`). For longer runs it shows month dividers, month labels (`Jan` … `Dec`) and a
  seasonal shade per month whose strength follows the month's mean daylight hours. Labels are drawn only when each
  day (month) is at least about 28 px wide.

#### 4.17.4 Colours on the snapshot

- `SNAP-10` **Voltage colour scale** (nodes). Defined only by the run's frozen case limits `u min` and `u max` and
  1.0 pu, as a five-stop ramp **blue - teal - green - yellow - red**:
  - `u min` full blue; the midpoint of `u min` and 1.0 pu teal; 1.0 pu green; the midpoint of 1.0 pu and `u max`
    yellow; `u max` full red;
  - between stops the colour is interpolated linearly, each side on its own span, so asymmetric limits move the
    midpoints;
  - at or beyond a limit the colour is flat (full blue below `u min`, full red above `u max`);
  - if 1.0 pu is not strictly between the limits, the green stop is placed at the midpoint of the limits instead;
  - no value: the neutral axis grey.
  Design intent: **undervoltage blue, nominal green, overvoltage red** with teal and yellow as early warnings; every
  energised node is filled with its ramp colour, so it is never mistaken for the hollow "not energised" style.
- `SNAP-11` The legend shows `u`, a continuous gradient bar of the five colours (five equal parts, so each tick
  sits under its stop) with three ticks `u min`, `1.00`, `u max` (2 decimals) read from the run's limits, and the
  tooltip `Limits from the run settings`. It is read-only.
- `SNAP-12` The scale follows the run's frozen case limits and has no per-browser override or editor. It never
  changes results, KPIs or violation limits.
- `SNAP-14` **Loading colours** (branches): neutral grey at 0 %, shading to green at 60 %, to amber at 100 %, to red
  at 120 % and above; no value is neutral grey. Branch line width grows linearly with loading up to 150 % (thin when
  idle, about 3× as thick at 100 % and 4× at 150 % and above). Legend: a `loading` gradient with ticks `0%`, `60%`, `100%`,
  `120%`.
- `SNAP-15` Status cues (out of service, not energised; section 4.18) take precedence over the loading colour and
  width; the changed and selected cues are still drawn on top. The legend row shows the voltage legend, the loading
  gradient and the status legend (when relevant).

#### 4.17.5 Details on the snapshot

- `SNAP-16` With nothing selected: `Click a node or branch to inspect its value.` For a selected element the panel
  shows the element details of section 4.5 (with edited markers from the frozen overrides) plus `Voltage at this
  timestep` `<u> pu` for a node or `Loading at this timestep` `<x.x %>` for a branch, updated with the timestep. An
  out-of-service branch shows `Out of service — no flow`; a not-energised node shows `Not energised`.
- `SNAP-17` Zoom and selection behave as in the explorer (buttons only; the wheel scrolls the page).

Acceptance criteria:

- Given the demo run at 1280 px, then the label reads `/ 672`, the five speed buttons are on one row and `2×` is
  selected; at `16×`, after 2 s of play then pause, the step has advanced by at least 25 and the label equals
  `step <t+1> / 672`.
- Given the demo run, then the clock is inside the diagram's bottom-right corner (within 16 px of both edges, below
  the zoom buttons); the slider strip shows 7 daylight segments with the label `Wed` and a tooltip mentioning
  `PV profile (lat 52°`; at index 8 the label is `step 9 / 672`, the clock shows `02:00`, `Wed 1 Jul 2026` and
  `Night`; at index 52 it shows `13:00`, `Daylight` and sunrise/sunset times; during playback the clock and the
  step label stay in sync.
- Given latitude 52° on 21 June with solar noon 13:30, then sunrise is about 05:15 and sunset about 21:45 (±15 min);
  21 December is shorter; a polar latitude gives sun up all day or no sunrise.
- Given an IEEE 14 1-day run with cleared browser storage, then the legend ticks read `0.90 0.95 1.05 1.10`, node 8
  (about 1.09 pu) is reddish and a node at about 1.01 pu is exactly the neutral colour; after setting `Full red
  above` 1.15 and `Band to` 1.10, the ticks update and node 8 turns neutral; setting `Band from` 1.12 shows an error
  containing `ascending` and changes nothing; reloading keeps the custom scale; `Match run limits` gives
  `0.90 0.95 1.05 1.10`; `Reset to defaults` restores and saves the defaults.
- Given a voltage of exactly 1.00 or 1.04, then the node is exactly neutral; 0.93 is partly blue; 0.88 is full blue;
  1.07 is partly red; 1.12 is full red.
- Given IEEE 14 with the branch between `node 1` and `node 2` switched off in the case, then on the snapshot it is
  drawn dashed, muted and thin with the `off` label despite the loading overlay, while other branches are solid and
  coloured; selecting it shows `Out of service — no flow`.

### 4.18 Network diagram: symbols, colours and status cues

These rules apply to both diagrams (the case editor's explorer and the results snapshot).

#### 4.18.1 Symbols

| Element | Drawn as |
|---------|----------|
| Node (bus) | A small filled dot (about 9 px at zoom 1, 1 px ring) with its name below in small text; labels hide when zoomed far out. |
| Line, asymmetric line, link, generic branch | A straight line between its nodes. |
| Two-winding transformer | The line between its nodes with the standard **two overlapping circles** symbol at its midpoint, rotated along the line (in 5° steps); each circle in the colour of the voltage level on its side. |
| Three-winding transformer | A hub with **three overlapping circles** coloured by the three voltage levels, connected to its three nodes. |
| Source (external grid) | The standard **hatched square** external-grid symbol, connected to its node by a dotted stub. |
| Generator | A **circle with a sine wave** (green), connected by a dotted stub. |
| Load | A small triangle, connected by a dotted stub. |
| Shunt | A **capacitor** (two plates) when its susceptance is positive, a **reactor** (coil) when negative, a generic box when zero or unknown; connected by a dotted stub. |

- `DIA-1` Symbols keep a readable size when zooming: their on-screen size stays between about 0.7× and 1.8× of their
  base size, so transformers remain visible when zoomed out and do not dominate when zoomed in.
- `DIA-2` Clicking any part of a transformer (line, symbol or hub) selects the transformer.

#### 4.18.2 Colours in the editor

- `DIA-3` Nodes are coloured by **voltage level**: distinct rated voltages from highest to lowest get the first,
  second, … colour of the categorical palette (highest level blue, next orange, …); transformer circles use the
  same colours.
- `DIA-4` Branch colours by type: lines in the secondary foreground (dark grey), links muted grey, transformers and
  three-winding transformers purple, generic branches amber; lines are slightly thinner than other branch types.

#### 4.18.3 Status cues

| State | Cue | Meaning |
|-------|-----|---------|
| **Out of service** branch | Dashed, thin, muted grey line with a small `off` tag at its midpoint (lifted clear of a transformer symbol); transformer symbol drawn in muted dashed circles; tooltip `Out of service`. | The branch is switched off at either end and carries no flow. |
| **Out of service** appliance or source | Hollow (unfilled) muted symbol; dashed stub. | The appliance is switched off. |
| **Not energised** node | Hollow dot with a **dashed** muted ring, a small muted **×** inside, italic muted label; tooltip `Not energised`. | The node is not connected to any in-service source through in-service branches. |
| **Within band** node (snapshot) | Solid, filled neutral grey with a normal ring and label. | Energised and inside the voltage band. |
| **Edited** element | An **amber** ring (nodes, symbols, appliances) or an amber halo under the line (branches), slightly larger node size. | The case overrides at least one parameter of this element. |
| **Selected** element | Accent-coloured (blue) halo. | Current selection. |

- `DIA-5` Out-of-service and not-energised cues take precedence over voltage-level, type and result colours and
  widths. The edited and selected cues are still visible on top of them (e.g. an edited out-of-service branch keeps
  its dashes with a thin amber halo).
- `DIA-6` Energisation is computed from the effective topology (editor) or the frozen run topology (snapshot): a
  breadth-first search from all in-service sources over in-service branches (a three-winding transformer connects
  its in-service windings). A switched-off source energises nothing; a ring stays energised when one branch of it
  is switched off; a second source keeps its area energised.
- `DIA-7` The legends add `Out of service` (dashed line sample) and `Not energised` (the dashed ring with ×) only
  when such elements exist, and `Changed` (amber ring) only when there are edits.
- `DIA-8` A theme change (light/dark) recolours the diagram and its symbols in place without re-layout.

Acceptance criteria:

- Given Vision MV, then there is one transformer symbol per two-winding transformer, each within 0.5 px of its
  line's midpoint, and the legend lists Transformer, Generator and External grid; at zoom 0.25 a transformer symbol
  is still more than 15 px wide.
- Given IEEE 14, then there are 4 generator symbols, 1 external-grid symbol and 1 capacitor, and the legend lists
  Generator, External grid and Capacitor.
- Given Vision MV, when I switch off the in-service branch whose removal islands the fewest nodes, then the islanded
  nodes have a dashed ring, no fill, the × image and an italic muted label; the count of not-energised nodes is
  shown in the legend; on the snapshot those nodes keep that style while an energised node within the limits is filled
  with its voltage colour, solid ring, normal font and no image.
- Given an edited transformer tap position, then that transformer is drawn with the amber edited cue.
- Given an out-of-service transformer, then its symbol is drawn in the off style and its `off` tag stays visible.

### 4.19 Charts and limit lines

- `CHART-1` All time charts share: a time x-axis with non-overlapping labels; zoom and pan on the time axis (mouse
  inside the chart and a slider below); no y-axis zoom; a shared tooltip at the hovered time; a legend when there
  are several series; consistent theme colours in light and dark.
- `CHART-2` **Limit lines are always visible and labelled.** Whenever a chart shows a quantity with limits (node
  voltage in pu, branch loading), the limits from the run's frozen case are drawn as dashed red horizontal lines
  with labels at the right end, and the y-axis range is widened to include them: `range = [min(data, limits) −
  pad, max(data, limits) + pad]` with `pad = 5 %` of the span (or 5 % of the value for a flat range). Without limits
  the y-axis fits the data.
- `CHART-3` Limit labels: voltage `u_min <v>` and `u_max <v>` with 2 decimals when exact, else 3 (`0.90`, `1.10`,
  `0.955`); loading `limit <v>` as a whole percent when exact, else 1 decimal (`limit 100%`, `82.5%`).
- `CHART-4` Limits always come from the run's frozen case, never from the snapshot's display colour scale.
- `CHART-5` Charts with limit lines: Voltage envelope, Element time series (node `u_pu`, branch `loading`) and the
  Violations dialog chart.
- `CHART-6` Gaps: failed timesteps are shown as gaps in lines, never connected across.

Acceptance criteria:

- Given limits outside the data, then the axis widens to include them; given limits inside the data, then the axis
  is the data range plus padding; a loading chart with only an upper limit includes it; with neither data nor
  limits, the axis is automatic.

### 4.20 Formatting of numbers, units and times

- `FMT-1` Missing or non-finite values always show as `—`.
- `FMT-2` Voltages in pu with 3 decimals (`0.973 pu`); loading as percent with 1 decimal (`83.0 %`).
- `FMT-3` Power auto-scales: `≥ 1e6` → MW (up to 3 decimals), `≥ 1e3` → kW (up to 2), else W (up to 1); the same for
  var/kvar/Mvar and VA; voltage in kV (up to 3 decimals); current in A with 1 decimal; angles in degrees with 2
  decimals.
- `FMT-4` Energy: MWh (up to 3 decimals below 10 MWh, else 1), GWh from 1000 MWh.
- `FMT-5` Durations: `<ms> ms` below 1 s, `<x.x> s` below 1 min, `<m> m <s> s` below 1 h, else `<h> h <m> m`. Window
  lengths: `<d> d` from 2 days, `<h> h` from 1 hour, else `<m> min`; resolutions `<h> h` for whole hours, else
  `<m> min`.
- `FMT-6` Date-times use the user's locale (year, short month, day, hours, minutes); relative times read `just now`,
  `<n> min ago`, `<n> h ago`, `<n> d ago` (within a week), then the date. Clock times on the snapshot are always
  24-hour `HH:MM`.
- `FMT-7` Edited equipment values are shown in display units without floating-point noise (12 significant digits
  internally, 6 shown), with on/off shown as `in service` / `out of service`.
- `FMT-8` All study times are local wall-clock times without a time zone; they are displayed exactly as entered and
  never shifted by the browser's time zone.

---

## 5. Non-functional requirements

### 5.1 Performance

| Id | Requirement |
|----|-------------|
| `NFR-P1` | A 1-year run at 15 min (35 040 timesteps) on Vision MV completes in a few seconds on a typical laptop (reference about 1.3 s of calculation), and always well under a minute. |
| `NFR-P2` | Profile generation scales: a residential profile for 35 040 timesteps × 200 elements is generated in under 3 s. |
| `NFR-P3` | Snapshot playback at 16× reaches about 25 timesteps per second on the demo week without skipping frames. |
| `NFR-P4` | Result views of a 1-year run open within a couple of seconds; charts reduce points for display (e.g. downsampling) without changing the data, and the heatmap is limited to 500 time buckets. |
| `NFR-P5` | Network topology and the editor stay responsive for networks of a few thousand elements (the force layout may use a faster, lower-quality mode above about 1500 elements). |
| `NFR-P6` | A long run reports progress regularly (about 40 updates over its course) and a cancel takes effect within one chunk of work. |
| `NFR-P7` | Results are stored compactly (long runs on mid-size networks must not exhaust disk or memory), and repeated queries of the same result field are served from a cache. |

### 5.2 Persistence

- `NFR-S1` All study data lives in a local **workspace** folder (configurable): cases, runs (status, frozen case,
  results, summary), uploaded networks and uploaded CSV files. Everything survives an app restart.
- `NFR-S2` Writes are atomic: an interrupted save never leaves a half-written case or run status.
- `NFR-S3` Deleting a case deletes its runs and results; deleting a run deletes its results. Uploaded networks and
  CSV files are kept.

### 5.3 Reproducibility

- `NFR-R1` Every random profile is seeded; the same case (network, window, profiles with parameters and seeds,
  overrides, calculation settings) always produces identical results.
- `NFR-R2` A run's inputs are frozen at start, so any result can be traced to exactly the inputs that produced it,
  regardless of later edits.
- `NFR-R3` Network files are never modified; overrides are stored separately in the case.

### 5.4 Theming and visual design

- `NFR-T1` Light and dark themes follow the operating system preference. All colours (UI, charts, diagram symbols,
  legends) are defined per theme and switch live without reloading or re-laying out diagrams.
- `NFR-T2` Colour meaning is consistent everywhere:

  | Meaning | Colour intent |
  |---------|---------------|
  | Primary action, selection, links | Blue accent |
  | Good / within limits / succeeded | Green |
  | Warning / edited ("changed") / cancelled | Amber |
  | Bad / violation / failed | Red |
  | Undervoltage | Blue (full at the lower scale end) |
  | Overvoltage | Red (full at the upper scale end) |
  | Within voltage band | Filled neutral grey (light grey in light theme, dark grey in dark theme) |
  | Not energised / out of service | Muted grey, dashed, hollow |
  | Daylight / night (clock, slider) | Warm yellow / muted grey |

- `NFR-T3` A clean, calm engineering look: neutral warm-grey surfaces, one accent colour, an 8-colour categorical
  palette for series and voltage levels, a sans-serif UI font with tabular figures for numbers, and monospace for
  ids.

### 5.5 Responsiveness

- `NFR-W1` Usable from about 1024 px wide upward, designed for 1280–1600 px; wide pages (editor, results) may use up
  to about 1600 px. The sidebar collapses to icons below a large-desktop width. Toolbars and forms wrap instead of
  overflowing; tables scroll inside their own box.
- `NFR-W2` The page scrolls as a whole; no control (diagram, chart) captures the mouse wheel.

### 5.6 Keyboard and accessibility basics

- `NFR-A1` Every control is reachable and operable by keyboard; dialogs close with Escape or a backdrop click (and
  should keep keyboard focus inside while open); tabs, toggles and switches expose their selected state to
  assistive technology.
- `NFR-A2` Inputs have labels (table cells: `<label> of <name>`); icon buttons have accessible names and tooltips
  (`Zoom in`, `Delete case`, `Revert … of …`).
- `NFR-A3` The timestep slider remains a standard range control (keyboard arrows work).
- `NFR-A4` Animations (row flash, smooth scrolling, diagram centring) are disabled when the user prefers reduced
  motion.
- `NFR-A5` Status is never conveyed by colour alone: badges carry text, out-of-service branches are dashed with an
  `off` tag, not-energised nodes are dashed with a × and italic labels, edited cells show `was …`.
- `NFR-A6` Text and UI colours meet a readable contrast in both themes.

### 5.7 Error handling

- `NFR-E1` Every error message is human-readable and says what is wrong and, where useful, how to fix it (see the
  message tables in sections 4.4, 4.8 and 4.9).
- `NFR-E2` The UI distinguishes: unknown item (not found), conflicts (duplicate case id, deleting an active run,
  results of a run that did not succeed: `Run '<id>' has status '<status>'; no results available`), invalid input
  (bad upload, bad parameters) and request validation errors; all are shown in place (panel, inline or toast),
  never as a blank page.
- `NFR-E3` When the backend is unreachable the header shows `Backend offline` and failed requests offer retry;
  transient server errors are retried automatically a couple of times.
- `NFR-E4` Non-converging timesteps never abort a run (`RUN-8`); results never contain "NaN" text, only "no value"
  (`—` or gaps).

---

## 6. Data handled

Described conceptually; the storage format is the builder's choice except for the user-facing file formats.

### 6.1 Inputs

| Input | Description |
|-------|-------------|
| **Network file** (user-facing format) | A PGM JSON input file (PGM's serialization format, as in its validation data). Components used: nodes, lines, asymmetric lines, links, transformers, generic branches, three-winding transformers, symmetric/asymmetric loads and generators, shunts, sources, voltage regulators. Optional per-element `Name` fields are used for display. |
| **Profile CSV** (user-facing format) | A delimited text file: the first column timestamps, other columns numeric multiplier series with header names. Any common delimiter. Values are multipliers (dimensionless), used as `m(t)`. |
| **Case** | See 6.3. |

### 6.2 Network information shown to the user

Per network: source, key, name, description, and counts per component type. Per element: id, name, type, and:

- nodes: rated voltage;
- branches: from node, to node (and node 3 for three-winding transformers), in service;
- appliances: node, specified P and Q (summed over phases for asymmetric ones), shunt susceptance (sign gives
  capacitor/reactor), in service;
- sources: node, reference voltage (pu);
- the file values of every editable parameter (or *not set*).

### 6.3 Persisted entities

| Entity | Contents |
|--------|----------|
| **Case** | Id (slug), name, description, study type, network reference (source + key), time window (start, end, resolution), calculation settings (method, error tolerance, max iterations), limits (u min, u max, loading max), ordered profile assignments (id, label, generator, parameter values, target component and optional id list, mode, magnitude in W, factor), equipment overrides (component, element id, parameter, SI value), created and updated times. |
| **Run** | Id, case id and name, status, progress (0…1), current message, number of timesteps, number of failed timesteps, created/started/finished times, duration, error text; the **frozen case copy**; the results (6.4). |
| **Uploaded network** | The file as uploaded plus its display name and upload time. |
| **Uploaded CSV** | The file plus its id, original file name, column names, row count and first/last timestamp. |

### 6.4 Results of a run

- **Per timestep, per element** (missing for failed timesteps):

  | Group | Values |
  |-------|--------|
  | Nodes | voltage (pu and V), voltage angle, injected P and Q |
  | Branches (all branch types) | loading; P, Q, I and S at the from side; P, Q and I at the to side |
  | Sources | P, Q, I |
  | Appliances | P, Q, I |

- **Summary**: the KPIs (section 4.12), per-node extremes (u min, u max, u mean with the times of min and max),
  per-branch extremes (loading max and mean with the time of the max) and the list of violation episodes (element,
  kind, start, end, number of timesteps, worst value, limit; up to 5000).
- **Derived on demand**: the voltage envelope per timestep (min, p05, mean, p95, max), the loading heatmap (max per
  time bucket, sorted by peak), element time series for any field, and a snapshot of all node voltages and branch
  loadings at one timestep.

---

## 7. Out of scope and future work

### 7.1 Deferred items (open issues, not part of the current product)

1. **Unrated branches show 0 % loading (#1).** Branches without a rating (IEEE 14 generic branches without rated
   power) report 0 % loading although they carry power. Future: treat them as *unrated* with no loading value,
   exclude them from loading KPIs and violations, warn `N branches have no rating, so loading can't be calculated
   for them`, note `N of M branches unrated` on the Max loading tile, show "no value" in heatmap and time series,
   and offer "Set rating for all unrated branches" as normal overrides.
2. **Show and edit voltage regulators (#2).** IEEE 14's 4 voltage regulators hold generator nodes at set voltages
   (node 8 at 1.09 pu) but are not visible. Future: a `Regulators` table tab with editable reference voltage and
   status, a link to the regulated generator, a "V" badge and `Voltage regulated to X pu` in its details.
   Transformer tap regulators are a later follow-up.
3. **Zoomable timeline for the snapshot slider on long runs (#3).** A window picker (day/week/month/whole run), an
   overview strip, day-step buttons, "jump to worst" (lowest voltage, highest loading) and daylight bands within
   the zoomed window.
4. **Snapshot clock polish (#4).** Use 24-hour times in the toolbar label and other result timestamps (today they
   follow the locale, e.g. `Jul 1, 2026, 01:00 PM` in en-US), and make the clock card smaller, translucent or
   collapsible so it never hides nodes in the bottom-right corner.
5. **Warn when a generation profile is applied to loads in scale mode (#5).** Classify generators as demand,
   generation or neutral; warn `Solar PV in scale mode multiplies load demand by the PV curve. For rooftop PV use
   Add with a negative magnitude.` with a one-click switch to add mode.

### 7.2 Known product caveats

- **IEEE 14 has no branch ratings**, so its loading results are 0 % unless the user sets `Rated power` overrides
  (see #1).
- **PV in scale mode on loads multiplies demand** by the PV curve (demand becomes zero at night). For rooftop PV,
  use add mode with a negative magnitude. The demo case applies PV to generators, where scale mode is correct (see
  #5).
- **Voltage regulators are not shown** in the explorer or snapshot, though they act in every run (see #2).
- Daylight-saving time is ignored: all days have 24 hours of wall-clock time.
- Only symmetric loads and generators can receive profiles; asymmetric appliances and shunts keep their file values.
- Only symmetric (balanced) power flow is offered.

### 7.3 Explicitly out of scope

- Multi-user operation, accounts, authentication and remote hosting.
- Any AI, LLM or chat feature.
- Solvers other than power-grid-model; study types other than the time-series power flow (the product should allow
  adding study types later).
- Writing changes back to network files, and deleting elements of the network file (they can be switched out of
  service). Adding equipment is limited to the components of section 4.6a.
- Network sources other than samples and uploads (a database or lakehouse source is a planned extension, section
  2).
- Comparing two runs side by side and exporting results to files (possible future features).
