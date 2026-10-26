# Agentic build workflow (resumable)

GridSim is built and extended by an **orchestrator** Claude Code session that
delegates work to **sub-agents**. Sessions can stop at any moment: usage
limits, resets, closed laptops, context compaction. So the workflow keeps **all
state that matters on disk and in git, never only in an agent's context.**

## Durable state

| What                      | Where                          | Written by           |
|---------------------------|--------------------------------|----------------------|
| Task ledger (plan + status)| `.agent/LEDGER.md`            | orchestrator only    |
| Task briefs (full prompts)| `.agent/briefs/<task-id>.md`   | orchestrator         |
| Per-task progress journal | `.agent/progress/<task-id>.md` | the sub-agent doing it|
| Checkpoints               | git commits `checkpoint(<task-id>): …` | orchestrator only |
| Contracts                 | `docs/api-contract.md`, `docs/architecture.md` | orchestrator |

A `SessionStart` hook (`.claude/settings.json`) prints the ledger into every
new session, so a fresh session knows where things stand without being told.

## Rules that make it robust

1. **The brief lives in a file before the agent starts.** Re-spawning an
   interrupted agent means "run `.agent/briefs/<id>.md`, and continue from
   `.agent/progress/<id>.md`". It never depends on the orchestrator remembering a prompt.
2. **Every task has an executable done check** (e.g. `cd backend && uv run pytest -q`).
   "Done" means the check passes, not that the agent said it finished.
3. **Agents journal after every sub-step.** The journal keeps a checklist,
   verification status, decisions and a precise `Next step:` line. Interruption
   then costs at most one sub-step.
4. **Tasks are idempotent and file-disjoint.** Parallel tasks own separate
   directories, so a re-run or a parallel agent can't clobber another's work.
   Shared files (contracts, ledger, CLAUDE.md) are orchestrator-only.
5. **Only the orchestrator commits**, after a task's done check passes, plus
   WIP checkpoints before long waits. This means `git log` is the recovery point,
   and two agents never race on the git index.
6. **Bounded tasks.** Each task should fit comfortably in one agent run. Split
   anything bigger. Run at most 2 sub-agents in parallel to stay within usage limits.
7. **Keep the orchestrator's context lean.** Agents return short reports, and
   details go into their journals. That way the orchestrator survives compaction.

## Resume protocol (`/resume-build` skill)

1. Read `.agent/LEDGER.md`, `git log --oneline -15`, `git status --short`.
2. For each task with status `in_progress`:
   - Run its done check. If it passes, mark the task `done` and commit a checkpoint.
   - Otherwise, re-spawn a sub-agent with its brief, plus: "Read
     `.agent/progress/<id>.md` and continue from `Next step`. Do not redo checked items."
3. Start `todo` tasks whose dependencies are `done`, at most 2 in parallel.
4. Update the ledger after every status change.

## Adding a new feature with this workflow

1. Add tasks to the ledger: id, owner area, dependencies, files, done check.
2. Write a brief for each task in `.agent/briefs/`. Point it at the relevant
   skill (e.g. `.claude/skills/add-result-view`).
3. Spawn the agents, wait, verify, checkpoint. Finish with `make check`.
