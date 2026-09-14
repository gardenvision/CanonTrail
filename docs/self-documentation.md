---
topic_id: canontrail-self-documentation
stand: "2026-09-14"
status: public-source-alpha
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
| Product introduction, installation and copyable agent entry | `README.md` (authored source); `.github/README.md` is its generated presentation only |
| Detailed adoption, task commands, safe resume and development reference | `docs/usage.md` |
| Current implementation priorities | `ROADMAP.md` |
| Alpha readiness, limitations and release gates | `docs/alpha-readiness.md` |
| Workflow interoperability | `docs/integrations.md` |
| Migration usage and execution limits | `docs/migration.md` |
| Platform coverage policy | `docs/platform-support.md` |
| Shared resources and task-scoped completion | `docs/parallel-work.md` |
| Change-integrity rationale | `docs/change-integrity.md` |
| Completed local candidate preparation | `.agent-context/tasks/T-ALPHA-CANDIDATE-001/state.yaml` |
| Frozen-example age correction | `.agent-context/tasks/T-FROZEN-EXAMPLE-LIFECYCLE-001/state.yaml` |
| License terms and local implementation decision | `LICENSE.txt`; `.agent-context/tasks/T-MIT-LICENSE-001/state.yaml` |
| Neutral naming and current public preparation | `.agent-context/tasks/T-PUBLIC-PREP-001/state.yaml` |
| Release operations and hosting observations | `docs/release-checklist.md` |
| Clean-source preparation, hosting completion and review/CI receipts | `.agent-context/tasks/T-RELEASE-CLOSURE-001/state.yaml` |
| Third-party dependency inventory | `docs/third-party-notices.md` |
| Landing-page design and onboarding verification | `.agent-context/tasks/T-README-ONBOARDING-001/state.yaml` |

Read `AGENTS.md` first and choose new task, validated resume, unfinished bootstrap, or maintenance. Load the relevant owner, not this entire tree by default. Exact task sources belong in a context lock; a narrative summary is not a substitute.

This baseline intentionally does not include private development-task history. Existing product definitions and synthetic examples are not newly promoted by copying them. Current candidate checks must be recorded afresh. The preparation task remains separate from license selection, independent release review and publication permission.

This copy derives from the sealed MIT and neutral-naming candidates and has a separate clean public Git history, without private development ancestors. The frozen-example task retains exact-V3 evidence; the MIT task retains the explicit license choice. Local Alpha and neutral-naming preparation closed with independent C1/C2 review and revision-bound platform evidence. T-RELEASE-CLOSURE-001 owns hosting and final metadata reconciliation; its state is authoritative. `docs/alpha-readiness.md` owns the limits; `docs/platform-support.md` owns exact host results. Private reporting and main-branch CI protection were actually configured, not merely described. No actual email-delivery test is claimed. Do not treat earlier CI as execution of later metadata revisions; the tagged release must identify its own final commit and run externally. All completed preparation locks and historical examples remain unchanged. Raw external reviews and machine-local checkpoints remain outside the source tree. No previous chat is needed to find the task or its remaining gates.
