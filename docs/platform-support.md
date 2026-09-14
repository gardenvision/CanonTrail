---
topic_id: canontrail-platform-support
stand: "2026-09-14"
status: c2-platform-evidence-recorded
truth_level: draft
verification:
  state: verified
  evidence: [.github/workflows/validate.yml, scripts/platform-capabilities.js, test/migration-platform.test.ts, .agent-context/tasks/T-FROZEN-EXAMPLE-LIFECYCLE-001/evidence/platform-results.json, .agent-context/tasks/T-RELEASE-CLOSURE-001/evidence/platform-results.json]
read_if_task_touches: [platform compatibility, migration portability, CI matrix]
primary_systems: [platform verification]
safe_to_edit: [Separate target support from actually observed exact-candidate results.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md, docs/alpha-readiness.md]
---

# Target platforms and evidence

Windows, Linux and macOS are targets. The configured matrix is Node24 on each and Ubuntu Node20.19 for the declared Node floor. Configuration alone is not a successful run, and earlier private development runs are not evidence that this curated candidate passed every platform.

## Clean-source C1 and C2

[GitHub run 34783886228](https://github.com/gardenvision/CanonTrail/actions/runs/34783886228) executed exact clean commit `bed8fa84beb3d0a763f001f42a415fafd6ddaf85`. [Run 34785633886](https://github.com/gardenvision/CanonTrail/actions/runs/34785633886) subsequently executed exact C2 `4355643c82aea3a69213d0821660cae561ac5b3a`. Both passed all four matrix jobs and the aggregate with the same counts below. Each host ran 696 cases; skips reflect observed capabilities, not successful tests. These runs were performed in private staging before the clean repository became public; results are revision-bound, not evidence for later edits.

| Host | Node | Passed | Skipped | Failed |
|---|---|---:|---:|---:|
| Windows x64 | 24.20.0 | 691 | 5 | 0 |
| macOS ARM64 | 24.20.0 | 691 | 5 | 0 |
| Linux x64 | 24.20.0 | 692 | 4 | 0 |
| Linux x64 | 20.19.6 | 692 | 4 | 0 |

Typecheck, build, built-CLI validation and strict repository finalization passed on every host; Ubuntu Node24 also passed the runtime-dependency audit. The release task's `platform-results.json` and `platform-results-c2.json` retain the two distinct runs, actual capability JSON, skipped test names and raw-result hashes; GitHub raw artifacts have 14-day retention. Later documentation/lifecycle commits are not retroactively either tested snapshot and must be checked separately. The final tagged release identifies its exact CI run on the release page. Independent review and actual hosting rules remain distinct.

## Historical V3 correction

The exact V3 ZIP (`d95cd0b307f37a4bfa37eaaaaa93b2e13f83973c7d2280f637787b68cf73591d`) passed historical private GitHub run `34747718414`, triggered by transport commit `a7901a3fb7a7a871ba7049e2aa50fc9da759744c`. That development repository is now named `CanonTrail-private`; the old URL in retained evidence is historical, not a run in the new public-source repository. The transport harness executed the archive and verified all 159 file hashes before and after. These older results support only V3, not the current C1 receipt above.

| Recorded host | Node | Passed | Skipped | Failed |
|---|---|---:|---:|---:|
| Windows x64 | 24.20.0 | 677 | 7 | 0 |
| Linux x64 | 24.20.0 | 680 | 4 | 0 |
| macOS ARM64 | 24.20.0 | 679 | 5 | 0 |
| Linux x64 | 20.19.6 | 680 | 4 | 0 |

Every hosted job covered 684 cases in 32 files, with all 35 new policy cases passing. Build, typecheck, dependency audit, structural validation, documentation audit and repository finalization passed. The original archived task gates correctly remained pending in that exact source; the harness explicitly expected FINALIZE105/110 instead of changing their states.

Real file-symlink rejection passed on all three hosted platforms, and Linux covered distinct exact-case files. Hosted Windows lacked 8.3 short names; both short-name tests passed in the local Windows24.11.1 V3 run (671 passed, 13 skips, zero failures). Across the five recorded environments every one of the 684 distinct cases passed at least once. This does not mean every case executes on every platform. The compact per-host capabilities and case coverage are retained in `.agent-context/tasks/T-FROZEN-EXAMPLE-LIFECYCLE-001/evidence/platform-results.json`.

Whole-product independent release review remains separate. Hosted runner labels change; keep the actual capability reports rather than inferring filesystem behavior from the OS name.

## Filesystem limits

- Preserve exact filename case, Unicode form and raw bytes. Do not normalize names merely to appear portable.
- Migration rejects unsupported special paths, reserved control trees and linked document authority. A filename accepted on one host may still be outside the portable migration contract.
- Symlinks, junctions, hard links and short-name availability need actual capability checks; unsupported test capabilities are skips, not passes.
- Byte-exact rollback preserves only the explicitly covered metadata contract. ACLs, ownership, timestamps, xattrs and link topology need separate protection when relevant.
- Keep source trees stable/exclusive; mutation-adjacent checks are not distributed or atomic filesystem transactions.

CI should run typecheck, build, the full suite, structural validation and strict repository finalization for the exact candidate without repairing its index. Branch rules must separately require the checks. No workflow or local approval silently configures hosting rights or grants migration permission.
