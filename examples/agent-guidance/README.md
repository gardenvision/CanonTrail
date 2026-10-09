---
topic_id: bundled-guidance-example
stand: "2026-10-03"
status: synthetic-example
truth_level: draft
verification:
  state: unverified
  evidence: [src/agent-guide.ts, src/task-status.ts, test/agent-guidance-status.test.ts]
read_if_task_touches: [bundled guidance example, readable task status]
primary_systems: [CLI guidance]
safe_to_edit: [Keep this illustrative and distinguish stored claims from verification.]
do_not_use_instead: [docs/usage.md, ARTIFACT_PROTOCOL.md]
---

# A guide from the executable; a status without rewriting the task

From any working directory, use your chosen built CLI:

```text
node <CLI> guide
node <CLI> task status <PROJECT> --task T-EXAMPLE --as-of 2026-10-03
```

The first command does not read the target. The second validates the target,
reads recorded lifecycle data and renders all completion diagnostics without
updating files. There is no live-agent monitoring.

Illustrative opening for an implemented task still awaiting acceptance:

```text
Recorded lifecycle: task="review"; change="implemented"; independent review="pending".
Recorded task acceptance: 0 pass, 1 pending, 0 fail, 0 blocked, 0 not-applicable, 0 not-run, 0 unspecified/unknown.
Recorded project checks: 1 pass, 0 pending, 0 fail, 0 blocked, 0 not-applicable, 0 not-run, 0 unspecified/unknown (not executed by this command).
Own context: CURRENT according to named-task structural checks.
Formal completion: NOT COMPLETE; open gates or errors remain.
```

This is not a real task receipt or evidence that implementation/review succeeded.
A failed check is displayed in the fail count and remains an open completion
gate. Unrelated deferred peer drift remains failed raw repository health and
is not CI/release approval. Missing or unsafe input cannot be called current.

`--json` emits the same existing finalize report as:

```text
node <CLI> finalize <PROJECT> --task T-EXAMPLE --as-of 2026-10-03 --json
```

The regression fixture executes both distributed commands and compares their
results/exit codes and before-after source hashes. Current source state and
the user/workflow's authority govern continuation; status alone authorizes
no migration, promotion, Git operation or next feature action.
