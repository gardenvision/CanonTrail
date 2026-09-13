---
topic_id: example-context-inspection
stand: "2026-09-07"
status: example
truth_level: design-target
verification:
  state: internally-reviewed
  evidence:
    - test/context-inspection.test.ts
read_if_task_touches: [context inspection, source excerpts]
primary_systems: [context continuity]
safe_to_edit: [Keep example and report schema aligned.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Exact source output, honest coverage

This worked example is an excerpt report, not a stored Context Lock or a new compact-evidence kind. The source.txt file is a small deterministic fixture; report.json uses <repository> instead of a machine-local root. Hashes still describe its exact source and excerpt bytes.

    canontrail context excerpt . --source examples/context-inspection/source.txt --from 2 --to 3 --max-tokens 100 --json
    canontrail context inspect . --task T-CONTEXT-INSPECTION-001 --json

Use inspect to distinguish stored input from unknown external/manual reads. A successful source comparison does not validate the current index or close application tests. A historical lock with later source drift stays historical; the command only reports current byte comparison.

The same task's brief/report may mention another task as a prerequisite or just a previous experiment. The tool exposes exact path/local-ID mentions for a human decision, never adds a dependency. It reads at most 1000 task-directory names and no peer content for those hints.

When a cited raw report dominates context, produce a compact record with the existing evidence record command and cite that record only if raw review is not required. Its subject hashes identify evidence, not loaded source text.

Save an excerpt response deliberately in task-owned evidence if continuity needs it. Before reuse, repeat the read with the reported whole-source hash. Citing the report alone does not enable upstream drift checking. For now essential active sources still need the existing whole-file lock contract. Splitting owning documentation, partial-lock integration and automatic reading telemetry are NOT implemented by these commands.
