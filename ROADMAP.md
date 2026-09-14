---
topic_id: implementation-roadmap
stand: "2026-09-14"
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

- Investigate temporary-fixture cleanup reliability in `test/context.test.ts`: additional C2 main workflow `34817295233` failed attempt1 with `ENOTEMPTY` during teardown; the unchanged-source attempt2 passed. Both attempts and log hashes are in the release task's `extra-ci-retry.json`. The root cause is not established or fixed; do not mask product assertions or describe every attempt as green. Exact final matrix and additional main workflow remain tag gates.

- Replace the generated resume-entry shorthand with the explicit validated-receiving-packet order already documented in README and protocol section 8. Until that separately reviewed generator change, do not treat a validated handoff alone as permission to execute the next feature action.

- Task/change scaffolding and explicit working/completion context phases.
- Better relevance fixtures across unrelated projects and safer compact-evidence authoring.
- More source extensions and generated-directory profiles, with tests.
- Evidence-backed semantic feature discovery; no promise of complete automatic documentation.
- Clearer lifecycle treatment when a verified canonical document changes after a historical promotion.
- Versioned upstream interoperability fixtures and unsupported-version reporting.

No GUI, hosted service, vector database, agent scheduler or new large application test is required for this bounded local preparation. Historical private research is retained separately, not republished here.
