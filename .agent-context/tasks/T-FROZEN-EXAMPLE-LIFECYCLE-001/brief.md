---
topic_id: frozen-example-lifecycle-task
stand: "2026-09-13"
status: completed
truth_level: active-snapshot
verification:
  state: verified
  evidence:
    - .agent-context/tasks/T-FROZEN-EXAMPLE-LIFECYCLE-001/evidence/verification.json
    - .agent-context/tasks/T-FROZEN-EXAMPLE-LIFECYCLE-001/evidence/review-receipt.json
    - .agent-context/tasks/T-FROZEN-EXAMPLE-LIFECYCLE-001/evidence/platform-results.json
    - .agent-context/tasks/T-FROZEN-EXAMPLE-LIFECYCLE-001/evidence/closure-verification.json
read_if_task_touches: [frozen example maintenance]
primary_systems: [documentation audit]
safe_to_edit: [Preserve historical bytes and independent review gates.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Hash-bound age handling for synthetic examples

Add an explicit age-only maintenance policy for exact immutable synthetic examples. Do not exempt live task files, canonical truth, structural/reference checks, source drift or future dates. Keep the old source Alpha and real projects unchanged. The release risk requires independent review before verified; no waiver is granted.

Author implementation checks passed on Windows/Node 24.11.1: 671 tests passed, 13 capability skips, 0 failures (684 total in 32 files). Typecheck and build passed. The focused rerun passed 52 cases with one skip. The new 35-case policy suite includes raw-byte drift, malformed declarations, real task paths, canonical/design truth, aliases, source-lock drift after rebinding, schema/reference errors and future dates. Original teaching inputs and their historical artifacts remain unchanged.

## Closure revision 2

Claude Opus 5 independently approved the exact V3 mechanism with conditions. Its report hash, narrow scope and three nonblocking follow-ups are preserved in `evidence/review-receipt.json`. Exact-V3 GitHub run `34747718414` then passed all four platform jobs, including real file-symlink probes. The original report was not a whole-product release review, and this author has not expanded it into one.

This revision only reconciles documentation and task metadata. All 83 runtime/schema/test/dependency sources retain their V3 bytes, as do all baseline examples. Local build/typecheck/dependency audit and 52 focused frozen-example/docs/finalization cases passed, with no skips or failures. New source metadata is checked locally; no new hosted run is claimed for this revision.

The original V3 active locks of this task and the still-active Alpha preparation task were archived byte-for-byte before current working views were recompiled. Historical teaching locks are not rewritten. The earlier Alpha 649-case and V3 684-case evidence remain tied to their actual sources. The current task state and revision-2 change are verified based on the recorded review, platform and closure checks; strict current task finalization must confirm those predicates and its last lock before handoff.

The Alpha preparation/release task remains in review. No license, public release, canonical promotion, new CI-harness review or real migration is authorized by this technical closure. R-1 clearer eligibility diagnostics, R-3 the protocol cross-reference and R-2 standalone audit JSON compatibility remain explicit nonblocking follow-ups.
