---
topic_id: contribution-policy
stand: "2026-09-13"
status: draft-before-public-release
truth_level: draft
verification: {state: unverified, evidence: [AGENTS.md, ARTIFACT_PROTOCOL.md]}
read_if_task_touches: [contributions, pull requests]
primary_systems: [contribution process]
safe_to_edit: [Do not invent licensing permissions or bypass review gates.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Contribution policy draft

The owner selected the [MIT License](LICENSE.txt) for CanonTrail's own material. No public contribution process is open yet; release policy, submission routes and public-content review remain separate gates. This draft adds no restrictions to MIT and does not change third-party licenses or claim that all content has been legally cleared.

For authorized local work, read `AGENTS.md`, keep one owner per topic, and create the required task/change record before nontrivial implementation. Include a counterexample that can reveal a wrong premise. Update the matching schema and worked example when an artifact contract changes.

Keep private project details, credentials, personal paths, raw conversations and unapproved third-party content out of proposed changes. Synthetic fixtures should be clearly synthetic. Preserve safety checks and historical evidence rather than weakening validation to get a green result.

Run typecheck, tests, build, index/validation and applicable finalization. Report failures, environmental skips and remaining review gates honestly. Do not claim Linux/macOS support from a Windows-only run. The owner must define the actual public contribution and security contact routes before release.
