---
topic_id: example-migration-plan-vocabulary
stand: "2026-09-13"
status: current-teaching-example
truth_level: draft
verification: {state: unverified, evidence: [schemas/migration-plan.schema.json]}
read_if_task_touches: [migration plan vocabulary]
primary_systems: [migration planning]
safe_to_edit: [Keep the retained historical plan byte-identical.]
do_not_use_instead: [docs/migration.md]
---

# Migration plan vocabulary

`neutral-plan.json` shows current `legacy-header-v1` vocabulary and a reproducible self-hash. `plan.json` is the retained, byte-identical historical teaching input with its earlier vocabulary and original hash. Both illustrate an empty plan inventory, not a reviewed real project or execution authority. The regression suite validates both forms. See `docs/migration.md` for the transformation and old-decision boundaries.
