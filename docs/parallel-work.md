---
topic_id: parallel-work-guidance
stand: "2026-09-06"
status: proposed
truth_level: design-target
verification:
  state: internally-reviewed
  evidence:
    - src/finalize-scope.ts
    - test/parallel-context-freshness.test.ts
read_if_task_touches: [parallel work, task completion, shared editor]
primary_systems: [documentation governance, workflow coordination]
safe_to_edit: [Keep workflow ownership external and distinguish implementation from rollout.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Parallel work without circular waiting

## Ownership boundary

CanonTrail records task context, decisions, evidence and handoffs. It is not a scheduler, editor lock service, lease enforcer or worktree manager. The human or selected external workflow owns execution. These are operating rules, not automatically enforced locks.

Different features are not necessarily independent. Before starting parallel work, inspect each task's declared paths and shared resources. A game-editor asset addition may share product catalogs, a network-object registry, domain/QA documents, the task board and one editor even when its asset path is unique.

## Named order and bounded write windows

1. The coordinator assigns the exact shared resources, first writer and next writer before either mutates them. If no order exists, agree one explicit order once; do not start two competing permission conversations.
2. The waiting task may read stable inputs and prepare task-owned files outside Unity-imported roots. It must not trigger imports, compile, scene switches, Play Mode, catalog writes or disruptive validation in the other writer's window.
3. A writer acquires all needed shared resources together; it must not hold one resource while waiting for a second writer. Immediately before mutation, inspect current bytes and dirty editor state. A message is not an atomic filesystem lock.
4. Release the window immediately after the last shared mutation and preservation checks, BEFORE waiting for final context compilation, a task reply or global completion. Release is not task completion and says nothing about unrun acceptance tests.
5. The next writer acknowledges takeover once and checks current state. On completion it announces shared sources stable. Both tasks then finish their own evidence/locks independently. No reply-to-reply acknowledgement chain is needed.

### Minimal release message

    Shared window RELEASED: <resource list>; next writer: <task ID>.
    Shared changes complete: <paths>; checks: <observed results>.
    Unsaved/uncertain state: <exact disclosure>.
    No more shared changes planned. Do not wait for my task finalization.

Set an explicit waiting deadline with the coordinator (for example five minutes). If there is no release, continue only conflict-free work, then report the blocked resource or create a handoff. Silence, elapsed time and an idle task are NOT permission to take over. Never save/discard another task's dirty scene to unblock a window. After a timed-out editor command inspect what actually completed before retrying it.

## Task completion and project health

Task-scoped finalization separates completion from unrelated active context drift, as specified in ARTIFACT_PROTOCOL.md section 11. Check T-TASK-SCOPED-COMPLETION-001 for implementation and independent-review status; this document does not grant rollout or promotion approval.

The task must retain current own sources and recorded dependencies, pass its acceptance and review gates, and preserve artifact integrity. A separate project-health finding is not a passing project/CI/release result. Repository-only finalization remains the strict integration gate. Never rewrite another task's historical lock or invent a passing gameplay check to make a report green.

## Follow-up tasks and advisory inspection

A task that reuses a prior result must decide whether that result is a genuine prerequisite or only historical provenance. Record an actual prerequisite in `state.dependencies` using the existing task ID; avoid adding dependencies only because two tasks share a project, a filename or chronological order. Existing section 11 references also establish scope.

Run `canontrail context inspect . --task TASK-ID` for stored selection costs and bounded mentions in that task's brief/report. A mention is only a review hint: it does not prove dependency, permission or current peer state. The inspector never edits a declaration, refreshes another lock, acquires resources, or changes a completion gate. The authoritative rule remains ARTIFACT_PROTOCOL.md, not the hint list.

## Unity example

For two furniture tasks sharing one editor, name A then B as writers of the catalogs, registry and owning docs. A creates/checks its object, preserves previous entries, releases the window, and writes its own evidence. B rereads the shared assets, creates/checks its object, and releases with shared-documents-stable. A and B inspect actual relevant source changes and compile their own contexts; neither waits for the other's final message. Dirty production scenes stay owned by their existing editor workflow.

For genuinely disjoint code tasks, a global editor window is unnecessary unless a build/import or runtime operation can interfere. This rule does not create a framework-managed mutex or promise automatic deadlock detection.
