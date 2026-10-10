---
topic_id: index-ci-instrumentation-verification
stand: "2026-10-10"
status: review
truth_level: active-snapshot
verification: {state: internally-reviewed, evidence: [test/index-upgrade.test.ts, .agent-context/tasks/T-INDEX-CI-001/evidence/quality.receipt.json]}
read_if_task_touches: [T-INDEX-CI-001]
primary_systems: [test instrumentation]
safe_to_edit: [Preserve original failure evidence and distinguish local checks from hosted publication.]
do_not_use_instead: [docs/index-rebuild.md, ARTIFACT_PROTOCOL.md]
---

# Canonical fixture identity: measured correction

Parent: `5de2e88296260659d33092802452f2d19f22d3bf`. PR #5's original platform
runs failed the two intended mutation-injection checks on both native Windows
and macOS. Linux Node 24 and Node 20.19 and the separate completion gate passed.
Original run IDs: 38036425253 (push), 38036431836 (PR platform), 38036431835
(PR completion). Failure artifacts and raw logs are retained, not replaced.

The hook compared a potentially aliased temporary path with the production
reader's canonical path. Its intended input/directory mutations did not occur.
The corrected fixture factory resolves realpath before installing hooks;
explicit counters require one injection before checking rejection. Two new
input/scope cases pass a directory-link alias as repository root. Existing
rejection, diagnostic and raw-byte preservation assertions remain intact.
There is no new skip or relaxation of production path rules.

Actually executed local quality: Windows typecheck/build and 56/56 focused
tests; full Windows suite 1,070 passes, 13 existing skips, 1,083 total tests in
48 files (387.64 seconds). Linux typecheck/build and 137/137 focused tests in
three files. Test bytes stayed equal across the Linux run.

All 432 other predecessor source-tree files were hash-checked unchanged against
the sealed parent tree (only this test and the generated global index differ).
All 42 emitted production JavaScript files equal the independent R3 build.
The neutral derived receipt records exact test and raw-measurement hashes;
it is an author record, not authentication or a claim of independent execution.

Corrected native hosted CI and main verification remain publication gates.
No consumer schema/index/runtime switch, historical repair or canonical
promotion was performed by this task. The old implementation-task records stay
unchanged and retain their original approval scope.
