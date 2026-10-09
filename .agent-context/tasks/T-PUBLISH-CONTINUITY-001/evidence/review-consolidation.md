---
topic_id: publication-review-consolidation
stand: "2026-10-03"
status: in-progress
truth_level: active-snapshot
verification: {state: internally-reviewed, evidence: [src/context.ts, src/task-create.ts, test/context.test.ts, test/task-create.test.ts]}
read_if_task_touches: [T-PUBLISH-CONTINUITY-001, independent publication review]
primary_systems: [release preparation]
safe_to_edit: [Keep predecessor review separate from later corrections and preserve historical bytes.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Independent review intake and bounded correction

The independent local Claude reviewer conditionally approved exact predecessor
66be45ec5922ab50f0a957dd8800125ebda1db75 against public-main baseline
d4e9597be175c715624c12cc2b8f4d881b7632a8. The original report SHA-256 is
dccaa95e2111dcb50086913d2e4da60cee1819cf6a81c8e4458cfdee2415d1bd.
The privately retained scripts/result manifest SHA-256 is
3fabbccdebeeeaae8428c2647e01d0a73676879cb851fd989b2615882146acdc.
The raw report, private paths and probe corpus are not distributed here.

The reviewer independently reproduced 827 passes and 13 capability/platform
skips (840 cases, 41 files), clean typecheck/build/audit/validation, healthy audit
and repository finalization. It confirmed the exact predecessor's hosted runs
37126443541, 37126448412 and 37126448410. Windows hosted counts are 835/5;
macOS and both Linux variants are 833/7. These are predecessor results, not
future execution of this correction. Publication-task finalization also reports
FINALIZE106 because AC-003 is pending; the earlier instruction's expected-code
list omitted that legitimate acceptance gate.

## Conditions and owner decisions

- M1: Any new head requires its own CI and a bounded independent delta review.
  No earlier review is transferred to new runtime or metadata bytes.
- M2 / F-1: `.mjs` was already supported on the public-main baseline without the
  additional encoding/size policy. The integrated predecessor applies 8 MiB,
  valid UTF-8 and no NUL to it. Explicit owner acceptance of this compatibility
  tightening was accepted by the owner on 2026-10-03. The owner chose
  to retain the stricter rule and document the compatibility change. Existing
  historical locks are not rewritten or recertified under the new policy.
- M3 / F-5: The owner initially rejected retained project-name references, then
  explicitly superseded that decision and accepted the names as uncritical at
  maintainer discretion. No credentials or private project files were found by
  the reviewer. Preserve the current public history and immutable receipts;
  prefer neutral examples in new material. No history rewrite is authorized or
  performed by this correction.

## Bounded implementation decision before edits

Correct F-2 by using existing code-unit ordering for equal-cost report entries.
Correct F-3 by JSON-quoting the objective in the generated Markdown brief, as
already done for acceptance text. Keep the original semantic text in YAML; no
caller text grants authority. Correct F-4's inaccurate format-review attribution.
Clarify I-1's atomic-visibility comment without promising power-loss durability,
preserved POSIX modes or multi-file transactions. Artifact shapes stay unchanged.

Add counterexamples that fail on the predecessor before changing runtime code.
Run the complete chain from an isolated new source snapshot. Keep all older
archives byte-identical and refresh only owning active locks after inspecting
their changed selections. Review and exact-head CI remain explicit open gates.

I-2 (pre-existing non-atomic saved-preview lock writer), I-3 (trimmed inline file
intents), I-4 (human project-health suffix), I-5 (attack-fixture timing wording)
and I-6 (YAML-1.1 timestamp readers) are retained nonblocking observations, not
silently reported fixed. No migration, consumer rollout or release is included.

## Current verification

All four new counterexamples failed on an isolated predecessor-runtime snapshot
after install/check/build passed: one equal-cost report and three multiline
objectives. This is intentional RED evidence, not a failed corrected suite.
The corrected isolated snapshot passed all four focused regressions after fresh
install/check/build. Complete quality is recorded below; hosted correction CI
and independent delta review remain pending. The names and `.mjs` decisions are
both now explicit.
The previous conditional review is evidence for its pinned predecessor only.

The first index preflight correctly refused a downgraded readiness-document
header with CHANGE018: two completed historical changes declare that document
verified. Their immutable records were not edited. The document retains its
verified factual-guidance state, with the corrected source-backed format facts
and explicit pending correction review/release wording. This is not a new
canonical promotion or a transfer of earlier independent approval. The broader
historical-feature/current-document lifecycle coupling remains separate work.

## Retained revision-3 full-run failure and bounded fixture correction

The first new full Windows suite ran all 844 cases: 830 passed, 13 capability
skips, one failure. The failure was EPERM in a direct directory move while
preparing the execution-directory case-alias fixture, before rollback was called.
All four new report/brief regressions passed. Three unchanged-source focused
runs of that same case then passed. This demonstrates environment-dependent
setup behavior; no scanner or OS root cause is established.

Reuse the existing, tested Windows-only renameFixtureDirectory helper for that
fixture's two setup moves. Keep its maximum five retries / 775 ms delay, same
EPERM/EACCES/EBUSY filter and immediate failure on other errors or platforms.
Rollback itself and all alias/evidence assertions remain unchanged. The failed
complete run is retained rather than labeled successful; a fresh full chain is
required after this test-only correction. No runtime migration code is changed.

## Fresh correction quality evidence

The frozen source-r8-full manifest covers 312 files (2,597,958 bytes), SHA-256
4f76e69e7726c6026641986fa6be4398213b5b21b39e3b87785b7df65eaf1e54.
The complete fresh Windows chain passed install, typecheck, build and all 844
test cases: 831 passed, 13 explicit capability/platform skips, zero failures,
41 test files. Full dependency audit reports zero vulnerabilities. Validation
passed with 59 Markdown documents, 59 structured artifacts, 16 schemas and zero
errors/warnings; documentation audit is healthy and strict repository finalize
passes. Earlier RED and failed setup runs remain retained with their own scope.

Preservation rechecked 124 protected pre-correction control artifacts, all four
frozen test snapshots and 114 copied reviewer scripts/results: zero changed.
The shared stable CLI SHA-256 remains
e98ebcb1f8ea0b7716801b0ad084e3364f03b7390a7c71a107f923dbbb1bdfef.
Three owning active locks were refreshed after reviewing changed selections;
their exact prior bytes are retained in hash-named context archives. The original
140,000 total / 16,000 output / 4,096 safety budgets still fit. Public-source
records are now consolidated separately from this frozen tested snapshot.

The publication view deliberately omits optional full test sources
`test/context.test.ts`, `test/task-create.test.ts`,
`test/compact-handoff.test.ts`, `test/continuity-write-hardening.test.ts` and
`src/validator.ts` at the unchanged budget. The changed assertions were inspected
and executed in the isolated full chain; this compact evidence is selected instead
of claiming that every executed test source fits in the current lock. Required
sources remain selected, and omissions stay visible in the compile report.

This local chain does not execute Linux/macOS or approve a later commit. The new
head still needs exact hosted matrix evidence and an independent bounded delta
review before merge, high-risk verification or consumer rollout. No release,
canonical promotion, consumer update or real-project migration is performed.
