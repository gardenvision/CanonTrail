---
topic_id: index-upgrade-author-verification
stand: "2026-10-10"
status: review
truth_level: active-snapshot
verification:
  state: internally-reviewed
  evidence: [src/metadata-index.ts, test/index-upgrade.test.ts, schemas/context-index.schema.json, .agent-context/tasks/T-INDEX-UPGRADE-001/evidence/local-quality.receipt.json, .agent-context/tasks/T-INDEX-UPGRADE-001/evidence/independent-review.md]
read_if_task_touches: [index upgrade verification]
primary_systems: [context index]
safe_to_edit: [Separate exact revision evidence, independent review, cutover and publication.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md, docs/index-rebuild.md]
---

# Author verification and independent findings

Public baseline: `8d48b72816b2195da73b3256d729534684504f3e`. Work is in a
separate source clone with uncommitted changes. This record is not consumer
rollout, historical repair, canonical promotion, hosted CI or publication.
Private raw logs/manifests/probe scripts are retained outside the source tree.

## R1 actually executed

Windows, Node v24.11.1: install with scripts disabled, typecheck, build and
serial full suite passed. 48 files, 1,055 passed, 13 pre-existing skipped,
1,068 total, 295.21 seconds. All 41 new upgrade cases passed; no new skip.
Dependency audit reported zero vulnerabilities (not a security certification).

Linux, Node v24.20.0: check/build and focused upgrade/working-index/initializer
suite passed: 122 tests in three files, no failures/skips. The 19 sealed changed
implementation inputs were rehashed before/after execution with zero mismatch.
Native macOS and hosted CI were not run for this candidate. Earlier platform
results are not borrowed as evidence of this change.

Own preliminary source validation: 86 Markdown, 90 structured artifacts,
19 schemas, zero errors/warnings; docs audit healthy with zero findings;
repository finalize passed. Task finalize correctly remained failed at only
pending status, acceptance, check and change-status gates.

The archive-read sentinel observed zero retained-payload read attempts in
metadata mode. The controlled 32-MiB invalid-archive fixture rebuilt metadata
under a 64-MiB heap. This is a synthetic boundary result, not measured speed or
memory for a real project's full validator. Strict validate/audit/default
index/refresh-finalize remain failed for damaged provenance; saved preview and
fresh-session current use reject incompatible indexes.

Three initial focused failures were recorded during author execution: one actual
Windows backslash normalization issue was fixed with the portable `/` policy;
two oracle mistakes were corrected (message versus detail; applied versus
dry-run preview). They are not presented as three product bugs.

## R1 independent review and R2 correction

An explicitly authorized independent local reviewer verified the exact R1
19-file seal, privately emitted the TypeScript runtime (42 JavaScript files
matched), and executed 34 independent passing controls. One regular-file symlink
capability was unavailable on native Windows, not passed; directory junctions
were tested. Its schema-valid, rehashed wrong inventory-path counterexample
retained `HANDOFF008` across strict validation, audit, index, finalize,
task-working and current-use resume, while only metadata projection succeeded.
Historical/source/receiving receipt bytes stayed unchanged.

The reviewer also found R1-F1: fresh init declares future documentation/task/
migration roots without creating them, so the original metadata-only
existence requirement was unusable immediately after init. R1 was approved only
with conditions, not as approval of R2.

R2 explicitly reports safely absent configured paths as `INDEX006` warnings and
`missing_configured_paths`, proves portable exact ancestry/case identity and
rechecks the missing set before writing. Missing references/schemas remain hard
failures. Tests cover baseline/none fresh init and a formerly absent empty root
appearing during preflight. The code, tests and policy docs were resealed; R2
quality passed: Windows full suite 1,057 passed / 13 pre-existing skips in 48
files (302.42 seconds); Linux focused 124/124 in three files, with zero sealed
source mismatch. Independent R2 boundary probes passed 49 Windows cases with
one unavailable file-symlink capability, and all 50 Linux cases.

These successes did not constitute approval: the reviewer independently
reproduced two further defects on Windows and Linux and rejected R2. A genuine
version-1 adoption manifest and unrelated version-1/versionless JSON records
could be replaced by the cache writer. Absent protected output roots with
case-variant names bypassed a case-sensitive role check. Neither defect was
waived or dismissed as a fixture problem.

## R3 output-ownership correction (review pending)

Both writer entry points now share a portable case-insensitive protected-role
guard, including adoption manifests and typed provenance destinations. Existing
JSON is replaceable only if it is a recognizable index-only payload; matching
or missing version numbers alone do not establish ownership. Unknown future
formats remain preserved. Explicit regeneration of malformed JSON at a separate
declared cache destination remains a documented operation requiring destination
review, not provenance recovery or a security credential.

Eleven new regressions cover genuine init/adoption preservation, both writers,
unrelated and mixed-purpose records, absent case-variant reserved roots, and
legitimate versionless/malformed cache repair. Windows focused suite 54/54
passed after typecheck/build. Final Windows full suite passed: 1,068 tests,
13 pre-existing skips, 48 files, 1,081 total, 305.66 seconds. Linux check/build
and focused suite passed 135/135 in three files (40.12 seconds); all 19 sealed
implementation inputs matched before/after. Typecheck/build were also rerun on
native Windows after the suite. No new skip was added. The R3 implementation
manifest SHA-256 is `0cc5b2e03cb85072d4ca4673d9d6f5b58532257c345f956ca2e9d8d718e0c9a5`.

Independent R3 probes have returned no blocking finding: output-ownership
controls passed 89/89 on Windows and Linux, the wider boundary rerun passed
49 Windows cases with one file-symlink capability unavailable and 50/50 Linux
cases. A separate TypeScript emit matched all 42 exercised JavaScript files.
The final R3 report APPROVES the exact local implementation and independently
closes the R1/R2 findings. Its identity and exclusions are recorded in
`independent-review.md`; the separately declared header/status/evidence closure
check is an additional gate, retained with the private Goal checkpoint rather
than inferred from that original approval. No source/consumer configuration is
automatically rewritten.

Own R3 preclosure checks: strict validation 87 Markdown, 92 structured artifacts,
19 schemas, zero errors/warnings; docs audit healthy and repository finalize
passed. Task finalize still correctly reported only pending lifecycle classes
`FINALIZE105/106/107/110`. Whitespace/diff checks passed. Terminology searches
confirmed metadata-only, format/order, incompatible-index and missing-scope
labels across protocol, usage, feature owner, finding codes and worked example.

## Preservation and remaining boundaries

`git diff --name-only 8d48b728 -- .agent-context/tasks` showed no changed
pre-existing task file. Only the new task's mutable context is refreshed; prior
source locks are archived as exact bytes. No original project, shared runtime,
existing historical receipt or Git remote was written by this Goal.
Stable exclusive tree access is required; this is not hostile-race atomicity.
Already distributed old CLI writers cannot be stopped by a new format marker.
Consumer cutover and provenance repair require separate authority and evidence.
