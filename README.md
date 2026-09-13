---
topic_id: project-overview
stand: "2026-09-13"
status: alpha-candidate
truth_level: draft
verification:
  state: unverified
  evidence:
    - package.json
    - src/cli.ts
    - src/initializer.ts
    - src/context.ts
read_if_task_touches: [project overview, onboarding]
primary_systems: [project overview]
safe_to_edit: [Keep commands reproducible and claims limited to recorded evidence.]
do_not_use_instead: [VISION.md, ARTIFACT_PROTOCOL.md]
---

# CanonTrail

CanonTrail helps coding agents keep project knowledge organized, load a bounded selection for each task, and leave a traceable handoff for the next session. It is a provider-neutral local CLI and readable project files—not an agent runner or a required hosted service.

**Source Alpha release candidate, MIT licensed:** publication is conditional on the [release gates](docs/alpha-readiness.md). The commands below apply to a local source copy; no npm publication is claimed.

## Why use it?

- Give each topic one authoritative home and distinguish current behavior from drafts and history.
- Start from relevant documentation, code and evidence; deliberately expand when knowledge is missing.
- Preserve task decisions, checks, uncertainty and the next safe action across sessions/providers.
- Discover and adopt existing projects without overwriting their files. Use reviewed migration only for the supported narrow formats.
- Keep your existing execution workflow: GSD/Superpowers may own planning, agents, reviews and worktrees.

Your chosen agent analyzes the code and writes meaningful documentation. CanonTrail supplies contracts, routing and checks; initialization does not automatically create complete verified project knowledge. Token estimates are not billing measurements, and CanonTrail does not prevent compaction or guarantee an agent follows instructions.

## 1. Build a local source copy

Requires Node.js 20.19 or newer. Git is needed if obtaining a source copy with Git and for project handoff/checkpoint creation; no remote is needed for normal local project use.

In the CanonTrail source directory:

```sh
npm ci --ignore-scripts
npm run build
node dist/cli.js --help
```

No global installation is necessary. A later public release must provide a reviewed repository/archive URL and revision. For source authenticity, obtain a copy from the maintainer and verify its revision; do not run an unrelated `npx canontrail` package based only on the name.

## 2. Keep the tool and target project separate

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

## 3. Give your agent an entry point

> CanonTrail is built at `<CANONTRAIL_HOME>` and the target is `<TARGET_PROJECT>`. Read the target's `AGENTS.md` and follow the relevant new-task/resume/bootstrap route. My task is: `<request>`. Create the required task records, compile a bounded context, inspect omissions, and load additional sources only when needed. Preserve checks, limitations and a next safe action. Do not treat documentation scaffolding as verified knowledge or setup as migration/publication permission.

In CanonTrail itself, start with [AGENTS.md](AGENTS.md), then [the knowledge map](docs/self-documentation.md). Product scope belongs to [VISION.md](VISION.md), artifact contracts to [ARTIFACT_PROTOCOL.md](ARTIFACT_PROTOCOL.md), and priorities to [ROADMAP.md](ROADMAP.md).

## 4. Create a small task and compile its context

Task scaffolding is still manual. Create `.agent-context/tasks/<TASK-ID>/state.yaml` and a governed `brief.md` using [the task schema](schemas/task-state.schema.json). Nontrivial changes also require `change.yaml` with acceptance cases and ten impact areas; see [change integrity](docs/change-integrity.md) and the synthetic [save example](examples/feature-save-schema/README.md).

Use `required_context_sources` for must-read existing files and `file_intents` for the broader possible change surface. Use the explicit CLI path from step 2 for these commands:

```text
node <CANONTRAIL_HOME>/dist/cli.js index <TARGET_PROJECT>
node <CANONTRAIL_HOME>/dist/cli.js context compile <TARGET_PROJECT> --task <TASK-ID> --total-tokens 16000 --reserve-output 2000 --input-safety 1024
```

