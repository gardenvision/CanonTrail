---
topic_id: contribution-policy
stand: "2026-10-18"
status: public-source-alpha-guidance
truth_level: draft
verification: {state: reviewed, evidence: [AGENTS.md, ARTIFACT_PROTOCOL.md, .agent-context/tasks/T-DOCS-FRESHNESS-20261018/evidence/review.md]}
read_if_task_touches: [contributions, pull requests]
primary_systems: [contribution process]
safe_to_edit: [Do not invent licensing permissions or bypass review gates.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Contributing to the source Alpha

CanonTrail's source is public at [gardenvision/CanonTrail](https://github.com/gardenvision/CanonTrail). Non-sensitive defects and proposals can be raised through repository issues or proposed pull requests. A proposal is not approval, a promise of acceptance or permission to merge. Report suspected vulnerabilities privately using [SECURITY.md](SECURITY.md), not a public issue.

The owner selected the [MIT License](LICENSE.txt) for CanonTrail's own material. This guide adds no restrictions to MIT, changes no third-party terms and is not legal clearance. Release, public-content and merge checks remain separate from proposing a contribution.

For authorized local work, read `AGENTS.md`, keep one owner per topic, and create the required task/change record before nontrivial implementation. Include a counterexample that can reveal a wrong premise. Update the matching schema and worked example when an artifact contract changes.

Keep private project details, credentials, personal paths, raw conversations and unapproved third-party content out of proposed changes. Synthetic fixtures should be clearly synthetic. Preserve safety checks and historical evidence rather than weakening validation to get a green result.

Use the built CLI's `task create --help` for a new draft record and `document create --help` for a complete draft document; creation does not supply an implementation decision or promote knowledge. Follow the repository's existing [entry instructions](AGENTS.md), rather than running initialization again.

For a local working change:

```sh
npm ci --ignore-scripts
npm run check
npm run build
npm test -- --maxWorkers=1
npm run index
npm run canontrail -- validate .
npm run canontrail -- finalize . --fail-on-warnings
```

CLI integration tests require the fresh build. Refresh the index deliberately after governed Markdown changes and review its diff; CI checks the committed candidate without repairing its index. Include the owning task's strict completion check where applicable. Report failures, environmental skips and remaining review gates honestly. A configured matrix or an older passing commit is not a passing current Linux/macOS run. Do not submit private histories or manufacture approval to make checks green.
