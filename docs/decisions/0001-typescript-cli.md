---
artifact_id: ADR-0001
artifact_kind: architecture-decision
topic_id: implementation-language
stand: "2026-07-13"
status: accepted-for-mvp
truth_level: canonical
verification:
  state: reviewed
  evidence:
    - package.json
    - ROADMAP.md
read_if_task_touches:
  - CLI implementation
  - runtime architecture
  - packaging
primary_systems:
  - validator
  - indexer
  - future adapters
safe_to_edit:
  - Revisit when measured packaging, performance, or embedding constraints invalidate the decision.
do_not_use_instead:
  - ROADMAP.md
---

# ADR-0001: TypeScript and Node.js for the MVP CLI

## Decision

CanonTrail's MVP CLI uses strict TypeScript, ESM, and Node.js 20.19 or newer. The initial package remains private and unlicensed until the repository owner selects a release license.

## Why

- JSON Schema and YAML are central protocol formats and have mature deterministic tooling in the Node ecosystem.
- A cross-platform CLI can inspect common workflow layouts and Git metadata without owning provider credentials.
- TypeScript keeps artifact shapes explicit while the protocol is still evolving.
- The implementation can later ship through npm, a bundled executable, or as a library without changing the protocol artifacts.

## Alternatives considered

- Python offers equally fast prototyping but adds more variation in interpreter and environment packaging for a user-facing CLI.
- Rust offers excellent single-binary distribution and startup behavior but would slow early protocol iteration and adapter development.
- A shell-only validator would reduce dependencies but would not provide a maintainable JSON Schema and YAML foundation across platforms.

## Consequences

- Protocol artifacts remain provider- and language-neutral; only the reference CLI selects Node.js.
- Runtime dependencies must stay small and auditable.
- Deterministic core functions must remain separable from command execution so workflow adapters and another implementation can conform later.
- The decision should be re-evaluated before a public binary distribution if startup time, installation friction, or embedding becomes a measured problem.
