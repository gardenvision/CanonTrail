---
topic_id: example-resume-history
stand: "2026-09-09"
status: implementation-example
truth_level: design-target
verification:
  state: internally-reviewed
  evidence:
    - test/resume-history.test.ts
read_if_task_touches: [resume history, current-use validation]
primary_systems: [context continuity]
safe_to_edit: [Keep history and actual consumption checks distinct.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# One receipt, two different questions

This is a reproducible scenario contract, not an operational packet or approval.

| Command | Question | Old source drift |
|---|---|---|
| validate / docs audit / index preflight / finalize | Is the retained receipt structurally intact and bound to its evidence? | Not a packet-integrity error; active context and other current project checks still apply. |
| resume validate --packet <A> | Can this exact packet be used against today's task and sources? | Reject. |
| resume create --apply then resume validate --packet <B> | Does the newly compiled receiving context satisfy current requirements? | Validate B, without altering A. |

## Executable sequence

The test fixture in test/resume-history.test.ts creates an active task, an explicit source section and an unshortenable full contract. It compiles, creates a handoff and packet A. It then changes the contract and expands the task section. Index preflight audits A's historical integrity; directly consuming A fails current byte and selection checks. A newly created B passes current-use validation. After completion and a final context compilation, repository validation can pass while consuming either old packet fails due to changed task bytes. A and its receiving/source archives stay byte-identical.

An explicitly replaced handoff leaves its exact old bytes under the existing task-owned hash-named archive path. History binds to those bytes; current-use requires latest instead. An existing archive with a matching semantic hash but changed YAML bytes fails the receiving byte-hash binding. Missing latest does not erase valid archived provenance, but prevents current use.

## Counterexamples

- Corrupt/missing packet, archive or schema: fail integrity and current-use checks as applicable.
- Validly rehashed archive with wrong task/session, inconsistent budget, duplicate source, invalid section or required omission: fail.
- Missing/shortened required sources with otherwise self-consistent hashes: cannot obtain current-use approval.
- Packet-authored historical flag or terminal status: never selects the validation purpose.
- Stale current active lock: still fails normal repository validation; a history audit does not repair it.

Hashes detect byte consistency, not authenticity. A writer able to fabricate all unsigned historical evidence can create a self-consistent receipt; repository audit does not assert past semantic correctness. Current-use validation independently checks today's task policy and sources. No second task index, automatic promotion, config migration, provider dispatch or Git write is introduced.
