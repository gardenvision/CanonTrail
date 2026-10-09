---
topic_id: compact-handoff-independent-review-request
stand: "2026-09-26"
status: pending
truth_level: active-snapshot
verification:
  state: unverified
  evidence: [.agent-context/tasks/T-COMPACT-HANDOFF-001/change.yaml]
read_if_task_touches: [independent compact handoff review]
primary_systems: [context continuity]
safe_to_edit: [Preserve the review's independent scope and do not fabricate approval.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Independent local review request

Review the uncommitted working snapshot on `codex/compact-handoff-inventory`, based on `f2f95541853ca97daf486c92844745c498f9afb8`, not HEAD alone. Include newly added files in the diff. The task is high risk because several continuity consumers must enforce the same provenance contract. Independent review is pending, not waived.

Read AGENTS, protocol sections 8/8.1/8.2 and 10/12, this task's brief/change/state and verification evidence. Inspect `worktree-inventory.ts`, `handoff.ts`, `resume.ts`, `resume-audit.ts`, relevant validator/CLI/initializer changes, both affected schemas and the compact example. Evaluate the oracle independently, not just the author's tests.

Challenge complete Git entry retention and exact rename identities; sidecar raw-byte binding and owner/time/count/dirty consistency; invalid or missing sidecars through every consumer; retained versus current receipt behavior; unsafe links/aliases/collisions; old-schema no-write behavior and legacy compatibility; budget/read-order exclusion without loss of safety disclosure; missing-reference diagnostics without gate bypass. Explicit checkpoint notes must not be truncated. Unsigned hashes are not authorization or proof of producer completeness.

Use only new synthetic scratch fixtures for experiments. Do not inspect or change consumer projects, publish, alter historical locks or claim Linux/macOS execution from Windows results. Do not modify production source as part of review. Distinguish deterministic product failures from unavailable host capabilities or the recorded EPERM test-setup incident; do not weaken those assertions.

Return findings with paths, concrete reproduction/oracle, severity and approval scope. Name untested boundaries. Approving implementation is not publication, a consumer schema update or permission to rewrite existing handoffs. The author must separately reconcile review and closure metadata before `verified`.
