---
topic_id: canontrail-release-checklist
stand: "2026-09-14"
status: public-source-hosting-reviewed
truth_level: draft
verification: {state: verified, evidence: [docs/alpha-readiness.md, SECURITY.md, .agent-context/tasks/T-RELEASE-CLOSURE-001/evidence/review-receipt-hosting.json, .agent-context/tasks/T-RELEASE-CLOSURE-001/evidence/hosting-results.json]}
read_if_task_touches: [public release preparation, source distribution]
primary_systems: [release operations]
safe_to_edit: [Record actual choices and checks without inventing hosting state.]
do_not_use_instead: [docs/alpha-readiness.md, SECURITY.md]
---

# First public source release

This checklist records the release process; its text does not itself configure GitHub or grant permission. On 2026-09-14 the separately reviewed clean-history `gardenvision/CanonTrail` became public at C2. The original development repository remains private as `gardenvision/CanonTrail-private`. Actual hosting observations are in the release task's `hosting-results.json`; read `docs/alpha-readiness.md` for exact review and platform evidence. A tagged Alpha is a later gate, not implied by public visibility alone.

## Decisions and remaining gates

1. Approved and prepared: `https://github.com/gardenvision/CanonTrail`, with clean root commit `23d542302e7327931cb2c60b7a35ae60e6e47f16` and no private development ancestors. The separately authorized private-repository rename is complete. Never merge old private branches, tags or raw project reports into this history.
2. Approved and configured: GitHub private vulnerability reporting. GitHub requires public visibility, so only the reviewed clean source was made public first; the channel was then immediately enabled and verified. The owner confirmed Watch / All Activity and the subscriber API confirmed the maintainer. The anonymous advisories page links to the private form. No advisory was submitted and actual email delivery was not tested; global account preferences were not changed. Never invent an email address or treat approval as configuration evidence.
3. Configured and API-verified: default branch `main`; required `validate` check bound to GitHub Actions app15368, strict up-to-date checks and admin enforcement; linear history; no force pushes or branch deletion. No second-person pull-request approval requirement is claimed. A tagged Alpha still requires the final metadata review and exact-revision CI. Neutral naming and MIT are selected. npm, canonical promotion and real-project migrations remain separate.

## Local preparation and review

- Preserve the sealed predecessor and record a manifest of the exact new files. Exclude private history, user projects, node_modules, build caches, original external review attachments and machine-specific paths.
- Audit that exact source inventory for secrets, private content and applicable third-party notices. A pattern scan is not complete legal provenance. Keep a maintainer review record with scope and limitations.
- From the candidate, run `npm ci --ignore-scripts`, `npm run check`, `npm run build`, and `npm test -- --maxWorkers=1`; preserve nonzero runs as well as the final results. Rebuild before inspecting the distributable CLI.
- Run `node dist/cli.js index .`, then deliberately refresh only current task locks after reviewing changes. Do not rewrite historical locks.
- Run `node dist/cli.js validate .`, `node dist/cli.js docs audit .`, and `node dist/cli.js finalize . --fail-on-warnings`. Check the named release tasks separately; a repository PASS does not close independent-review gates.
- Review neutral input, deprecated input, immutable historical plans, mixed-vocabulary rejection and unchanged transformation/rollback behavior. No tests run against an actual user project.
- Require revision-bound Windows/Linux/macOS evidence for changed behavior, distinguishing supported capabilities and skips. Earlier CI receipts are not the new snapshot.
- Obtain an independent review of the current change and overall release boundary, or an explicit recorded human waiver permitted by the protocol. Author self-review is not independence.

## Hosting steps after explicit permission

- Create the approved clean repository, stage only the manifest-reviewed files, and inspect the initial commit contents and author identity. Do not copy a private `.git` directory.
- Preserve exact raw source bytes when transporting hash-bound artifacts: this curated tree uses `* -text`, not automatic end-of-line conversion. Verify a real fresh checkout against the pre-commit inventory, including a consumer with `core.autocrlf=true`; ordinary test success in the pre-commit folder is not this evidence.
- Set the chosen distribution URL in the README and integration manifests. Pin the consumer GitHub Action to the reviewed immutable release commit, not a moving branch. Do not assume inherited development URLs already identify a public release.
- Configure the real private vulnerability-reporting channel and maintainer notifications; record configuration separately from actual delivery. GitHub requires public visibility before enabling this feature, so use the independently reviewed clean source for that prerequisite and stop the tagged release if activation fails. Update `SECURITY.md` with observed facts, without inventing a response-time SLA. [GitHub configuration guide](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository).
- Run the shipped platform workflow against the exact release candidate and configure actual required status checks/branch protections. Workflow YAML alone does not block merging. Inspect results before applying a public tag or release.
- Apply a public tag/release only after the owner's permission and exact final checks: both the platform matrix/aggregate and the separate main `completion-gate` workflow must pass. Branch protection enforces `validate`, not that second workflow, so inspect the second result explicitly. Verify unauthenticated read-only access to the repository/archive and essential documentation. Record the resulting revision and URLs externally or in the GitHub release; do not create a self-referential claim that a receipt-containing commit already included its own future CI result.

## npm is a separate channel

Packaging decision after independent review: keep source maps and include the corresponding `src/` TypeScript files so every map reference resolves inside the package. Source maps must contain neither absolute machine paths nor unreviewed embedded source. Verify this against the actual pack inventory; preserving maps without their sources is not a completed check. The runtime and schema contracts are unchanged by this inclusion decision.

Historical review erratum: earlier preparation receipts used `baseline_unchanged` and `predecessor_files_unchanged` for the 172 files preserved in the separate sealed MIT directory. That does not mean candidate equality: the neutral candidate has 158 unchanged, 14 changed, 13 added and 0 removed files. Retain the original receipts and read the scoped correction in the release task; never replace an old signed-by-hash report silently.

Keep `private: true` until separately approved. `npm pack --dry-run --json --ignore-scripts` checks the inclusion of README, MIT terms, guides, protocol and schemas without publishing. It is not an installed-package integration test or proof of namespace ownership. Build output and runtime dependencies have their own actual distribution inventory; a future offline/binary bundle must preserve its applicable notices. Installed users read their target project's generated `AGENTS.md`; the tool package does not ship private preparation-task history. See `docs/third-party-notices.md`.

No additional large application pilot is required merely to finish this release checklist. Nonblocking unrelated product improvements remain roadmap work.
