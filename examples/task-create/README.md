---
topic_id: task-create-example
stand: "2026-10-01"
status: teaching-example
truth_level: draft
verification:
  state: unverified
  evidence: [src/task-create.ts, test/task-create.test.ts]
read_if_task_touches: [task draft authoring]
primary_systems: [task authoring]
safe_to_edit: [Keep this synthetic and do not portray generated drafts as decisions.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md, docs/usage.md]
---

# A task draft, not an invented approval

In a disposable, already initialized project, with the built CanonTrail CLI:

```text
node <CANONTRAIL_HOME>/dist/cli.js task create <PROJECT> --task T-RECEIPT-001 --change-id CHG-RECEIPT-001 --objective "Review the local receipt export" --accept "Export round-trips without loss" --accept "Invalid input fails visibly" --author "Example author" --risk medium --created-at 2026-10-01T12:00:00Z --json
```

The JSON report includes complete preview content and raw byte hashes for exactly:

```text
.agent-context/tasks/T-RECEIPT-001/brief.md
.agent-context/tasks/T-RECEIPT-001/state.yaml
.agent-context/tasks/T-RECEIPT-001/change.yaml
```

No output exists yet. Repeating with `--apply` creates the new directory and these
three files. An existing directory, even empty, fails instead of being reused.
The report is not an executable saved-preview token: a later invocation validates
the current project again. Keep `--created-at` fixed only when exact reproducible
draft bytes are useful; it is not authentication of an earlier review.

The state and brief say `draft`; the change says `idea`. Both caller acceptance
statements are pending. All ten impact decisions are pending. Authority is null,
review is pending, and no evidence, source path, ownership lease or Git base is
invented. The `author` string records the caller's claim, not a signed identity.

The brief presents the objective and acceptance statements as JSON-quoted data.
For example, an objective containing a newline followed by `## Before implementation`
keeps that newline escaped inside the quote; it does not add another structural
section. YAML preserves the original text. Quoting is not a model-safety guarantee
and caller text does not grant authority.

Before implementation, the owning agent fills starting conditions, failure
behavior, counterexamples and test oracles; reviews risk and all impacts; chooses
the existing truth locations and actual source files; and records the real
decision authority. Only then may it move the change to `decided`, refresh the
index and compile a bounded working context. Running `finalize` on the untouched
draft must fail. Schema validity is not readiness or completion.

Installed schemas must accept the prospective payload as well as the shipped
schemas. A rejected preflight writes nothing and never edits project configuration.
Stable exclusive filesystem access is required during apply. Unexpected I/O
failure can leave a partial new draft; inspect it rather than deleting evidence
or rerunning with an invented overwrite flag. There is no `--force` option.
