---
artifact_id: T-SAVE-001
artifact_kind: external-task-brief
topic_id: example-save-task
stand: "2026-07-13"
status: in-progress
truth_level: active-snapshot
verification:
  state: structurally-reviewed
  evidence:
    - examples/feature-save-schema/project-doc.md
read_if_task_touches:
  - save migration task
primary_systems:
  - SaveManager
safe_to_edit:
  - Preserve the external source reference and current task status.
do_not_use_instead:
  - examples/feature-save-schema/project-doc.md
source_system: superpowers
source_ref: docs/superpowers/plans/2026-07-13-save-schema.md
---

# Task brief: legacy save detection

Implement missing-field parsing as schema version `0`, add the focused regression test, and record verification evidence. This brief is an execution snapshot imported from an external planner; it does not replace the save-format contract.
