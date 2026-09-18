---
topic_id: usage-guide
stand: "2026-09-18"
status: public-source-alpha
truth_level: draft
verification:
  state: unverified
  evidence: [src/cli.ts, src/initializer.ts, src/context.ts, src/resume.ts]
read_if_task_touches: [first project adoption, bounded context commands, receiving session steps]
primary_systems: [usage reference]
safe_to_edit: [Keep commands and safety boundaries consistent with the running CLI.]
do_not_use_instead: [README.md, ARTIFACT_PROTOCOL.md]
---

# Usage guide

Start with the [quick start and agent prompt](../README.md#quick-start). This guide owns the detailed local workflow and command caveats. Commands run from a built source checkout; there is no required server or global installation.

## Safe adoption

PowerShell (replace both placeholders):

```powershell
$CanonTrailHome = (Resolve-Path '<CanonTrail source folder>').Path
$TargetProject = (Resolve-Path '<your existing project>').Path
node "$CanonTrailHome/dist/cli.js" init "$TargetProject" --adopt --dry-run
```

POSIX shell:

```sh
CANONTRAIL_HOME="/absolute/path/to/canontrail"
TARGET_PROJECT="/absolute/path/to/project"
node "$CANONTRAIL_HOME/dist/cli.js" init "$TARGET_PROJECT" --adopt --dry-run
```

Check the target path, scan coverage, proposed files and conflicts. Only when the proposal is wanted and conflicts have been resolved should you repeat it without `--dry-run`. Initialization never commits, pushes, fetches, installs hooks or overwrites existing files.

**Conflicts are not transactional rollback:** a dry run writes nothing. An adoption with conflicts preserves those files, creates the other planned files, and returns exit 2; a dry run with conflicts also returns exit 2 without writing anything. Suggested merge bridges are written under `.agent-context/generated/bridges/`. Do not automatically apply after a failed preview. Existing `AGENTS.md`/provider rules require deliberate integration of the proposed bridge. A new session in an already initialized project does not need another init.

For large repositories, inspect `init --help` and set explicit `--documentation-root`/`--owned-source-root` paths. The Unity profile excludes common generated output. Unscanned directories remain unknown; no profile guarantees semantic feature discovery.

## Tasks and bounded context

Task scaffolding is still manual. Create `.agent-context/tasks/<TASK-ID>/state.yaml` and a governed `brief.md` using [the task schema](../schemas/task-state.schema.json). Nontrivial changes also require `change.yaml` with acceptance cases and ten impact areas; see [change integrity](../docs/change-integrity.md) and the synthetic [save example](../examples/feature-save-schema/README.md).

Use `required_context_sources` for must-read existing files and `file_intents` for the broader possible change surface. Use the explicit CLI path from Safe adoption for these commands:

```text
node <CANONTRAIL_HOME>/dist/cli.js index <TARGET_PROJECT>
node <CANONTRAIL_HOME>/dist/cli.js context compile <TARGET_PROJECT> --task <TASK-ID> --total-tokens 16000 --reserve-output 2000 --input-safety 1024
```

Inspect selected sources, reasons and omissions, then repeat with `--apply` if the proposal is correct. 16k is an example, not a universal budget. A required source that cannot fit causes failure instead of silent omission; the prior lock is preserved. Add a narrow source with `--include`, or choose an [explicit optional-source section](../examples/context-sections/README.md), then recompile. Required whole files cannot be silently narrowed.

Cite only immutable evidence: files that CanonTrail commands or scripts regenerate (for example a saved compile or finalize JSON, or a rewritten log) must not be cited as task evidence. The context lock can never become stable while its producer keeps changing such a file, and compilation refuses cited evidence that embeds the current lock or index hash. Record durable snapshots with `canontrail evidence record`, or cite hash-named archived copies under `.agent-context/tasks/<task-id>/evidence/context-locks/`.

The compiler uses a fixed text-extension allowlist (`TEXT_EXTENSIONS` in `src/context.ts`): common text and source extensions such as `.js`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.jsx`, `.cs`, `.kt`, `.py`, `.rs`, `.md`, `.json`, `.yaml`/`.yml`, `.xml`, `.html`, `.css` and `.txt`. Files outside the allowlist are not loadable as sources; do not rename real source files just to bypass this. Use `context inspect` to understand costs and drift.

## Verification and handoffs

After relevant source/document changes, update the index and your active context. Do not rewrite completed historical locks simply because the project evolved.

```text
node <CANONTRAIL_HOME>/dist/cli.js validate <TARGET_PROJECT>
node <CANONTRAIL_HOME>/dist/cli.js docs audit <TARGET_PROJECT>
node <CANONTRAIL_HOME>/dist/cli.js finalize <TARGET_PROJECT> --task <TASK-ID> --fail-on-warnings
```

Validation checks structural contracts; it does not independently prove every narrative claim. Record actual application tests and evidence first. `finalize` is the terminal aggregator, not a task check that should invoke itself. Technical verification, independent review and canonical promotion are separate gates. See [parallel work](../docs/parallel-work.md) for task completion versus unrelated active-lock drift.

For a handoff/checkpoint, the target must be a readable local Git worktree so dirty/untracked changes can be recorded. Use `handoff --help`, `checkpoint --help` and [protocol section8](../ARTIFACT_PROTOCOL.md#8-task-and-session-continuity). After applying a handoff, update `latest_handoff` and recompile the active task lock; the archived source lock remains unchanged. A receiving session validates its packet and follows the recorded read order, not old chat transcripts by default.

**Safe receiving-session order:** validate the supplied handoff; inspect a `resume create` dry run and explicitly apply the receiving packet/context; validate that exact packet with `resume validate --packet`; load its bounded `read_order` (including exact selected sections); only then carry out the recorded next safe action. Do not execute a feature change merely because the handoff itself validates. Some generated entrypoint shorthand says to follow the next action before recompiling; interpret it as orientation only, not permission to act before establishing current receiving context. The complete ordering here and protocol section 8 govern safe resumption.

## Other capabilities and limits

- [Migration](../docs/migration.md): plan-first, narrow reviewed transformation and rollback; not arbitrary restructuring.
- [Integrations](../docs/integrations.md): read-only workflow artifacts and optional thin bridges; external tools retain ownership.
- Compact evidence: `evidence record --help`; reference claim/result and subject hashes without copying entire test logs into context. Direct raw-evidence citations deliberately remain required.
- [Platform support](../docs/platform-support.md): Windows/Linux/macOS targets, capability-dependent skips and exact-candidate CI boundaries.
- Weekly `docs audit` is report-first. Findings do not authorize automatic cleanup or promotion.

## Troubleshooting

Common symptoms and their fixes:

- **`Cannot find module '…/dist/cli.js'`** (or any MODULE_NOT_FOUND when running the CLI): the tool is not built. In `CANONTRAIL_HOME`, run `npm ci --ignore-scripts` (first time only) and `npm run build`; confirm with `node dist/cli.js --help`.
- **`npm test` fails on a clean checkout**: the CLI integration tests execute `node dist/cli.js`. Run `npm run build` first, then `npm test`.
- **`canontrail: project is not empty; use 'canontrail init --adopt' to preserve and document an existing project`**: the target already contains files; add `--adopt` (preview with `--dry-run` first).
- **`CONFLICT <path>: existing file preserved` (exit 2)**: nothing was overwritten. A dry run also exits 2 when it finds conflicts, and writes nothing. Merge manually - a suggested bridge may be under `.agent-context/generated/bridges/<name>.proposed` - then re-run the preview until it is conflict-free or deliberately accepted.
- **`context index is stale; run 'canontrail index .', then rerun this command`**: refresh the index, then rerun the original command (compile, validate or finalize).
- **`required context needs X estimated tokens but only Y input tokens are available; breakdown: …`**: required sources cannot fit. The message proposes a minimum `--total-tokens` (required + reserves); alternatively lower `--reserve-output`/`--input-safety` or reduce required sources (move whole files to optional candidates, or select `context_sections` for large documents). Required whole files are never silently dropped and the previous lock is preserved.
- **`cited task evidence '…' embeds the current context lock or index hash …`**: you cited a file that CanonTrail itself regenerates (a saved compile/finalize JSON, or a rewritten log). Such a file can never stay stable and blocks `LOCK004` convergence. Save run output outside the task evidence set, record an immutable snapshot with `canontrail evidence record`, or cite a hash-named archived copy under `.agent-context/tasks/<task-id>/evidence/context-locks/`.
- **`LOCK004 stale content hash for '<path>'`**: a selected source changed after compilation. Reread the file, update the task, then recompile (`context compile … --apply`). During `finalize --task A`, drift in an unrelated task's lock is reported separately as project-health debt, not as a failure of task A.
- **`LOCK008`**: the message names the cause - a stale or inconsistent index (`run 'canontrail index .' before recompiling the lock`), a lock/task identity mismatch (restore the task state or recompile), or task-relevant index changes (refresh the index, then recompile).
- **`CHANGE004 referenced path does not exist: <path>`**: a `change.yaml` reference points to a missing path. References are repository-root-relative; fix the path or create the file. Repeated occurrences of the same path are collapsed with `(referenced N times)`.
- **`FINALIZE115` / `FINALIZE116`**: a change marked `verified` still has open acceptance cases or verification checks. Close them (or mark them `not-applicable`) before finalizing.
- **`FINALIZE001 Documentation audit could not complete: …`**: finalization fails with `ok:false`, `documentation: null` and exit 1 (even without `--fail-on-warnings`). Check permissions and `.agent-context/maintenance.yaml`; never fake a healthy audit.

Exit codes: `0` = pass; `1` = failed validation/finalization/index preflight (and any CLI error); `2` = `init` found conflicts (dry run or applied - files preserved, nothing overwritten). The complete finding-code registry lives in [Finding codes](finding-codes.md).

## Development and packaging

If the documentation audit cannot complete (for example, because of permissions or a malformed maintenance policy), finalization fails with `FINALIZE001`. In JSON output, `documentation` is `null`, not a fabricated healthy report. Check `ok` and handle the unavailable audit; this error exits 1 even without `--fail-on-warnings`.

Worked JSON excerpt for `canontrail finalize . --json` when the audit raises a permission error (other fields/gates omitted):

```json
{
  "ok": false,
  "documentation": null,
  "writes_performed": false,
  "gates": [{
    "id": "documentation",
    "status": "fail",
    "summary": "Documentation audit is unavailable; finalization cannot pass.",
    "findings": [{
      "code": "FINALIZE001",
      "message": "Documentation audit could not complete: EACCES: permission denied"
    }]
  }]
}
```

Build `dist/` before running the test suite: the CLI integration tests spawn `node dist/cli.js` and fail on a clean checkout until `npm run build` has completed. The CI workflows enforce the same order (`test/ci-build-order.test.ts`).

```sh
npm ci --ignore-scripts        # clean checkout only
npm run check
npm run build                  # required before npm test: CLI integration tests spawn dist/cli.js
npm test -- --maxWorkers=1
npm run index
node dist/cli.js validate .
node dist/cli.js finalize . --fail-on-warnings
```

CI does not repair a stale index. Hosting branch rules must separately require the appropriate status checks; workflow files alone do not block merges. A future consumer action must pin a reviewed release revision, not assume a moving branch is safe.

This source distribution retains exact source bytes through Git (`* -text` in `.gitattributes`). Automatic LF/CRLF normalization would invalidate its existing byte-hashed index, locks and historical evidence. This does not disable textual diffs or allow silently rewriting historical artifacts. Deliberate active-source edits still require the normal index/context refresh.

This candidate is intended first as source distribution. The package file list includes the linked product guides, protocol and license; a dry-run inventory is not npm publication or installed-package verification. npm publication still requires separate approval. See the [release checklist](../docs/release-checklist.md), [third-party inventory](../docs/third-party-notices.md), [contribution policy](../CONTRIBUTING.md) and [security-reporting status](../SECURITY.md).

The distribution destination is `https://github.com/gardenvision/CanonTrail`, a new clean-history repository separate from private development. The consumer Action template pins clean runtime commit `23d542302e7327931cb2c60b7a35ae60e6e47f16`; it does not follow `main`. Public availability and current checks must be verified before using the Action. npm remains a separate, unpublished channel.

