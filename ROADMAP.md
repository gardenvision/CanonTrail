---
topic_id: implementation-roadmap
stand: "2026-10-08"
status: public-source-alpha
truth_level: draft
verification:
  state: unverified
  evidence: [src/cli.ts, docs/alpha-readiness.md]
read_if_task_touches: [implementation priorities, alpha scope]
primary_systems: [roadmap]
safe_to_edit: [Advance claims only with current candidate evidence.]
do_not_use_instead: [VISION.md, ARTIFACT_PROTOCOL.md]
---

# Bounded Alpha roadmap

## Existing implementation to verify for this candidate

- Governed metadata, indexing and structural validation.
- Non-overwriting init/adoption, prioritized inventory roots and a Unity inventory profile.
- Bounded context, required sources, optional omissions, explicit sections and drift detection.
- Compact evidence, task state, checkpoint/handoff and validated fresh-session resume.
- Report-first documentation audit and task-scoped completion gates.
- Optional external-workflow artifact bridges.
- Narrow plan-first reviewed legacy-header transformation and rollback, subject to the explicit experimental migration boundary.

Presence of these commands is not independent review of the entire product. `docs/alpha-readiness.md` owns release gates and practical limitations.

## Source Alpha release state

1. Completed for C1: curated-source boundary review, portable first-use probes, package/source-map checks and exact raw-byte Git transport. Keep the documented limits; this is not legal clearance or a full security audit.
2. Completed for C1 and C2: exact Windows/Linux/macOS CI, plus Linux at the declared Node floor; independent C2 metadata reconciliation. Reconcile later documentation/lifecycle changes separately.
3. Configured and checked: clean public source, separate private development history, confidential GitHub reporting, maintainer repository subscription and required main-branch CI. Actual email delivery is not claimed. MIT is selected.
4. T-RELEASE-CLOSURE-001 owns final metadata review and source preparation; a tagged Alpha still needs the final commit's hosted checks and an external release receipt. npm publication, canonical promotion and real-project migrations are not part of this source release.

Current bounded correction: T-FROZEN-EXAMPLE-LIFECYCLE-001 adds explicit hash-bound age handling for synthetic examples without rewriting historical locks or exempting live tasks. Its revision 2 records the independent V3 review and exact-source CI for formal task closure; the Alpha preparation/release gate remains distinct. See `docs/alpha-readiness.md` for current states. Source distribution is the current target. T-PUBLIC-PREP-001 adds the missing package documentation to the file list; installed-package verification and npm publication remain separate.

Nonblocking follow-ups from that review remain open: R-1 clearer eligibility diagnostics; R-3 the protocol section-11 validator cross-reference; R-2 an explicit compatibility decision about standalone audit JSON parse failures. They do not authorize runtime changes in this closure revision.

T-MIT-LICENSE-001 applies the explicit MIT decision in a new local revision. It preserves `private: true`, third-party license metadata, runtime contracts and historical locks. Publication and original-checkout integration remain separate decisions.

T-PUBLIC-PREP-001 introduced neutral `legacy-header-v1` naming with retained historical-input compatibility, recorded the source-content audit boundary, and prepared the release checklist and third-party inventory. Its independent naming/C1 reviews and platform evidence are recorded; neither is borrowed from V3. Its local preparation closure remains distinct from the later release task and actual hosting receipts.

## Useful later work, not this release's automatic scope

- `T-FIELD-AUTHORING-002` owns complete draft-document creation, explicit
  field-specific schema choices, managed immutable document snapshots and
  durable coordinator guidance. It is a new candidate; author checks do not
  transfer the predecessor's independent approval or update consumers. Its
  newly observed development-only source-map-js advisory is corrected only by
  a semver-compatible 1.2.1-to-1.2.2 lock entry; fresh evidence owns that result.
- `T-TASK-WORKING-INDEX-001` implements opt-in task-local working-index isolation.
  Exact r5 native Windows/Linux runtime and regression chains passed, as did
  its independent technical delta review. Integrated predecessor review and
  fresh hosted/platform/publication gates remain pending; technical scope PASS
  is not completion or consumer rollout.
  An unrelated
  malformed task note should not prevent conflict-free orientation, but missing
  global canonical truth, real dependencies, unsafe references and release/CI
  defects must remain visible and blocking. The separate explicit working view
  does not replace the global index, quarantine files or relax completion.
- Keep an external human/host coordinator optional. Durable participants,
  approval provenance and resource observations are useful; live messages,
  scheduler decisions and enforced editor locks remain externally owned.

