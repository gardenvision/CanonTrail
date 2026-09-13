---
topic_id: alpha-readiness
stand: "2026-09-13"
status: local-preparation-awaiting-release-review
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

Current closure: the owner authorized conditional clean-source publication and the old repository was kept private as `gardenvision/CanonTrail-private`. A separate `gardenvision/CanonTrail` now exists as private staging, not a public release. The naming change received independent Claude review; its exact report identity and findings are recorded by T-RELEASE-CLOSURE-001. Current platform checks, independent whole-release assessment and confidential reporting confirmation remain gates. No private Git history is a distribution input.

This source tree is a local neutral-naming/public-preparation revision derived from the sealed MIT candidate. Earlier V4 closed the frozen-example task using exact V3 evidence; the exact V3 source received independent technical review of that correction and passed hosted CI on Windows, Linux and macOS. The subsequent MIT revision changed only licensing metadata and documentation. The present T-PUBLIC-PREP-001 additionally changes migration vocabulary, schema acceptance and CLI help, and therefore needs its own tests and independent review. No old hosted run or technical approval is attributed to these new bytes. MIT remains selected and the package remains private. Review of this readiness document concerns facts and open gates, not legal clearance, public release or canonical promotion.

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
- The context compiler currently supports a fixed list of text extensions; `.mjs` and `.cjs` are not included.

## Recorded evidence and remaining gates

| Gate | Current evidence and limit |
|---|---|
| Frozen-example technical review | Claude Opus 5 approved the exact V3 correction with conditions; the original report hash and scope are in `review-receipt.json`. This is not general release review. |
| Exact V3 hosted CI | Run `34747718414`, transport commit `a7901a3fb7a7a871ba7049e2aa50fc9da759744c`, four jobs passed. See `docs/platform-support.md` and `platform-results.json`. |
| Formal frozen-example closure | The existing task's revision 2 records the review and platform evidence; its authoritative current lifecycle is `.agent-context/tasks/T-FROZEN-EXAMPLE-LIFECYCLE-001/state.yaml`. Current task finalization must verify the closure metadata. |
| Public-content author audit | The sealed MIT predecessor's 172 files were scanned and findings classified: no secret-pattern hits, six synthetic fixture identities and historical format-name references. This is not full legal provenance or independent review; the current changed source needs a refreshed exact-inventory scan. |
| Current change and whole-product release review | Claude independently approved the naming/package change with conditions. Its evidence-label erratum is recorded separately; a local independent release-boundary assessment is in progress. Neither is silently substituted for final current-platform evidence. |
| License selection | MIT explicitly selected by the owner; standard terms are in `LICENSE.txt`. Decision scope is recorded by T-MIT-LICENSE-001; third-party terms are not replaced. |
| Publication | Owner authorized publication only after gates pass. Clean repository staging is private; no public release or npm publication yet. `private: true` remains enabled for npm. This process gate does not restrict rights granted by MIT. |
| Product integration and hosting rules | Owner approved a separate clean repository and private-history preservation. The old private transport branch must not be merged into public history. Actual required checks/security reporting are still to be verified. |

Earlier preparation evidence remains historical: Windows/Node24.11.1 passed 636 tests with 13 skips in the 649-case baseline, plus build/audit and synthetic onboarding. The unchanged V3 correction subsequently passed 671 local tests with 13 skips in 684 cases; all four hosted runs used that exact V3 ZIP. No result is retroactively attributed to a different source snapshot.

The frozen save-example brief is addressed by `T-FROZEN-EXAMPLE-LIFECYCLE-001`: an exact hash-bound `frozen_examples` policy handles age without changing the brief, its original header or historical artifacts. The exemption is age-only; real task paths, canonical/design truth, malformed declarations, source drift and filesystem aliases remain ineligible. The corrected source passed author typecheck, build and 671 runnable tests (13 skips, 684 total in 32 files) on Windows/Node 24.11.1. This includes 35 new policy cases; old valid policies receive no default exemption. Invalid maintenance files excluded from normal artifact discovery are now checked explicitly and can fail validation.

The V3 working locks of both preparation tasks were archived byte-for-byte before this closure's selected-document updates. No historical teaching lock is rewritten. The separate Alpha preparation task remains in review; no broad release approval is borrowed from the accepted frozen-example correction. A final current working lock is compiled before terminalizing that correction. Subsequent normal repository validation treats its completed lock as historical; targeted finalization still checks it strictly.

The three nonblocking review recommendations remain bounded follow-ups: R-1 clearer source-eligibility diagnostics; R-3 a section-11 validator cross-reference; R-2 a separate decision on pre-existing standalone audit JSON parse-error behavior. None is silently reported fixed by this metadata-only closure.

The subsequent MIT task owns only mechanical application of the owner's explicit license choice. Its local checks do not become independent legal or release review. The V4 Alpha working lock is archived before updating current selected documents; the completed frozen-example lock and all earlier example/evidence bytes remain historical and unchanged. No new hosted run is claimed for the licensing revision.

The current task replaces application-specific names in normal guidance and newly generated plans with `legacy-header-v1`. Historical format spellings remain only as compatibility inputs and retained examples. No plan, transaction, review receipt or completed lock is rewritten for terminology. `docs/release-checklist.md` owns the remaining preparation sequence; `docs/third-party-notices.md` records dependency licensing. Exact hosting/contact choices remain unconfigured. The new active Alpha lock is archived before refresh; the completed MIT and frozen-example locks remain unchanged.
