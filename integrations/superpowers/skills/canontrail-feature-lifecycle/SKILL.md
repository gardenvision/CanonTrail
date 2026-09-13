---
name: canontrail-feature-lifecycle
description: Use when starting, resuming, reviewing, or completing a feature in a CanonTrail-governed project alongside Superpowers.
topic_id: superpowers-canontrail-feature-lifecycle-skill
stand: "2026-08-29"
status: supported-adapter
truth_level: design-target
verification:
  state: internally-reviewed
  evidence:
    - src/finalize.ts
    - ARTIFACT_PROTOCOL.md
    - docs/integrations.md
read_if_task_touches:
  - Superpowers feature lifecycle
  - CanonTrail task context
  - CanonTrail completion
primary_systems:
  - Superpowers compatibility
  - bounded context
  - completion gates
safe_to_edit:
  - Compose with Superpowers without changing its core skills.
do_not_use_instead:
  - AGENTS.md
  - ARTIFACT_PROTOCOL.md
---

# CanonTrail feature lifecycle

Use Superpowers for brainstorming, design, planning, TDD, execution, reviews, and worktrees. Use CanonTrail for durable project truth, bounded task context, evidence continuity, handoffs, and documentation completion.

## At feature start

1. Read `AGENTS.md` and `.agent-context/config.yaml` completely.
2. Create or locate exactly one CanonTrail task for the approved Superpowers feature. Record the Superpowers spec or plan as `source_ref`; it remains external and non-canonical.
3. For non-trivial work, establish the decided `change.yaml`, acceptance oracle, ten impact areas, risk, and documentation-structure decision before implementation.
4. Run `canontrail context compile . --task <task-id> --apply`. Treat omissions and hash drift as explicit blockers. Load additional sources only for a named dependency or uncertainty, then recompile.

## During execution and review

- Give implementers and reviewers the task objective, acceptance criteria, locked sources, and exact affected code/tests—not the full historical conversation.
- Keep Superpowers specs, plans, and review flow under Superpowers ownership.
- Attach only durable, repository-relative evidence to CanonTrail. A review statement or green test is evidence, not automatic canonical promotion.
- Before a session or agent switch, create a CanonTrail checkpoint and resume from the resulting handoff/receiving lock.

## Before completion

1. Run the project-owned tests and the applicable Superpowers review and verification skills with fresh evidence.
2. Update CanonTrail acceptance cases, all impact areas, feature-document lifecycle, checks, and independent review. Do not mark them passing without evidence.
3. Run `canontrail index .` and recompile the task context lock.
4. Run `canontrail finalize . --task <task-id> --fail-on-warnings`.
5. Do not claim task completion while its result is FAIL. Keep a separately reported non-blocking `project-health` failure visible; it is not whole-project success and does not authorize peer-lock rewrites. Before integration/release or a whole-project completion claim, also run `canontrail finalize . --fail-on-warnings` without `--task`. Canonical promotion remains a separate reviewed action.

If `canontrail` is unavailable, use only the exact project-documented `CANONTRAIL_HOME` invocation. Never search unrelated user directories or silently skip the gate.
