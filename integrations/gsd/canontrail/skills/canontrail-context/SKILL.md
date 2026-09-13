---
name: canontrail-context
description: Prepare the bounded CanonTrail task context before GSD plans a phase.
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
topic_id: gsd-canontrail-context-skill
stand: "2026-08-29"
status: supported-adapter
truth_level: design-target
verification:
  state: internally-reviewed
  evidence:
    - integrations/gsd/canontrail/capability.json
    - ARTIFACT_PROTOCOL.md
read_if_task_touches:
  - GSD plan pre-hook
  - CanonTrail context compilation
primary_systems:
  - GSD compatibility
  - bounded context
safe_to_edit:
  - Keep GSD artifacts read-only and fail when task identity is ambiguous.
do_not_use_instead:
  - AGENTS.md
  - ARTIFACT_PROTOCOL.md
---

# Prepare CanonTrail context for GSD

Use GSD as the planning and execution owner. Treat every file under `.planning/` as external, non-canonical input and do not modify it for CanonTrail's benefit.

1. Read the repository `AGENTS.md` and `.agent-context/config.yaml` completely.
2. Identify the current GSD phase from the phase context already supplied by GSD. Do not infer it from unrelated plans or old summaries.
3. Locate exactly one `.agent-context/tasks/<task-id>/state.yaml` whose `source_system` is `gsd-core` and whose `source_ref` names the current phase artifact. If none or more than one match, stop with a precise setup error; never guess a task.
4. Confirm that the task brief and, for non-trivial work, `change.yaml` exist and describe the same objective and acceptance boundary as the current phase. CanonTrail may update its own task artifacts but must not rewrite `.planning/`.
5. Run `canontrail context compile . --task <task-id> --apply`. If the executable is not available, use only the project-documented `CANONTRAIL_HOME` command; do not search arbitrary user directories.
6. If an existing file intent is omitted, or a required source is missing or stale, halt planning and report the exact path. Otherwise provide the resulting lock as the bounded working context.

Do not load the full repository, the full documentation tree, raw transcripts, or historical GSD phases merely because they exist. Expand context only for a named dependency or uncertainty and then recompile the lock.
