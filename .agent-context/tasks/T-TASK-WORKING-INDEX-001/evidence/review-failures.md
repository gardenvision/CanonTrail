---
topic_id: task-working-index-failed-review-receipts
stand: "2026-10-09"
status: retained-failures
truth_level: historical
verification: {state: internally-reviewed, evidence: [.agent-context/tasks/T-TASK-WORKING-INDEX-001/evidence/progress.md]}
read_if_task_touches: [T-TASK-WORKING-INDEX-001, prior working-index defects]
primary_systems: [context continuity]
safe_to_edit: [Append later dispositions without changing the original review identities.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Retained independent rejections

Raw machine-local reports and fixtures remain outside the distribution. These
neutral receipts name the exact reviewed manifest and report hashes, not a
blanket approval, signature or later source identity.

| Revision | Source manifest SHA-256 | Report SHA-256 | Disposition |
|---|---|---|---|
| r3 | a184d949bc747968887a12c58ba0b3e86952e81d17e276953cc09afa264b9614 | 003594512daf15c7f5f41f324da676c30ac74e3cbaa84cf24246b7ecda343b73 | FAIL, WI-R3-001: working preflight skipped all active static integrity |
| r4b | cf67cb4a70f4b7250f8def32efbe47617c4ecefbe421c2f4c7fa0243d92d54f8 | 6b875f3e8720b63119fcd578c97b9d87b669ce54ca42c1a454d01a125704c31b | FAIL, WI-R4B-001: invalid active source grammar skipped with freshness |

r4b evidence SHA-256:
`112ef758f35a0a6c080fd093cf1aec816402d5a0ad1fcf1ab95f0736f646e2ea`.
The independently executed r4b reference/owner closure (28), mode/resume (11),
general regressions (22) and earlier integrity/freshness/capability (14) passed;
three clean source-identity counterexamples failed. Source and all 123 built
files were unchanged. Valid initial peer locks and preserved required sources
remove the confounds in the first synthetic discovery fixtures.

r5 author RED/GREEN evidence is separate. A subsequent independent follow-up
must actually check that sealed source; no disposition is inherited here.
