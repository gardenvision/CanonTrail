---
topic_id: example-save-schema-continuity
stand: "2026-09-12"
status: current
truth_level: active-snapshot
verification:
  state: internally-reviewed
  evidence:
    - examples/feature-save-schema/project-doc.md
    - examples/feature-save-schema/task-brief.md
    - examples/feature-save-schema/tasks/T-SAVE-001/context.lock.json
    - examples/feature-save-schema/tasks/T-SAVE-001/handoff.yaml
    - examples/feature-save-schema/tasks/T-SAVE-001/change.yaml
    - examples/feature-save-schema/tasks/T-SAVE-001/evidence/EVID-SAVE-TEST.evidence.yaml
read_if_task_touches:
  - worked examples
  - external workflow compatibility
  - handoffs
primary_systems:
  - examples
safe_to_edit:
  - Keep the example valid against current schemas.
do_not_use_instead:
  - ARTIFACT_PROTOCOL.md
---

# Save-schema documentation continuity example

This example starts after an external workflow such as Superpowers or GSD has already produced a task. CanonTrail does not recreate that tool's planning process.

This is a synthetic, frozen teaching scenario, not a currently executing task or an operational resume packet. The task brief retains the original planner input, including its original `active-snapshot` header; later task state illustrates closure. The brief, locks, handoff and evidence retain their original bytes. Their structural validity is not permission to resume them against today's repository. The regression in `test/context-review-corrections.test.ts` explicitly checks this distinction.

The frozen brief retains its original `active-snapshot` header because that header is part of the locked bytes. Its age-only handling is explicitly declared in `.agent-context/maintenance.yaml` using `frozen_examples`, its exact path and raw SHA-256, plus a rationale. The runtime validates eligibility before suppressing age-only `DOCS101`; structural, reference, lock-hash and future-date checks still run. A changed source loses eligibility and is an error. No blanket exception applies to other examples or real tasks. See protocol section 10.1 and `docs/alpha-readiness.md` for the contract and review status.

It demonstrates the boundary CanonTrail owns:

1. `project-doc.md` is the canonical project truth.
2. `task-brief.md` records the original external task as an active snapshot, not canonical truth; the bytes now serve as historical teaching input.
3. `context.lock.json` records the exact bounded sources selected for the worker.
4. `handoff.yaml` lets another agent or fresh session resume without the original conversation.
5. Verified implementation results may later update `project-doc.md` through explicit promotion.
6. `change.yaml` records why the existing feature document was updated, then proves that documentation structure, acceptance, impacts, and verification were closed before promotion.
7. `evidence/EVID-SAVE-TEST.evidence.yaml` records one compact technical-test claim and subject hash without embedding `SaveSystemTests.cs`.
8. `SaveManager.cs` demonstrates that an ordinary selected implementation source is `unclassified`, not canonical documentation.

The paths `SaveSystemTests.cs` and `docs/save-system/README.md` remain declared placeholders for this portable example.
