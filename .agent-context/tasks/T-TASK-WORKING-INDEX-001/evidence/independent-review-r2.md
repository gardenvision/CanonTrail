---
topic_id: task-working-index-independent-review-r2
stand: "2026-10-08"
status: current
truth_level: active-snapshot
verification:
  state: internally-reviewed
  evidence: [.agent-context/tasks/T-TASK-WORKING-INDEX-001/evidence/progress.md, src/working-index.ts, src/resume-audit.ts, src/context-schema.ts]
read_if_task_touches: [T-TASK-WORKING-INDEX-001, working-index review counterexamples]
primary_systems: [context continuity, documentation governance]
safe_to_edit: [Keep this failed historical review separate from later remediation approval.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Independent r2 review: FAIL, retained

An explicitly authorized independent local subagent reviewed the sealed r2
working-index delta. Its earlier field-authoring PASS was not reused here.
The exact 368-file input manifest has SHA-256
`a2196a4bd04339a2d05ad11f6fbae0b1a3dd3a892e694fb6788672ac5c754652`.
Before/after inputs were unchanged; its isolated check/build passed and all 123
dist outputs matched. Windows only; this is not a Linux/macOS or full-suite claim.

Four P1 findings prevented technical approval:

1. REF001 diagnostic prose did not prove that excluded raw references were safe:
   ESC, drive-relative and stream-shaped references were incorrectly isolated.
2. A retained canonical peer did not establish its owner in the initial closure.
   An unchanged preview then failed apply; a bad peer note could be overlooked
   before a prospective lock write and immediately trigger LOCK008 afterwards.
3. A draft note in a peer folder without any matching state.yaml could be
   excluded, treating unknown ownership as positive independence.
4. A fully rehashed unknown receiving mode passed current-use through an old
   permissive installed schema. A known scoped receipt also passed current-use
   without the explicit installed capability required for a new compile.

The independently retained full report SHA-256 is
`ab93ad4539e2423f1a0a82285704ef55a56cae9ab849dceba239c1e01fa4cc9c`;
evidence record `1e12b1853e2e8caf098074ec015f0258fc92d6577061088a09d4632508856a92`;
final observations `b15233028203e2ab914b193a7b1f63aa5cc80710473aef82fdb3943320bd8953`.
Review fixture/oracle mistakes and relocated sourcemap differences were disclosed,
corrected separately and not misclassified as product defects.

Author remediation is now separately sealed as r3, manifest
`a184d949bc747968887a12c58ba0b3e86952e81d17e276953cc09afa264b9614`.
Its new working-index regression oracle run against old r2 product code produced
34 pass / 12 fail / zero skip out of 46, exactly the intended old-code failures.
Oracle file SHA-256 `ff3c8bd0e2fecc3bc942809ce5e9a7a1c28196735117f248e7ceac04f5e718f8`.
This deliberately mixed RED comparison is not represented as a release snapshot.
The same 46 working cases pass on r3; together with the field-inventory checks,
the focused Windows result is 94 pass / zero fail / one platform skip out of 95.

Full r3 Windows/Linux results, independent r3 disposition and hosted CI remain
separate gates. No consumer rollout or completion approval follows from this note.
