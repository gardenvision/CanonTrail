---
topic_id: parallel-context-worked-example
stand: "2026-09-06"
status: current
truth_level: active-snapshot
verification:
  state: internally-reviewed
  evidence:
    - test/parallel-context-freshness.test.ts
read_if_task_touches: [parallel context freshness]
primary_systems: [context validation]
safe_to_edit: [Keep cases synchronized with executable tests.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Two tasks sharing an index

The executable synthetic fixture is in test/parallel-context-freshness.test.ts. No real application, prior transcript or external workflow is required. Task A routes to FurnitureSurfacePlacement; task B routes to EditorCliConnection. InvoiceTotalsCalculator is unrelated. Both compile bounded locks against the same index.

| Later event | Expected validation | Lock writes |
| --- | --- | --- |
| Add a peer report; edit/delete an unselected unrelated canonical document; rebuild index | Both unchanged tasks pass, including named-task completion after their own lifecycle gates are closed | None |
| Add a new strongly routed canonical furniture requirement, or promote/change routing of a previously unselected document | A fails LOCK008 naming the missing requirement; B remains valid | None until A explicitly inspects/recompiles |
| Add an unselected weak canonical match, design target or draft | Does not by itself add a mandatory source | None |
| Change shared AGENTS.md or another selected source | LOCK004 remains a real source-drift failure | Owner rereads/recompiles explicitly |
| Delete a selected source, forge the lock payload or leave the current index stale | Existing missing-source, self-hash or index diagnostics remain failures | None |
| Remove governance from a selected metadata-routed document, or change its effective authority | LOCK008 requires a new assessment | None |
| Add unrelated index entries while applying an exact saved preview | Preview application still rejects index drift | Existing active lock preserved |

The original context_index_hash remains compilation provenance. Validation may establish compatibility against a later fresh index; it does not replace that hash or regenerate peer locks. All selected bytes, including optional sources and cited evidence, remain hash-checked. A cited task-evidence document can deliberately have historical selector authority while its own governed header is active-snapshot: those are different classifications, not drift by themselves.

## Operator sequence

1. Each task records its own goal, checks and small required_context_sources set, then compiles its context.
2. After documentation changes, update the shared deterministic index and validate.
3. If only unrelated index entries changed, keep the existing locks. If selected bytes or required canonical context changed, the owning task inspects the named sources and recompiles.
4. Each task records its actual verification and passes its own completion gate. A peer's real source error is not silently ignored by repository validation.

This example does not promise thread scheduling, atomic concurrent index writes, semantic completeness, lower token counts, or safety of simultaneous edits to the same source. Avoid unnecessary shared-file edits and keep true conflicts explicit. Existing older locks need no format migration; existing project instruction files are not automatically rewritten. Local native tests do not substitute for separate Linux/macOS or live-project evidence.
