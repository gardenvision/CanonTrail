---
topic_id: task-public-prep-001
stand: "2026-09-13"
status: review
truth_level: active-snapshot
verification: {state: internally-reviewed, evidence: [.agent-context/tasks/T-PUBLIC-PREP-001/evidence/verification.json]}
read_if_task_touches: [T-PUBLIC-PREP-001]
primary_systems: [release preparation]
safe_to_edit: [Keep exact checks and pending review separate from publication.]
do_not_use_instead: [docs/alpha-readiness.md]
---

# Neutral naming and local release preparation

Apply the owner's neutral naming decision, preserve historical migration plans, and prepare a source-release checklist and license inventory. New generated plans and CLI help should say `legacy-header-v1`; deprecated input spellings remain accepted only for compatibility. No alias obfuscation and no existing artifacts rewritten to appear newly approved.

Change record owns acceptance and impacts. Migration execution semantics, safety gates and transaction formats are out of scope. High risk because serialized migration contracts are touched: independent review is required before verified. This candidate is a separate source-only copy; no Git-backed handoff is invented.

The public destination, actual confidential security contact, independent Alpha review and publication approval remain separate decisions. Prepare guidance without guessing those values. Source release is the first target; package documentation can be made complete without enabling npm publication.
