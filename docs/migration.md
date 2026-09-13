---
topic_id: canontrail-documentation-migration
stand: "2026-09-13"
status: experimental-alpha-candidate
truth_level: draft
verification:
  state: verified
  evidence: [src/migration.ts, schemas/migration-plan.schema.json, schemas/migration-transaction.schema.json, test/migration-transformation.test.ts, test/migration-naming.test.ts, .agent-context/tasks/T-PUBLIC-PREP-001/evidence/verification.json, .agent-context/tasks/T-RELEASE-CLOSURE-001/evidence/review-receipt.json]
read_if_task_touches: [documentation migration, brownfield adoption]
primary_systems: [migration planning, documentation governance]
safe_to_edit: [Keep planning, execution permission and canonical promotion separate.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Controlled documentation migration

Migration is not initialization. `init --adopt` establishes missing scaffolding without overwriting existing files. Migration first inventories explicitly selected existing documentation and proposes actions. The agent and reviewer decide semantic meaning and canonical destinations.

```text
canontrail migrate plan <PROJECT> --id MIG-EXAMPLE-001 --documentation-root docs
```

Planning is read-only by default. `--apply` stores the plan, not a rewritten document. Supported detection includes complete CanonTrail frontmatter, the named `legacy-header-v1` format and plain Markdown; ordinary YAML frontmatter is not automatically governed knowledge.

`legacy-header-v1` recognizes the supported labeled Markdown header (for example `Stand`, `Status`, `Truth level`, `Verification`, and routing/editing labels). It describes a format, not a particular application. Select it explicitly with `--adapter legacy-header-v1`, or use the default `auto` detection. It is not a universal converter for every existing documentation style.

## Compatibility with earlier plans

New plans use `legacy-header-v1` as the detected format and summary count key. The deprecated selector `gaertnerei-legacy` is accepted as an input alias but normalized before generating a new plan. Retained plans using `gaertnerei-legacy-header` remain readable with their original hashes and bytes; they are not rewritten. These two historical spellings are compatibility names only, not recommended public setup commands.

The additive vocabulary retains plan version 1. A plan's document formats and complete count-key vocabulary must agree; mixed old/new count keys or documents cannot hide missing counts. Older installed schemas do not know the new names: synchronize the migration-plan schema through a separately reviewed local update before storing new plans in such a project. Nothing updates existing configuration or schemas automatically.

A new preview has a new plan hash when naming changes, even if source bytes are identical. Old decision sets are not rebound to that hash automatically: obtain a fresh review of the exact new preview. Existing transaction artifacts keep their original transaction contract; normal integrity, source and rollback checks still apply.

For this Alpha, deprecation is documentation-only: the compatible alias does not emit a runtime warning and no removal date is promised. New scripts should use the neutral name. `transform-preview` always replans from current source; accepting old stored plans for validation does not execute those stored plans or bypass a newly bound decision. The defensive old-format classification branch is not evidence of a separate historical-plan execution route.

`generic-markdown` deliberately treats inputs as plain Markdown instead of recognizing a structured header. It is an inventory/review choice, not a general-purpose automatic converter. Plan validation checks retained snapshot structure and identity, not whether every historical source still exists; execution separately enforces current source preconditions.

Without `--apply`, planning and transformation preview write no project files, including control artifacts. With `--apply`, they may write their respective CanonTrail plan or transaction proposal under `.agent-context/migrations`; this still does not change the source documents. Keep those two modes distinct when recording preservation evidence.

## Experimental transformation boundary

Use `migrate transform-preview --help` for exact options and `--show-content` for a read-only before/after view. Full document text can be sensitive; keep it local and scoped. Missing or provisional review decisions are not approvals.

The current executable adapter only normalizes a fully reviewed legacy header **in place**. It does not relocate, split or merge files, infer canonical truth, or migrate arbitrary documentation systems. Legacy verification prose remains visible as unpromoted provenance. Source hashes, reviewed roots, exact paths and decision/operation binding are validated again at execution.

An approved transaction can be staged separately, then `migrate execute` requires its exact confirmed hash. This is an explicit write operation, not a side effect of ordinary agent entry. Back up the source and keep the tree stable and exclusively owned. Local checks narrow filesystem races; they do not create an atomic distributed/NAS transaction.

Rollback restores the recorded bytes only if the transaction and recovery evidence are valid and later user edits would not be overwritten. Transaction IDs are single-use; do not delete recovery evidence to force a retry. Byte restoration does not promise restoration of ownership, ACLs, timestamps, xattrs or link topology.

`reviewed_by` and self-hashes are audit metadata, not cryptographic reviewer authentication. High-risk execution needs trusted out-of-band approval of the exact inputs. Tests and structural PASS do not grant that permission. See `ARTIFACT_PROTOCOL.md` for the complete normative path, evidence, recovery and lifecycle requirements; this usage guide does not weaken them.

This candidate does not carry private historical pilot reports or approvals. Independent release review and exact-platform checks remain pending in `docs/alpha-readiness.md`.
