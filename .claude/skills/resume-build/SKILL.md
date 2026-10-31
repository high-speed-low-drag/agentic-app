---
name: resume-build
description: Resume the agentic build after an interruption (usage limit, reset, new session). Reads the task ledger, verifies in-progress tasks, re-spawns sub-agents from their briefs and progress journals, and checkpoints to git. Use when the user says "resume", "continue the build", or a session starts with unfinished ledger tasks.
---

# Resume the build

Follow `docs/agentic-workflow.md`. Steps:

1. **Load state** (don't rely on memory):
   - `cat .agent/LEDGER.md`
   - `git log --oneline -15 && git status --short`
   - `ls .agent/progress/ .agent/briefs/`
2. **Check that no agent is still running.** If the session has live sub-agents,
   wait for their notifications instead of re-spawning. Two agents on one task
   will clobber each other.
3. **For each `in_progress` task:**
   - Run its done check from the ledger.
   - If it passes, set the task to `done`, add a log line, and commit:
     `git add -A && git commit -m "checkpoint(<id>): <summary>"`.
   - If it fails, re-spawn a `general-purpose` sub-agent (in the background) with this prompt:
     "Your task brief is in `.agent/briefs/<id>.md`. Read it fully. Your
     previous run was interrupted. Read `.agent/progress/<id>.md` and continue
     from its `Next step`. Do not redo checked items. Keep updating the progress file."
4. **Start ready `todo` tasks** (all deps `done`), at most 2 at a time,
   only if they own disjoint files. Write the brief to `.agent/briefs/<id>.md`
   before spawning.
5. **After each completion,** verify the task yourself with the done check (never trust the
   report alone), update the ledger, and checkpoint-commit.
6. **If usage is running low,** before stopping make sure the ledger and progress files are
   current, and commit a WIP checkpoint: `git commit -m "wip(<id>): <state>"`.
