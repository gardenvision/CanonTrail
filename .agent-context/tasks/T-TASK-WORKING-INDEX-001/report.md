---
topic_id: task-working-index-result-001
stand: "2026-10-09"
status: implementation-awaiting-review
truth_level: active-snapshot
verification: {state: internally-reviewed, evidence: [.agent-context/tasks/T-TASK-WORKING-INDEX-001/evidence/verification.md]}
read_if_task_touches: [T-TASK-WORKING-INDEX-001, working-index completion]
primary_systems: [context continuity, documentation governance]
safe_to_edit: [Keep measured scope approval and deployment separate.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md, .agent-context/tasks/T-TASK-WORKING-INDEX-001/state.yaml]
---

# Working-index result

Implemented: read-only `index --task` and opt-in `context compile --working-index`.
The view can isolate two narrowly proved defects in unrelated noncanonical task
notes, without overwriting the global index or approving completion. Shared
truth, real/transitive dependencies, unsafe identity and structured corruption
still block. Locks bind their mode; previews and fresh resume re-establish scope.

Native exact-r5 Windows: 1007 pass / 13 skips; Linux: 1013 pass / seven skips,
zero failures on both (1020 cases). Independent review found real earlier
defects, retained in the evidence; the r5 remedy has its own author counterexamples
and preservation audit. See evidence/verification.md for exact identities.

The independent r5 technical review passed 99 corrected fresh cases; its exact
receipt is evidence/independent-review-r5.md. It does not approve the older
unpublished changes, strict project health or hosted CI.

Still open: supplementary integrated public-main review, strict closure after
metadata/active-lock refresh, fresh hosted macOS/Windows/Linux and
Node-floor checks, then authorized commit/push/merge. No publication or optional
completion signal has occurred. Consumers and older shared runtimes are untouched.

Next safe action: receive the review, consolidate only supported gates, archive
and deliberately refresh current active locks, obtain strict checks and publish
a reviewable branch. Merge only the exact green head without bypassing protection.
