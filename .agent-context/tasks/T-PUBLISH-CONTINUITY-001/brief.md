---
topic_id: task-T-PUBLISH-CONTINUITY-001
stand: 2026-10-03
status: in-progress
truth_level: active-snapshot
verification:
  state: unverified
  evidence: []
read_if_task_touches:
  - T-PUBLISH-CONTINUITY-001
primary_systems: []
safe_to_edit:
  - Owning task; preserve existing project instructions, evidence and peer tasks.
do_not_use_instead:
  - AGENTS.md
---

# Publish reviewed continuity updates

## Objective

Integrate tested continuity and task-authoring updates with public main and publish a reviewable branch with exact hosted checks.

## Acceptance statements

- AC-001: "Public main corrections and existing working changes are preserved."
- AC-002: "Pinned dependency audit finding is remediated without unrelated upgrades."
- AC-003: "The source passes checks and the branch is published with honest review and platform status."

## Authority and boundary

The maintainer requested the pending source updates, commits, push and hosted
checks. Preserve public-main corrections and all historical receipts. Publish a
reviewable branch; high-risk independent review remains a merge gate. This work
does not update consumer schemas or runtimes, migrate a real project, or implement
the separately requested PersonalCanon idea.

## Verification route

Compare the preserved starting snapshot and both branch diffs, integrate public
main, remediate only the affected dependency, and run typecheck, build, regression
and complete suites. Run structural validation, strict repository finalization,
and exact-revision hosted Windows/Linux/macOS/Node-floor checks. Retain actual
failures/skips and pending independent review. Existing product owners retain
their boundaries; no new feature-document split is required.