- `T-AGENT-GUIDANCE-STATUS-001` owns the additive bundled `guide` and read-only
  `task status` view. It preserves finalize JSON/predicates and recorded lifecycle
  shapes. Its current checks do not approve the pending publication branch,
  update consumers or add Herdr orchestration. A future optional host adapter
  needs a separate measured pilot and explicit scope.

Current continuity work: `T-COMPACT-HANDOFF-001` separates complete Git-status provenance from required handoff context and clarifies missing-reference/index failures. Its own state, regression results and independent review determine closure. This does not update consumer schemas or old handoffs automatically and is not a new publication.

Revision 2 addresses the independent review's Git-root, byte-transport and diagnostic findings; author Windows/Linux suites pass. Independent remediation closure and exact macOS execution remain open before rollout. The review's deeper archive/resume write-path link hardening is a separately retained safety follow-up; diagnostic completeness, multi-output collision preflight and ordering precision are not silently counted as resolved. See the task's `evidence/review-remediation.md` before expanding scope.

Revision 3 adds a precommit raw-byte collision correction and two RED/GREEN regressions. Complete Windows/Linux suites pass for its pinned snapshot; independent review and macOS remain open. See `T-COMPACT-HANDOFF-001/evidence/precommit-review-r3.md`; this is not a consumer rollout or a release.

Subsequent review independently confirmed R3 A-D with conditions. `T-CONTINUITY-WRITE-HARDENING-001` now owns remaining Git-warning, older raw-archive writer, deep-link, preflight, retained-handoff and diagnostic corrections. Its review intake maps both reports by topic rather than reusing their finding numbers. New code requires its own regression/platform evidence and review; old approval is not transferred. Unavoidable multi-file crash/race and unsigned-provenance boundaries remain explicit, not advertised as fixed.

- Investigate temporary-fixture cleanup reliability in `test/context.test.ts`: additional C2 main workflow `34817295233` failed attempt1 with `ENOTEMPTY` during teardown; the unchanged-source attempt2 passed. Both attempts and log hashes are in the release task's `extra-ci-retry.json`. The root cause is not established or fixed; do not mask product assertions or describe every attempt as green. Exact final matrix and additional main workflow remain tag gates.

- Replace the generated resume-entry shorthand with the explicit validated-receiving-packet order already documented in README and protocol section 8. Until that separately reviewed generator change, do not treat a validated handoff alone as permission to execute the next feature action.

- `T-FIELD-WORKFLOW-001` implements dry-run-first task/change drafts, additional checked module/shader sources, and initial-excerpt guidance from bounded field feedback. Its own verification owns completion; pending continuity review/platform/rollout gates remain separate. Explicit working/completion context phases and semantic document splitting are still later work.
- Better relevance fixtures across unrelated projects and safer compact-evidence authoring.
- Broader source-format policies (especially binary-capable engine assets) and generated-directory profiles require separate tests and design; the new shader/module allow-list is not arbitrary text ingestion.
- `T-PUBLISH-CONTINUITY-001` integrates public-main corrections with continuity/task-authoring work and changes only the transitive fast-uri lock from 3.1.6 to 3.1.8. The lock-only update reports zero advisories; clean-install tests, audit and exact hosted checks must still establish the new publication boundary. This is not a demonstrated CanonTrail network exploit or permission to replace a consumer runtime. Independent continuity review gates remain open.
- Evidence-backed semantic feature discovery; no promise of complete automatic documentation.
- The conditional independent review of 66be45e is consolidated in `T-PUBLISH-CONTINUITY-001/evidence/review-consolidation.md`. Revision 3 corrects equal-cost report ordering, objective quoting and documentation accuracy; its fresh Windows suite passes 831 cases with 13 capability skips. The owner explicitly retains the stricter `.mjs` compatibility policy. New-head CI and independent delta review remain required before merge or consumer rollout.
- Retain the review's pre-existing non-atomic saved-preview active-lock writer as a separate follow-up. Atomic visibility is not power-loss durability, POSIX mode preservation or a multi-file transaction; do not transfer a predecessor approval to a later writer change.
- Clearer lifecycle treatment when a verified canonical document changes after a historical promotion.
- Versioned upstream interoperability fixtures and unsupported-version reporting.

No GUI, hosted service, vector database, agent scheduler or new large application test is required for this bounded local preparation. Historical private research is retained separately, not republished here.
