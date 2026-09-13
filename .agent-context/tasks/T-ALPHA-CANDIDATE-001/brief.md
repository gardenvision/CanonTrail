---
topic_id: alpha-candidate-preparation-task
stand: "2026-09-13"
status: completed
truth_level: active-snapshot
verification:
  state: verified
  evidence:
    - .agent-context/tasks/T-ALPHA-CANDIDATE-001/evidence/verification.json
    - .agent-context/tasks/T-RELEASE-CLOSURE-001/evidence/review-receipt.json
read_if_task_touches:
  - alpha candidate preparation
primary_systems:
  - release preparation
safe_to_edit:
  - Preserve open release/content gates; attribute the separate owner license decision accurately.
do_not_use_instead:
  - VISION.md
---

# Prepare a bounded local Alpha candidate

Preserve the framework implementation, schemas and useful synthetic examples while separating private development evidence from the proposed distribution. Establish portable onboarding and truthful new operational records. Apply small, tested dependency/documentation corrections only in this candidate.

This task prepares a reviewable candidate. It does not grant a license, publish a repository/package, authorize real-project migration, or transfer old private review approvals. Its independent C1 review is complete for local preparation; remaining publication/security/hosting obligations belong to T-RELEASE-CLOSURE-001.

Baseline local preparation was implemented and author-tested: 636 passed tests, 13 capability-dependent skips, no failures in the 649-case suite. Typecheck, build, dependency audit, structural validation and synthetic entry cases passed. Its strict repository gate failed on the frozen example's documented DOCS101 warning. Those recorded results and tested-input hashes describe the earlier candidate, not new approval of subsequently changed code.

The isolated follow-up T-FROZEN-EXAMPLE-LIFECYCLE-001 implemented the age-only correction with its own 684-case verification evidence. At that stage this task remained in review. The changes to the maintenance contract, worked-example explanation, readiness and roadmap did not authorize publication or change historical example bytes. Its original active lock was archived byte-for-byte before recompiling the current working view. Historical evidence remains attributed to its actual tested input.

The independent frozen-example technical review and exact V3 hosted CI are recorded in the correction task. They do not constitute whole-product release review. That earlier metadata closure updated the shared readiness owner and archived both original V3 working locks. The readiness document's verification concerns the accuracy of recorded facts and remaining gates; it stays draft, not canonically promoted.

The subsequent T-MIT-LICENSE-001 applies the owner's explicit MIT choice, separately from this task. Its licensing metadata does not imply third-party clearance or public release. This task's V4 working lock was archived before refreshing the selected shared documentation; completed correction and teaching locks remain unchanged.

Closure: the independent C1 review checked the curated inventory, synthetic onboarding, package/source-map completeness, raw-byte Git transport and preserved historical artifacts. C1 also passed the exact four-job hosted platform matrix. See the linked review/platform receipts; these are not legal clearance or publication permission. Preserve historical source and evidence. The next safe action belongs to T-RELEASE-CLOSURE-001: finish the approved security/hosting decisions before public release.
