---
topic_id: task-context-budget-clarity-001
stand: "2026-09-25"
status: completed
truth_level: active-snapshot
verification:
  state: internally-reviewed
  evidence: [.agent-context/tasks/T-CONTEXT-BUDGET-CLARITY-001/evidence/verification.txt]
read_if_task_touches: [context budget diagnostics, explicit source sections, task-scoped finalization]
primary_systems: [context compilation, completion reporting]
safe_to_edit: [Keep source selection and completion gates unchanged while improving explanations.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md, VISION.md]
---

# Explain costly required context and task completion

## Decision and scope

The Gärtnerei VAT task needed a 60,000-token context window. Its selected input estimate was 50,938 tokens; two persistently required whole documents contributed 30,099 tokens, and a cited follow-up contributed 6,298. The project is a read-only motivating case; no project data or Unity source belongs in this public change.

The compiler already supports hash-bound `context_sections` as required inputs. It correctly rejects any attempt to narrow a source still required whole by task policy, strong canonical routing, governing instructions, or cited evidence. Preserve that rule. Show individual required-source costs and their selectors in compile diagnostics. Explain how a task owner can deliberately replace an unnecessary whole-file requirement with an explicit hash-bound section, while retaining full-file drift checking.

Task-scoped finalization already defers unrelated active `LOCK004`/`LOCK008` findings without declaring the whole repository healthy. Clarify the human-facing task and project-health result; retain JSON gate statuses, findings, exit semantics, and repository-wide strictness.

## Acceptance

1. A successful compile lists the largest required sources with exact estimated costs, paths, and selectors; JSON exposes every required source's cost and category. The category totals and selected lock remain unchanged.
2. Over-budget failure lists the largest required sources and categories before writing any lock. An optional large file must never be presented as a required cost.
3. The usage guide explains an explicit owner-reviewed whole-to-section conversion using existing `context excerpt` and `context_sections`. A conflicting whole requirement still fails; a section retains full-source and selected-byte hashes and fails on drift.
4. Task finalization with unrelated peer drift clearly says task completion can pass while project-wide health fails. Repository-only finalization remains strict and diagnostics remain visible.

## Verification and boundary

Use focused deterministic tests, TypeScript check, build, index, repository validation, docs audit, and task-scoped finalization when lifecycle evidence is ready. These are CLI usability and documentation changes. No target-project mutation, schema migration, automatic source narrowing, or measured provider-token savings is claimed.

## Result

The compiler now explains individual required-source estimates and selectors in JSON, human summaries and over-budget errors. Existing hash-bound sections have an explicit, owner-reviewed whole-to-section workflow in the usage guide. Named-task finalization text separates its completion result from raw repository structural health. The completed verification and remaining limits are recorded in `evidence/verification.txt`.
