---
topic_id: bundled-guidance-verification
stand: "2026-10-03"
status: checked-local
truth_level: active-snapshot
verification:
  state: internally-reviewed
  evidence: [test/agent-guidance-status.test.ts, .agent-context/tasks/T-AGENT-GUIDANCE-STATUS-001/evidence/quality.json]
read_if_task_touches: [bundled guidance verification]
primary_systems: [CLI guidance]
safe_to_edit: [Preserve actual results and platform limits.]
do_not_use_instead: [.agent-context/tasks/T-AGENT-GUIDANCE-STATUS-001/state.yaml]
---

# Local verification

On Windows with Node 24.11.1, a fresh exact source copy was installed with
`npm ci --ignore-scripts`, typechecked, built, tested serially, audited, validated,
documentation-audited and repository-finalized. Every command exited 0.

- Full suite: 863 pass, 13 explicit capability skips, 876 cases in 42 files.
- New guide/status suite: all 32 pass.
- Audit: zero vulnerabilities.
- Initial verified snapshot: 61 Markdown, 64 structured artifacts, 16 schemas,
  zero errors and warnings. Documentation healthy; strict repository gate PASS.
- Final task/continuity metadata is checked separately after recording results.
  Prior hosted CI is not evidence for this new code.

The real distributed guide worked even with malformed target configuration
and a decoy newer README. Every referenced command exists in distributed help.
The safe receiving order, small guide size and version-label caveat are checked.
This demonstrates bundled guidance, not host skill installation or agent compliance.

Real status fixtures cover completed work, pending acceptance/review, failed tests,
own-source drift, missing/corrupt locks, wrong identity, warning policy, unrelated
deferred drift, declared dependencies, unrelated schema corruption, alternate
change.yml and corrupted primary, quoted caller text, empty/traversing IDs,
identical JSON/exit codes and an injected refresh request. All findings retain
the existing completion semantics. Before-after fixture byte manifests stay exact.

The actual in-progress repository task was also inspected: own context CURRENT,
repository PASS, formal completion NOT COMPLETE. Its output retained every
pending gate; no application checks were run by the status command.

Preservation: 137 prior control artifacts exact, four old active locks archived
byte-for-byte, 327-file tested source snapshot exact, 105 current runtime/test/
schema/build files exact to that tested snapshot. Original shared dist is unchanged.
Only author-owned active contexts were reviewed/refreshed; prior task states,
approvals, handoffs, archives and frozen examples were not rewritten.

One initial focused failure was a test-premise mistake: the test included an old
lock_hash when recomputing a changed fixture's payload hash. Correcting the fixture,
not weakening runtime validation, gave 27 passes. Self-review then added five
identity/refresh cases; the fresh full snapshot passes all 32.

No commit, push, merge, consumer build replacement, schema rollout or Herdr
integration occurred. Windows execution is the only fresh platform evidence for
these bytes; Linux/macOS CI and pending earlier independent publication review
remain separate. Raw receipts and manifests are retained outside public source.
