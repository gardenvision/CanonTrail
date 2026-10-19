---
topic_id: task-T-FILE-PREFLIGHT-001
stand: 2026-10-18
status: completed
truth_level: active-snapshot
verification:
  state: verified
  evidence: [.agent-context/tasks/T-FILE-PREFLIGHT-001/evidence/verification.md]
read_if_task_touches:
  - T-FILE-PREFLIGHT-001
primary_systems: []
safe_to_edit:
  - Owning task; preserve existing project instructions, evidence and peer tasks.
do_not_use_instead:
  - AGENTS.md
---

# Single-file authoring preflight

## Objective

"Add read-only single-file authoring preflight, precise missing-field diagnostics, and discoverable entry helpers without changing repository approval"

## Verified acceptance

- AC-001: "A chosen governed Markdown or known structured artifact is checked without scanning peer tasks or writing files"
- AC-002: "Malformed YAML and missing or invalid fields return path-specific diagnostics, including actual allowed values, without a raw crash"
- AC-003: "Passing preflight never implies repository validity, continuity integrity, or task completion; existing strict gates remain unchanged"
- AC-004: "The entry route exposes existing authoring snapshot and task-working tools with executable examples"

## Local outcome and boundary

The user authorized this bounded implementation. The decided record and draft
feature owner preceded code changes. The four cases pass with actual CLI,
read-ledger, raw-hash and negative controls. Windows/Linux full suites, typecheck,
build and dependency audit passed; see `evidence/verification.md` for exact counts,
snapshot binding, author self-review and retained non-green harness runs.

This is local verification, not publication, independent review or canonical
promotion. Existing consumers and historical tasks remain unchanged. Inventory
representation and coordinated consumer rollout remain separate follow-ups.
