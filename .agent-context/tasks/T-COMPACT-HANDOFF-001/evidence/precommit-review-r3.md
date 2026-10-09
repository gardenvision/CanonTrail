---
topic_id: compact-handoff-precommit-review-r3
stand: "2026-09-27"
status: author-tested-review-pending
truth_level: active-snapshot
verification:
  state: internally-reviewed
  evidence: [src/worktree-inventory.ts, test/compact-handoff-review.test.ts, .agent-context/tasks/T-COMPACT-HANDOFF-001/change.yaml]
read_if_task_touches: [raw-byte inventory collision, compact handoff precommit checks]
primary_systems: [context continuity]
safe_to_edit: [Keep author checks distinct from independent review and retain earlier receipts.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Raw-byte collision found before commit

The maintainer paused the requested push and asked for further checks first. No commit, push, merge or consumer change occurred. Typecheck and the existing 41 focused cases passed again. The Windows/Linux revision-2 results remain reproducible evidence for their pinned implementation, not proof against new counterexamples.

An additional author-written scratch-only probe found a new gap in `writeWorktreeInventory`: on EEXIST it reads UTF-8 text and compares strings. A valid JSON inventory with a literal Unicode replacement character can be altered by replacing that character's three UTF-8 bytes with the invalid byte FF. The decoded string is identical, but the raw bytes and SHA-256 differ. The writer accepts the corrupted existing file; `verifyWorktreeInventory` then correctly rejects its raw hash. This is not a validation bypass or a successful overwritten original: it can produce a newly applied handoff bound to already-invalid evidence, contrary to the rejection-before-write contract.

Observed expected hash: `sha256:13609cb2e0a021353dd6d721cd5a4e2099c95ff484b98657a9036109c6460d4d`; corrupted hash: `sha256:c9dea87f37c4c4e63bdc62c18adad14ccf0f1635365d05d312439f7ba702774e`. Both the probe and its full result are retained externally. The real source checkout, prior review and consumer projects were not used as mutation targets.

Decision before implementation: encode expected bytes once, retain the hash check, write those bytes, and compare existing bytes as buffers. Add a full creation-path rejection case plus an exact-byte idempotence control with the valid Unicode character. Do not ban valid filenames or normalize evidence, change schemas, overwrite the corrupt file, or weaken the subsequent reader. The scope is the existing raw-byte integrity acceptance case, not the separately deferred archive-path/atomicity findings.

Independent follow-up and revision-bound macOS execution remain open. Local regression results and closure observations follow; no previous review approval is transferred to this revision.

## RED regression

The two new cases were run against the unfixed writer. The full handoff creation case failed because the call resolved and wrote its handoff/archive instead of rejecting the pre-existing wrong bytes. The exact valid-Unicode idempotence control passed. Result: 1 failed, 1 passed, 11 other cases excluded by the name filter; those 11 are not capability skips. The earlier 41-case focused suite and typecheck had passed, showing why this counterexample needs explicit coverage.

## Initial GREEN verification

The writer now encodes expected bytes once and compares the existing file as a raw Buffer, with the original immutable-write and path guards unchanged. Typecheck passed. Both compact suites passed all 43 cases, including the two new regressions (23.63 seconds on Windows). Full fresh revision-3 platform runs and final governance checks are still pending at this snapshot; those will be recorded below rather than inferred from revision 2.

## Final revision-3 author results

The frozen snapshot contains 246 source files excluding top-level Git metadata, dependencies and build outputs. Its manifest SHA-256 is `a4c3c7ddd91345b12720fb4eff839d9d78c270a759a6b21c7d65c514f4c1a66b`. Windows and the separate Ubuntu WSL filesystem copy both matched it after their complete runs; Linux also verified it before installation. Later task/evidence/continuity updates do not change the tested executable inputs.

- Windows: typecheck, isolated build and all 36 suites pass; 730 passed / 13 skipped / 743 total, 158.94 seconds. Node 24.11.1, npm 11.10.0, Git 2.45.1.windows.1. Full log SHA-256 `73ac4184db0a23b5b896a90eafd5d8ed85626d1afd314a5a7dd34338c5174975`.
- Linux: fresh dependency install, typecheck, build and all 36 suites pass; 739 passed / 4 skipped / 743 total, 95.77 seconds. Node 24.20.0, npm 11.19.0, Git 2.43.0. Install audit reports 0 vulnerabilities. Full log SHA-256 `879ebfc281d2651d001ea147652536bad4a5f25471869c6c512766112948d7ea`.
- RED log SHA-256 `960f4e448ec41859d8de04fa1dd1515ae3f37f93267b9fa7110f2c3b2ed3b950`; focused GREEN log SHA-256 `0fb34ec576652187f7ada43debeeee75366c12e286290f9baf75571e891dfa86`.
- A separate repeat of the original scratch probe against the isolated revision-3 build rejects the corrupt bytes with the expected collision error and leaves them unchanged. Original failure result SHA-256 `e53c636646d712e255bc379e0315b193438a774f4a40d9c430973f2c2033e5aa`; fixed result SHA-256 `d36bb2fb08e304dc0bf3a199a992f7b0e000b6808c367f2c3f8433527c2612cf`.
- The compiled inventory module SHA-256 is `13cf528ed3cf12bd00d3e8efe88af23756011795e729adde7a16a0be76850a4c`. The CLI entrypoint itself is unchanged from revision 2; its hash alone does not distinguish these builds. Use the snapshot manifest and module identity.

Preservation checks confirmed all 13 pre-existing tracked continuity artifacts, all 87 shared stable-build files, and the original reviewer ZIP/report unchanged. All 96 implementation/test/schema/integration/template/build-input files match the tested revision-3 snapshot. Source `git diff --check` passes. No commit, push, consumer synchronization or release was performed. Raw logs, probe scripts and manifests are retained outside the distributable source tree.

The current task/change remains review/implemented. The original revision-1 review is not transferred to revision 3; no independent reviewer or waiver has been invented. macOS cannot run locally and needs a later authorized, exact-revision hosted CI run. The separately triaged archive-path, multi-output atomicity and other deferred findings remain in `review-remediation.md`. Final structural/audit/continuity checks are recorded separately after the latest checkpoint, without turning review gates green.

## Closure checkpoint

The new checkpoint validates and preserves the replaced revision-2 handoff byte-exactly. [Revision-3 gate receipt](final-gates-r3.json) records structural validation (47 Markdown, 38 structured artifacts, 16 schemas, 0 errors/warnings), healthy documentation audit with no findings, repository strict finalize PASS, handoff validation PASS and a receiving dry run with no packet/active-lock writes. Task finalize correctly retains exactly FINALIZE105/107/110 for review state, pending independent review and implemented change. Its failure is not an implementation-test failure or a completed task claim.

The working and receiving contexts retain every required source. The optional CLI source is omitted within the existing budget; it is unchanged in revision 3 and exercised through the built CLI and full suites. The separate complete inventory is not added to mandatory receiving context. Estimated input is not measured provider consumption. A private-path/name pattern scan over newly added task/example/source files found no matches; this is a bounded hygiene check, not a comprehensive release/security audit.
