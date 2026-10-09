---
topic_id: field-workflow-verification-001
stand: "2026-10-01"
status: implementation-verified
truth_level: active-snapshot
verification:
  state: internally-reviewed
  evidence: [.agent-context/tasks/T-FIELD-WORKFLOW-001/evidence/quality.json, .agent-context/tasks/T-FIELD-WORKFLOW-001/evidence/self-review.md, .agent-context/tasks/T-FIELD-WORKFLOW-001/evidence/active-lock-retention.json]
read_if_task_touches: [field workflow improvements]
primary_systems: [task authoring, context compilation]
safe_to_edit: [Keep execution, author review and release approval distinct.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Field workflow verification

## Outcome and acceptance

The bounded intake examined CanonTrail passages from 34 relevant documents among
58 report/closure/route candidates. The external private ledger retains exact
identities and search limits; this does not claim a complete project or chat review.
Reported runtime identity was checked separately from visible checkout/source
changes. Several oversized-handoff reports used the older stable executable;
they are not new failures of the pending compact writer.

- **AC-SCAFFOLD:** `task create` previews and optionally creates exactly three
  task drafts. Metadata and both schema sets are validated before creation.
  Tests cover zero-write previews, existing empty/populated tasks, path and link
  rejection, caller-text quoting, configuration/schema failures, CLI flags and
  exact worked-example execution. Untouched drafts cannot pass completion.
- **AC-FORMATS:** the seven explicit module/shader extensions participate in
  whole and section selection, excerpts and a real local handoff/resume fixture.
  Tests retain BOM/CRLF bytes, full and selected hashes, token estimates and
  unclassified authority. Invalid UTF-8, NUL, oversized, missing, excluded and
  over-budget requirements preserve the prior lock; optional invalid inputs are
  visible omissions. A rehashed invalid preview is rejected. Binary-capable
  assets remain unsupported.
- **AC-GUIDANCE:** a missing first task lock yields actionable task-free excerpt
  guidance without fabricated coverage. Usage/protocol distinguish preparation,
  current working context, historical evidence and incomplete acceptance. The
  synthetic documented command is exercised by the distributable-CLI test.

Baseline reproduction against the prior isolated build established the unsupported
formats and missing-lock diagnostic. Its root help listed no task command; its
help exit code was zero, not a claimed failed task creation. New code and tests
were built only in separate snapshots, never over the shared consumer runtime.

## Executed quality checks

| Platform | Typecheck/build | Full test files | Passed | Skipped | Failed |
|---|---|---:|---:|---:|---:|
| Windows, Node 24.11.1 | PASS | 39 | 814 | 13 | 0 |
| Linux, Node 24.20.0 | PASS | 39 | 820 | 7 | 0 |

Both runs contain 827 cases, with the unchanged 15-second test timeout and one
worker. Capability-dependent skips are listed in `quality.json`; no macOS run
is claimed. An earlier focused run passed 94 cases before the exact-example
regression was added; the final suites include that additional case. No assertion
or timeout was weakened. Author inspection is recorded separately in `self-review.md`.

Both platform copies matched the same 277-file manifest after execution:
`daf39d66ad9ac215872e910f025e236b80a8deb43d9a7b9aa87147c29b7f67c8`.
All 138 implementation/test/schema/example/build inputs still match those tested
bytes. Later task/documentation metadata is checked separately. Raw logs are
retained externally by the hashes in the portable quality receipt.

**The dependency audit is not clean.** Both runs exit 1 for the pinned indirect
`fast-uri` 3.1.6 dependency. The intake names three applicable advisories and the
upstream patched version. No demonstrated application exploit is claimed. A
focused dependency update is separate pre-publication work; repository validation
must not be confused with dependency security or release approval.

## Preservation and lifecycle

After tests, all 34 read consumer documents, 100 prior task artifacts and 87 stable
build files still matched their baselines. No consumer project, Git history,
remote, package lock, historical handoff or existing evidence was edited.

Only two owned active review locks need refresh after inspected changes to the
shared protocol, usage, roadmap, self-documentation and CLI registration. Their
exact prechange bytes are retained in the receipt and raw archives. This does
not change their state, approvals, old source archives or handoffs. The original
compact/continuity tasks remain independently gated. Refreshing current locks
is not retroactive review of those earlier changes.

This task's bounded medium-risk authoring/selection acceptance is verified by
author execution and inspection. It neither grants an independent review nor
canonically promotes consumer documents. No commit, push, publication, shared
runtime rebuild or consumer rollout occurred. Real provider-token savings,
automatic semantic splitting, orchestration and binary decoders remain unclaimed.

## Next safe boundary

An initial index attempt rejected a proposed downgrade of the old Alpha-readiness
document's verification metadata (`CHANGE018` from its existing historical change
records). That proposed edit was withdrawn, including the added development
limitation text: the entire old readiness document retains its baseline bytes.
New development behavior belongs in current usage/protocol/task evidence, not a
silent rewrite of that release snapshot. No validator or historical record was
relaxed to obtain a pass.

Consolidate the index and owning active contexts, then validate the task and its
handoff. For a release, address the dependency audit, obtain the outstanding
continuity review and exact platform/CI evidence, then explicitly plan consumer
updates. Do not bypass these gates or rebuild a shared runtime in place.
