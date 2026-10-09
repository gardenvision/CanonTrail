---
topic_id: field-authoring-002-author-review
stand: "2026-10-08"
status: author-review-only
truth_level: active-snapshot
verification:
  state: internally-reviewed
  evidence: [.agent-context/tasks/T-FIELD-AUTHORING-002/evidence/verification.md, src/document-authoring.ts, src/document-snapshot.ts, src/schema-diagnostics.ts, docs/parallel-work.md]
read_if_task_touches: [T-FIELD-AUTHORING-002]
primary_systems: [document authoring, evidence snapshots]
safe_to_edit: [Do not relabel author inspection as independent approval.]
do_not_use_instead: [.agent-context/tasks/T-FIELD-AUTHORING-002/change.yaml, ARTIFACT_PROTOCOL.md]
---

# Bounded author self-review

This is the implementation author's inspection, not the independent review
required for a new high-risk writer. No peer message or predecessor approval
closes that gate.

| Boundary | Author observation and executed oracle |
|---|---|
| Truth and caller text | Fixed draft/unverified header, empty evidence; multiline title/purpose cannot manufacture block-level approval. Quoting is not a model-instruction firewall. |
| Writes and paths | Exact portable regular paths, installed plus shipped schema checks, existing task owner, exclusive output; aliases, links and collisions remain visible. Stable exclusive tree required. |
| Raw provenance | Original bytes preserved separately; exact record serialization and independently reconstructed hash, task, size and archive path bindings; source drift is historical. |
| Index authority | Raw binary copies do not become Markdown truth owners. Invalid records, missing bytes and scanner coverage cannot be hidden by exclusion. Global errors remain blocking. |
| Read-back | Explicit bounded UTF-8 retrieval; error instead of truncation; human controls JSON-quoted, no semantic verification or current-source claim. |
| Coordination | User-appointed external coordinator only. Durable task identity, real authorization and transient host messaging/resource observations stay separate. |
| Compatibility | New snapshot shape needs explicit schema support; no automatic sync. Existing locks/handoffs and installed consumer code retained. |
| Tests/platforms | Exact-source Windows and native Linux chains pass; new paths have 82 focused cases. No new skips, timeout relaxation or macOS claim. |

## Retained risks and follow-ups

- Multi-file snapshot creation is not crash-atomic; partial output is preserved.
- Metadata/self-hashes are integrity checks, not authenticated user approval.
- Some manually parsed checkpoint-input enums still have terse diagnostics.
- Global malformed-note isolation and an actual compact-handoff consumer rollout
  remain separately scoped work, not silently completed here.
- Strict project health still fails on preserved peer drift; no release gate is
  relabeled healthy. New high-risk review and macOS evidence remain open.

The author identified no unresolved new deterministic failure in the executed
cases. That is a bounded statement, not a universal safety guarantee.
