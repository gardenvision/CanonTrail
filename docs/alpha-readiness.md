---
topic_id: alpha-readiness
stand: "2026-09-18"
status: public-source-hosting-configured
truth_level: draft
verification:
  state: verified
  evidence:
    - .agent-context/tasks/T-ALPHA-CANDIDATE-001/state.yaml
    - .agent-context/tasks/T-ALPHA-CANDIDATE-001/evidence/verification.json
    - .agent-context/tasks/T-FROZEN-EXAMPLE-LIFECYCLE-001/evidence/verification.json
    - .agent-context/tasks/T-FROZEN-EXAMPLE-LIFECYCLE-001/evidence/review-receipt.json
    - .agent-context/tasks/T-FROZEN-EXAMPLE-LIFECYCLE-001/evidence/platform-results.json
    - .agent-context/tasks/T-MIT-LICENSE-001/evidence/owner-decision.json
    - .agent-context/tasks/T-PUBLIC-PREP-001/evidence/verification.json
    - .agent-context/tasks/T-PUBLIC-PREP-001/evidence/readiness-facts.json
    - .agent-context/tasks/T-RELEASE-CLOSURE-001/evidence/review-receipt.json
    - .agent-context/tasks/T-RELEASE-CLOSURE-001/evidence/platform-results.json
    - .agent-context/tasks/T-RELEASE-CLOSURE-001/evidence/review-receipt-c2.json
    - .agent-context/tasks/T-RELEASE-CLOSURE-001/evidence/platform-results-c2.json
    - .agent-context/tasks/T-RELEASE-CLOSURE-001/evidence/hosting-results.json
read_if_task_touches:
  - alpha release readiness
  - distribution scope
primary_systems:
  - release preparation
safe_to_edit:
  - Separate preparation checks from publication permission and independent approval.
do_not_use_instead:
  - VISION.md
  - ARTIFACT_PROTOCOL.md
---

# Alpha source release readiness

Current hosting: the owner authorized clean-source publication; the old repository remains private as `gardenvision/CanonTrail-private`. Only the new clean history in `gardenvision/CanonTrail` is public. Independent Claude naming review, independent Codex C1 release-boundary review and C2 metadata reconciliation are recorded by T-RELEASE-CLOSURE-001. Exact C1 and C2 platform checks passed. Private reporting, the maintainer subscription, default main branch, required CI and anonymous public access were verified on 2026-09-14. Actual email delivery was not tested. Later metadata requires bounded review and exact final CI before a tagged Alpha; the release page records that eventual commit-bound result. No private Git history is a distribution input.

This source tree derives from the sealed MIT candidate. Earlier V4 closed the frozen-example task using exact V3 evidence; the subsequent MIT revision changed only licensing metadata and documentation. T-PUBLIC-PREP-001 then changed migration vocabulary, schema acceptance and CLI help. Its own reviews and C1 hosted results now support those bytes; no old V3 approval is substituted for them. This later metadata closure is not retroactively identical to C1. MIT remains selected and the npm package remains private. Review of this readiness document concerns facts and open gates, not legal clearance, public release or canonical promotion.

## Included and excluded knowledge

The implementation, schemas, synthetic regression tests, worked examples and portable product definitions originate from the existing development codebase. Private project inventories, transcripts, external review attachments and development-task history are intentionally not distributed. New task evidence describes this candidate only; it does not fabricate public proof of excluded historical reviews. The private provenance manifest is kept outside the candidate.

Product definitions inherited unchanged do not constitute a new canonical promotion. Edited and newly authored operational documents remain drafts until their stated checks and reviews are completed. Test fixtures are examples, not records of a real user's tasks.

## Boundaries to retain

- Context counts are deterministic estimates, not measured provider billing or the whole session footprint. CanonTrail cannot prevent compaction or guarantee compliance by an agent.
- Required large files and directly cited raw evidence may dominate a lock. Compact evidence records and explicit optional-source sections are available; selecting them well still requires judgment.
- Init creates scaffolding and a documentation campaign, not complete verified knowledge. Existing-file conflicts are preserved; explicit adoption may still create other files and exit with a conflict status.
- Migration execution is narrow and experimental for the Alpha. Independently reviewed inputs, backup, stable exclusive source access and separate execution authority remain mandatory. No universal restructuring or network-filesystem transaction is promised.
- A source file's participation in context does not make it canonical. Technical verification and canonical promotion remain distinct. Evolving documents and historical promotion records can require a reviewed lifecycle decision.
- External tools own workflow, agents, worktrees and shared editor access. CanonTrail does not schedule parallel work.
- The context compiler supports a fixed text-extension allowlist, which includes `.mjs` and `.cjs` since the 2026-09-18 review; files outside the allowlist are not loadable as sources. See the [usage guide](usage.md).

## Recorded evidence and remaining gates

