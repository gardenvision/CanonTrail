---
topic_id: validation-memory-bounded-history
stand: "2026-10-09"
status: review
truth_level: active-snapshot
verification:
  state: internally-reviewed
  evidence: [.agent-context/tasks/T-VALIDATION-MEMORY-001/evidence/verification.md]
read_if_task_touches: [large retained continuity archives, validation memory]
primary_systems: [repository validation, retained provenance]
safe_to_edit: [Keep implementation checks separate from review and rollout.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Bounded retained-continuity validation

The maintainer supplied a default-heap validation crash and a successful but
near-limit enlarged-heap diagnostic on a large private consumer. Do not publish
private source paths or raw consumer task records. The added archive coverage
must remain complete while parsed handoff and inventory lifetimes are bounded.

Implement in this separate local checkout. Keep the published/shared runtime
and all consumer files unchanged. Do not skip history, weaken schemas, compare
historical selected sources to current bytes, repair evidence or raise the normal
heap requirement. Preserve report counts, findings and current-use behavior.

Acceptance: a long synthetic history completes in a constrained child-process
heap and still detects a damaged last archive, invalid source-lock provenance,
wrong inventory owner and malformed input. Compare exact old/new reports on
small positive/negative fixtures. Real consumer execution, independent review,
cross-platform evidence, publication and rollout remain separate gates.

Implementation and Windows author verification are complete. The real-scale
read-only diagnostic no longer exhausts the normal heap; existing validation
findings remain visible. Independent local review approved the exact implementation
identities; its disposition is recorded in evidence/independent-review.md. Exact
Linux/macOS execution remains pending. The task is not verified or deployed.

The maintainer subsequently authorized committing this reviewed correction,
pushing its branch and opening a pull request to obtain exact hosted platform
results. This is branch/PR authorization only: no merge, release tag, shared
runtime replacement or consumer update is authorized by that instruction.
