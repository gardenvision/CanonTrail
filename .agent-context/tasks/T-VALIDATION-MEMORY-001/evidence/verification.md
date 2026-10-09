---
topic_id: validation-memory-author-verification
stand: "2026-10-09"
status: current
truth_level: active-snapshot
verification:
  state: internally-reviewed
  evidence: [src/validator.ts, test/validation-memory.test.ts]
read_if_task_touches: [validation memory, retained continuity history]
primary_systems: [repository validation, retained provenance]
safe_to_edit: [Keep measured results separate from review and rollout.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Bounded validation memory: author verification

This is a working-tree correction on public baseline
`1567677c19eee656ea6878631014b54e1226b5ca`, in a separate local clone.
It is not a published release, consumer rollout or independent approval.
Private raw diagnostics and test harnesses are retained outside this repository.

## Native quality chain

Windows, Node v24.11.1: `npm ci --ignore-scripts`, `npm run check` and
`npm run build` passed. Dependency installation reported zero vulnerabilities.
The full built-source suite ran serially with one worker and passed:
47 files, 1,014 tests passed, 13 skipped, 1,027 total, zero failed; Vitest
duration 343.21 seconds. The seven new cases cover retained archives, late
corruption, malformed/schema-invalid input, source-lock provenance, inventory
binding, current-use source existence and a constrained-heap corpus.
Skips are not passes. This is not execution evidence for Linux or macOS.

## Controlled predecessor comparison

One synthetic fixture contains 96 retained handoffs, each with 3,072 structured
file observations: 68,223,254 YAML bytes in total. The exact published
predecessor and the corrected build were executed against that same fixture.

- Predecessor with a 128-MiB JavaScript heap exited 134 with V8 heap exhaustion.
- Predecessor with a 1,024-MiB heap completed; corrected build with 128 MiB
  completed. Their full positive JSON reports are exactly equal.
- A payload change in the lexically last archive, without rehashing, is reported
  as `HANDOFF005` by both builds. Their full negative JSON reports are exactly
  equal; the corrected run still uses the 128-MiB heap.
- Positive OS peak RSS: predecessor 489,748 KiB, correction 230,412 KiB.
  Negative peak RSS: predecessor 489,804 KiB, correction 229,356 KiB.

All six control assertions passed: small-heap predecessor failure, large-heap
predecessor success, small-heap corrected success, exact positive equality,
exact negative equality and detection of last-archive corruption.
RSS includes native memory and is not the JavaScript heap cap. These are
synthetic process measurements, not provider token or universal savings claims.

## Read-only real-scale diagnostic

A large live private consumer was validated without changing its files,
schemas or shared runtime and without a heap override. The corrected CLI
completed in 247.93 seconds, exit 1 for recorded validation findings, with an
empty stderr file and a valid JSON report. The normal V8 heap limit was
4,496,293,888 bytes; OS peak RSS was 472,696 KiB (about 462 MiB). Maximum
sampled heap use was 301,131,728 bytes; sampling can miss synchronous peaks.

The report counts 682 Markdown documents, 1,507 structured artifacts, 16
schemas, 277 errors and zero warnings: 202 `LOCK004`, 65 `LOCK008`, one
`INDEX003`, nine `HANDOFF008`. The reported earlier enlarged-heap run had
681 documents and 1,504 artifacts: this was a live corpus, not an atomic
preserved snapshot. Equal error-code totals are not proof of exact whole-tree
equivalence. The earlier private-memory trace and current RSS use different
metrics; no precise percentage reduction or speed improvement is claimed.
Completion without a runtime crash is not a passing consumer validation.

The nine inventory findings bind custom inventory filenames rather than the
required owner-scoped content-hash filename. Field inspection establishes a
path-binding mismatch, not missing bytes or a Git-worktree cause. No historical
receipt was repaired, renamed or rehashed to make this run pass.

## Integrity, scope and reproducibility

Every recognized retained handoff and inventory still receives full parsing,
schema and existing semantic/provenance checks. A parse failure is not counted
as a parsed artifact; parsed null or schema-invalid values retain their former
counting behavior. Other task, change, evidence and migration joins retain
their existing artifact map. The change bounds decoded continuity-history
lifetimes; one large input, Markdown, other artifact classes and diagnostics
can still consume memory. No archive exclusion, hash-only fallback or forced
garbage collection is introduced.

The built `dist/validator.js` SHA-256 is
`2e7942e2d72757b1e57c792034a944bf4f33c9624e60d2153bdb7643d2706441`.
The thin `dist/cli.js` entry wrapper is unchanged, so its leaf hash alone must
not be used to identify the corrected runtime. A complete build identity is
retained with the private diagnostic artifacts.

Initial invalid test data, one YAML quoting mistake and a guessed unsupported
CLI flag were corrected before successful checks. A first diagnostic launcher
failed before executing the CLI because a Windows import path was not a file
URL; its log is retained separately and is not a product validation result.

Independent local review subsequently approved the exact implementation; see
evidence/independent-review.md. Revision-bound Linux/macOS execution remains open.
Consumer migration/rollout and canonical-owner lifecycle work are separate
tasks. Neither this evidence nor a green author suite closes those gates.
