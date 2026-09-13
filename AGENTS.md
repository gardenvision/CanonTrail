---
topic_id: agent-instructions
stand: "2026-09-12"
status: current
truth_level: canonical
verification:
  state: internally-reviewed
  evidence:
    - VISION.md
    - ARTIFACT_PROTOCOL.md
    - src/context.ts
    - src/checkpoint.ts
    - docs/integrations.md
read_if_task_touches:
  - any repository change
primary_systems:
  - documentation governance
  - context continuity
  - compatibility adapters
safe_to_edit:
  - Keep this file short and provider-neutral.
  - Update routing when canonical documents move.
do_not_use_instead:
  - VISION.md
  - ARTIFACT_PROTOCOL.md
---

# Agent instructions

Durable repository files are the source of truth; chat history and model memory are not. CanonTrail preserves broad hierarchical project knowledge while each task receives the smallest sufficient, reproducible working view.

## Read routing

- At session entry, determine whether this is a new task, a validated handoff resume, unfinished documentation bootstrap, or documentation maintenance; then load only the corresponding route. See `README.md` (Give your agent an entry point) for the short entry checklist.
- Read `docs/self-documentation.md` and `.agent-context/documentation-plan.yaml` when determining CanonTrail's current knowledge owners, self-documentation coverage, or continuity state.
- Read `VISION.md` for product purpose, scope, and non-goals.
- Read `ARTIFACT_PROTOCOL.md` before changing schemas, context selection, handoffs, promotion, or maintenance.
- Read `docs/integrations.md` before changing compatibility behavior.
- Read `ROADMAP.md` before adding implementation scope.
- Read `docs/parallel-work.md` before sharing write/editor resources or interpreting task completion separately from project health; the execution workflow owns scheduling.
- Read `docs/alpha-readiness.md` before changing or making release claims about completed-lock lifecycle, finalization, adoption, evidence-only context, or semantic/visual verification behavior. Private historical reviews are not distributed with this candidate.
- Update the matching schema and worked example when an artifact shape changes.
- For a non-trivial change, create or update `.agent-context/tasks/<task-id>/change.yaml` before implementation and follow `ARTIFACT_PROTOCOL.md` section 12.
- For every decided non-trivial change, record the documentation-structure decision and draft required feature documents before implementation is declared complete; verification and canonical promotion remain separate gates.
- Before a task is implemented or resumed, compile its bounded context lock with `canontrail context compile . --task <task-id> --apply`; recompile after selected sources change or validation reports task-relevant index changes; unrelated index updates alone do not require rewriting a valid lock.
- Before compaction, pause, blocker, phase transition, or agent/provider switch, update the structured checkpoint input and run `canontrail checkpoint create`; provider adapters must not read transcripts or control compaction.
- After applying a handoff/checkpoint, ensure the task state records `latest_handoff` and recompile its active context after that update; creation does not edit state, and archived source locks stay unchanged.
- Run `canontrail docs status .` for a health summary and `canontrail docs audit .` for the weekly report; never clean up, archive, or promote from a finding without review.

## Invariants

1. One topic has one canonical truth location.
2. External workflow artifacts are read-only inputs and non-canonical by default.
3. CanonTrail does not own brainstorming, multi-model deliberation, planning methodology, execution, agents, or worktrees.
4. A fresh session resumes from a validated handoff and locked context selection, not an opaque chat summary.
5. Documentation promotion requires implementation evidence.
6. Adoption never overwrites existing files or performs remote operations.
7. Provider bridges stay thin; provider-neutral rules live here.
8. Completion claims require recorded verification evidence.
9. A non-trivial change is complete only when acceptance cases and all ten impact areas are closed; high/critical risk requires independent review or a recorded human waiver.
10. Product growth triggers an explicit documentation-granularity decision; branches and external execution workflows do not determine feature-document ownership.
11. The complete repository and documentation tree are not default context; add narrowly relevant sources and recompile the context lock when the current view proves insufficient.

## Verification

- Run `npm run check` after TypeScript changes.
- Run `npm test` after deterministic behavior changes.
- Run `npm run build` before testing the distributable CLI.
- Run `npm run index` after governed Markdown changes.
- Run `npm run canontrail -- validate .` before claiming repository validity.
- Run `npm run canontrail -- finalize . --fail-on-warnings` before claiming repository-level completion; task completion additionally requires `--task <task-id>`.

Release preparation uses a clean source history, never the private development Git history. Record raw preparation logs and external reports outside the distributable tree. A Git-backed handoff is valid only in an actually initialized readable worktree; do not invent one for an archive extraction. Product and release tasks retain their separate verification and publication gates.
