---
topic_id: security-reporting-policy
stand: "2026-10-18"
status: configured-for-public-alpha
truth_level: draft
verification: {state: verified, evidence: [.agent-context/tasks/T-RELEASE-CLOSURE-001/evidence/hosting-results.json, .agent-context/tasks/T-DOCS-FRESHNESS-20261018/evidence/hosting-observation.json]}
read_if_task_touches: [security reporting, supported versions]
primary_systems: [security policy]
safe_to_edit: [Require an actual maintainer-approved private reporting channel before release.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Security policy

Report suspected security issues through [GitHub's private vulnerability reporting form](https://github.com/gardenvision/CanonTrail/security/advisories/new). Sign in to GitHub to submit a private report. The maintainer enabled this channel and its public entry point was verified on 2026-09-14. A read-only GitHub API check on 2026-10-18 reconfirmed that private vulnerability reporting is enabled. This later configuration check did not submit a report, test the anonymous sign-in flow or verify notification delivery. The earlier receipt records the maintainer's repository subscription; actual email delivery remains untested.

This is an experimental source Alpha. Reports should identify the exact commit or release tag, relevant OS/filesystem and a minimal reproduction. There is no response-time or backport commitment, and no promise that an Alpha is free of vulnerabilities. Older development snapshots and unrelated packages using the same name are not supported releases of this repository.

Do not post credentials, private documents, unredacted execution logs or sensitive exploit details in public issues. Prefer minimal synthetic reproduction cases; never test a suspected flaw against a real project without explicit scope and backup. If the private form is unavailable, report only that the reporting channel is unavailable in a public issue; do not include the sensitive details there.

Migration is high-risk and requires reviewed inputs and stable source access. The tool's self-hashes do not authenticate a reviewer. Dependency audit results are observations at a specific time, not a guarantee of safety. See `docs/alpha-readiness.md` for this candidate's outstanding checks and release decisions.
