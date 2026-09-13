---
topic_id: example-precompaction-checkpoint
stand: "2026-08-27"
status: current
truth_level: active-snapshot
verification:
  state: reviewed
  evidence:
    - examples/pre-compaction-checkpoint/handoff.yaml
    - schemas/handoff.schema.json
    - test/checkpoint.test.ts
read_if_task_touches:
  - checkpoint examples
  - pre-compaction checkpoints
primary_systems:
  - examples
  - context continuity
safe_to_edit:
  - Keep the handoff valid against the current schema.
  - Do not add transcript content.
do_not_use_instead:
  - ARTIFACT_PROTOCOL.md
---

# Pre-compaction checkpoint example

The handoff in this directory shows the optional provenance added by `canontrail checkpoint create`: a provider-neutral checkpoint trigger, source provider, and provider-native event. The durable output remains a normal CanonTrail handoff and contains no transcript.

The source and resume references intentionally reuse the portable save-schema example so this worked artifact remains independently verifiable without duplicating project truth.