Inspect selected sources, reasons and omissions, then repeat with `--apply` if the proposal is correct. 16k is an example, not a universal budget. A required source that cannot fit causes failure instead of silent omission; the prior lock is preserved. Add a narrow source with `--include`, or choose an [explicit optional-source section](examples/context-sections/README.md), then recompile. Required whole files cannot be silently narrowed.

The compiler uses a fixed text-extension list. `.js`, `.ts`, `.cs`, `.kt`, `.md`, `.json` and `.yaml` are supported; `.mjs` and `.cjs` currently are not. Do not rename real source files just to bypass this limitation. Use `context inspect` to understand costs and drift.

## 5. Verify and hand over

After relevant source/document changes, update the index and your active context. Do not rewrite completed historical locks simply because the project evolved.

```text
node <CANONTRAIL_HOME>/dist/cli.js validate <TARGET_PROJECT>
node <CANONTRAIL_HOME>/dist/cli.js docs audit <TARGET_PROJECT>
node <CANONTRAIL_HOME>/dist/cli.js finalize <TARGET_PROJECT> --task <TASK-ID> --fail-on-warnings
```

Validation checks structural contracts; it does not independently prove every narrative claim. Record actual application tests and evidence first. `finalize` is the terminal aggregator, not a task check that should invoke itself. Technical verification, independent review and canonical promotion are separate gates. See [parallel work](docs/parallel-work.md) for task completion versus unrelated active-lock drift.

For a handoff/checkpoint, the target must be a readable local Git worktree so dirty/untracked changes can be recorded. Use `handoff --help`, `checkpoint --help` and [protocol section8](ARTIFACT_PROTOCOL.md#8-task-and-session-continuity). After applying a handoff, update `latest_handoff` and recompile the active task lock; the archived source lock remains unchanged. A receiving session validates its packet and follows the recorded read order, not old chat transcripts by default.

**Safe receiving-session order:** validate the supplied handoff; inspect a `resume create` dry run and explicitly apply the receiving packet/context; validate that exact packet with `resume validate --packet`; load its bounded `read_order` (including exact selected sections); only then carry out the recorded next safe action. Do not execute a feature change merely because the handoff itself validates. Some generated entrypoint shorthand says to follow the next action before recompiling; interpret it as orientation only, not permission to act before establishing current receiving context. The complete ordering here and protocol section 8 govern safe resumption.

## Other capabilities and limits

- [Migration](docs/migration.md): plan-first, narrow reviewed transformation and rollback; not arbitrary restructuring.
- [Integrations](docs/integrations.md): read-only workflow artifacts and optional thin bridges; external tools retain ownership.
- Compact evidence: `evidence record --help`; reference claim/result and subject hashes without copying entire test logs into context. Direct raw-evidence citations deliberately remain required.
- [Platform support](docs/platform-support.md): Windows/Linux/macOS targets, capability-dependent skips and exact-candidate CI boundaries.
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

This candidate is intended first as source distribution. The package file list includes the linked product guides, protocol and license; a dry-run inventory is not npm publication or installed-package verification. npm publication still requires separate approval. See the [release checklist](docs/release-checklist.md), [third-party inventory](docs/third-party-notices.md), [contribution policy](CONTRIBUTING.md) and [security-reporting status](SECURITY.md).

The distribution destination is `https://github.com/gardenvision/CanonTrail`, a new clean-history repository separate from private development. The consumer Action template pins clean runtime commit `23d542302e7327931cb2c60b7a35ae60e6e47f16`; it does not follow `main`. Public availability and current checks must be verified before using the Action. npm remains a separate, unpublished channel.

## License

CanonTrail's own code, schemas, templates and documentation are licensed under the [MIT License](LICENSE.txt), except where another license is stated. Preserve the applicable license and copyright notices when redistributing copies or substantial portions. Third-party dependencies and incorporated third-party material retain their respective terms; the project license does not replace them.

The package remains `private: true` to prevent accidental npm publication. The maintainer's public-release and contribution process still requires separate approval and public-content review. These are release-management gates, not additional restrictions on rights granted by MIT. Selecting a license is not a legal-clearance or liability-immunity claim.
