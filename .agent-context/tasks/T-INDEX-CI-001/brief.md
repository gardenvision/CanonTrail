---
topic_id: task-T-INDEX-CI-001
stand: 2026-10-10
status: completed
truth_level: active-snapshot
verification:
  state: internally-reviewed
  evidence: [.agent-context/tasks/T-INDEX-CI-001/evidence/verification.md, .agent-context/tasks/T-INDEX-CI-001/evidence/independent-review.md]
read_if_task_touches:
  - T-INDEX-CI-001
primary_systems: []
safe_to_edit:
  - Owning task; preserve existing project instructions, evidence and peer tasks.
do_not_use_instead:
  - AGENTS.md
---

# Canonical temporary-path instrumentation

## Objective

"Make metadata-index race-test instrumentation observe canonical temporary paths on every platform, without changing runtime behavior"

## Verified local acceptance

- AC-001: "Injected changes must actually occur exactly once and preserve the previous index"
- AC-002: Production source schemas and previous task files remain byte-identical.

## Decided boundary

The first hosted snapshot failed two mutation-injection checks on Windows and
macOS. Linux and the separate completion gate passed. The production reader
resolves canonical roots; the test compared reads with potentially aliased
temporary paths, so its intended mutations did not occur.

Resolve fixture roots before installing hooks, prove each injection happened,
and add an explicit repository-root alias control. Preserve all production code,
schemas and prior task/review bytes. No assertion weakening or new skip. Exact
corrected hosted CI remains a publication gate, not a local task claim.
