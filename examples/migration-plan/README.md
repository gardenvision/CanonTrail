---
topic_id: example-migration-plan-vocabulary
stand: "2026-10-18"
status: current-teaching-example
truth_level: draft
verification: {state: reviewed, evidence: [schemas/migration-plan.schema.json, test/migration-naming.test.ts, .agent-context/tasks/T-DOCS-FRESHNESS-20261018/evidence/review.md]}
read_if_task_touches: [migration plan vocabulary]
primary_systems: [migration planning]
safe_to_edit: [Keep the retained historical plan byte-identical.]
do_not_use_instead: [docs/migration.md]
---

# Migration plan vocabulary

`neutral-plan.json` shows current `legacy-header-v1` vocabulary and a reproducible self-hash. `plan.json` is the retained, byte-identical historical teaching input with its earlier vocabulary and original hash. Both illustrate an empty plan inventory, not a reviewed real project or execution authority. The regression suite validates both forms. See `docs/migration.md` for the transformation and old-decision boundaries.

From a dependency-installed, built source checkout, recheck the vocabulary and
byte-preservation controls with:

```sh
npx vitest run test/migration-naming.test.ts --maxWorkers=1
```

The populated disposable fixtures additionally reject inconsistent count keys
and old decisions rebound to a newly named plan; they exercise exact-byte
execute/rollback only inside their own temporary projects. The two JSON files
here contain no source documents and prove no real-project coverage, reviewer
identity, current-source freshness or execution permission. Do not update their
dates, regenerate their hashes or edit them to silence documentation warnings.
