---
topic_id: validation-memory-bounded-history
stand: "2026-10-09"
status: completed
truth_level: active-snapshot
verification:
  state: reviewed
  evidence: [.agent-context/tasks/T-VALIDATION-MEMORY-001/evidence/verification.md, .agent-context/tasks/T-VALIDATION-MEMORY-001/evidence/independent-review.md, .agent-context/tasks/T-VALIDATION-MEMORY-001/evidence/platform-verification.md]
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
Windows/Linux/macOS execution for the committed implementation `8570c44` has
passed; evidence/platform-verification.md records exact runs and capability
limits. The technical task/change gates are verified. No consumer is deployed.

The maintainer subsequently authorized committing this reviewed correction,
pushing its branch and opening a pull request to obtain exact hosted platform
results. That earlier instruction did not authorize merging or consumer updates.
The maintainer has now separately authorized the metadata closure, successful
final-head CI, protected PR #4 merge and actual main verification as a goal.
Final metadata and main checks must be observed after publication; earlier CI
is evidence for unchanged implementation bytes, not a claim about future runs.
Shared runtime replacement, consumer update and tagged/npm release remain out
of scope. Historical locks and handoffs are not rewritten for this closure.
