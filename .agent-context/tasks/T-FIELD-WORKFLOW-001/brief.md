---
topic_id: task-field-workflow-001
stand: "2026-10-01"
status: completed
truth_level: active-snapshot
verification:
  state: internally-reviewed
  evidence: [.agent-context/tasks/T-FIELD-WORKFLOW-001/evidence/intake.md, .agent-context/tasks/T-FIELD-WORKFLOW-001/evidence/verification.md]
read_if_task_touches: [field workflow improvements, task scaffolding, shader context]
primary_systems: [task authoring, context compilation]
safe_to_edit: [Owning task; preserve historical artifacts and existing pending review gates.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Field workflow improvements

The maintainer requested review of real multi-session consumer reports and bounded
improvements. Private intake and raw project paths remain outside the distribution.
The abstract findings and selected response are in the task intake evidence.

## Decided scope

1. A dry-run-first `task create` command generates schema-valid `brief.md`,
   `state.yaml` and `change.yaml` in a new task directory. Explicit task/change
   identities, author, risk, objective and acceptance statements come from the
   caller. Generated lifecycle stays draft/idea and every outcome stays pending;
   no authority, execution permission, evidence or success is inferred.
2. Permit a small explicit set of text programming/shader formats in bounded
   context: `.mjs`, `.cjs`, `.hlsl`, `.glsl`, `.shader`, `.compute`, `.cginc`.
   These additional formats require valid UTF-8, no NUL and at most 8 MiB.
   Ambiguous engine assets/prefabs remain unsupported; no automatic tree loading.
3. Give a useful no-write error for an excerpt task comparison before its first
   lock, pointing to the existing task-free excerpt workflow. Do not accept an
   absent, corrupt or mistyped task lock as successful context coverage.
4. Document the short authoring/checkpoint sequence and executable-vs-source
   provenance boundary; retain strict missing-evidence and exact-preview checks.

## Non-goals

No consumer-project edits or rollout, stable CLI rebuild, Git mutation, release,
automatic reviewer/agent/coordinator, new scheduling or lease system, automatic
task completion, inferred feature ownership, whole-document semantic splitting,
binary asset decoder, weakening of repository gates or historical rewrites.

## Verification plan

Reproduce current unsupported formats and missing-lock error in neutral fixtures.
Verify generated schema shape, honest lifecycle, no-write preview, overwrite/link/
alias rejection and preservation. Exercise new formats through whole/section
compile, excerpt and resume, including malformed bytes, budget and missing-source
counterexamples. Build and test only in an isolated snapshot. Report Linux/Windows
results separately; no unexecuted macOS result or inherited independent approval.
