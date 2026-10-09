---
topic_id: field-workflow-self-review-001
stand: "2026-10-01"
status: author-review
truth_level: active-snapshot
verification:
  state: internally-reviewed
  evidence: [src/task-create.ts, src/context-text.ts, src/context.ts, src/context-inspection.ts, test/task-create.test.ts, test/context-formats.test.ts, test/context-inspection.test.ts]
read_if_task_touches: [field workflow improvements]
primary_systems: [task authoring, context compilation]
safe_to_edit: [Distinguish author review from independent approval and runtime evidence.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Author self-review, not independent approval

The implementation was checked against its decided narrow scope. The draft
writer validates explicit caller metadata and both installed/shipped schemas
before creating output. New directories are exclusive; existing empty tasks,
links and aliases are not adopted or overwritten. All acceptance, impact and
review fields remain pending, and actual authority is not invented. A separate
test executes the exact documented CLI example without invoking a shell.

Additional shader/module formats use bounded raw-byte reads, strict UTF-8 and
NUL rejection. Whole/section costs and hashes retain their existing meanings.
Selection does not confer canonical authority. Required failures preserve the
working lock; optional failures are visible omissions. Exact-preview application
rechecks these bytes. Binary-capable engine assets remain outside this contract.

An initial excerpt with no lock cannot claim task coverage. The new diagnostic
points to a task-free inspection and checking the task identity; corrupt or
misidentified existing locks still fail. The checkpoint guidance preserves
historical evidence and separates pending acceptance from completed work.

Residual boundaries are explicit: task creation is not a multi-file crash
transaction; stable exclusive filesystem access is required. It does not lock
out an actively racing process. Code-format recognition is not a language parser
or proof of code correctness. Existing continuity hardening still needs its own
independent/platform gates. None is closed by this medium-risk author review.
Execution results and the separate dependency audit are recorded in verification
evidence, not inferred from this inspection.
