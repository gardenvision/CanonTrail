---
topic_id: canontrail-self-documentation
stand: "2026-10-08"
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
| Compact handoff inventories and reference-failure guidance | `.agent-context/tasks/T-COMPACT-HANDOFF-001/state.yaml`; `ARTIFACT_PROTOCOL.md` section 8.2 |
| Continuity byte/path preflight and retained-handoff hardening | `.agent-context/tasks/T-CONTINUITY-WRITE-HARDENING-001/state.yaml` |
| Abstract field feedback, task draft creation and checked shader/module context | `.agent-context/tasks/T-FIELD-WORKFLOW-001/state.yaml` |
| Public-main integration, dependency correction and branch publication | `.agent-context/tasks/T-PUBLISH-CONTINUITY-001/state.yaml` |
| Bundled runtime agent guide and read-only task status | `.agent-context/tasks/T-AGENT-GUIDANCE-STATUS-001/state.yaml`; `docs/usage.md` |
| Complete document drafts, explicit enum diagnostics and immutable document copies | `.agent-context/tasks/T-FIELD-AUTHORING-002/state.yaml`; `docs/usage.md`; `ARTIFACT_PROTOCOL.md` section 8.3 |
| Opt-in task working index and narrow peer-note isolation | `.agent-context/tasks/T-TASK-WORKING-INDEX-001/state.yaml`; `ARTIFACT_PROTOCOL.md` section 7.3 |

Read `AGENTS.md` first and choose new task, validated resume, unfinished bootstrap, or maintenance. Load the relevant owner, not this entire tree by default. Exact task sources belong in a context lock; a narrative summary is not a substitute.

## Current October 8 work

The independent delta review of exact `cf2702d` was received and its report hash
checked (`cc8090251f9e17cd21982dac78dfa8746fb4efae91666d4c4e3487921c96785e`).
It conditionally approves the predecessor's two deltas, not new authoring work.
The raw review is externally retained. Existing high-risk task metadata and
release gates still need separate consolidation; no merge or rollout follows.

`T-FIELD-AUTHORING-002` is on local branch `codex/field-friction-20261008`, based
on `cf2702d`. It reduces document-header, enum-diagnostic and copy-provenance
friction with explicit draft/snapshot commands, while documenting coordinator
authority rather than adding messaging or a supervisor. Global malformed-note
isolation is now a distinct opt-in task, not a hidden exemption.
The shared older `dist/` and consumer projects stay unchanged. Build/test in an
isolated exact-source copy; the task's evidence owns actual results and review
limits. Historical locks/receipts and the sealed PR target remain unchanged.
The new authoring/snapshot boundary passed 82 focused cases plus exact-source
full Windows (945 pass / 13 skip) and native Linux (951 pass / 7 skip) chains.
Its task report is the small current checkpoint; detailed verification and
the external raw manifest own the measured claims. New independent review,
strict peer-drift closure and macOS evidence remain open, with no consumer
update or publication. The sealed authoring r2 boundary has now received its
own independent technical PASS; that report does not approve the new index work
or close platform/integration gates. `T-TASK-WORKING-INDEX-001` has locally
implemented a read-only scope view, optional installed-schema-checked lock
marker, preview checks and fresh-resume mode inference. Its latest sealed r5
passed native Windows (1007 pass / 13 skips) and Linux (1013 pass / seven skips),
1020 cases on each with zero failures. Independent reviews rejected real earlier
defects, recorded with RED/GREEN regressions; independent r5 technical review
passed 99 corrected fresh cases. Integrated predecessor review remains pending.
These native results are not macOS, CI,
completion or consumer approval. Five inspected active locks were archived/
recompiled, preserving terminal/historical receipts; final metadata still needs
fresh strict checks. The task report owns the current next safe action; earlier
October 8 implementation notes are historical.

## Retained predecessor state (not current approval)

The October 3 guide/status task follows the sealed publication correction
be191ba on a separate local branch. That baseline passed its exact hosted
Windows/Linux/macOS/Node-floor checks; independent publication-delta review
remains open. The new guide/status bytes require fresh evidence of their own.
They do not change completion authority, stored schemas, consumer runtimes,
the draft PR's review target or external workflow ownership.

The October field-feedback task reviews a bounded, externally retained consumer corpus and publishes only abstract findings and synthetic fixtures. It adds task draft authoring rather than automatic decisions/completion, and explicit shader/module text support rather than binary ingestion. Its state/evidence own current progress and tests. Shared stable consumer CLIs are deliberately not rebuilt in place; source documentation and older executables must not be conflated. T-PUBLISH-CONTINUITY-001 owns the separate dependency correction and integration with public main. Its fresh evidence, rather than older green receipts, must establish the new source boundary.

Compact-handoff revision 3 received a bounded independent conditional review confirming A-D, including the new inventory writer correction. Two review receipts and their non-interchangeable scopes are recorded in T-CONTINUITY-WRITE-HARDENING-001/evidence/review-intake.md. The older archive writers, Git warning handling, retained history and detailed diagnostics are corrected and author-tested on Windows/Linux in that separate high-risk task. Its new bytes are not approved by the R3 review; independent review and exact macOS/CI remain open. Current exact verification and remaining gates belong in its state/change/evidence, not in old receipts. No consumer rollout, stable-runtime replacement or coordination feature is implied.

This baseline intentionally does not include private development-task history. Existing product definitions and synthetic examples are not newly promoted by copying them. Current candidate checks must be recorded afresh. The preparation task remains separate from license selection, independent release review and publication permission.

The independent conditional review of 66be45e and the owner's compatibility/name
decisions are retained by `T-PUBLISH-CONTINUITY-001/evidence/review-consolidation.md`.
Its revision-3 correction has four RED/GREEN regressions and a fresh full Windows
chain (831 passed, 13 capability skips, 844 cases). New correction-head CI and an
independent delta review remain open. Raw reviewer evidence stays outside public
source; 124 protected control artifacts and all frozen snapshots remain exact.
Do not rebuild consumer runtimes, rewrite historical receipts or merge on the
strength of the predecessor review alone.

This copy derives from the sealed MIT and neutral-naming candidates and has a separate clean public Git history, without private development ancestors. The frozen-example task retains exact-V3 evidence; the MIT task retains the explicit license choice. Local Alpha and neutral-naming preparation closed with independent C1/C2 review and revision-bound platform evidence. T-RELEASE-CLOSURE-001 owns hosting and final metadata reconciliation; its state is authoritative. `docs/alpha-readiness.md` owns the limits; `docs/platform-support.md` owns exact host results. Private reporting and main-branch CI protection were actually configured, not merely described. No actual email-delivery test is claimed. Do not treat earlier CI as execution of later metadata revisions; the tagged release must identify its own final commit and run externally. All completed preparation locks and historical examples remain unchanged. Raw external reviews and machine-local checkpoints remain outside the source tree. No previous chat is needed to find the task or its remaining gates.
