---
topic_id: usage-guide
stand: "2026-09-25"
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

**Conflicts are not transactional rollback:** a dry run writes nothing. An explicitly applied adoption may preserve conflicting files, create the other planned files, and return exit 2. Do not automatically apply after a failed preview. Existing `AGENTS.md`/provider rules require deliberate integration of the proposed bridge. A new session in an already initialized project does not need another init.

For large repositories, inspect `init --help` and set explicit `--documentation-root`/`--owned-source-root` paths. The Unity profile excludes common generated output. Unscanned directories remain unknown; no profile guarantees semantic feature discovery.

## Tasks and bounded context

Task scaffolding is still manual. Create `.agent-context/tasks/<TASK-ID>/state.yaml` and a governed `brief.md` using [the task schema](../schemas/task-state.schema.json). Nontrivial changes also require `change.yaml` with acceptance cases and ten impact areas; see [change integrity](../docs/change-integrity.md) and the synthetic [save example](../examples/feature-save-schema/README.md).

Use `required_context_sources` for must-read existing files and `file_intents` for the broader possible change surface. Use the explicit CLI path from Safe adoption for these commands:

```text
node <CANONTRAIL_HOME>/dist/cli.js index <TARGET_PROJECT>
node <CANONTRAIL_HOME>/dist/cli.js context compile <TARGET_PROJECT> --task <TASK-ID> --total-tokens 16000 --reserve-output 2000 --input-safety 1024
```

Inspect selected sources, reasons and omissions, then repeat with `--apply` if the proposal is correct. 16k is an example, not a universal budget. A required source that cannot fit causes failure instead of silent omission; the prior lock is preserved. The compile report lists required-source costs largest first (`required_source_costs` in JSON, top five in text); each entry names the path, selector and estimated tokens. Optional candidates are not in that ranking. These are byte-based estimates, not measured provider tokens or proof of a saving. The error for an over-budget task names the same largest drivers.

If a large file is listed in `required_context_sources`, first decide whether the *whole* file is truly needed. Do not remove a safety-critical requirement merely to make a lock fit. If one exact range suffices, the task owner can remove only that task-owned whole-file declaration, use the read-only `context excerpt` command to inspect the range and its full-source hash, then add a `context_sections` entry to `state.yaml`:

```text
node <CANONTRAIL_HOME>/dist/cli.js context excerpt <TARGET_PROJECT> --source <repository-relative-path> --from <first-line> --to <last-line> --task <TASK-ID>
```

```yaml
context_sections:
  - path: docs/example.md
    from: 20
    to: 48
    content_hash: "sha256:<whole-file-hash-from-excerpt>"
```

Then refresh the index if governed Markdown changed, compile without `--apply`, inspect the section, omissions and budget, and apply only a sound proposal. The section is itself required and bound to the *entire* source hash: edits outside lines 20–48 also force a fresh decision. If another rule still requires the whole file (for example governing instructions, strong canonical routing, a direct evidence citation or `--include`), compilation rejects the narrower request; keep the whole file or use a larger budget. [The worked example](../examples/context-sections/README.md) shows exact hashes and bytes. `--include` requests a whole source, not a section.

The compiler uses a fixed text-extension list. `.js`, `.ts`, `.cs`, `.kt`, `.md`, `.json` and `.yaml` are supported; `.mjs` and `.cjs` currently are not. Do not rename real source files just to bypass this limitation. Use `context inspect` to understand costs and drift.

## Verification and handoffs

After relevant source/document changes, update the index and your active context. Do not rewrite completed historical locks simply because the project evolved.

```text
node <CANONTRAIL_HOME>/dist/cli.js validate <TARGET_PROJECT>
node <CANONTRAIL_HOME>/dist/cli.js docs audit <TARGET_PROJECT>
node <CANONTRAIL_HOME>/dist/cli.js finalize <TARGET_PROJECT> --task <TASK-ID> --fail-on-warnings
```

Validation checks structural contracts; it does not independently prove every narrative claim. Record actual application tests and evidence first. `finalize` is the terminal aggregator, not a task check that should invoke itself. Technical verification, independent review and canonical promotion are separate gates. A task-scoped report names both the named-task result and raw repository structural health. Unrelated active-task lock drift can remain visible as non-blocking for that task; it is still a failed project-health gate, not CI or release approval. Run repository-only `finalize` for project-wide strictness. See [parallel work](../docs/parallel-work.md) for the full boundary.

For a handoff/checkpoint, the target must be a readable local Git worktree so dirty/untracked changes can be recorded. Use `handoff --help`, `checkpoint --help` and [protocol section8](../ARTIFACT_PROTOCOL.md#8-task-and-session-continuity). After applying a handoff, update `latest_handoff` and recompile the active task lock; the archived source lock remains unchanged. A receiving session validates its packet and follows the recorded read order, not old chat transcripts by default.

**Safe receiving-session order:** validate the supplied handoff; inspect a `resume create` dry run and explicitly apply the receiving packet/context; validate that exact packet with `resume validate --packet`; load its bounded `read_order` (including exact selected sections); only then carry out the recorded next safe action. Do not execute a feature change merely because the handoff itself validates. Some generated entrypoint shorthand says to follow the next action before recompiling; interpret it as orientation only, not permission to act before establishing current receiving context. The complete ordering here and protocol section 8 govern safe resumption.

## Other capabilities and limits

- [Migration](../docs/migration.md): plan-first, narrow reviewed transformation and rollback; not arbitrary restructuring.
- [Integrations](../docs/integrations.md): read-only workflow artifacts and optional thin bridges; external tools retain ownership.
- Compact evidence: `evidence record --help`; reference claim/result and subject hashes without copying entire test logs into context. Direct raw-evidence citations deliberately remain required.
- [Platform support](../docs/platform-support.md): Windows/Linux/macOS targets, capability-dependent skips and exact-candidate CI boundaries.
- Weekly `docs audit` is report-first. Findings do not authorize automatic cleanup or promotion.

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

```sh
npm run check
npm test
npm run build
npm run index
node dist/cli.js validate .
node dist/cli.js finalize . --fail-on-warnings
```

CI does not repair a stale index. Hosting branch rules must separately require the appropriate status checks; workflow files alone do not block merges. A future consumer action must pin a reviewed release revision, not assume a moving branch is safe.

This source distribution retains exact source bytes through Git (`* -text` in `.gitattributes`). Automatic LF/CRLF normalization would invalidate its existing byte-hashed index, locks and historical evidence. This does not disable textual diffs or allow silently rewriting historical artifacts. Deliberate active-source edits still require the normal index/context refresh.

This candidate is intended first as source distribution. The package file list includes the linked product guides, protocol and license; a dry-run inventory is not npm publication or installed-package verification. npm publication still requires separate approval. See the [release checklist](../docs/release-checklist.md), [third-party inventory](../docs/third-party-notices.md), [contribution policy](../CONTRIBUTING.md) and [security-reporting status](../SECURITY.md).

The distribution destination is `https://github.com/gardenvision/CanonTrail`, a new clean-history repository separate from private development. The consumer Action template pins clean runtime commit `23d542302e7327931cb2c60b7a35ae60e6e47f16`; it does not follow `main`. Public availability and current checks must be verified before using the Action. npm remains a separate, unpublished channel.
