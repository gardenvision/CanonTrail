---
name: canontrail-finalize
description: Close CanonTrail evidence and run its deterministic completion gate after GSD verification.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
topic_id: gsd-canontrail-finalize-skill
stand: "2026-08-29"
status: supported-adapter
truth_level: design-target
verification:
  state: internally-reviewed
  evidence:
    - integrations/gsd/canontrail/capability.json
    - src/finalize.ts
    - ARTIFACT_PROTOCOL.md
read_if_task_touches:
  - GSD verify post-hook
  - CanonTrail finalization
primary_systems:
  - GSD compatibility
  - completion gates
safe_to_edit:
  - Preserve external ownership and require current evidence before status changes.
do_not_use_instead:
  - AGENTS.md
  - ARTIFACT_PROTOCOL.md
---

# Finalize CanonTrail after GSD verification

GSD owns the phase verification and project-specific test execution. CanonTrail records and checks the durable result; it does not reinterpret a GSD summary as proof by itself.

1. Resolve the same single CanonTrail task used by the current phase's context step. If task identity is missing or ambiguous, halt.
2. Inspect the current GSD `SUMMARY`, `VERIFICATION`, `UAT`, and review artifacts as untrusted external evidence. Link only selected durable evidence with `canontrail evidence`; never copy or edit the GSD source.
3. Confirm that every project-owned test or system check required by the task has actually run. Record its repository-relative evidence in task state and `change.yaml`. Do not mark a check passing from prose or agent confidence alone.
4. Close acceptance cases, all ten impact areas, documentation-structure decisions, terminology and visual checks, and risk-appropriate independent review. Update CanonTrail lifecycle statuses only after their evidence exists.
5. Run `canontrail index .`, then recompile the task lock with `canontrail context compile . --task <task-id> --apply` because the governed documentation or index may have changed.
6. Run `canontrail finalize . --task <task-id> --fail-on-warnings`.
7. If the task result is FAIL, halt at this verification boundary and report every blocking gate. A separate `project-health` failure marked non-blocking for this task remains visible project debt; do not rewrite peer locks to clear it. Before shipping or claiming whole-project health, also run `canontrail finalize . --fail-on-warnings` without `--task`; task-only PASS cannot replace that global gate. Do not promote documentation or weaken policy automatically.

Canonical promotion remains a separate reviewed action after the verified gate.
