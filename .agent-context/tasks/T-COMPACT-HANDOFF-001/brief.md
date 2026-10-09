---
topic_id: task-compact-handoff-001
stand: "2026-10-09"
status: completed
truth_level: active-snapshot
verification:
  state: verified
  evidence: [src/handoff.ts, src/resume-audit.ts, src/validator.ts]
read_if_task_touches: [compact handoffs, missing evidence reference diagnostics]
primary_systems: [context continuity]
safe_to_edit: [Keep measured checks separate from proposals and preserve historical artifacts.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Compact handoffs and actionable reference failures

The maintainer authorized implementing the two investigated continuity improvements. Real-project observations are retained outside the public source tree; use synthetic fixtures here. Do not modify consumer projects, publish, or rewrite old handoffs/locks.

## Decided scope

New handoffs retain a complete, immutable Git-status inventory as a task-owned hash-addressed JSON sidecar. The compact handoff binds its raw-byte hash and entry count, selects changed paths only through the locked context, exact file intents or explicit checkpoint input, and gives a count-based dirty summary. A selected file is not an ownership claim. Explicit semantic notes are preserved, never silently truncated. The inventory records status, destination and rename/copy source; it does not snapshot file content, ignored files or unsaved editor state.

The complete sidecar is tool-verified during handoff validation/replacement, resume creation and retained/current packet validation, but is not automatically model context. Legacy handoffs without a sidecar retain their contract. Old project schemas must fail before new writes, with guidance to synchronize deliberately. No automatic schema update.

Missing references remain blocking. Diagnostics identify the referring file/task, exact target and safe repair boundary. Index preflight must explain why recompiling a lock cannot repair a missing evidence file. No guessed rename, automatic rewrite or reference exception.

## Verification plan

Use hundreds of unrelated changes plus a small task to compare compact versus legacy-shaped handoff size and prove full inventory retention. Verify rename/deletion/untracked cases, deterministic dry run, old schema rejection, legacy compatibility, sidecar corruption/missing/wrong ownership, unsafe linked paths, immutable collisions, replacement and retained/current resume validation. Execute focused and full suites, typecheck/build, index/validate/audit/finalize; record independent review because continuity integrity crosses several consumers. Estimates are not provider-token savings.

## Historical implementation checkpoints

Decision recorded before implementation. Worktree began clean at f2f95541853ca97daf486c92844745c498f9afb8. Working branch: codex/compact-handoff-inventory.

Implementation includes an immutable worktree-inventory module/schema, compact default file selection/summary, installed-schema preflight, new-init schema inclusion, direct/retained/current-use validation and reference/index guidance. Protocol, usage and a synthetic worked example are updated. Final Windows tests: 717 passed, 13 capability skips, 730 total across 35 files; typecheck/build pass. An intermediate EPERM in an unchanged migration-test setup is recorded explicitly; focused and complete unchanged repeats pass. No consumer project or remote was changed.

The first baseline-focused run exposed one old test expecting all Git paths in the inline handoff. It was updated to assert the intentionally new contract: unrelated paths in complete inventory, selected paths inline. Its replacement assertions pass. No production safety gate was removed to fix that expectation.

Measured synthetic comparison: 902 complete inventory entries, 83,928-byte sidecar, 1,678-byte compact handoff versus 149,599 bytes for a reconstructed legacy-shaped all-entry disclosure. The new receiving lock did not select the sidecar. These are artifact/selection observations, not provider-token telemetry. Twelve tracked historical locks/handoffs/packets remain byte-identical to HEAD.

Revision 1 received an independent conditional review; its frozen source and review package remain unchanged. The maintainer authorized addressing the three medium findings. Revision 2 implements fail-before-write for nested-project creation, consumer raw-byte transport guidance and source-specific reference diagnostics. Eleven new regression cases pass. Final implementation suites: Windows 728 passed / 13 skipped; Linux 737 passed / 4 skipped; both 741 total in 36 files. The first Linux run exposed and recorded a test-only autocrlf configuration mistake, corrected without weakening assertions or changing production code. See evidence/review-remediation.md for exact snapshot/log hashes and remaining findings. Earlier 717/13 results above identify revision 1 only. Independent closure of the changed bytes, macOS execution and release/consumer rollout remain separate; no approval or waiver is inferred. Existing tracked continuity artifacts and the stable consumer build stay untouched.

Final context choice: file intents now describe the actual change surface. The unchanged initializer, validator and resume-history suites were executed, not rewritten or claimed as fully selected. The one initializer change is its schema-registration list; lines 103–120 are explicitly selected against the full source hash. The required continuity implementation and new regression source remain whole. All whole-file requirements were preserved; this is not removal of a requirement to force the budget down.

Pre-commit checks reopened this task as revision 3 on 2026-09-27. A new scratch counterexample proves that an existing inventory containing malformed UTF-8 can have different raw bytes but decode to the expected text; the writer accepts it, then the reader correctly rejects its hash. Correct the collision comparison to raw buffers and prove rejection before handoff/archive writes. The review regression source is now explicitly required context. Prior revision-2 test/review receipts remain historical and do not approve the new edit. No commit or push has occurred.

Revision 3 is now implemented and author-tested: the raw-buffer correction passes both new cases, all 43 focused cases and the complete 743-case Windows/Linux suites. Windows passes 730 with 13 skips; Linux passes 739 with 4 skips. The failed pre-fix regression is retained. Independent review of changed bytes and macOS execution remain open; the task returns to review, not verified. See `evidence/precommit-review-r3.md`.

The bounded revision-3 review has now been received and hash-verified: report SHA-256 17777a1f83d87cacced1489012ae123b348a52ea024de66218a771be1dfc1458, identifying Codex as reviewer, approves A-D with conditions. A separate Claude report (336a9e9a9ed79151b920b7ec8cde0df2437d52aeb0e1b17a579d41d731a51505) reviews the older R1 package, not the current source. Their remaining cross-writer, capture and retained-provenance findings are reconciled in `.agent-context/tasks/T-CONTINUITY-WRITE-HARDENING-001/evidence/review-intake.md`. That new high-risk task owns the corrections. These receipts do not independently approve the subsequent implementation; the combined working state remains review-pending. No historical handoff, archive or review receipt is rewritten to change its old claims.

## October 9 technical closure

This task's implementation, declared acceptance cases, ten impact decisions and
required technical checks are closed by the exact r5/50f7 evidence and separate
independent decisions. The current owner is state.yaml; the consolidated record
is .agent-context/tasks/T-TASK-WORKING-INDEX-001/evidence/integration-closure.md.
Earlier pending statements above are historical checkpoints, not the current
gate. Final closing metadata, its new head and the protected merge require their
own exact checks. No consumer rollout, schema migration or promotion is implied.
