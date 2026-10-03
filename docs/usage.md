---
topic_id: usage-guide
stand: "2026-10-01"
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

For a new task, preview a schema-valid draft with the new `task create` command (check the actual executable's help before using development-source instructions):

```text
node <CANONTRAIL_HOME>/dist/cli.js task create <TARGET_PROJECT> --task T-EXAMPLE --change-id CHG-EXAMPLE --objective "Describe the requested outcome" --accept "Describe one observable acceptance condition" --author "Your name or agent identity" --risk medium --json
```

Repeat `--accept` for additional conditions. Review all three generated files, then repeat with `--apply` to create a **new** task directory. Existing directories are never overwritten, including empty ones. Both shipped and installed schemas are checked; the command does not initialize or upgrade a project. It performs no Git, index, compile or project-test operations. Unexpected I/O failure may leave a partial new draft; inspect it instead of blindly overwriting or deleting it.

The output is deliberately `draft` / `idea`, not an implementation decision. Fill actual acceptance oracles, non-goals, source authority, documentation structure, checks and all ten impacts; assess whether independent review is required. Only then move the change to `decided` and begin implementation. Nothing is marked passed for you. [The task-creation example](../examples/task-create/README.md) walks through this boundary. Manual authoring using [the task schema](../schemas/task-state.schema.json), [change integrity](../docs/change-integrity.md) and the synthetic [save example](../examples/feature-save-schema/README.md) remains supported.

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

Before the first context lock exists, omit `--task`; that option only compares with an existing lock and is not needed to inspect a source. The default excerpt limit is 4,000 estimated content tokens. A justified larger range can use `--max-tokens <number>` (at most 32,000); no truncated output is substituted for an over-budget range.

```yaml
context_sections:
  - path: docs/example.md
    from: 20
    to: 48
    content_hash: "sha256:<whole-file-hash-from-excerpt>"
```

Then refresh the index if governed Markdown changed, compile without `--apply`, inspect the section, omissions and budget, and apply only a sound proposal. The section is itself required and bound to the *entire* source hash: edits outside lines 20–48 also force a fresh decision. If another rule still requires the whole file (for example governing instructions, strong canonical routing, a direct evidence citation or `--include`), compilation rejects the narrower request; keep the whole file or use a larger budget. [The worked example](../examples/context-sections/README.md) shows exact hashes and bytes. `--include` requests a whole source, not a section.

The compiler uses an explicit text-extension list. Alongside `.js`, `.ts`, `.cs`, `.kt`, `.md`, `.json` and `.yaml`, it accepts `.mjs`, `.cjs`, `.hlsl`, `.glsl`, `.shader`, `.compute` and `.cginc`. The additional module/shader formats must be valid UTF-8 without NUL and at most 8 MiB; a rejected required source fails before lock replacement, while an invalid optional source is reported as omitted. Explicit selection still determines what is loaded; extension support does not scan the source tree or make code canonical. Binary-capable `.asset`, `.prefab`, `.unity`, images and model files remain outside this text contract. Record their exact identity through compact evidence and inspect them with the appropriate project tool. Do not rename real sources just to bypass the boundary. Use `context inspect` to understand costs and drift.

## Verification and handoffs

After relevant source/document changes, update the index and your active context. Do not rewrite completed historical locks simply because the project evolved.

To avoid needless rework, consolidate a checkpoint in this order:

1. Finish the current bounded source changes and record the corresponding evidence/status together. A planned output belongs in `file_intents`; a cited evidence path must already exist. Renaming referenced evidence is not a way to tidy history.
2. Refresh the index when governed Markdown changed; compile and inspect the owning task's current selection. A stale saved preview must be regenerated and reviewed, not silently applied against a different index.
3. At an actual pause, phase boundary, provider change or pre-compaction point, create and validate one checkpoint. Set `latest_handoff` and refresh the active lock as needed. Do not replace a valid checkpoint after every individual metadata edit; create a new one when its next action or relevant continuity state would mislead a receiving session.
4. Run application checks and task-scoped finalization at the appropriate completion point. `review` / `implemented` with pending human or runtime acceptance is an honest unfinished state, not a reason to relabel missing tests as passed. Task completion and whole-project health remain separate.

This order reduces unnecessary cycles; it does not skip required source-drift review, missing-reference checks, finalization gates, or handoff validation. Keep each receiving session's validated packet order below.

```text
node <CANONTRAIL_HOME>/dist/cli.js validate <TARGET_PROJECT>
node <CANONTRAIL_HOME>/dist/cli.js docs audit <TARGET_PROJECT>
node <CANONTRAIL_HOME>/dist/cli.js finalize <TARGET_PROJECT> --task <TASK-ID> --fail-on-warnings
```

Validation checks structural contracts; it does not independently prove every narrative claim. Record actual application tests and evidence first. `finalize` is the terminal aggregator, not a task check that should invoke itself. Technical verification, independent review and canonical promotion are separate gates. A task-scoped report names both the named-task result and raw repository structural health. Unrelated active-task lock drift can remain visible as non-blocking for that task; it is still a failed project-health gate, not CI or release approval. Run repository-only `finalize` for project-wide strictness. See [parallel work](../docs/parallel-work.md) for the full boundary.

For a handoff/checkpoint, the target must be the root of a readable local Git worktree so dirty/untracked changes and task sources share one path base. A nested project below that root is currently rejected before writes; do not move its configuration or rerun init to bypass the check. A linked Git worktree's own root is supported. Existing handoff validation is unchanged. Use `handoff --help`, `checkpoint --help` and [protocol section8](../ARTIFACT_PROTOCOL.md#8-task-and-session-continuity). After applying a handoff, update `latest_handoff` and recompile the active task lock; the archived source lock remains unchanged. A receiving session validates its packet and follows the recorded read order, not old chat transcripts by default.

New handoffs keep the complete Git-status list in a separate hash-bound `worktree_inventory` file. The short handoff shows task-selected/explicit files and a count summary; the receiving tools verify the inventory without loading its full list as model context. This preserves unrelated changes in the safety record without claiming that the task owns them. The record is not a file-content backup and cannot record unsaved editor state. Explicit long checkpoint notes are not automatically shortened. See [the compact handoff example](../examples/compact-handoff/README.md).

Before creation, review changed task sources and recompile the active lock. Missing or changed selected sources and missing explicit resume inputs now stop creation before writes. Git warnings also stop it, even when Git exits successfully: long paths or unreadable directories can otherwise hide changes. Read the reported cause, resolve the project-local access/path issue, then retry; CanonTrail does not change Git settings automatically.

Creation checks every archive/packet collision and mutable destination before the first write. Control files must be exact-spelled, regular and unlinked, including deeper archive directories. Invalid UTF-8, decoded-equal but byte-different archives and noncanonical new inventory JSON are rejected rather than repaired. This is a stable-tree operation, not a multi-file crash transaction: unexpected I/O failure can still leave immutable outputs. Inspect hashes and the latest handoff/active lock before retrying; do not delete history automatically. Hash-named retained handoffs are audited even without a resume packet, while their old source hashes remain historical. Human validation and audit output includes the detailed cause and target.

For an existing project, compare the running version's `schemas/handoff.schema.json` and `schemas/worktree-inventory.schema.json` with the configured schema directory before creating a new checkpoint. Review local schema customizations and synchronize those schemas deliberately; do not rerun init or blindly copy an entire schema tree. An old schema is rejected before new handoff/archive writes. Old handoffs and packets remain readable without being rewritten. To replace a large old handoff, first inspect the current task state, then use a new `checkpoint create ... --replace --apply`; the previous handoff is archived. Preserve that archive and all bound evidence.

For a missing reference, inspect its code, referring file/task and resolved target. `LOCK003` concerns a current selected source: after reviewing an intentional optional removal/rename, recompile your active lock; restore or explicitly reconsider genuinely required sources rather than dropping them for convenience. `HANDOFF004` concerns a resume source: resolve its absence first, then review a new checkpoint; recompilation and `--replace` cannot bypass validation of the existing handoff. Missing evidence/control records are different: recompiling cannot recreate them. Do not rewrite immutable historical receipts or suppress errors. Store completed revisions under stable paths and give new variants new paths. A recreated filename is not proof of the original revision. Unresolved references still block index generation without replacing the old index.

Use explicit evidence paths: write `./shot.png` or `./result.txt` for files in the repository root, not ambiguous bare names inside prose. Legacy reference inference is intentionally limited; typed evidence records are preferable when exact identity matters. New handoff timestamps are quoted strings. External YAML consumers should use YAML 1.2 (or preserve string timestamps explicitly); do not rewrite old bytes to accommodate a YAML 1.1 parser's implicit date conversion.

### Preserve handoff bytes in a consumer repository

Before first staging new artifacts, review the project's existing `.gitattributes`. A scoped starting rule is:

```gitattributes
.agent-context/** -text
```

This prevents Git text/EOL normalization of those control artifacts; review more-specific overrides and filters too. It is not a rule for the remaining selected source files: preserve their hashed bytes through appropriate reviewed attributes as well. Do not overwrite a project's existing policy. A deliberately reviewed whole-tree `* -text` policy, as used by CanonTrail's own source distribution, is one option, not an automatic consumer change.

Verify a real fresh clone with `core.autocrlf=true`, including handoff validation and a receiving-context dry run. A clean Git status does not establish exact byte equality. `eol=lf` alone is normalization, not protection of bytes previously hashed with CRLF. A later attribute change does not undo already staged conversion. Recover a damaged historical artifact from a proven original and review transport changes; do not automatically run renormalization, change global Git settings, or recalculate historical hashes merely to make validation pass. CanonTrail never makes these Git/attribute changes for you. The compact-handoff example and regression tests exercise both the protected and unprotected cases.

**Safe receiving-session order:** validate the supplied handoff; inspect a `resume create` dry run and explicitly apply the receiving packet/context; validate that exact packet with `resume validate --packet`; load its bounded `read_order` (including exact selected sections); only then carry out the recorded next safe action. Do not execute a feature change merely because the handoff itself validates. Some generated entrypoint shorthand says to follow the next action before recompiling; interpret it as orientation only, not permission to act before establishing current receiving context. The complete ordering here and protocol section 8 govern safe resumption.

## Other capabilities and limits

- [Migration](../docs/migration.md): plan-first, narrow reviewed transformation and rollback; not arbitrary restructuring.
- [Integrations](../docs/integrations.md): read-only workflow artifacts and optional thin bridges; external tools retain ownership.
- Compact evidence: `evidence record --help`; reference claim/result and subject hashes without copying entire test logs into context. Direct raw-evidence citations deliberately remain required.
- [Platform support](../docs/platform-support.md): Windows/Linux/macOS targets, capability-dependent skips and exact-candidate CI boundaries.
- Weekly `docs audit` is report-first. Findings do not authorize automatic cleanup or promotion.

## Development and packaging

Keep the runtime used by project sessions separate from a mutable development checkout. A package version or checkout HEAD alone does not prove which code `dist/cli.js` runs: uncommitted source changes and a stale build can coexist. Record the chosen release/source revision plus the built runtime/manifest identity, and verify the command's actual `--help`. Do not run `npm run build` in a shared consumer CLI directory while other sessions use it, nor silently switch them from `dist/cli.js` to `src/cli.ts`. Build and test a separate snapshot, finish its review/platform gates, then make an explicit consumer update with schema comparison and retained history.

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
