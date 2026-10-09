---
topic_id: task-working-index-verification-001
stand: "2026-10-09"
status: implementation-awaiting-review
truth_level: active-snapshot
verification: {state: internally-reviewed, evidence: [.agent-context/tasks/T-TASK-WORKING-INDEX-001/evidence/quality-r5.json]}
read_if_task_touches: [T-TASK-WORKING-INDEX-001, task-working release evidence]
primary_systems: [context continuity, documentation governance]
safe_to_edit: [Keep exact tested identities failures and open gates explicit.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Exact r5 verification

Source manifest SHA-256: `b37f486fbc6cdf5c61b0b87707c93623e87701a129329d33a7b9f409baebdc55`.
372 inputs / 3,186,275 raw bytes. The code/schema identities and individual
receipt hashes are in quality-r5.json. This is a working-tree snapshot based on
cf2702d, not a claim that the uncommitted files equal that Git commit.

## Executed author quality

- Native Windows, Node 24.11.1: 1007 pass / 13 capability skips / zero failures.
- Native Linux ext4 under WSL, Node 24.20.0: 1013 pass / seven skips / zero failures.
- Both have 1020 cases in 46 test files and clean install, typecheck, isolated
  CLI build and audit exit zero. No audit vulnerabilities were reported.
- Focused working-index/reference inventory on Windows: 109 pass / one
  capability skip / zero failures, 110 cases in two files. All 61 working-index
  cases pass. Both platforms preserve every sealed input byte.
- Package dry-run: 214 files / 2,049,853 unpacked bytes, 18 schemas, both new
  schemas present; no task history, outputs, tests, Git or dependency directory.
  This is not npm publication or installed-package integration approval.

## Acceptance and remaining strictness

AC-ISOLATE / AC-GLOBAL: only positively noncanonical unrelated governed task
Markdown with a schema-valid owner is eligible. The two permitted defects are
its header SCHEMA005 and safely proved missing local REF001. Actual shared/
canonical/design truth, every retained document's owner, literal and transitive
dependencies, unsafe paths, duplicate identities, structured corruption and
unknown diagnostics remain blocking, before writes. Raw findings are never erased.

AC-LOCK / AC-RESUME: optional task-working marker is hash-bound; explicit shipped
and installed capability plus actual payload validation are required for new or
active/current use. Retained known receipts are historical; unknown markers
cannot be hidden by an old permissive schema. Saved previews and fresh receiving
contexts reconstruct current requirements. Fully rehashed manipulation is
tested; self-hashes are integrity metadata, not authentication or authorization.

AC-STRICT: scoped CLI index writes nothing and global index/validate/finalize
stay strict. The working preflight skips only current source/index freshness,
not active static self-hash, budgets, source duplicates, required omissions,
owner, mode/capability or pure exact repository-relative source grammar. A valid
missing file remains a freshness exception; an invalid spelling does not.
Historical terminal path/freshness handling is preserved.

AC-QUALITY remains pending until the independent exact-snapshot/integration
disposition and fresh hosted Windows/Linux/macOS/Node-floor checks are recorded.
Earlier hosted checks are not this source's platform evidence.

## Failed revisions are retained

The first focused run had eight fixture/command failures, recorded separately.
Full r2 had one genuine test-oracle inventory failure on both platforms; the new
finite marker field was classified explicitly, not excused. Independent r2
FAIL found four real P1 defects; r3 confirmed their exercised fixes but failed
WI-R3-001 (all lock semantics skipped). r4b fixed that boundary but independently
failed WI-R4B-001 (unsafe source grammar skipped with freshness). Their report
identities are retained in independent-review-r2.md and review-failures.md.

Deliberately mixed RED comparisons, not release snapshots:

- Old r2 + r3 oracle: 34 pass / 12 expected failures / zero skips (46 cases).
- Old r3 + r4 oracle: 46 pass / seven expected failures / zero skips (53 cases).
- Old r4b + r5 oracle: 54 pass / seven expected grammar failures / zero skips
  (61 cases). A genuinely compiled valid peer lock retains all required sources;
  only its extra path changes and the self-hash is recomputed. The valid missing
  source control still passes orientation and fails strict current freshness.

None of these failed runs is presented as green, and author remediation is not
the next revision's independent approval.

## Preservation and limits

Baseline audit covers 155 old task files: only three inspected active locks and
Compact's current schema-list section changed. All nine pre-existing terminal
locks, 103 existing evidence/handoff/archive files and both older shared runtime
hashes remain raw-byte exact. Five current task locks were separately archived
and recompiled in explicit global mode; later closure metadata may require a
further deliberate active refresh. No historical receipt is rewritten.

No consumer project, live editor, private-history publication, paid Claude
review, host messaging/lease engine, automatic schema rollout or promotion.
Stable exclusive filesystem access is still required: no hostile-race,
crash-atomic multi-file write, provider-token saving or universal semantic
relevance guarantee. The bounded working route is not isolation of every peer
defect, task completion, clean project health or permission to modify a peer.
