---
topic_id: field-authoring-002-verification
stand: "2026-10-08"
status: author-checked
truth_level: active-snapshot
verification:
  state: internally-reviewed
  evidence: [.agent-context/tasks/T-FIELD-AUTHORING-002/evidence/quality.json, test/document-authoring.test.ts, test/document-snapshot.test.ts, test/schema-diagnostics.test.ts]
read_if_task_touches: [T-FIELD-AUTHORING-002]
primary_systems: [document authoring, evidence snapshots, regression verification]
safe_to_edit: [Keep exact tested-source identities failures and platform limits.]
do_not_use_instead: [.agent-context/tasks/T-FIELD-AUTHORING-002/state.yaml, ARTIFACT_PROTOCOL.md]
---

# Author verification, not independent review

## Tested identity and commands

Clean starting source was cf2702d041c11934a8749267e792c0331ebabcd9.
The new uncommitted r2 product/test/document source snapshot contained 351
files, 2,969,220 bytes. Raw manifest SHA-256:
75d0fdec0f11cd9b0aa519e3fe00ab9711fe6429f60f4d3df54582e02e04f990.
Later own progress records/checkpoint metadata are separate from that tested
product snapshot; product code, tests and schema are not silently substituted.

Windows Node v24.11.1 and native Linux Node v24.20.0 were used. Linux copied
the exact manifest's bytes to native ext4 (filesystem type 61267), not a test
on a Windows-mounted case-insensitive source tree. Both ran:

```text
npm ci --ignore-scripts
npm run check
npm run build
npm audit --audit-level=moderate
npm test -- --maxWorkers=1 --reporter=default --reporter=json --outputFile=<external-receipt>
```

Default 15-second per-test timeout and existing skip policy were unchanged.
Windows full result: 945 pass / 13 skip / 0 fail, 958 total in 45 test files,
290.57 seconds. Linux: 951 pass / 7 skip / 0 fail, 958 total in 45 files,
153.19 seconds for the full command. Different skips exercise actual native
capabilities (case-sensitive paths, POSIX permissions/file links versus
Windows aliases/long paths); neither result is macOS evidence.

Focused Windows executed all 82 new cases in the three authoring/snapshot/
diagnostic test files. The checked-in worked example's three CLI commands
were executed, including preview/apply and exact historical read-back.
Raw reports remain externally retained, not nonexistent repository-relative
evidence files. Their hashes/counts are in the owned quality summary; the
external work output's STATUS document and manifests locate the originals.

## Counterexamples and boundaries

Draft cases cover complete installed/shipped schemas, caller-controlled
multiline text, no fabricated canonical truth, existing/alias/reserved/excluded
targets, missing/incompatible schemas and exclusive no-overwrite behavior.

Snapshot cases independently check BOM/CRLF/Unicode bytes and the ordered
JSON hash recipe; changed/deleted/renamed current sources stay historical.
Corrupt/missing/hardlinked bytes, hidden coverage, directory links, misplaced
records without a task inventory, fully rehashed incorrect owner/path/size,
extra authority and noncanonical JSON still fail. Oversized/NUL/invalid UTF-8
sources and read budgets fail without silently truncating or repairing data.

Two actual CLI index counterexamples (malformed governed header and missing
snapshot preimage) preserve the prior index and all broken evidence unchanged.
This is intentionally strict global safety, not task-local index isolation.
Orphan valid raw preimages are retained with warnings, not automatically removed.
Stable exclusive inputs are required; two-file capture is not crash-atomic and
does not resist every hostile concurrent namespace swap.

Schema diagnostics were checked against actual AJV enum/const params and
installed header/task schemas. No enum was relaxed or made globally uniform.
Manually parsed checkpoint input is a retained separate diagnostic follow-up.

## Earlier failed author run, retained honestly

The first focused Windows run passed 70 and failed 7 of 77. Its failures were
author fixture/oracle mistakes: a missing fixture parent, index writes included
in preservation baselines, an assumed document count and an assumed enum order.
Corrected tests plus five new integration cases were tested in fresh r2, not
inserted into r1 to rewrite its result.
R1's original manifest/report remain retained. Its scratch package lock was
subsequently changed for the bounded dependency probe; that working copy is
not claimed still byte-identical to its original manifest. R2 source bytes
remained unchanged after both platform quality chains.

## Dependency and preservation

A clean initial audit found development-only GHSA-68fv-2mgg-jv7q. Only the
existing source-map-js lock entry's version/resolved/integrity changed from
1.2.1 to 1.2.2, within its parent's range. Fresh install/audit passed with 0
findings on both systems; no exploit against CanonTrail is claimed.

338 baseline files were compared as raw bytes. Exactly twelve intended
existing owners changed: the index; protocol/roadmap; finding, parallel, usage
and self-documentation guides; lockfile; bundled guide; CLI; initializer;
validator. All 155 existing task files are unchanged. Shared source CLI and
old consumer handoff runtime match their recorded pre-work hashes.
Consumer data, editor state, configuration, historical locks and receipts were
not changed. No Git write operation beyond creation of the local work branch.

## Structural versus global completion

Before own closure metadata, fresh checks found 65 Markdown documents,
69 structured artifacts and 17 schemas. Index/structural preflight with
context freshness excluded passed 0/0; this is not full repository validity.
Full validation/audit reported exactly 19 LOCK004 source drifts in three
preserved active peer tasks. Strict repository finalization failed as required.
Task-scoped structure/documentation passed, while separate project health and
unfinished own acceptance/review gates stayed open. No raw error was hidden.

After progress consolidation, the fresh metadata preflight has 68 Markdown,
69 structured artifacts and 17 schemas: 0 structural errors/warnings. Full
validation retains the same 19 peer LOCK004 findings, with no own-context drift.
Task-scoped finalization passes structure/documentation but rejects completion
with exactly FINALIZE105/106/107/110. Quality acceptance/check closure and new
independent review remain pending; the change stays implemented. This is not
a passing global/release result.

The current report and all three new test sources are persistently required
context, not accidental optional picks. A compact phase checkpoint is the next
record; validate its actual archived source and inventory rather than trusting
this narrative. The high-risk change must not be marked verified without real
independent review or an authorized recorded human waiver. No consumer/release
is approved.
