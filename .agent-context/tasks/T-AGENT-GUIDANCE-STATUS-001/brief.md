---
topic_id: bundled-agent-guide-and-status
stand: "2026-10-03"
status: completed
truth_level: active-snapshot
verification:
  state: verified
  evidence: [.agent-context/tasks/T-AGENT-GUIDANCE-STATUS-001/evidence/verification.md]
read_if_task_touches: [bundled agent guidance, readable task status]
primary_systems: [CLI guidance]
safe_to_edit: [Keep this task read-only at runtime and preserve existing completion predicates.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md, docs/usage.md]
---

# Bundled agent guidance and readable task status

The owner accepted deriving useful improvements from Herdr. Implement only a
small guide shipped with the running CLI and a read-only task-status view.
Herdr integration, agent orchestration, consumer rollout and publication are
not part of this task. A host's idle/done state is never task acceptance.

## Decided scope

- `guide` prints concise provider-neutral instructions from the bundled runtime,
  not newer web or checkout documentation. State version-label limitations.
- `task status` reuses named-task finalization without index refresh. Show
  recorded lifecycle, checked own context, open completion gates and raw project
  health separately. JSON and exit behavior remain the existing finalize result.
- Do not add stored lifecycle states, schemas, scheduling, automatic migration,
  evidence promotion, schema synchronization, Git or source mutation.

## Acceptance

AC-GUIDE: guidance covers new/adopted, bootstrap, resume and maintenance entry,
safe receiving order, scope and no implied authority.

AC-STATUS: pending acceptance/review differs from failed tests, actual safety
errors remain blocking, unrelated deferred lock drift stays visible.

AC-PRESERVE: distributed commands perform no project writes and no live-agent
claims; old source-control evidence remains exact.

AC-QUALITY: focused/full tests, build, checks, documentation and strict
validation recorded honestly. Platform/release evidence is not transferred.

## Continuity

Baseline is be191bafa4af1b5597384d36d42a6de520549673. The existing draft PR
remains on that sealed review target. This task uses a separate local branch.
Shared consumer CLI builds are not touched.

Implementation and all 32 new tests pass; the isolated full suite has 863
passes and 13 explicit skips. A checkpoint preserves the tested work and next
safe publication decision; current closure metadata uses a separately refreshed
context. Linux/macOS/publication remain separate, not inherited approval.
