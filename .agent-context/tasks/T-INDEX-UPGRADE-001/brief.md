---
topic_id: index-upgrade-task
stand: "2026-10-10"
status: completed
truth_level: active-snapshot
verification:
  state: reviewed
  evidence:
    - .agent-context/tasks/T-INDEX-UPGRADE-001/evidence/verification.md
    - .agent-context/tasks/T-INDEX-UPGRADE-001/evidence/independent-review.md
read_if_task_touches: [index upgrade correction]
primary_systems: [context index]
safe_to_edit: [Record actual implementation and verification without implied rollout.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md, docs/index-rebuild.md]
---

# Safe index reconstruction and upgrade identity

Introduce an explicit metadata-only global index rebuild. It checks the actual
index inputs but does not parse the continuity archive or approve repository
integrity. Strict commands remain strict. Name the current deterministic format
and ordering semantics and explain legacy/unsupported indexes and central CLI
pinning. Existing version-1 index writers cannot be retroactively guarded.

Keep unchanged historical locks, receipts, consumer projects and shared runtimes.
No automatic initialization, schema synchronization, recovery, lifecycle
promotion, publication or Git transport. Tests use neutral synthetic data.

Implementation, independent review and platform evidence are distinct gates.
The explicit projection/format boundary is implemented. Independent R1/R2
findings led to visible safe-absence handling and R3 output-ownership guards.
R3 native tests and independent implementation review passed. Closure metadata
and final continuity are verified separately before Goal completion. The next
safe action after that is a separately authorized integration/platform-publication
review, then one central quiet-window consumer update. No such operation is
performed or authorized by this task.
