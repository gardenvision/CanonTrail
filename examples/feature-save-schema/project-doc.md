---
topic_id: example-save-format
stand: "2026-07-13"
status: current
truth_level: canonical
verification:
  state: reviewed
  evidence:
    - examples/feature-save-schema/README.md
read_if_task_touches:
  - save format
  - schema compatibility
primary_systems:
  - SaveManager
safe_to_edit:
  - Update only after implementation evidence confirms current behavior.
do_not_use_instead: []
---

# Save-format contract

Existing saves without an explicit schema version are interpreted as legacy version `0`. New writers emit a positive schema version. Migration must preserve the original serialized data until the migrated representation passes validation.
