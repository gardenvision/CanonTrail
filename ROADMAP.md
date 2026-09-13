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

1. Finish the curated-source review and portable first-use instructions.
2. Record current installation, tests, audit, validation and source-preservation results.
3. Finish third-party/public-content clearance and independent whole-product release review. The owner has selected MIT; this does not close those reviews. Exact V3 cross-platform CI is recorded; the later metadata/licensing revisions are not new hosted snapshots.
4. Obtain separate repository/publication and hosting-rule approval.

Current bounded correction: T-FROZEN-EXAMPLE-LIFECYCLE-001 adds explicit hash-bound age handling for synthetic examples without rewriting historical locks or exempting live tasks. Its revision 2 records the independent V3 review and exact-source CI for formal task closure; the Alpha preparation/release gate remains distinct. See `docs/alpha-readiness.md` for current states. Source distribution is the current target. T-PUBLIC-PREP-001 adds the missing package documentation to the file list; installed-package verification and npm publication remain separate.

Nonblocking follow-ups from that review remain open: R-1 clearer eligibility diagnostics; R-3 the protocol section-11 validator cross-reference; R-2 an explicit compatibility decision about standalone audit JSON parse failures. They do not authorize runtime changes in this closure revision.

T-MIT-LICENSE-001 applies the explicit MIT decision in a new local revision. It preserves `private: true`, third-party license metadata, runtime contracts and historical locks. Publication and original-checkout integration remain separate decisions.

T-PUBLIC-PREP-001 introduces neutral `legacy-header-v1` naming with retained historical-input compatibility, records the source-content audit boundary, and prepares the release checklist and third-party inventory. Its new migration-contract behavior requires independent review and current platform evidence; neither is borrowed from V3. Public destination, confidential security reporting and publication authority remain open.

## Useful later work, not this release's automatic scope

- Replace the generated resume-entry shorthand with the explicit validated-receiving-packet order already documented in README and protocol section 8. Until that separately reviewed generator change, do not treat a validated handoff alone as permission to execute the next feature action.

- Task/change scaffolding and explicit working/completion context phases.
- Better relevance fixtures across unrelated projects and safer compact-evidence authoring.
- More source extensions and generated-directory profiles, with tests.
- Evidence-backed semantic feature discovery; no promise of complete automatic documentation.
- Clearer lifecycle treatment when a verified canonical document changes after a historical promotion.
- Versioned upstream interoperability fixtures and unsupported-version reporting.

No GUI, hosted service, vector database, agent scheduler or new large application test is required for this bounded local preparation. Historical private research is retained separately, not republished here.
