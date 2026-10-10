---
topic_id: index-rebuild
stand: "2026-10-10"
status: verified
truth_level: draft
verification:
  state: reviewed
  evidence:
    - .agent-context/tasks/T-INDEX-UPGRADE-001/evidence/verification.md
    - .agent-context/tasks/T-INDEX-UPGRADE-001/evidence/independent-review.md
read_if_task_touches: [explicit metadata index reconstruction, index format upgrade]
primary_systems: [context index]
safe_to_edit: [Keep projection integrity and consumer rollout distinct.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md, docs/usage.md]
---

# Explicit metadata index reconstruction

## Choose the right boundary

Normal `canontrail index .` retains its full structural preflight, except prior
index/active-lock freshness. `finalize --refresh-index`, repository validation,
documentation audit and task working views retain their existing strict checks.
They may still fail because retained provenance is damaged.

`canontrail index . --metadata-only` is a separate, explicit cache-reconstruction
operation. It checks configured governed Markdown, installed schemas, actual
headers, canonical/artifact identities and machine-readable metadata references.
It does **not** decode task states, locks, handoffs, inventory sidecars, resume
packets, snapshots or migration payloads. Filesystem names beneath governed roots
are still enumerated; an unsafe link cannot conceal Markdown coverage.

The JSON report says `validation_scope: index-inputs`,
`repository_validation_performed: false`, `continuity_validation: not-performed`
and `completion_approval: false`, even on success. The human report says that
repository integrity, completion, CI, release and promotion are not approved.
This mode cannot be combined with `--task`. No automatic fallback uses it.

## Inputs, output and limits

An existing `.agent-context/config.yaml` is required. Paths use `/` on Windows,
Linux and macOS; exact spelling and portable regular-file identities are checked.
Safe absent configured paths (including future roots from fresh `init`) are
reported explicitly as `INDEX006` warnings and `missing_configured_paths`; no
metadata from those scopes is claimed. Their absence is rechecked before writing.
Missing installed schemas and metadata references still fail. Metadata inputs/output reject links,
filesystem aliases and multiply linked files; unsafe metadata references fail
even if a missing-reference exception was configured. Normal reference grammar
is preserved: a prose mention is not an evidence path.

Config, installed schemas, Markdown and an existing output are each limited to
8 MiB, valid UTF-8 and no NUL. Captured input bytes total at most 128 MiB, and
enumeration covers at most 100,000 entries. Larger sets fail with instructions
to review narrower roots/exclusions, not a silently partial index. Captured config
and schemas are parsed from those bytes, not reopened by the validator.

The destination must be a separate `.json` cache, not an input, schema, task,
migration, adoption manifest, typed provenance, Git or external-workflow artifact.
Protected role names are case-insensitive on every platform, including when the
directory does not yet exist. A configured `index_path` is not permission to
replace an unrelated existing JSON record. Captured source bytes, inventories
and destination bytes are rechecked before replacement. Failures leave the old
index intact. A successful identical rebuild reports `index_written: false`.
Stable, exclusive filesystem access is required; this is not a hostile-race
defense, atomic filesystem snapshot or multi-file crash transaction.

## Format 2 and legacy input

Every newly generated global/embedded index declares `version: 2`,
`document_order: utf16-code-unit`, `hash_algorithm: sha256`. Documents are sorted
by JavaScript UTF-16 code units, not host locale. Global `root_hash` is SHA-256
over UTF-8 `JSON.stringify(documents)` with the projected field order. No build
timestamp or CLI identity enters it. The task-working root retains its separate
task-bound hash domain; the format label does not merge those scopes.

Format 1 did not declare whether it used locale or code-unit ordering. Current
use therefore rejects it with `INDEX004`, even if its hash happens to match.
Explicit regeneration may upgrade it. Historical context/handoff/packet receipts
are not rewritten; integrity is not approval to read their old source set today.
An unknown future format, different ordering or hash algorithm is not overwritten.
Malformed JSON at a separate declared cache destination may be explicitly
regenerated; its former role cannot be inferred, so review that destination first.
Versionless/format-1 replacement requires a recognizable index-only payload
(`hash_algorithm`, SHA-256 `root_hash`, `documents` with path/content hashes), not
merely a missing or matching version number. Unrelated records and mixed-purpose
top-level fields are preserved and rejected. This does not repair any provenance
artifact. The compiler checks the complete current
index, not merely a user-supplied root hash.

## Central cutover, not one update per session

1. Arrange one quiet window with all shared index writers stopped. Preserve
   current config, installed schemas, index and runtime identity as raw bytes.
2. Build/review a separate exact source snapshot. Record its revision and built
   runtime hashes; a CLI version label alone is insufficient.
3. Compare `context-index.schema.json` (new), `task-working-index.schema.json`
   (embedded format 2) and the consumer's customized installed schemas. Install
   reviewed changes centrally; do not rerun init or copy an entire schema tree.
4. Run normal index reconstruction if strict provenance passes. If retained
   history blocks it, explicitly choose metadata-only reconstruction and retain
   its **non-approval** report. Invalid Markdown/references remain blocking.
5. Run strict `validate`, `docs audit` and `finalize` separately. Keep every
   remaining failure visible. A rebuilt index does not close those gates.
6. Review/recompile only owned active context affected by the upgrade. Preserve
   terminal locks and archived bytes. A damaged latest handoff cannot be repaired
   by normal `--replace`, which first requires the existing receipt to verify.
7. Notify sessions of one pinned runtime and prohibit old writers. A previously
   distributed CLI cannot retroactively recognize format 2 and may still rewrite
   the shared cache. The new marker is not a cross-version process lock.

The [neutral worked example](../examples/index-rebuild/README.md) illustrates
this boundary. This document does not authorize a consumer update, history repair,
canonical promotion or public release.
