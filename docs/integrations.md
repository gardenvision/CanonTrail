---
topic_id: workflow-integrations
stand: "2026-08-29"
status: current-research-snapshot
truth_level: design-target
verification:
  state: reviewed
  evidence:
    - https://github.com/obra/superpowers
    - https://github.com/open-gsd/gsd-core
    - https://github.com/open-gsd/gsd-pi
    - src/compatibility.ts
    - test/compatibility.test.ts
    - src/readiness.ts
    - test/readiness.test.ts
    - integrations/gsd/canontrail/capability.json
    - integrations/superpowers/skills/canontrail-feature-lifecycle/SKILL.md
    - test/workflow-bridges.test.ts
    - https://code.claude.com/docs/en/hooks
    - https://developers.openai.com/api/reference/java/resources/responses/methods/compact
read_if_task_touches:
  - compatibility adapters
  - Superpowers
  - GSD
primary_systems:
  - compatibility
safe_to_edit:
  - Verify upstream layouts before changing mappings.
  - Record the checked date and supported version range when adapters become versioned.
do_not_use_instead:
  - VISION.md
  - ARTIFACT_PROTOCOL.md
---

# Workflow integrations

## Boundary

CanonTrail integrates at the artifact boundary. It detects paths, assigns roles, selects relevant sources for context, imports evidence references, and proposes canonical documentation updates. It does not invoke or reimplement another workflow's planning and execution lifecycle.

All external artifacts are:

- owned by the external tool;
- read-only to CanonTrail by default;
- `external-design` or `external-operational` state;
- non-canonical until explicit promotion;
- excluded from CanonTrail metadata requirements unless a user deliberately governs them.

## Superpowers

Superpowers 6.x uses mandatory, composable agent skills for brainstorming, planning, red-green-refactor TDD, fresh subagent execution, two-stage reviews, verification, and worktrees. Its default durable outputs are separated into:

- `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`;
- `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`.

CanonTrail maps specs to `specification` and plans to `plan`. It may reference them from task briefs and context locks. It must not edit them or promote them merely because Superpowers marked work complete.

Superpowers improves CanonTrail-backed projects when the desired unit is a feature with a human-approved design, a detailed implementation plan, strict TDD, and review after each task. Its workflow completion can supply evidence to a CanonTrail change record, but cannot close an impact row or acceptance oracle by itself.

Superpowers 6.x returns code-review findings through the agent workflow but does not define a default durable review file beside its specs and plans. Therefore the local adapter reports specs/plans and explicitly reports that no durable review candidate exists. A future GitHub pull-request adapter or an explicit upstream review projection may provide such a source; CanonTrail does not invent one.

The optional `integrations/superpowers/` bridge ships a separate `canontrail-feature-lifecycle` skill. It composes CanonTrail task setup, bounded context, checkpoints, evidence closure, and `finalize` with Superpowers rather than modifying the upstream Superpowers skills. `AGENTS.md` remains the always-on project policy; the skill supplies feature-lifecycle timing. It can be installed as a Claude Code plugin or as a standard Agent Skill in runtimes that support that layout.

## GSD Core

The former `gsd-build/get-shit-done` repository is archived; maintained development continues under `open-gsd/gsd-core`. GSD Core 1.11.x owns discussion, phase planning, parallel-wave execution in fresh contexts, verification, and shipping. It is the stronger fit for milestones that span many phases or are especially exposed to context rot.

CanonTrail initially recognizes `.planning/` and classifies common files:

- `PROJECT.md` as specification;
- `REQUIREMENTS.md` as requirements;
- `ROADMAP.md` as roadmap;
- `STATE.md` as operational state;
- `CONTEXT.md` as operational context;
- phase plans and summaries by filename and directory;
- `*-VERIFICATION.md` as verification evidence;
- `*-UAT.md` as human-acceptance evidence;
- durable `*REVIEW*.md` files as review evidence.

Mappings are conservative because upstream layouts evolve. Unknown files remain `other`; CanonTrail reports them instead of guessing canonical meaning.

GSD's phase verification and durable state can supply execution and resume evidence. CanonTrail still checks whether the phase outcome reached the canonical documentation and all applicable change-impact areas.

The optional `integrations/gsd/canontrail/` bridge is an installable GSD feature capability bounded to `>=1.11.0 <2.0.0`. Its `plan:pre` step compiles the exact CanonTrail task context before planning. Its `verify:post` step records selected durable evidence and runs strict task finalization after GSD's own verifier. Both steps halt on an unresolved CanonTrail gate. The capability contributes instruction surfaces only: it does not add a competing planner, write `.planning/`, execute project tests, or perform canonical promotion.

The task mapping is deliberately explicit. A GSD phase must match exactly one CanonTrail task whose `source_system` is `gsd-core` and whose `source_ref` names the current phase artifact. Missing or ambiguous mappings stop the bridge rather than guessing ownership.

### Experimental project-policy readiness projection

