---
topic_id: continuity-write-hardening-verification-001
stand: "2026-09-27"
status: current
truth_level: active-snapshot
verification:
  state: internally-reviewed
  evidence: [test/continuity-write-hardening.test.ts, test/compact-handoff.test.ts, src/continuity-files.ts]
read_if_task_touches: [continuity write hardening verification, review follow-up]
primary_systems: [context continuity]
safe_to_edit: [Retain failed attempts and separate author checks from independent approval.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Continuity write hardening: author verification

## Scope and attribution

The new correction follows the review reconciliation in `review-intake.md`. The bounded R3 report identifies Codex as reviewer; the additional Claude report concerns the older R1 package. Neither approves these subsequent bytes. This high-risk change stays implemented/review-pending, not verified. No consumer update, shared-runtime replacement, remote operation or Git commit is part of this work.

## Implemented corrections

- One exact-spelling, portable, no-link path helper now protects continuity control reads and writes, including deeper parents, hard-linked files, old handoff/source archives, receiving archives, packets and the mutable active lock. Observed Git filenames remain data, not normalized control paths.
- Immutable collisions compare raw bytes. Strict UTF-8 reads do not fabricate replacement characters. Every known immutable collision and mutable destination is preflighted before output; immutable receipts precede active-context replacement.
- Git stderr rejects capture even with successful exit, retaining the diagnostic and making no automatic Git configuration change.
- Version-1 inventory sidecars must be unambiguous writer-format JSON: two-space indentation, final LF, no BOM or duplicate keys. All readers share the byte parser. Existing valid writer output is unchanged; the synthetic worked example was corrected, not historical evidence.
- Hash-named retained handoffs are audited even without a resume packet. Linked/excluded archive trees are visible errors. Later source changes do not invalidate historical integrity.
- New handoffs require current selected source hashes and existing explicit resume inputs. Human CLI output now exposes diagnostic detail and the separate inventory; new timestamps are quoted and path ordering uses locale-independent UTF-16 code units.

No schema shape changed in this follow-up. The earlier compact-handoff change still includes the new inventory schema and requires deliberate consumer schema synchronization. No automatic migration is implied.

## Regression method and results

`test/continuity-write-hardening.test.ts` adds 29 cases: malformed-UTF8 decoded-equal collisions, no-write late collisions, BOM/duplicate JSON, portable path identities, deep links/hardlinks, archive coverage, unbound historical handoffs, source freshness, CLI diagnostics, timestamps/order and Git warnings. Two cases require Windows; supported links are tested without pretending an unavailable capability passed.

The initial pre-fix run failed all 16 original cases. The first correction passed 15/16; the last fixture needed the documented active-context refresh after handoff replacement. A broader 108/110 run identified a stale linked-worktree fixture and changed missing-handoff wording; both were corrected without weakening assertions. Later test strengthening makes rehashed semantic mutations canonical JSON, ensuring that they reach semantic rejection rather than an earlier formatting failure.

Frozen hardening-r1 (258 files) passed Linux typecheck, isolated build and the full suite: **766 passed / 6 skipped / 772 total**, 37 files. Both manifest checks passed. The stronger example-byte test then correctly failed against the old inline example (29/30 passed); the example now matches actual writer output. Final r2 verification is below. Product implementation did not change between r1 and r2; the test and example did.

Final frozen r2 repeats Linux typecheck/build and the full suite successfully: **766 passed / 6 skipped / 772 total**, 37 files, 317.79 seconds. All 258 manifest entries match before and after. The strengthened example test passes. Windows r2 typecheck and isolated build pass as well; shared source dist was not rebuilt.

Final Windows r2 repeat: **759 passed / 13 skipped / 772 total**, 37 files, 274.82 seconds, exit 0. Command: `npm test -- --maxWorkers=1 --reporter=verbose`, retaining the package's default 15-second timeout and default worker pool. All 29 new hardening cases pass, including real exit-zero long-path Git diagnostics and Windows case aliases. The 258 snapshot files still match after execution. This successful repeat does not erase the earlier host-timeout observations or establish their precise cause.

Windows default-timeout runs encountered repeatable 15-second setup timeouts, including simple Git setup. The unchanged frozen R3 control also timed out, while a narrower repeat passed. This supports an environment/performance issue but does not establish its cause. Failed and interrupted runs remain retained; they are not called green. An npm-level timeout override was rejected for duplicate CLI options before execution. A direct 60-second fork-pool run was interrupted after prolonged delay; it also has no complete result. Source timeout/assertions were not changed. Any alternate-pool or longer-timeout result must be explicitly distinguished from the default command.

## Frozen inputs and external evidence

Full raw outputs and scripts remain outside the distributable tree in the maintainer's `canontrail-compact-handoff-20260926` work directory. Hashes below identify exact retained files, not downloadable public evidence or cryptographic reviewer authentication.

| Artifact | SHA-256 |
| --- | --- |
| source-hardening-r1-manifest.json | b37e342ce38375f78a4329535637eaca82d765a1eca7dd209902a1098725ee62 |
| source-hardening-r2-manifest.json | 837d1a2549d245e6c8e0fd8d84e3f215d81a3d11b77d250742c7f66be9e76262 |
| hardening-red.txt | 25ef057b8f321728aafa57b685824ad5b10455dbf374a60687ba6aa6c883892b |
| hardening-linux-full-r1.txt | 84459f388b5d36055064e8185ce47aafd9c3b157775d4e479db39bb129da1bdf |
| hardening-linux-full-r2.txt | 564140bac6f9ec8bc29300c7952223bd153de4da0de95ae96e37dbcc48c51c76 |
| hardening-windows-r2-check-build.txt | 5a71d82d949df322c07fc6efb532e1723cf94b5cf01d5460abba4e2f9e1b7253 |
| hardening-windows-full-r2-default.txt | 1ca42db97a1559965bbbda797e45676ffb5523d432c0ae050c20a8e2009e1b11 |
| hardening-linux-test-delta-v2.txt (example negative control) | 0708e3065e09845e2006f65c72688d7bd531b6141cf300920928d5db7a2cdec5 |
| hardening-preservation-preclosure.json | 03607d10b9b8d582fad1b3945a7a5e4fdccc9b2895841d783ca23f10f6b8a299 |
| hardening-terminology.txt | 13931f47f219bfa3e2c1f675310819d4ff431ed3cc31725808bd6f7930983497 |

The preclosure preservation check confirms 13 tracked historical continuity artifacts unchanged, all 87 shared stable build files unchanged, 8 retained compact-task archives plus its latest handoff unchanged, and 5 original review receipts/packages unchanged. All 133 implementation/test/schema/example/build-input files match the r2 snapshot. Current task metadata and active locks may subsequently be updated; historical receipts are not edited.

The first working closure run also passed validation (50 Markdown / 45 structured / 16 schemas, zero errors/warnings), healthy documentation audit, repository completion checks, both task handoff validations and a receiving dry run. The receiving selection contains 28 sources, no omissions and no automatic inventory selection; its 111,411 estimated input tokens fit the explicit 140k total, 16k output and 4096 input-safety budget. These framework-self-review estimates are not provider-token savings. After the final checkpoint, the repeated checks pass at 50 Markdown / 47 structured / 16 schemas; receiving input is 111,884 estimated tokens. The immutable observation is recorded in `.agent-context/tasks/T-CONTINUITY-WRITE-HARDENING-001/evidence/final-gates.json`, before that receipt and this link were stored. Both tasks retain exactly FINALIZE105/107/110 for review state, pending review check and implemented change. Final reindex/active-context refresh and external checks are repeated after storing the receipt; the receipt is not its own prerequisite or a claim to the final active-lock hash.

## Honest remaining boundaries

The writer assumes an exclusive stable tree. Preflight prevents known deterministic collisions; it is not a multi-file crash transaction and does not stop an adversary changing the filesystem between checks. Self-hashes are integrity metadata, not authentication against coordinated rehashing. Git may already normalize unrepresentable filenames before output. Generic prose such as a bare filename is not universally a discovered reference; explicit relative paths or typed evidence remain the supported route.

Exact-revision macOS/hosted CI and independent review of these new bytes remain open. Do not close those gates using the old R3 approval. Consumer rollout is separate. The human-output assertions and terminology search cover CLI wording; no application-layout or graphical-UI approval is claimed.
