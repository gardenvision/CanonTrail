---
topic_id: security-reporting-policy
stand: "2026-09-12"
status: draft-before-public-release
truth_level: draft
verification: {state: unverified, evidence: [docs/alpha-readiness.md]}
read_if_task_touches: [security reporting, supported versions]
primary_systems: [security policy]
safe_to_edit: [Require an actual maintainer-approved private reporting channel before release.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Security policy draft

This is an unreleased local Alpha candidate. No public supported-version policy, response-time commitment or private reporting address has been approved yet. The owner must configure and verify an appropriate confidential reporting channel before public release. Do not invent an email address or assume GitHub private reporting is enabled.

Authorized testers should use the private channel agreed with the owner. Do not post credentials, private documents, unredacted execution logs or sensitive exploit details in public issues. Prefer minimal synthetic reproduction cases; never test a suspected flaw against a real project without explicit scope and backup.

Migration is high-risk and requires reviewed inputs and stable source access. The tool's self-hashes do not authenticate a reviewer. Dependency audit results are observations at a specific time, not a guarantee of safety. See `docs/alpha-readiness.md` for this candidate's outstanding checks and release decisions.
