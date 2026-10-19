---
topic_id: documentation-freshness-review-20261018
stand: "2026-10-18"
status: verified-local
truth_level: active-snapshot
verification:
  state: verified
  evidence: [ARTIFACT_PROTOCOL.md, .github/workflows/validate.yml, .agent-context/tasks/T-DOCS-FRESHNESS-20261018/evidence/hosting-observation.json]
read_if_task_touches: [T-DOCS-FRESHNESS-20261018, six-document freshness review]
primary_systems: [documentation maintenance]
safe_to_edit: [Distinguish actual content review from date-only renewal and release approval.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Review of six aged documentation owners

The user authorized content review, not a date-only warning suppression. This
documentation-only task was decided before editing the six owners. The previous
file-preflight implementation and completed task remain unchanged.

## Per-document source-to-claim ledger

| Owner | Sources inspected | Finding and bounded correction |
| --- | --- | --- |
| CONTRIBUTING.md | AGENTS.md; protocol 12; LICENSE.txt; current public repository API; package scripts | Pre-public wording was stale. Describe available public proposal channels without promising acceptance, changing MIT or granting merge rights; make build-before-test and deliberate local index refresh explicit. |
| SECURITY.md | Existing hosting receipt; current private-vulnerability-reporting API; alpha limits | Reporting remains enabled. Preserve the historical activation date; add the dated API observation, not a delivery test or new security approval. |
| docs/change-integrity.md | Protocol 9/12; change schema; validator lifecycle checks; task/check/finalize CLI | Rules are still consistent. Fix section reference and add a short actionable route that preserves decision, evidence, independent-review and separate promotion gates. |
| docs/migration.md | Migration source binding/execution guards; schemas; real plan/preview help; naming/transformation tests | The in-place, roots-bound experimental contract is unchanged. Replace unqualified pending-release prose with explicit revision-bound review limits; distinguish a source-alpha tag from permission for real-project migration. |
| docs/platform-support.md | Current workflow; capability probe; retained exact-commit receipts; local file-preflight evidence | Calling the October 50f7 revision the current public head is stale. Label it historical and explicitly distinguish current local Windows/Linux results from an unexecuted exact-candidate hosted matrix. |
| examples/migration-plan/README.md | Both plan JSON payloads; shipped plan schema/hash implementation; naming regression | Both empty examples are still valid teaching inputs. Explain what they do not prove and give the focused regression command; do not alter or rehash either JSON file. |

The current read-only GitHub observation confirms a public non-archived repository,
issues enabled, main at `34edacab3ee6001813208e192c217eec595958b9`, confidential
reporting enabled and a published prerelease `v0.1.0-alpha.1`. No settings were
changed and no advisory/report was submitted. Actual notification delivery and
an anonymous submission flow were not tested in this maintenance.

## Verification plan and boundaries

Run document preflight, migration/reference regression controls, typecheck/build,
then the built CLI index, repository validation, current-date audit and strict
named-task/repository finalization. Capture raw logs outside distributed source.
Compare completed task files, retained JSON examples, executable sources and the
immutable live runtime against the pre-maintenance snapshot. Do not change the
freshness policy, add exemptions or backdate the audit.

Platform tests for the preceding file-preflight source remain bound to its frozen
manifest; they are not retroactively runs of these later documentation bytes.
No new macOS, Node-floor, hosted CI, release or consumer-cutover claim is made.
This is author documentation review, not independent security or legal review.

## Measured local results

- All six individual file preflights pass; the index is current and the
  current-date documentation audit reports healthy, zero errors and zero warnings.
- Typecheck and distributable build pass. The exact focused migration-naming
  command documented in the example passes all 12 cases, with no skips.
- Full Windows/Node 24.11.1 suite: 1120 passed, 13 existing capability skips,
  zero failures, 1133 cases in 49 files. Frozen 476-file snapshot manifest SHA-256:
  `15ec35e323913933b4ec13b0147d12140db75092f5f708c61956dfb94849af3c`.
  Raw test-result JSON SHA-256:
  `8cb97769f4569a7739d2b13c173caf3ee1e0c791bb69437bbae9e8c725bf49c6`.
  All 476 source files still matched that snapshot after execution. Later task
  closure notes are metadata, not retroactively part of that test run.
- The pre-maintenance 466-file manifest has SHA-256
  `8376453943af78828521a7b1ac0540e8e8a5cb20d4fff16847baf46e6bced40c`.
  Exactly the six reviewed documents and derived index changed. All 257 prior
  task files, 123 executable/schema/test/script/config files, both retained plan
  JSON files and the freshness policy remain byte-identical. No existing consumer
  was written and the immutable live runtime hash is unchanged.
- Retained `plan.json` raw SHA-256:
  `83784f5a112611e8d24db794a07a8a8d2aa2a8f4f083695a724ccfcba84ba3c3`;
  `neutral-plan.json`:
  `e6aaeee436e1de36e3873d58e5ce5c26f4c591c847a37deb12303b78fc7a5b13`.

Author self-review corrected AC-004's circular premise: terminal finalization
cannot be an independent prerequisite of its own lifecycle gate. Revision 2
uses index/validation/audit as independently measurable acceptance; strict
finalization remains a required terminal observation after closure. The decided
revision-1 bytes are preserved in `change-r1.yaml.fixture`, not silently replaced
as if the first oracle had been correct.

The owner separately authorized pushing the green branch and opening a pull
request for exact hosted CI. This does not authorize merging main, a tag/release,
GitHub settings changes or consumer cutover. Actual publication/CI observations
are collected separately from these local test receipts.
