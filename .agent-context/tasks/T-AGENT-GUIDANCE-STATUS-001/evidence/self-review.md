---
topic_id: bundled-guidance-self-review
stand: "2026-10-03"
status: author-reviewed
truth_level: active-snapshot
verification:
  state: internally-reviewed
  evidence: [src/agent-guide.ts, src/task-status.ts, test/agent-guidance-status.test.ts]
read_if_task_touches: [bundled guidance self-review]
primary_systems: [CLI guidance]
safe_to_edit: [Keep author review distinct from independent review and release approval.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Author counterexample review

Herdr's separation of agent operating guidance from live runtime ownership
motivated this bounded task. Its live done/idle signal is not feature acceptance;
CanonTrail must remain durable governance, not an agent scheduler.

The guide lives in a compiled module and does not read mutable web/checkout docs.
Its CLI version comes from the running command definition. This is release-bundled
content, not a cryptographically exact full-runtime identity or upgrade mechanism.
Existing project scope, dry runs, installed-schema compatibility and safe packet
validation still govern actions. No host API/plugin is imported.

The task status wrapper calls existing finalization with refreshIndex forced false.
It adds no stored fields, predicate, approval, schema exception or deferred error.
JSON is the existing result. Human metadata uses safe exact local control reads,
does not fall back around a corrupt primary, quotes values, counts failed/pending
claims separately and refuses to call missing/unsafe own context current.
The complete underlying report retains safety findings and project-health debt.

Additional counterexamples found while reviewing the wrapper: empty ID could
otherwise fall through finalize's optional-task branch; injected API options
could request refresh if spread carelessly. Explicit identity validation and
forced no-refresh are tested. A task in review with successful tests is not
reported as technically broken; a failed check remains failed.

The terminology search covered guide/status source, usage, example and tests:
recorded, current, completion, health, guide, live agent and refresh-index.
Observed distributed stdout, not source inspection alone, verified CLI labels.
No graphical interface, diagram or application rendering was changed.

Limits: the report assumes stable local files, does not measure live agents,
rerun tests, attest semantic sufficiency or remove the need for strict global
integration/release gates. Context can conservatively remain unconfirmed when
other structural errors block a sufficient validation.

This medium-risk presentation change is author-reviewed; it is not independent
review or closure of the pre-existing high-risk tasks. No paid review is needed
for the local bounded task under the current protocol. Exact cross-platform CI
and a publication decision are still needed before distribution.
