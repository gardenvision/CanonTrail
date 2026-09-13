---
topic_id: alpha-candidate-preparation-task
stand: "2026-09-13"
status: review
truth_level: active-snapshot
verification:
  state: internally-reviewed
  evidence:
    - .agent-context/tasks/T-ALPHA-CANDIDATE-001/evidence/verification.json
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

This task prepares a reviewable candidate. It does not grant a license, publish a repository/package, authorize real-project migration, or transfer old private review approvals. Until independent release review, the task may remain in review even when implementation checks pass.

Baseline local preparation was implemented and author-tested: 636 passed tests, 13 capability-dependent skips, no failures in the 649-case suite. Typecheck, build, dependency audit, structural validation and synthetic entry cases passed. Its strict repository gate failed on the frozen example's documented DOCS101 warning. Those recorded results and tested-input hashes describe the earlier candidate, not new approval of subsequently changed code.

The isolated follow-up T-FROZEN-EXAMPLE-LIFECYCLE-001 implements the age-only correction with its own 684-case verification evidence. The changes to the maintenance contract, worked-example explanation, readiness and roadmap were reviewed for this preparation context; none authorize publication or change historical example bytes. This task is still active in review. Its original active lock was archived byte-for-byte before recompiling the current working view. Historical evidence remains attributed to its actual tested input.

The independent frozen-example technical review and exact V3 hosted CI are now recorded in the correction task. They do not constitute whole-product release review. This metadata-only closure updates the shared readiness owner and archives both original V3 working locks before a current selection is compiled. The readiness document's verification now concerns the accuracy of its recorded facts and remaining gates; it stays draft, not canonically promoted, and this Alpha preparation task remains in review.

The subsequent T-MIT-LICENSE-001 applies the owner's explicit MIT choice, separately from this task. Its licensing metadata does not imply third-party clearance or public release. This task's V4 working lock was archived before refreshing the selected shared documentation; completed correction and teaching locks remain unchanged.

Next safe action: obtain whole-product release/content review and separate publication decisions. Preserve the exact reviewed V3 archive and its evidence; later metadata/licensing revisions are not retroactively hosted CI inputs. Do not publish, change the original repository, or rewrite historical locks. See `docs/alpha-readiness.md` for the separate release gates.
