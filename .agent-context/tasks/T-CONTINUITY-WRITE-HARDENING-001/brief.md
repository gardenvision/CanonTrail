---
topic_id: task-continuity-write-hardening-001
stand: "2026-10-09"
status: completed
truth_level: active-snapshot
verification:
  state: verified
  evidence: [src/handoff.ts, src/resume.ts, src/resume-audit.ts, src/worktree-inventory.ts]
read_if_task_touches: [continuity write hardening, retained handoff integrity]
primary_systems: [context continuity]
safe_to_edit: [Preserve historical receipts and distinguish author checks from independent approval.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Continuity write hardening

The maintainer asked to implement remaining improvements after two conditional reviews. This is a new high-risk correction, not approval borrowed from the bounded compact-handoff R3 review. Preserve the frozen R1/R3 review packages, historical continuity artifacts and shared stable build. Work only in the current CanonTrail source checkout and disposable test fixtures. No consumer rollout or automatic Git-configuration change.

## Decided scope

- Fail closed when Git reports warnings during status capture, even with exit code zero.
- Preserve and compare exact archive bytes; reject malformed UTF-8 on continuity reads.
- Share exact-spelling, no-link control-path checks across handoff, inventory and resume output/read paths. Preflight every immutable collision and mutable destination before the first output write. Exclusive stable-tree access is still required; no multi-file crash transaction or hostile concurrent-filesystem guarantee is claimed.
- Validate retained hash-named handoffs even without a resume packet; preserve the distinction between historical integrity and current-source freshness.
- Reject ambiguous inventory serialization, check current selected sources before creating a new handoff, expose diagnostic details, and use deterministic code-unit ordering.
- Document remaining evidence-discovery, Git filename, timestamp/parser and unsigned-provenance boundaries instead of inventing authentication or weakening gates.

Protocol section 8 and the existing usage/worked example own these rules; no parallel feature document or artifact-shape migration is necessary. Review receipt/triage is in evidence/review-intake.md. Acceptance and ten impact decisions are in change.yaml.

## Verification and completion boundary

Use explicit negative controls, raw file inventories, junction/symlink/hardlink cases when supported, real Git long-path behavior on Windows, historical drift controls and CLI output checks. Build a new isolated snapshot, never the shared source dist. Run Windows and Linux full suites; macOS needs exact-revision hosted CI. Record any skipped capability honestly. New code remains review-pending until independent review or an explicit human waiver; the user has not authorized a new reviewer in this turn.

## Historical implementation checkpoints

The correction is implemented, with 29 additional regression cases and the shared control-path/raw-byte helper. Protocol, usage, human diagnostics and the worked example agree with the implementation. Final r2 suites pass: Linux 766 tests with 6 platform skips; Windows 759 with 13 skips, both 772 total in 37 files. Typecheck/build pass on both; the successful Windows repeat uses the unchanged default 15-second timeout after earlier recorded setup timeouts. Exact results, failed attempts, preserved-history checks and remaining limitations are in `evidence/verification.md`. The task stays in review; neither old approval nor author testing closes the independent review or exact macOS/CI gates. Historical archives and the stable consumer runtime remain unchanged.

## October 9 technical closure

This task's implementation, declared acceptance cases, ten impact decisions and
required technical checks are closed by the exact r5/50f7 evidence and separate
independent decisions. The current owner is state.yaml; the consolidated record
is .agent-context/tasks/T-TASK-WORKING-INDEX-001/evidence/integration-closure.md.
Earlier pending statements above are historical checkpoints, not the current
gate. Final closing metadata, its new head and the protected merge require their
own exact checks. No consumer rollout, schema migration or promotion is implied.
