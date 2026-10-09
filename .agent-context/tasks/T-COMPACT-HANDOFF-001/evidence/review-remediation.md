---
topic_id: compact-handoff-review-remediation
stand: "2026-09-27"
status: implemented-review-pending
truth_level: active-snapshot
verification:
  state: internally-reviewed
  evidence: [.agent-context/tasks/T-COMPACT-HANDOFF-001/change.yaml]
read_if_task_touches: [compact handoff review remediation]
primary_systems: [context continuity]
safe_to_edit: [Keep original review scope separate from author remediation and do not infer approval.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Conditional review and bounded remediation

External Claude review of revision 1: APPROVE WITH CONDITIONS, Windows only. Raw report SHA-256: `b4415fca6a8ba48272dbf73fdab31817fa47ed95e218b7fb5ca0ee5b6cfe2990`. Reviewed ZIP SHA-256: `e967b720b722633dfd985d09b2a7e61a8528404f4cd1949a1fad69a0b6e3c09a`. The original report and test scripts are retained externally; no private paths or project inventory are redistributed here. The author read the complete report on 2026-09-27. Conditional review is not an unconditional approval of later edits.

Independent reproduction reported 717 passed / 13 capability skips / 730 total; a real old/new fixture retained 943 status entries with handoff bytes 103,215 -> 2,361 and estimated receiving tokens 27,235 -> 2,022. These are synthetic artifact/selection measurements, not provider-token telemetry. Raw source, prior artifacts and original reviewer package remain unchanged as evidence of that earlier revision.

## Authorized correction decisions, recorded before implementation

- F1: Require the CanonTrail project root to equal its local Git worktree root when creating new handoffs/checkpoints. Explicit fail-before-write for nested projects is one of the review's accepted remedies. Keep inventory and selected file identities on one root without adding an unreviewed nested-root mapping format. Existing artifact reading is not retroactively rejected or rewritten; init/context are not automatically moved.
- F2: Preserve the raw-byte contract. Document reviewed consumer `.gitattributes` rules before artifacts are first staged, fresh-clone verification, and exact recovery from proven original bytes. Add protected/unprotected `core.autocrlf=true` clone fixtures and an actionable inventory hash-mismatch hint. No silent normalization, rehashing historical evidence, global Git configuration or consumer edits.
- F3: Give LOCK003 and HANDOFF004 source-specific recovery guidance, reserve immutable-provenance instructions for actual evidence/control references, show the resolved repository-relative target, and avoid an evidence-only blanket index hint. Recompilation can refresh an intentional optional-source change but cannot replace a missing required source or recreate historical evidence. Existing handoff replacement also requires its existing sources to validate; do not promise that `--replace` bypasses that guard.
- No new task generator, coordinator, watcher, agent messaging, publication or consumer rollout is authorized by this revision.

## Other findings retained for separate work

F4/F5/F8: human diagnostic/help completeness. F6: preflight all immutable outputs to avoid orphan sidecars on a later collision (multi-file apply is not atomic). F7: specify UTF-16 code-unit ordering explicitly. V1: stale source locks can produce an immediately invalid handoff; V2: existing archive/resume writes follow links at deeper archive directories; V3: limited bare-filename evidence heuristic; V4: locale-dependent inline file ordering. Do not represent these as fixed by the three-remedy scope. V2 is a safety follow-up requiring its own review and tests before making stronger whole-continuity path-safety claims.

## Verification progress

The three bounded corrections are implemented with eleven additional regression cases in `test/compact-handoff-review.test.ts`. Shared consumer runtime remains at f2f9554; changed code was built only in isolated snapshots. No consumer project, Git configuration, remote or original reviewer package was modified.

1. RED run before production fixes: 9 failed / 2 passed / 11 total, 8.33 seconds. Log SHA-256 `d93487f33af2da7cf3ff2c1982754a443298759158b7baa892e9f85718de8978`.
2. First corrected Windows focused run: 11 passed, 10.67 seconds; first full run: 728 passed / 13 skipped / 741 total, 36 files, 158.57 seconds. Full log SHA-256 `81c42d3198b2888a7e09fe690970cf05b0cf1c2614ac2faf4c95349d21326d0d`.
3. First Linux run: 735 passed / 2 failed / 4 skipped, 741 total, 95.14 seconds. Both failures were clean-status assertions in the new clone fixture: `git -c core.autocrlf=true clone` set a one-command policy, then Linux status used its different host default. The clone now uses persisted clone-local `--config core.autocrlf=true` and asserts that local setting. No production behavior or assertion was weakened. Initial log SHA-256 `fd76b9d5e213b224149d8e159368b86d5b30ae7bd7299865d41a65a201e0cb12`. That failed run ended before its post-run manifest check; no post-run preservation claim is made for it.
4. Final focused Windows repeat: 11 passed, 9.22 seconds. Log SHA-256 `8ec6ee65f37780e7af91eac8a5ae1c578a32de58e04352a1f4df96a3e056fff7`.
5. Final Windows full suite: 728 passed / 13 skipped / 741 total in 36 files, 161.31 seconds. Node 24.11.1, npm 11.10.0, Git 2.45.1.windows.1. Typecheck and isolated build passed. Full log SHA-256 `e7575e9e003249c7d9177a1679f5d4c3fe6469438c9cfbc3fd7eef93f78cee12`.
6. Final Linux full suite in a separate Ubuntu WSL filesystem: 737 passed / 4 skipped / 741 total in 36 files, 95.89 seconds. Node 24.20.0, npm 11.19.0, Git 2.43.0. Fresh `npm ci --ignore-scripts`, check and build passed; install audit reported 0 vulnerabilities. Full log SHA-256 `4f7f5eae62afb47cf2404caed63f7bf62d61685d6746834b512fecfb7d2a06ad`.

The final tested snapshot contains 240 source files (excluding top-level Git metadata, dependencies and build output); its manifest SHA-256 is `b1b27243fada3dffb29cb632fcb96cdbf3ba8f764e34fed3e9701f35f5c66969`. Both Windows live source and the Linux copy matched it after their runs; Linux also matched before execution. Later edits record evidence, lifecycle and continuity only, not new executable behavior. The frozen snapshot, manifests, scripts and full logs are retained externally so this report does not expose private machine paths.

The large-worktree fixture still retains all 902 entries (83,928-byte inventory), with a 1,678-byte compact handoff versus 149,599 bytes of reconstructed legacy-shaped disclosure; the sidecar is absent from mandatory receiving context. The new clone fixtures prove that protected raw bytes validate/resume while unprotected CRLF conversion fails even with clean Git status. Nested real-CLI dry runs and applies preserve all project bytes and the Git index. Linked worktree roots work. Optional-source recompilation works, missing required sources still fail, and an invalid previous handoff cannot be bypassed through replacement.

Author self-review checked all changed consumers and documentation boundaries. Missing provenance stays strict; diagnostics do not grant path rewrites. Thirteen tracked continuity artifacts matched raw HEAD bytes (the broader suffix match includes the receiving/source worked-example locks), and all 87 files of the shared stable build matched the f2f9554 baseline. The original Claude report and ZIP retain their exact hashes. The revision-1 fingerprint and final-gate receipts remain unchanged; new closure observations are recorded separately.

Independent follow-up approval and exact macOS execution remain open; no human waiver, consumer deployment or publication is inferred. Full test passes are not independent approval. Structural/index and new dogfood-handoff checks follow the evidence/lifecycle update and are recorded in a separate revision-2 gate receipt.

The first post-edit index preflight correctly reported CHANGE018 after the release checklist's verification label was lowered to internally-reviewed while its historical release record still declares that document verified. The current checklist's added transport claims were technically verified by the new Windows/Linux fixtures; its verified label and supporting test reference therefore remain, with an explicit paragraph separating this author verification from the still-pending independent implementation/release gates. No historical change record, validator rule, truth level or review status was rewritten to bypass the finding. The broader lifecycle handling of later edits to previously verified documents remains roadmap work.
