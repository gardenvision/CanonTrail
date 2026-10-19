---
topic_id: file-preflight-verification
stand: "2026-10-18"
status: verified-local
truth_level: active-snapshot
verification:
  state: verified
  evidence: [src/file-preflight.ts, test/file-preflight.test.ts, test/schema-diagnostics.test.ts]
read_if_task_touches: [T-FILE-PREFLIGHT-001 verification]
primary_systems: [file preflight]
safe_to_edit: [Retain measured results and distinguish local verification from publication.]
do_not_use_instead: [docs/file-preflight.md]
---

# Single-file preflight: local verification

## Revision and scope

Base: `34edacab3ee6001813208e192c217eec595958b9`. Uncommitted candidate on
`codex/file-preflight-20261018`; no publication, consumer cutover or canonical
promotion. A decided medium-risk record preceded implementation. The review
below is the author's self-review, not independent approval.

The change adds a read-only `check` command, precise missing-field pointers,
existing-helper discoverability and narrow malformed-header crash guards. It
does not change existing persisted artifact schemas, global error isolation,
status vocabularies or inventory representation. The new report schema is
included by fresh initialization; installed projects need no automatic migration.

## Acceptance and counterexamples

| Case | Measured oracle | Result |
| --- | --- | --- |
| AC-001 | Exact read ledger: config, selected file and two schemas only; no repository-validator call; fixture before/after hashes equal | PASS |
| AC-002 | Missing/malformed verification, invalid enums, malformed YAML/JSON and actual CLI failures return coded findings and precise field choices | PASS |
| AC-003 | Fixed non-approval flags; shape-valid corrupt lock passes preflight but strict integrity rejects; malformed peer still fails global validation | PASS |
| AC-004 | Actual bundled guide/help and checked-in example executed; task/document/snapshot and budget-driver routes are visible | PASS |

Additional negative controls cover traversal, wrong case, hardlinks, linked
ancestors, exclusions, missing/unsupported/oversized/NUL/invalid-UTF-8 inputs,
unrelated corrupt schemas and reference fan-out. BOM/CRLF/Unicode retain raw
identity. Required shipped and installed schema versions both apply.

## Baseline defect and self-review corrections

An independently constructed minimal fixture against the unchanged baseline
reproduced three property-access exceptions when verification was absent:
validate, documentation audit and direct index generation. The candidate returns
failing SCHEMA005 diagnostics, or a path-specific direct-index rejection; no
replacement index is written. Ten additional malformed-header variants all
failed closed in file check, validation and audit without an exception.

Author self-review found and corrected two additional edge cases: invalid
metadata prevented comparing the index but audit called it current; a configured
index path could hide a recognized artifact's real schema. Regression tests now
require invalid audit state and failed configuration, plus a valid-index control.
These later changes received their own complete r2 platform runs.

Earlier non-green runs are retained outside the distributed tree: the first
focus run used an invalid native-ESM spy; r4's positive index fixture forgot to
govern that selected file. Both test harnesses were corrected without relaxing
product behavior. A helper initially reused a baseline-results filename; the
original baseline was faithfully rerun into a separate exclusive receipt. It is
that preserved baseline receipt, not the overwritten filename, that supports RED.

## Exact r2 test snapshot

The 458-file source snapshot manifest has SHA-256
`7aadbdb097bc4b2d2cd226f8666d58ac49228ce8eec1ca61469f4746984da0c9`.
Linux transport verified every selected file before running. The Windows source
still matched all 458 files after both runs. Lifecycle/evidence updates made
after these tests are separately index/validation/audit gated; they are not
misrepresented as bytes already present in that frozen test snapshot.

| Execution | Result | Raw JSON SHA-256 |
| --- | --- | --- |
| Focus r5, three files | 85 pass, 0 fail, 0 skip | `ecff53f80de881f3536537b735bf84e86706e42200f76663bdf5d24176422de2` |
| Windows, Node 24.11.1 | 1120 pass, 0 fail, 13 existing skips; 49 files | `8ea068399698a381e28b87fad22c7e48353d0bf4fae60b073345d25616071a7c` |
| Linux, Node 24.20.0 | 1126 pass, 0 fail, 7 existing skips; 49 files | `7c66f8909324256b43aee5b1a4c86bdba68423b0be937bac242f4330095d9473` |

Both full runs used `npm run check`, `npm run build` then
`npm test -- --maxWorkers=1 --reporter=default --reporter=json`. Each platform
had 1133 tests total. There are 49 new file-preflight cases and one additional
schema-diagnostic case; no new case is skipped. Dependency audit reported zero
vulnerabilities. Raw logs, exact source manifests and author review are retained
outside the distributed tree by the operator.

The built candidate `dist/cli.js` SHA-256 is
`872954b6b623d5d56fc6036dac8a705151a101f7ebc50e4a625b0ee4314db830`.
That file's hash alone is not a whole-runtime provenance or release certificate.
All 242 pre-existing task files matched baseline bytes; the existing shared
runtime was not rebuilt or replaced. New example/result bytes are neutral and
do not expose consumer names or absolute home paths.

## Remaining boundaries

Native macOS and hosted CI were not run for this local snapshot. A post-exit
inspection found the Linux temporary test directory no longer present; no
post-run Linux tree-preservation claim is made. Pre-run exact transport and the
completed test receipt remain recorded. A later verification helper categorized
missing files as changed; that is not evidence of product mutation.

Stable local inputs are required; file preflight is not an atomic filesystem
snapshot or hostile-race protection. Structural success is not self-hash,
cross-artifact, canonical, current-use, repository or completion approval.

Separate follow-ups retain inventory growth, strict index JSON error formatting,
and coordinated consumer entry-route cleanup. Do not delete old inventories or
rewrite historical handoffs. This task does not authorize any of those changes.

## Closure checks and pre-existing documentation debt

The refreshed index and current owning-task context were applied. The detailed
checkpoint was created with the prior checkpoint/source context archived, then
validated. Repository validation passed with 96 Markdown documents, 106
structured artifacts, 20 schemas and zero errors/warnings before this final
closure-note update; the final continuation may add retained checkpoint artifacts.

At the actual date 2026-10-18, audit has zero errors but six DOCS101 age warnings.
Consequently strict task and repository finalization with `--fail-on-warnings`
fail their documentation gate. The repository structural gate and owning-task
completion gate both pass. This is NOT a green strict finalization claim.

The six unchanged older documents are `CONTRIBUTING.md`, `SECURITY.md`,
`docs/change-integrity.md`, `docs/migration.md`, `docs/platform-support.md` and
`examples/migration-plan/README.md`. Their bytes and the 30-day draft freshness
policy match baseline. They require actual content review in a separate
maintenance step, not an unverified date bump, relaxed policy or backdated audit.
That project debt remains visible and is not relabeled as a feature defect or
silently suppressed. Native macOS/CI and publication remain separate as above.
