---
topic_id: publish-continuity-progress
stand: "2026-10-03"
status: in-progress
truth_level: active-snapshot
verification: {state: internally-reviewed, evidence: [package-lock.json, .github/workflows/validate.yml]}
read_if_task_touches: [T-PUBLISH-CONTINUITY-001]
primary_systems: [release preparation]
safe_to_edit: [Record current observations without transferring historical approval.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Publication progress

Public main contains additional reviewed corrections; the local pending changes
must integrate them. Exact starting source was retained outside this repository.
Existing compact-handoff and continuity-hardening independent reviews remain
open. Branch publication and CI do not establish independent review or authorize
a real-project migration. Public-main ordering, stable cited evidence and atomic
replacement behavior are preserved. Existing continuity path preflight remains
in force; mutable replacement uses exact raw bytes and an exclusive temporary
file. Integration regressions cover a pre-existing temporary-file collision,
raw BOM/CRLF/Unicode replacement, and complete real Git status above 1 MiB.

The scoped dependency update changes only fast-uri from 3.1.6 to 3.1.8. Its
BSD-3-Clause notice was inspected in the fresh installed package; the public
inventory matches the new lock.

## Fresh author verification

The external source-r1 manifest covers 298 source files (2,420,143 bytes), based
on merge commit f08d3ca plus the subsequent test/documentation/current-lock
changes. Its raw SHA-256 is
1be0fcba6542b333d99a3df43425184fe3c0a3460fbf24e72f55dc68ca29c1fb.
This is a working-tree snapshot identity, not a claim that f08d3ca alone contains
all checked bytes. The manifest is retained alongside this record.

Fresh Windows installation, typecheck and build passed. The complete serial
suite passed 823 tests with 13 explicit platform/capability skips, 836 total in
40 files. The new real Git-status fixture exceeded 1 MiB and preserved all 6,200
unrelated entries, with no unrelated inline handoff files. The atomic collision
and raw mutable replacement regressions also passed. npm audit reported zero
vulnerabilities across 134 dependency entries. Validation passed with 58 Markdown
documents, 55 structured artifacts, 16 schemas and zero errors/warnings;
documentation audit was healthy and strict repository finalization passed.

An external logging-helper attempt stopped after installation due to its own
already-finished stream wait; no product assertion failed. The corrected helper
reran the entire chain with fresh logs. Raw logs remain outside the distribution.

Exact hosted Linux/macOS/Windows/Node-floor checks and independent review remain
pending. Historical locks/archives retain their original identities. Only the
three owning active locks were refreshed after inspecting source changes; the
initializer section now selects the same complete schema list at lines 104..121.
No shared consumer executable is rebuilt or replaced by this publication.

## Hosted revision-1 observation and fixture correction

The pushed head 373d605 passed both Linux matrix variants, macOS and the separate
completion gate. Both hosted Windows runs failed the same test assertion: the
Git invocation did not emit the long-path warning the local installation emits.
The failed runs (37124835783 and 37124889267) are retained externally; they are
not described as green or discarded by a retry.

Revision 2 corrects this test premise, not the runtime contract: a diagnostic
still requires rejection with no writes. Without a diagnostic the test must
find the exact deep-file status entry, compare the complete captured sidecar with
the independently observed Git entries, and preserve every pre-existing file.
Missing entries still fail. The platform-neutral injected-warning assertions
remain unchanged. Fresh execution of this changed fixture and the final hosted
revision is required; no global timeout increase or new capability skip is used.

The next complete local suite passed the changed long-path test but failed while
constructing a different migration attack fixture: Windows denied renaming its
fresh execution directory with EPERM, before the junction attack was installed.
Two focused unchanged-source probes produced one pass and another setup EPERM
in a different test using the same helper. The failure and probe logs are retained.
This establishes repeated setup access denial, not its OS/scanner root cause.

The fixture-only directory rename now retries identical Windows EPERM/EACCES/EBUSY
operations at most five times (775 ms total delay). Persistent errors, other error
codes and non-Windows errors still fail. Four deterministic unit cases pin this
bound. Product operations, containment assertions, no-mutation checks, global
timeouts and skip policy are unchanged. This is not a runtime migration fix or
proof of a hostile-race guarantee; the corrected complete suite is still required.

## Revision-2 local completion

The frozen source-r4 manifest covers 305 files (2,510,350 bytes), with raw SHA-256
a357d278a78a319e5b7b9353522479dc7c08db8c7d2ea9cfc61f3ce34072deef.
Five complete repeated control-evidence fixture runs passed. A fresh complete
Windows chain then passed installation, typecheck, build, 827 tests with 13
explicit skips (840 total in 41 files), full audit with zero vulnerabilities,
validation (58/57/16, zero errors/warnings), healthy documentation audit and
strict repository finalization. The four new fixture-helper unit cases passed.
This snapshot still precedes its new hosted revision; inspect the draft PR's
actual checks before calling that revision cross-platform green. All prior
failures and their distinct scopes remain retained, not silently overwritten.