| Gate | Current evidence and limit |
|---|---|
| Frozen-example technical review | Claude Opus 5 approved the exact V3 correction with conditions; the original report hash and scope are in `review-receipt.json`. This is not general release review. |
| Exact V3 hosted CI | Run `34747718414`, transport commit `a7901a3fb7a7a871ba7049e2aa50fc9da759744c`, four jobs passed. See `docs/platform-support.md` and `platform-results.json`. |
| Formal frozen-example closure | The existing task's revision 2 records the review and platform evidence; its authoritative current lifecycle is `.agent-context/tasks/T-FROZEN-EXAMPLE-LIFECYCLE-001/state.yaml`. Current task finalization must verify the closure metadata. |
| Public-content author audit | The sealed MIT predecessor's 172 files were scanned and findings classified: no secret-pattern hits, six synthetic fixture identities and historical format-name references. This is not full legal provenance or independent review; the current changed source needs a refreshed exact-inventory scan. |
| Current change and release-boundary review | Claude naming review and independent Codex C1 source-boundary review passed with explicit conditions. The latter independently verified all 195 source/commit files and permits local preparation closure only. The erratum and exact scope are retained in the release task; neither review is legal clearance or a publication grant. |
| Current C1 hosted CI | Clean commit `bed8fa84beb3d0a763f001f42a415fafd6ddaf85`, run `34783886228`: all four matrix jobs and aggregate passed, with 696 cases per host. Actual counts/capabilities and skipped cases are in the current release task's platform receipt. Later documentation closure is a separate delta. |
| C2 metadata and hosted CI | Independent metadata reconciliation approved exact C2 `4355643c82aea3a69213d0821660cae561ac5b3a`. Run `34785633886` passed all four matrix jobs and aggregate; per-host totals remain 696. The `review-receipt-c2.json` and `platform-results-c2.json` records distinguish the reviewer observations from the later author-collected hosted result. |
| License selection | MIT explicitly selected by the owner; standard terms are in `LICENSE.txt`. Decision scope is recorded by T-MIT-LICENSE-001; third-party terms are not replaced. |
| Source availability | Owner-authorized clean source is public. A tagged Alpha requires its final exact-revision checks and is recorded on the GitHub release page. No npm publication: `private: true` remains enabled. This process gate does not restrict rights granted by MIT. |
| Hosting rules | API-verified: private reporting enabled; main requires the Actions app15368 `validate` check with strict up-to-date/admin enforcement; force pushes/deletion prohibited. Anonymous source and reporting-entry reads succeeded; anonymous old-repository access returned404. The old private transport branch must never be merged into public history. |

Earlier preparation evidence remains historical: Windows/Node24.11.1 passed 636 tests with 13 skips in the 649-case baseline, plus build/audit and synthetic onboarding. The unchanged V3 correction subsequently passed 671 local tests with 13 skips in 684 cases; all four hosted runs used that exact V3 ZIP. No result is retroactively attributed to a different source snapshot.

The frozen save-example brief is addressed by `T-FROZEN-EXAMPLE-LIFECYCLE-001`: an exact hash-bound `frozen_examples` policy handles age without changing the brief, its original header or historical artifacts. The exemption is age-only; real task paths, canonical/design truth, malformed declarations, source drift and filesystem aliases remain ineligible. The corrected source passed author typecheck, build and 671 runnable tests (13 skips, 684 total in 32 files) on Windows/Node 24.11.1. This includes 35 new policy cases; old valid policies receive no default exemption. Invalid maintenance files excluded from normal artifact discovery are now checked explicitly and can fail validation.

The V3 working locks of both preparation tasks were archived byte-for-byte before selected-document updates. No historical teaching lock was rewritten. At that earlier stage the Alpha task remained in review; its current local-preparation closure uses the separate C1 boundary review, not approval borrowed from the frozen-example correction. Named finalization checks each closing task's current lock strictly; later ordinary repository validation treats completed locks as historical.

The three nonblocking review recommendations remain bounded follow-ups: R-1 clearer source-eligibility diagnostics; R-3 a section-11 validator cross-reference; R-2 a separate decision on pre-existing standalone audit JSON parse-error behavior. None is silently reported fixed by this metadata-only closure.

The subsequent MIT task owns only mechanical application of the owner's explicit license choice. Its local checks do not become independent legal or release review. The V4 Alpha working lock is archived before updating current selected documents; the completed frozen-example lock and all earlier example/evidence bytes remain historical and unchanged. No new hosted run is claimed for the licensing revision.

The completed neutral-naming task replaced application-specific names in normal guidance and newly generated plans with `legacy-header-v1`. Historical format spellings remain only as compatibility inputs and retained examples. No plan, transaction, review receipt or completed lock was rewritten for terminology. `docs/release-checklist.md` owns release operations; `docs/third-party-notices.md` records dependency licensing. The earlier working Alpha locks were archived before refresh. Alpha, PublicPrep, MIT and frozen-example tasks are now historical and are not refreshed by subsequent hosting-documentation changes.
