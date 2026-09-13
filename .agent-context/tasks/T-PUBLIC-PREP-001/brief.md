---
topic_id: task-public-prep-001
stand: "2026-09-13"
status: completed
truth_level: active-snapshot
verification: {state: verified, evidence: [.agent-context/tasks/T-PUBLIC-PREP-001/evidence/verification.json, .agent-context/tasks/T-RELEASE-CLOSURE-001/evidence/review-receipt.json]}
read_if_task_touches: [T-PUBLIC-PREP-001]
primary_systems: [release preparation]
safe_to_edit: [Keep exact checks and pending review separate from publication.]
do_not_use_instead: [docs/alpha-readiness.md]
---

# Neutral naming and local release preparation

Apply the owner's neutral naming decision, preserve historical migration plans, and prepare a source-release checklist and license inventory. New generated plans and CLI help should say `legacy-header-v1`; deprecated input spellings remain accepted only for compatibility. No alias obfuscation and no existing artifacts rewritten to appear newly approved.

Change record owns acceptance and impacts. Migration execution semantics, safety gates and transaction formats are out of scope. High risk because serialized migration contracts are touched: the independent naming review and C1 boundary reconciliation are now recorded. The original source-only copy was subsequently placed in a new clean Git history; no private ancestors were copied and no earlier Git-backed handoff is invented.

Local preparation is completed. T-RELEASE-CLOSURE-001 owns the conditionally authorized clean-source publication, current platform receipts and still-open confidential reporting/hosting gates. The documentation-only alias deprecation, live-source replanning distinction and explicit evidence-counter erratum are retained; matching source-map targets are included. This task does not publish a repository or enable npm publication, and does not promote migration documentation to canonical truth.
