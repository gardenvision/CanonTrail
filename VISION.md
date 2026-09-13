---
topic_id: product-vision
stand: "2026-08-28"
status: approved-for-mvp
truth_level: canonical
verification:
  state: internally-reviewed
  evidence:
    - ARTIFACT_PROTOCOL.md
    - docs/integrations.md
read_if_task_touches:
  - product scope
  - product positioning
  - architecture principles
  - feature prioritization
primary_systems:
  - canonical documentation
  - context lifecycle
  - workflow compatibility
safe_to_edit:
  - Change only through an explicit product decision.
  - Preserve the boundary between documentation governance and external execution tools.
do_not_use_instead:
  - ARTIFACT_PROTOCOL.md
  - ROADMAP.md
---

# Vision

## Problem

Long-lived AI-assisted projects accumulate several competing forms of memory:

- canonical project documentation;
- plans and specifications produced by workflow tools;
- task state, summaries, and handoffs;
- provider instruction files;
- chat history and compaction summaries;
- code and tests that may no longer match the prose.
- locally correct changes that never propagate through requirements, contracts, examples, UI, terminology, diagrams, operations, and documentation.

As projects grow, agents load too much or the wrong context, old plans are mistaken for current behavior, new sessions cannot resume safely, and documentation drifts away from the implementation. Existing execution systems already plan, review, use worktrees, and dispatch agents well. They should not need to be replaced to solve documentation governance.

## Product thesis

CanonTrail is a Git-native, provider-neutral documentation governance and context-continuity layer for coding agents.

It connects:

```text
project discovery
  -> governed documentation
  -> progressive context selection
  -> task and session handoff
  -> verification evidence
  -> explicit canonical promotion
  -> recurring documentation maintenance
```

External systems such as Superpowers and GSD may own brainstorming, planning, execution, reviews, agents, and worktrees. CanonTrail detects and consumes their artifacts without rewriting them or treating them as canonical truth.

CanonTrail deliberately separates the project's durable knowledge from an agent's working context. The repository may retain comprehensive, hierarchical, evidence-backed knowledge; one task or session receives only the smallest sufficient view. Additional knowledge remains addressable and is loaded deliberately when the work exposes a relevant dependency, uncertainty, or contradiction.

## Target users

- developers maintaining large projects across many AI sessions;
- teams using more than one coding-agent provider or workflow;
- brownfield projects with missing, duplicated, or stale documentation;
- maintainers who need agents to load only relevant, evidence-backed context;
- workflow authors who need a portable documentation, context-lock, and handoff boundary.

## Product principles

### 1. One topic, one canonical location

Plans, summaries, generated notes, and provider memories may inform project truth but do not compete with it. Canonical ownership is explicit and duplicate ownership is rejected.

### 2. Documentation states what is known

Every governed document distinguishes current truth, future design, operational snapshot, draft discovery, and history. Verification state and evidence remain visible.

### 3. Context is compiled progressively

Durable project knowledge may cover every stable feature, system, contract, decision, operation, and verified relationship. A session is not a mirror of that complete corpus. Agents receive the smallest sufficient set of governing instructions, relevant canonical documentation, current task material, code, tests, and the latest valid handoff.

If that bounded view becomes insufficient, the agent identifies the missing dependency or uncertainty, follows explicit routing and evidence, and recompiles the context with the narrow additional source. Full repositories, complete documentation trees, and old transcripts are never the default context.

### 4. Compaction is a checkpoint

Before a session ends or compacts, it records completed work, decisions within authority, changed files, checks, blockers, open questions, and the next safe action. A fresh session resumes from durable state.

### 5. Evidence outranks confident prose

Tests, command results, source references, diffs, and observed behavior determine whether documentation can be promoted. Agent confidence alone is not verification.

### 6. External workflows remain owners of their artifacts

CanonTrail reads Superpowers specs and plans, GSD planning/state artifacts, and future adapter sources through explicit mappings. It does not mutate their directories or reimplement their orchestration.

### 7. Safe brownfield adoption

Initialization never overwrites existing files or performs Git remote operations. Mechanical inventory and semantic discovery are separated; generated descriptions begin as draft and unverified.

Mature documentation is migrated through an explicit plan-before-transform boundary. CanonTrail first records source identity, format, role, uncertainty, and proposed action without changing source bytes. Normalization, restructuring, and canonical promotion remain separate reviewed phases; no folder name or model inference silently becomes product truth.

### 8. Progressive complexity

Markdown, YAML, exact paths, metadata, Git hashes, and text search come first. Databases, semantic retrieval, graphs, servers, and dashboards require measured need.

### 9. Change integrity is explicit

For non-trivial work, a durable record connects the canonical decision to acceptance cases, counterexamples, ten impact areas, verification evidence, and risk-appropriate independent review. A green test suite is evidence, not proof that the tested premise was correct.

## Product layers

### Truth layer

Owns document identity, truth levels, verification, evidence, supersession, promotion, and one-topic-one-truth.

### Discovery and maintenance layer

Inventories a project, creates an evidence-backed documentation campaign, detects gaps and staleness, and supports recurring cleanup without destructive automatic rewrites.

### Context layer

Routes hierarchical project knowledge by task and system metadata, creates bounded working-context manifests, records exact versions, selection reasons, and omissions, and supports controlled expansion when new evidence is needed.

### Continuity layer

Defines task state, context locks, handoffs, and fresh-session resume packets independently of the executing provider.

### Compatibility layer

Detects external workflow layouts and maps their artifacts to non-canonical roles. Adapters import references and evidence while leaving the source workflow untouched.

## Non-goals

CanonTrail is not:

- a multi-model deliberation, consensus, or synthesis system;
- a replacement for Superpowers, GSD, OpenSpec, or another planner/executor;
- an autonomous coding-agent runner or worktree manager;
- a provider credential manager or model router;
- a vector database or universal memory store;
- a hosted service requirement;
- an IDE replacement;
- a store for hidden reasoning or full chat transcripts;
- a second canonical documentation tree beside the project's chosen truth locations.

## MVP success criteria

The first useful release succeeds when it can:

1. adopt a large existing project without overwriting source or requiring a remote;
2. bootstrap a staged, evidence-aware documentation campaign;
3. validate governed metadata and reject competing canonical topic owners;
4. build a deterministic context index;
5. detect supported Superpowers and GSD artifacts without modifying them;
6. compile a bounded context manifest for a task;
7. validate a handoff that a fresh provider session can resume from;
8. identify stale, duplicate, contradictory, and orphaned documentation;
9. promote verified implementation knowledge into exactly one canonical destination.
10. reject completion when a non-trivial change has unresolved impact areas or lacks required acceptance and review evidence.

## Public positioning

> CanonTrail keeps project documentation canonical, agent context bounded, and session handoffs reproducible—without replacing the workflow tools you already use.
