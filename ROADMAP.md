---
topic_id: implementation-roadmap
stand: "2026-09-13"
status: alpha-candidate
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

## Before a public Alpha

1. Completed for C1: curated-source boundary review, portable first-use probes, package/source-map checks and exact raw-byte Git transport. Keep the documented limits; this is not legal clearance or a full security audit.
2. Completed for C1: local checks and exact Windows/Linux/macOS CI, plus Linux at the declared Node floor. Reconcile subsequent documentation/lifecycle changes separately.
3. Remaining: approved confidential reporting route, actual hosting rules and public-access verification; keep private development history separate. The owner has selected MIT and conditionally authorized the new clean repository's publication after gates pass.
4. T-RELEASE-CLOSURE-001 owns these remaining release steps. npm publication, canonical promotion and real-project migrations are not part of this source release.

Current bounded correction: T-FROZEN-EXAMPLE-LIFECYCLE-001 adds explicit hash-bound age handling for synthetic examples without rewriting historical locks or exempting live tasks. Its revision 2 records the independent V3 review and exact-source CI for formal task closure; the Alpha preparation/release gate remains distinct. See `docs/alpha-readiness.md` for current states. Source distribution is the current target. T-PUBLIC-PREP-001 adds the missing package documentation to the file list; installed-package verification and npm publication remain separate.

Nonblocking follow-ups from that review remain open: R-1 clearer eligibility diagnostics; R-3 the protocol section-11 validator cross-reference; R-2 an explicit compatibility decision about standalone audit JSON parse failures. They do not authorize runtime changes in this closure revision.

T-MIT-LICENSE-001 applies the explicit MIT decision in a new local revision. It preserves `private: true`, third-party license metadata, runtime contracts and historical locks. Publication and original-checkout integration remain separate decisions.

T-PUBLIC-PREP-001 introduces neutral `legacy-header-v1` naming with retained historical-input compatibility, records the source-content audit boundary, and prepares the release checklist and third-party inventory. Its independent naming/C1 reviews and current platform evidence are recorded; neither is borrowed from V3. Local preparation closes separately from the release task's still-open confidential reporting and actual hosting gates.

## Useful later work, not this release's automatic scope

- Replace the generated resume-entry shorthand with the explicit validated-receiving-packet order already documented in README and protocol section 8. Until that separately reviewed generator change, do not treat a validated handoff alone as permission to execute the next feature action.

- Task/change scaffolding and explicit working/completion context phases.
- Better relevance fixtures across unrelated projects and safer compact-evidence authoring.
- More source extensions and generated-directory profiles, with tests.
- Evidence-backed semantic feature discovery; no promise of complete automatic documentation.
- Clearer lifecycle treatment when a verified canonical document changes after a historical promotion.
- Versioned upstream interoperability fixtures and unsupported-version reporting.

No GUI, hosted service, vector database, agent scheduler or new large application test is required for this bounded local preparation. Historical private research is retained separately, not republished here.
