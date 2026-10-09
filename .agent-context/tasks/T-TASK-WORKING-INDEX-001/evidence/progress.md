---
topic_id: task-working-index-progress-001
stand: "2026-10-08"
status: in-progress
truth_level: active-snapshot
verification: {state: unverified, evidence: [.agent-context/tasks/T-TASK-WORKING-INDEX-001/state.yaml]}
read_if_task_touches: [T-TASK-WORKING-INDEX-001, task-local working index]
primary_systems: [context continuity, documentation governance]
safe_to_edit: [Keep scope exclusions and strict release limits explicit.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Working-index progress

Decided revision recorded before implementation. Goal and publication permission
are saved outside the distributable source. The first opt-in implementation now
exists locally: a read-only task-working index, hash-bound optional context-lock
marker, installed-schema preflight, explicit preview revalidation and receiving
session mode inference. TypeScript no-emit checking passed; focused runtime and
adversarial cases have not yet run. This is not independent approval or release
readiness. The prior field-authoring review is a separate boundary. No consumer,
old historical archive or installed runtime changed.

Sealed working revision r2 passed 85 focused Windows checks. Full Windows ran
977 pass / 13 skip / one failure; native Linux ran 983 pass / seven skip / one
failure (991 cases on each). The shared failure is the schema-field inventory
oracle, which still needs explicit classification of the new non-path mode field.
No failing run is represented as green.

The independent r2 reviewer reproduced unsafe-reference isolation, inconsistent
canonical-peer ownership closure and acceptance of unknown receiving-lock mode
values through an older permissive installed schema. Local unsealed corrections
to reference identity and owner closure pass typecheck but are not yet tested.
Receiving capability handling and RED/GREEN regression oracles were added in a
separate sealed r3. All 46 working-index cases pass there; the new oracle catches
12 failures on old r2 product code (34 pass, zero skip). Focused r3 Windows totals
including reference inventory are 94 pass / zero fail / one skip out of 95.
The failed independent r2 review is retained in independent-review-r2.md; its
four P1 findings are not erased by author remediation. Exact
raw receipts and revision manifests remain outside the distributable tree; the
subsequent compact verification must bind to the actual remediated snapshot.

Full r3 completed: Windows 992 pass / 13 skip / zero fail; native Linux 998 pass /
seven skip / zero fail (1005 cases each). The independent r3 follow-up confirmed
the four r2 fixes but found WI-R3-001: skipping all active-lock checks also hid
static corruption. Its retained FAIL report SHA-256 is
`003594512daf15c7f5f41f324da676c30ac74e3cbaa84cf24246b7ecda343b73`.

Change revision 2 decides the narrower fail-closed boundary. Static active-lock
integrity/capability is retained; only current source/index freshness is skipped.
The final r4 capture (work-r4b), not the preliminary capture, is review target:
372 files, 3,179,661 bytes, manifest SHA-256
`cf67cb4a70f4b7250f8def32efbe47617c4ecefbe421c2f4c7fa0243d92d54f8`.
Native checks and independent remediation/integrated publication review are in
progress. Five inspected active contexts were previously archived/recompiled;
their historical archives and terminal-task locks were not rewritten.

Full r4b native Linux quality passed 1005 cases, seven capability skips and zero
failures out of 1012; exact sealed inputs remain unchanged. Windows is still
running. The independent reviewer found WI-R4B-001: a grammatically invalid
active extra-source path could bypass static checks together with freshness.
The probe starts from a valid compiled peer lock, keeps every required source,
changes only the extra path and recomputes the self-hash. This is a real FAIL,
not new approval inferred from passing earlier probes.

Change revision 3 decides a pure, filesystem-free active-source identity check
using the compiler's existing grammar. Backslashes remain REF002; other invalid
source identities are LOCK003, not isolatable note defects or tagged drift.
Eight additional cases exercise invalid identities and the valid missing-file
freshness exception. Historical terminal path/freshness handling is unchanged.

Full exact r5 now passed: Windows 1007 pass / 13 skips; native Linux 1013 pass /
seven skips, zero failures out of 1020 cases / 46 files on each. Every sealed
input is unchanged. The deliberately mixed old-r4b/new-r5 RED oracle finds the
seven intended grammar failures (54 pass / seven fail / zero skip); it is not
release quality. See report.md and evidence/verification.md for the bounded
current checkpoint and preserved failures.

Independent r5 technical PASS is now recorded with 99 corrected fresh cases;
evidence/independent-review-r5.md binds that scope. The first integrated view
correctly leaves three older high-risk tasks pending. A separate supplement may
use only newly disposable local Git fixtures; originals and shared runtimes are
protected. No earlier CI or conditional review substitutes for its new oracles.

Current next safe action: receive the supplementary integrated disposition,
consolidate only supported gates, refresh only current active
contexts, then obtain new exact hosted checks. No publication or consumer
runtime rollout has taken place.
