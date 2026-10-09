---
topic_id: task-field-authoring-002
stand: "2026-10-08"
status: review
truth_level: active-snapshot
verification:
  state: internally-reviewed
  evidence: [.agent-context/tasks/T-FIELD-AUTHORING-002/evidence/verification.md, .agent-context/tasks/T-FIELD-AUTHORING-002/evidence/quality.json, ARTIFACT_PROTOCOL.md]
read_if_task_touches: [T-FIELD-AUTHORING-002]
primary_systems: [document authoring, evidence snapshots]
safe_to_edit: [Owning task only; preserve peer tasks and all historical evidence.]
do_not_use_instead: [AGENTS.md, ARTIFACT_PROTOCOL.md]
---

# Field documentation authoring and provenance

## Objective and authority

The maintainer requested improvements from repeated field feedback: malformed
document headers, unclear allowed values, copied documentation being mistaken
for current governed documents, and ad-hoc cross-session coordination.
Implement a bounded authoring/provenance improvement; do not infer a new
execution permission from another agent's message.

## Accepted implementation boundary

- A `document create` command previews one complete, schema-valid governed
  Markdown draft. Apply creates only a new file. It never claims canonical
  authority, documentary verification, task completion or passing evidence.
- Schema errors name the failing field and its actual allowed enum/constant
  values. Different concepts retain different lists; no schema is weakened.
- A `document snapshot` command archives exact source bytes under the selected
  existing task, with a small hash-bound record. The copy is not a new `.md`
  truth owner. Explicit read-back is legible and separately verifies provenance.
  Historical snapshots remain valid after source drift. Tampered or incomplete
  snapshot evidence fails normal validation and index preflight.
- Document the optional human/external coordinator's durable identity and
  approval boundaries without creating a scheduler, agent messaging service,
  lease enforcer or project-specific editor lock.

## Explicit non-goals and retained next work

No consumer update, schema synchronization, peer-task rewrite, old-handoff
compaction, publication, Git push/merge, Unity action or paid review.
Existing compact handoffs are not reimplemented or silently rolled out.
Global malformed-document isolation needs a separate task-local working-index
contract: global truth, explicit dependencies and missing safety inputs must
remain blocking. This task does not suppress those findings.
The predecessor review's metadata closure and empty-finalize-ID follow-up remain
separate from the new implementation; its approval is not transferred here.

## Independent oracles and failure behavior

Revision 2 also owns a newly observed development dependency advisory:
GHSA-68fv-2mgg-jv7q. The permitted correction is only the existing transitive
source-map-js lock entry from 1.2.1 to 1.2.2, within the parent's declared range.
Record the exact lock diff and fresh install/audit/full-test result. No exploit
against CanonTrail is claimed and no broad dependency upgrade is authorized.

Use installed and shipped schemas, before/after raw-byte fixture manifests,
executed distributed CLI output, and independently calculated byte hashes.
Counterexamples include overwrites, filesystem aliases, missing/old schemas,
recomputed but incorrectly bound snapshot records, raw copies entering the
canonical index, or a forged approval in a generated title.
Multi-file snapshot creation is not crash-atomic. Keep stable exclusive inputs;
partial new evidence is preserved for inspection, not automatically deleted.

## Completion boundary

Run focused and full regressions, typecheck/build, strict validation, audit and
repository finalization against an exact isolated snapshot. Record skips and
platform limits. High-risk independent review remains pending until actually
performed; author self-review is not a substitute.

## Current checkpoint

Implementation and author verification are recorded in the task report and
evidence. Exact-source Windows and native Linux full regressions passed.
The new high-risk independent review remains pending, and strict project health
still reports 19 source drifts in three preserved peer tasks. Quality closure
stays pending rather than disguising that global result as success. No consumer
rollout, old receipt refresh, publication or paid review occurred.
