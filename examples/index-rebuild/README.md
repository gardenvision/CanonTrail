---
topic_id: example-index-rebuild
stand: "2026-10-10"
status: synthetic-reference
truth_level: draft
verification:
  state: unverified
  evidence: [test/index-upgrade.test.ts]
read_if_task_touches: [metadata index reconstruction, index format example]
primary_systems: [context index]
safe_to_edit: [Keep this a synthetic example, not consumer recovery approval.]
do_not_use_instead: [docs/index-rebuild.md, ARTIFACT_PROTOCOL.md]
---

# Metadata cache is not provenance approval

A synthetic initialized project has schema-valid `AGENTS.md` and a malformed
retained handoff under its task evidence directory. Normal strict index/validate
still fail. The explicit command:

```text
node <CANONTRAIL_HOME>/dist/cli.js index <SYNTHETIC_PROJECT> --metadata-only --json
```

may rebuild the metadata cache while reporting these exact boundary fields:

```json
{
  "purpose": "metadata-index-rebuild",
  "validation_scope": "index-inputs",
  "ok": true,
  "repository_validation_performed": false,
  "completion_approval": false,
  "continuity_validation": "not-performed"
}
```

This is an excerpt, not the complete report. Its index uses `version: 2`,
`document_order: utf16-code-unit` and `hash_algorithm: sha256`. The empty document
payload has global root hash
`sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`.
Real documents contribute their complete projected metadata, sorted by path.

The negative controls keep corrupted archive bytes identical, keep strict
commands failed and leave the old index untouched for invalid metadata, paths
or unknown future formats. Format 1 requires an explicit reviewed rebuild; it
does not permit rewriting old locks. The task-working root remains a different
task-bound domain even when it embeds the same format-2 document shape.
