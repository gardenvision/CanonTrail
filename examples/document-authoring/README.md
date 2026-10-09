---
topic_id: document-authoring-example
stand: "2026-10-08"
status: synthetic-example
truth_level: draft
verification:
  state: unverified
  evidence: [src/document-authoring.ts, src/document-snapshot.ts, schemas/artifact-header.schema.json, schemas/document-snapshot.schema.json, test/document-authoring.test.ts, test/document-snapshot.test.ts]
read_if_task_touches: [complete document drafts, document snapshot provenance]
primary_systems: [document authoring, evidence snapshots]
safe_to_edit: [Keep examples executable with explicit placeholders and no fabricated approval.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md, docs/usage.md]
---

# Draft authoring and historical copies

Synthetic illustration, not a completed task or a real historical receipt.
Replace `<CANONTRAIL_HOME>` and `<PROJECT>` with reviewed local paths. The
project must already be initialized with compatible schemas. The example
`T-DOCUMENT-001` is an existing synthetic task, not an instruction to create
or overwrite someone else's task.

## One complete unverified draft

```text
node <CANONTRAIL_HOME>/dist/cli.js document create <PROJECT> --path docs/canontrail/receipt-export.md --topic receipt-export --title "Receipt export" --purpose "Describe source-backed export rules and open questions" --route "receipt export" --system "receipt export" --created-at 2026-10-08T12:00:00Z --json
```

Inspect the planned single file and complete frontmatter. It is always
draft/unverified with empty evidence. Repeat the same command with `--apply`
only if the new destination is wanted. Existing files, aliases, reserved
archives and conflicting ownership are not overwritten. Resolve sources,
evidence and authoritative truth deliberately before any promotion.
Multiline title/purpose are quoted data; quoting does not enforce agent behavior.

## Preserve the exact before-revision

After the new file actually exists:

```text
node <CANONTRAIL_HOME>/dist/cli.js document snapshot <PROJECT> --task T-DOCUMENT-001 --source docs/canontrail/receipt-export.md --purpose "Before reviewing the export draft" --created-at 2026-10-08T12:00:00Z --json
```

This previews a `<source-hash>.source.bin` plus
`<record-hash>.document-snapshot.json` in the owning task's
`evidence/document-snapshots/` directory. No hash here is a real receipt.
The small record follows [the snapshot schema](../../schemas/document-snapshot.schema.json);
the [protocol](../../ARTIFACT_PROTOCOL.md#83-document-draft-authoring-and-immutable-snapshots)
owns its exact ordered hash recipe and independent owner/path/raw-byte bindings.
Use explicit `--apply` to retain the pair. Source, index, state and Git remain
unchanged. Capture checks both installed and shipped schemas; it never upgrades
an old project automatically. A selected expected source hash can be supplied
with `--expect-hash`.

## Read the historical content explicitly

```text
node <CANONTRAIL_HOME>/dist/cli.js document snapshot-read <PROJECT> --record <exact-record-path-returned-by-capture> --max-tokens 4000 --json
```

Both record and preimage are verified first. JSON-decoded `content` re-encodes
to the original UTF-8 bytes, including BOM/line endings. The human display uses
JSON quoting to expose source controls. An over-budget request fails rather
than shortening the original. A larger deliberate limit is possible up to
32,000 estimated content tokens; larger verified archives can be inspected
locally without claiming that full content entered the task lock.

The original source may later change or disappear: snapshot integrity is
historical, not a current-source assertion. The record is provenance, not a
passing verification or canonical truth. The `.source.bin` role prevents a raw
copy from being indexed as new Markdown; no manual extension workaround is
needed. Do not rename the pair or create a `.md` copy just to force context
loading. Cite the small record and load content only when actually required.

## Counterexamples that must remain visible

- Rehashed records with another task owner, uncontrolled archive path or wrong
  byte count still fail.
- Missing/corrupt preimages and linked or configuration-hidden archives fail.
- Orphan raw preimages are preserved and warned about, not cleaned up silently.
- Invalid UTF-8, NUL text and sources above 8 MiB cannot be newly captured.
- Current source drift is not repaired by rewriting a retained record.
- No snapshot or peer message supplies task/operation approval.

Multi-file capture is not crash-atomic. Keep stable exclusive inputs and inspect
partial output after an I/O failure. Historical artifacts are never rehashed to
make a broken receipt pass.
