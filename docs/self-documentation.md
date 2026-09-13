---
topic_id: canontrail-self-documentation
stand: "2026-09-13"
status: alpha-candidate
truth_level: draft
verification:
  state: unverified
  evidence: [.agent-context/documentation-plan.yaml]
read_if_task_touches: [session entry, documentation ownership, candidate continuity]
primary_systems: [documentation governance]
safe_to_edit: [Keep one owner per topic and do not import private history.]
do_not_use_instead: [VISION.md, ARTIFACT_PROTOCOL.md, ROADMAP.md]
---

# Knowledge owners

| Topic | Owner |
|---|---|
| Purpose, product boundaries and non-goals | `VISION.md` |
| Artifact/lifecycle rules and safety contracts | `ARTIFACT_PROTOCOL.md` |
| Installation, entry and everyday commands | `README.md` |
| Current implementation priorities | `ROADMAP.md` |
| Alpha readiness, limitations and release gates | `docs/alpha-readiness.md` |
| Workflow interoperability | `docs/integrations.md` |
| Migration usage and execution limits | `docs/migration.md` |
| Platform coverage policy | `docs/platform-support.md` |
| Shared resources and task-scoped completion | `docs/parallel-work.md` |
| Change-integrity rationale | `docs/change-integrity.md` |
| Current candidate preparation | `.agent-context/tasks/T-ALPHA-CANDIDATE-001/state.yaml` |
| Frozen-example age correction | `.agent-context/tasks/T-FROZEN-EXAMPLE-LIFECYCLE-001/state.yaml` |
| License terms and local implementation decision | `LICENSE.txt`; `.agent-context/tasks/T-MIT-LICENSE-001/state.yaml` |
| Neutral naming and current public preparation | `.agent-context/tasks/T-PUBLIC-PREP-001/state.yaml` |
| Release operations and decisions still needed | `docs/release-checklist.md` |
| Third-party dependency inventory | `docs/third-party-notices.md` |

Read `AGENTS.md` first and choose new task, validated resume, unfinished bootstrap, or maintenance. Load the relevant owner, not this entire tree by default. Exact task sources belong in a context lock; a narrative summary is not a substitute.

This baseline intentionally does not include private development-task history. Existing product definitions and synthetic examples are not newly promoted by copying them. Current candidate checks must be recorded afresh. The preparation task remains separate from license selection, independent release review and publication permission.

This copy is the 2026-09-13 neutral-naming/public-preparation revision derived from the sealed MIT candidate. The frozen-example task owns its received technical-review receipt and exact-V3 platform results; the completed MIT task records the explicit license choice. The current T-PUBLIC-PREP-001 owns neutral migration vocabulary, source-publication preparation and its still-required independent review. `docs/alpha-readiness.md` owns their meaning and still-open release gates; `docs/platform-support.md` owns platform details. Do not interpret the private CI transport branch as product integration, or this changed runtime revision as the exact old CI snapshot. Earlier Alpha working locks remain in task-owned archives. Completed MIT/frozen-example locks and historical examples are not rewritten. Preparation checkpoints and private review attachments remain outside this source-only tree, as required by `AGENTS.md`.
