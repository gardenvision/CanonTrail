---
topic_id: file-preflight
stand: "2026-10-18"
status: implemented-awaiting-release
truth_level: draft
verification:
  state: verified
  evidence: [ARTIFACT_PROTOCOL.md, test/file-preflight.test.ts, .agent-context/tasks/T-FILE-PREFLIGHT-001/evidence/verification.md]
read_if_task_touches: [single-file preflight, document authoring errors]
primary_systems: [file preflight]
safe_to_edit: [Keep structural file checks separate from repository and continuity approval.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md, docs/usage.md]
---

# Single-file authoring preflight

This candidate is owned by `T-FILE-PREFLIGHT-001`. Check the actual executable's
`check --help`; an older shared runtime is not upgraded by reading this document.
The implementation is locally verified on Windows and Linux; this document
remains draft truth, without canonical promotion or release approval.

`canontrail check <path> [root] --json` checks one governed Markdown
file or schema-recognized structured artifact. It reads configured local schemas
and the selected file, not peer task payloads or the global index. Markdown
metadata references receive existence/path checks; full repository ownership,
cross-artifact semantics, self-hashes, source freshness and completion remain
separate strict checks. No file, index, task, Git state or remote is changed.

Every report declares single-file structural scope and explicitly denies
repository validation, continuity approval and task completion, even on success.
Missing, unsafe, excluded, unsupported, invalid or over-limit inputs fail with
coded diagnostics. Installed and shipped schemas both apply; no synchronization
is automatic. Stable local inputs are required; this is not an atomic snapshot.

Use existing `document create` for complete draft headers and `document snapshot`
for immutable before-copies. A new file preflight does not replace either tool,
turn snapshot bytes into current truth, or relax strict project validation.

## Everyday use

```sh
node <CLI> check docs/canontrail/new-topic.md <PROJECT> --json
node <CLI> check .agent-context/tasks/<TASK>/state.yaml <PROJECT> --json
```

Use exact repository-relative spelling for the file; quote paths for the shell.
Root is optional and defaults to the current directory. Exit 0 means this file
passed structural preflight, not project approval. Input/schema failures exit 1
with the same report shape in JSON; ordinary command-line argument errors still
follow the CLI parser. There is no `--apply`, index refresh, automatic correction,
status synonym or hidden fallback to a repository scan.

Markdown uses `artifact-header`. Known structured files use the same filename
classification as repository validation (task/change, lock, handoff, inventory,
evidence, migration, snapshot, compatibility, maintenance and resume artifacts).
The configured index destination uses `context-index` when it is governed too.
An index destination colliding with Markdown or a recognized control artifact
fails as configuration, rather than silently changing that file's schema.
Arbitrary source files, configuration files and unknown JSON/YAML do not become successful generic lint
results. Both shipped and installed schemas must accept the selected payload;
this does not synchronize any schema. Only the needed schema pair is loaded, so
an unrelated corrupt schema is not silently claimed to have passed.

## What a pass does not prove

The report always says `repository_validation_performed: false`,
`continuity_validation: not-performed`, `self_hash_validation: not-performed`,
`completion_approval: false`, and `writes_performed: false`. A well-shaped lock
with an invalid self-hash may pass this check and must still fail `validate`.
Structured artifact references, task-directory identity, migration preconditions,
evidence binding and current-use source compatibility are not checked here.
Canonical topic uniqueness and document age also need their repository/audit gates.

Markdown metadata references receive the existing reference grammar and configured
missing-reference policy plus safe exact local-identity checks. Directories can be
references. External URI locators are not fetched or verified. A prose mention is
not a validated dependency. The checker examines referenced path identities, not
their contents, and does not make an out-of-scope document governed.

## Limits and diagnostics

The selected file, initialized config and each required schema must be regular,
unlinked, exact-spelled portable paths. Inputs are valid UTF-8 without NUL, each
at most 8 MiB; reads are bounded even if a file grows while it is being read.
At most 1024 distinct local metadata references are probed. Stable local inputs
are required. This is neither an atomic filesystem snapshot nor a hostile-race
defense, and a result cannot authorize later changed bytes.

`SCHEMA005` names missing JSON-pointer fields and real allowed values from the
schema. `DOC002` identifies malformed Markdown frontmatter; `ART001` identifies
structured syntax failure. `CFG001` identifies configuration failure;
`CHECK001`/`CHECK002` identify selected identity/scope/read/unsupported-kind errors;
`SCHEMA002` identifies an unavailable or unusable schema. Existing `REF001` and
`REF002` retain reference diagnostics. Failures do not produce index quarantine
or a passing partial repository report. The [worked example](../examples/file-preflight/README.md)
and [report schema](../schemas/file-preflight.schema.json) show the contract.
