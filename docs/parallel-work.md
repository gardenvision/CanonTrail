---
topic_id: parallel-work-guidance
stand: "2026-10-08"
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

## Optional durable coordinator, external live control

A user MAY designate one ordinary task as the coordination reference. Record
that role and its bounded scope in the brief/report, using existing task state
and checkpoint fields; there is no `role: coordinator` schema field or automatic
CanonTrail supervisor. The host/workflow still owns messaging, live discovery
and resource enforcement. Keep canonical operating rules in the existing
project entrypoint, not only in a provider's private memory or a long chat.

Use durable **task IDs** for participants and resource order, not transient host
session addresses. After a restart/provider switch, rediscover the host address
and verify the intended task before sending an authorized message. Host message
delivery, counts, idle/done signals and cross-provider reachability are not
CanonTrail guarantees. A recorded address or delivery attempt is not proof that
the receiver acted. Record uncertain/missing delivery honestly.

A peer/coordinator message is NOT the user's approval. A worker must have direct
trusted user authorization or externally established approval provenance naming
the exact task, scope and limits. Do not manufacture permission by writing
"user approved" into a record. Audit metadata/unsigned hashes are not approval
authentication. A resource-window release only permits the next already
authorized writer to begin its allowed work; it does not authorize a new task,
destructive operation, Git mutation, promotion or broader tool access.

Keep a small current coordination view and an append-only event log under the
coordinator task. The view should name participants, resource owner/order,
last-observed state/time, active approval reference, blockers and next safe
action, then link older incidents rather than requiring a multi-thousand-line
log at every restart. These are ordinary draft notes, not new state-schema keys
or an enforced lease. Distinguish a real prerequisite in `dependencies` from a
mere participant list; avoid coordinator/worker dependency cycles.

An expired window, silence, address change or lost message grants no takeover.
Check the actual project/editor/build state and obtain the required release or
new user decision. If an existing project-owned lock script enforces additional
rules, preserve it and its owner; a CanonTrail note does not replace or bypass
it. Such cooperative locks cannot claim protection from every other process.

Minimal durable coordination note (free-text document, not `state.yaml` input):

```text
Coordinator task / user-defined scope: <task ID, exact boundary>
Participant tasks: <IDs>; host addresses: separately verified, transient
Resource / observed owner / next writer: <resource, task, task>
Last observation and release evidence: <time, exact local check/reference>
Trusted user approval reference and limits: <real reference; unknown if absent>
Open blocker / next safe action: <concrete action within existing authority>
```

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

For conflict-free orientation when an unrelated noncanonical task note has a
header-schema error or missing local reference, preview `index --task TASK-ID`
and `context compile --working-index --task TASK-ID`. This opt-in working view
preserves the full raw diagnostics, excludes only positively identified peer
notes, and never writes the global index. Authority, dependency, identity,
unsafe-reference and structured-integrity errors stay blocking. It does not
relax finalization or CI: a peer-note repair is still required before repository
integration. Check installed schema capability first; old locks and other
tasks are not rewritten. [Protocol section 7.3](../ARTIFACT_PROTOCOL.md#73-explicit-task-working-view-opt-in)
owns this separate working-context boundary.

## Follow-up tasks and advisory inspection

A task that reuses a prior result must decide whether that result is a genuine prerequisite or only historical provenance. Record an actual prerequisite in `state.dependencies` using the existing task ID; avoid adding dependencies only because two tasks share a project, a filename or chronological order. Existing section 11 references also establish scope.

Run `canontrail context inspect . --task TASK-ID` for stored selection costs and bounded mentions in that task's brief/report. A mention is only a review hint: it does not prove dependency, permission or current peer state. The inspector never edits a declaration, refreshes another lock, acquires resources, or changes a completion gate. The authoritative rule remains ARTIFACT_PROTOCOL.md, not the hint list.

## Unity example

For two furniture tasks sharing one editor, name A then B as writers of the catalogs, registry and owning docs. A creates/checks its object, preserves previous entries, releases the window, and writes its own evidence. B rereads the shared assets, creates/checks its object, and releases with shared-documents-stable. A and B inspect actual relevant source changes and compile their own contexts; neither waits for the other's final message. Dirty production scenes stay owned by their existing editor workflow.

For genuinely disjoint code tasks, a global editor window is unnecessary unless a build/import or runtime operation can interfere. This rule does not create a framework-managed mutex or promise automatic deadlock detection.
