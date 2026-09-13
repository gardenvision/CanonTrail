---
topic_id: canontrail-release-checklist
stand: "2026-09-13"
status: preparation-not-publication
truth_level: draft
verification: {state: unverified, evidence: [docs/alpha-readiness.md, SECURITY.md]}
read_if_task_touches: [public release preparation, source distribution]
primary_systems: [release operations]
safe_to_edit: [Record actual choices and checks without inventing hosting state.]
do_not_use_instead: [docs/alpha-readiness.md, SECURITY.md]
---

# First public source release

This checklist prepares a release; it does not authorize one. No public destination, repository creation, visibility change, security channel or maintainer notification setting is configured by these files. Read `docs/alpha-readiness.md` for actual review and platform evidence.

## Owner choices still required

1. Choose the exact public repository name and URL. Preserve the private development repository. Publish a clean source history built from the reviewed manifest, not the old private branches, tags, reflogs or raw project reports. If the desired name is already occupied, agree on any rename first.
2. Choose a real confidential security reporting channel. GitHub private vulnerability reporting is recommended for the eventual public repository, but is not assumed enabled. Confirm the form and notification delivery after configuration; if a channel must be available before visibility changes, supply a verified alternative contact first. Never invent an email address.
3. Approve the exact final revision for public source distribution after the independent release review and required quality gates. The neutral format name is already the owner's decision; the old name is compatibility-only, not normal onboarding.

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
- Configure the real private vulnerability-reporting channel and maintainer notifications; replace `SECURITY.md`'s draft status with verified facts. Decide supported Alpha versions without promising an unapproved response-time SLA. [GitHub configuration guide](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository).
- Run the shipped platform workflow against the exact release candidate and configure actual required status checks/branch protections. Workflow YAML alone does not block merging. Inspect results before applying a public tag or release.
- Publish only after the owner's final permission and verify public read-only access to the repository/archive and essential documentation. Record the resulting revision and URLs.

## npm is a separate channel

Packaging decision after independent review: keep source maps and include the corresponding `src/` TypeScript files so every map reference resolves inside the package. Source maps must contain neither absolute machine paths nor unreviewed embedded source. Verify this against the actual pack inventory; preserving maps without their sources is not a completed check. The runtime and schema contracts are unchanged by this inclusion decision.

Historical review erratum: earlier preparation receipts used `baseline_unchanged` and `predecessor_files_unchanged` for the 172 files preserved in the separate sealed MIT directory. That does not mean candidate equality: the neutral candidate has 158 unchanged, 14 changed, 13 added and 0 removed files. Retain the original receipts and read the scoped correction in the release task; never replace an old signed-by-hash report silently.

Keep `private: true` until separately approved. `npm pack --dry-run --json --ignore-scripts` checks the inclusion of README, MIT terms, guides, protocol and schemas without publishing. It is not an installed-package integration test or proof of namespace ownership. Build output and runtime dependencies have their own actual distribution inventory; a future offline/binary bundle must preserve its applicable notices. Installed users read their target project's generated `AGENTS.md`; the tool package does not ship private preparation-task history. See `docs/third-party-notices.md`.

No additional large application pilot is required merely to finish this release checklist. Nonblocking unrelated product improvements remain roadmap work.