CanonTrail includes a fixture-backed, directly callable observer for a local `gsd-phase-readiness` version-1 projection. This is not an official GSD Core artifact, adapter guarantee, CLI feature, or automatically detected role. The local project policy owns the projection contract; GSD remains the workflow owner. The observer only reports structure, declared workflow status, referenced-source freshness, and deterministic inconsistencies. It never writes `.planning/`, grants execution authority, supplies completion evidence, or maps `ready` to CanonTrail `verified`.

Unknown versions remain unsupported and the normal compatibility detector continues to report the file as `other`. Automatic classification requires a later, separately approved adapter change after the projection has proven stable in real use.

## GSD Pi

GSD Pi stores local project state under `.gsd/`, including plans, tasks, decisions, session history, and runtime metadata. CanonTrail scans only Markdown, JSON, and YAML projections. It does not ingest databases, caches, logs, credentials, or opaque runtime state.

## Compatibility guarantees

An adapter must have fixtures for every claimed supported layout/version. Detection and context selection may remain available for unknown versions, but writes and migrations stay disabled. Every adapter test must verify that source files are byte-for-byte unchanged.

## Provider checkpoint events

Provider checkpoint adapters are thinner than workflow adapters: they translate a documented lifecycle event into CanonTrail's provider-neutral handoff lifecycle. They do not own provider configuration, session execution, compaction, or transcript processing.

Claude Code documents a `PreCompact` hook with `manual` and `auto` matchers and an input containing `session_id`, `cwd`, `trigger`, `custom_instructions`, and `transcript_path`. CanonTrail accepts that event only through the explicit `checkpoint claude-code` command, maps the session and trigger, verifies the repository boundary, and ignores the transcript path. Initialization does not install or configure the hook. An opted-in hook should use `--quiet`; CanonTrail failures use a normal non-blocking error rather than Claude Code's blocking exit-code contract.

OpenAI documents explicit conversation compaction through the Responses API `POST /responses/compact`. As of this snapshot, the official Codex documentation checked for this change did not establish a matching Codex CLI/Desktop pre-compaction lifecycle hook. CanonTrail therefore supports Codex through `checkpoint create --provider codex --trigger pre-compaction` rather than presenting API compaction as a Codex hook. This is a documented-evidence boundary, not a claim that future Codex versions cannot add such an event.

## Recommended combined use

Use one execution workflow as the primary owner for a given project or phase:

- choose Superpowers for a skills-first, design/TDD/review pipeline around discrete features;
- choose GSD Core for milestone/phase management and aggressive fresh-context execution;
- choose GSD Pi when its local-first agent runtime is the desired execution environment;
- use CanonTrail alongside any of them for canonical truth, bounded context locks, handoffs, change-integrity closure, and documentation maintenance.

Running Superpowers and GSD simultaneously as co-owners is not the default recommendation. Their planning gates, task state, subagents, and worktree behavior overlap and can produce conflicting authority. CanonTrail should detect both if present, but a task records exactly one owning workflow and treats the other as reference material unless the human explicitly transfers ownership.

The implemented evidence linker records selected durable GSD completion artifacts in `change.yaml` without copying or editing them. Superpowers review linking remains unavailable until a durable upstream or configured projection exists; specs and plans continue to serve only as design/plan inputs.

## Optional workflow bridges

Install only the bridge for the project's chosen execution owner:

```text
# GSD project capability
gsd capability install <CANONTRAIL_HOME>/integrations/gsd/canontrail --scope project

# Superpowers-compatible skill/plugin
<CANONTRAIL_HOME>/integrations/superpowers/
```

Both bridges require CanonTrail to be initialized in the target repository and either `canontrail` on the execution path or one exact project-documented `CANONTRAIL_HOME` invocation. They do not search arbitrary local directories. GSD and Superpowers are alternatives as primary workflow owners; installing both bridges for the same task is not the default.

Task-scoped finalization can separate unrelated context drift into a failed but task-non-blocking project-health gate. Both bridges must preserve that debt in their report and run repository-only `canontrail finalize . --fail-on-warnings` before integration/release or a whole-project success claim. Neither bridge may rewrite peer locks or infer shipping permission from a task PASS. Scheduling and shared editor/write-window ownership stay with the execution workflow; see `docs/parallel-work.md`.

## Evidence reference command

`canontrail evidence` scans detected workflow roots for durable evidence candidates. It distinguishes:

- `execution-summary`: an implementation claim that still requires independent checking;
- `verification`: recorded verification evidence;
- `human-acceptance`: a durable UAT observation;
- `review`: a durable review result.

Linking is bounded and explicit:

```text
canontrail evidence .
canontrail evidence . --change .agent-context/tasks/T-123/change.yaml \
  --source .planning/phases/01-foundation/01-VERIFICATION.md
canontrail evidence . --change .agent-context/tasks/T-123/change.yaml \
  --source .planning/phases/01-foundation/01-VERIFICATION.md --apply
```

The second command is a dry run. `--apply` writes only provenance metadata and the exact content hash to the CanonTrail-owned change record. The external artifact remains byte-for-byte unchanged and non-canonical. If the source later changes, validation reports a stale hash rather than silently accepting new content under an old decision.
