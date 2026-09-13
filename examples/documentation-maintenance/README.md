---
topic_id: example-documentation-maintenance
stand: "2026-08-27"
status: current
truth_level: active-snapshot
verification:
  state: reviewed
  evidence:
    - examples/documentation-maintenance/maintenance.yaml
    - schemas/maintenance.schema.json
    - test/docs.test.ts
read_if_task_touches:
  - documentation maintenance examples
  - docs audit
primary_systems:
  - examples
  - documentation maintenance
safe_to_edit:
  - Keep the policy valid against the current schema.
  - Keep the example report-first and remote-independent.
do_not_use_instead:
  - ARTIFACT_PROTOCOL.md
---

# Documentation maintenance example

This policy runs conceptually once per week but does not install a scheduler. It makes freshness decisions reproducible: canonical truth receives a longer review window, fast-changing active snapshots and drafts receive shorter windows, and retained history has no age limit.

Run `canontrail docs audit . --as-of YYYY-MM-DD` to receive findings. A finding is a review queue item, never permission to change or delete its target.

