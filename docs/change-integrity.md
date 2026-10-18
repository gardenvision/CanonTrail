---
topic_id: change-integrity-analysis
stand: "2026-10-18"
status: alpha-candidate
truth_level: draft
verification:
  state: reviewed
  evidence: [ARTIFACT_PROTOCOL.md, schemas/change-record.schema.json, test/validator.test.ts, .agent-context/tasks/T-DOCS-FRESHNESS-20261018/evidence/review.md]
read_if_task_touches: [change integrity, acceptance criteria, impact matrix]
primary_systems: [change-record validation]
safe_to_edit: [Keep binding rules in the protocol rather than creating a second rule set.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Why record change integrity?

A passing test can still encode the wrong assumption. A nontrivial change therefore records the chosen requirement, expected behavior, a discriminating counterexample and an independent enough oracle before implementation is declared complete.

The change record also considers ten impact areas: requirements, data/contracts, domain logic, tests/reference cases, example data, UI/API, documentation, diagrams/visuals, terminology, and operations/compatibility. An unaffected area needs a reason; an affected area needs evidence. Documentation granularity is decided explicitly instead of following chat or branch boundaries.

The lifecycle is idea → decided → implemented → verified, with rejection/supersession and independent review requirements defined by protocol section 12. Drafting a feature document does not require prior promotion; conversely technical implementation alone does not promote it. High-risk release/migration/security work requires independent review or an explicit human waiver before a verified change claim.

`finalize` aggregates recorded gates; it does not perform application tests or canonical promotion. Keep raw logs as evidence when needed, but normally cite compact result records with subject hashes so a completion context need not contain every executed source file.

Use `examples/feature-save-schema/` for a synthetic worked shape and `schemas/change-record.schema.json` for exact fields. Historical private research is not reproduced in this candidate.

## Practical route

1. Preview a task with `task create --help`; generated records start as ideas, not decisions. Resolve authority, failure behavior, counterexamples, all ten impacts and documentation structure before implementation.
2. Draft or update the existing feature owner, then run the project-owned tests and required review. A task report and a canonical feature document have different jobs.
3. Record measured evidence and only then advance the change/feature verification states. A technically finished implementation awaiting acceptance remains visibly open; do not turn pending review into a passing check.
4. Run task-scoped completion and strict repository completion separately. Only the narrowly classified unrelated lock drift described by protocol section 11 may be non-blocking; other errors and strict warning policy remain effective.
5. Canonical promotion, when authorized, follows protocol section 9. Neither task creation, finalization nor a branch merge performs that semantic review for you.
