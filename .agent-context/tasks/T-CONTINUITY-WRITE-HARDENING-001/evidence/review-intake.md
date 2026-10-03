---
topic_id: continuity-write-hardening-review-intake
stand: "2026-09-27"
status: triaged
truth_level: active-snapshot
verification:
  state: internally-reviewed
  evidence: [src/handoff.ts, src/resume.ts, src/worktree-inventory.ts, src/validator.ts]
read_if_task_touches: [continuity hardening review scope]
primary_systems: [context continuity]
safe_to_edit: [Keep reviewer observations separate from author reproductions.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Review intake and bounded decisions

Two different snapshots were reviewed. Finding numbers are not globally unique; reconcile by topic.

- Additional Claude review of the OLD R1 package: report SHA-256 `336a9e9a9ed79151b920b7ec8cde0df2437d52aeb0e1b17a579d41d731a51505`. Conditional approval; new observations include exit-zero Git warnings, ambiguous inventory serialization and unbound retained handoffs. Earlier R2/R3 corrections already address nested roots, byte-transport guidance, source-specific repair and the new inventory writer collision.
- Current R3 bounded review: report SHA-256 `17777a1f83d87cacced1489012ae123b348a52ea024de66218a771be1dfc1458`, reviewer identifies as Codex. Independently passed A-D and reproduced 730 passed / 13 skipped Windows tests. It confirms the older context-archive writer still accepts decoded-equal but byte-different invalid UTF-8. Deep archive links and deterministic late-collision orphans remain open. This is not approval for the present new change, macOS or consumer rollout.

Raw reports and review packages are retained outside the distributable tree. The frozen R3 source remains unchanged. No existing receipt is renamed, overwritten or reattributed.

## Resolution plan

| Topic | Decision |
|---|---|
| Git warnings with exit zero | Fail closed with captured cause; no global configuration edit. |
| Older archive and resume decoded-text collisions | Raw-buffer comparison and strict UTF-8 control readers. |
| Deep links, case aliases, hardlinks | Shared exact no-link control-path checks, including existing mutable destinations. |
| Late known collision leaves sidecar | Preflight all outputs before writing; retain honest non-atomic crash/race boundary. |
| BOM/duplicate-key inventory disagreement | Require the new sidecar writer's unique JSON serialization; do not rewrite retained evidence. |
| Unbound historical handoffs | Audit hash-named archives, owner and provenance without checking old sources against today's contents. |
| Stale context/new missing resume source | Refuse new creation until selected sources and explicit inputs are current. |
| Human details and locale ordering | Print diagnostic details and use explicit UTF-16 code-unit comparison. |
| Generic evidence strings and YAML timestamps | Clarify path vs observation and portable YAML parsing; prefer quoted new timestamp scalars. |
| Fully rehashed unsigned artifacts | No authentication claim or ineffective downgrade marker; deliberate schema synchronization remains required. |
| Git filename normalization | Inventory records Git's reported identity, not a complete raw filesystem-name enumeration. |
| macOS, consumer installation, release | Remain separate exact-revision verification and authorization gates. |

Task generation, ordered checkpoint ergonomics and optional coordination are not silently added to this safety correction. Those roadmap proposals require their own design and tests.
