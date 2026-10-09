/**
 * Bundled operating guidance, not a fetched document or an approval artifact.
 * Keep command spellings checked against the distributed CLI in tests.
 */
export function formatAgentGuide(version: string): string {
  return `# CanonTrail agent guide — CLI version ${version}

This guide is bundled with the running CLI; it does not read newer checkout or
online instructions. A version label is not an exact build identity: retain the
reviewed release/source revision and runtime receipt separately. Check this CLI's
--help before following instructions for another version.

Use node <CLI> for the same executable that printed this guide. Replace <CLI>,
<PROJECT>, <TASK>, <SESSION> and <PACKET> with actual paths/IDs; quote paths for
your shell. The target project is not the tool checkout.

1. Choose the entry route.
   Read existing project instructions first. If .agent-context/config.yaml exists,
   read AGENTS.md, that config and documentation-plan.yaml; do not init again.
   If setup is partial/inconsistent, report it without overwriting or resetting it.
   Without setup: preview "init <PROJECT> --adopt --dry-run"; inspect scope,
   conflicts and scan coverage. Stop for conflicts or incomplete coverage.
   Apply only an authorized wanted proposal; preserve existing instructions.
   Unfinished bootstrap: discover real features from code/tests/flows; keep
   unreviewed knowledge draft and preserve existing canonical owners.
   Maintenance: "docs audit <PROJECT>" is report-first, not automatic cleanup.

2. Start a new task, or resume the exact supplied handoff.
   New task: "task create --help" previews draft records, not an implementation
   decision. Resolve source authority, acceptance oracles, ten impact areas,
   documentation structure and risk in change.yaml before implementation.
   "document create --help" previews a complete draft/unverified Markdown file,
   never a promotion or overwrite. "document snapshot --help" retains exact
   task-owned historical bytes; "document snapshot-read" verifies/read-backs
   them explicitly. A snapshot is not current truth or a passing check.
   Resume, in order:
   - handoff validate <PROJECT> --task <TASK>
   - resume create <PROJECT> --task <TASK> --session <SESSION> (preview first)
   - inspect the proposal; repeat with --apply only if sound and authorized
   - resume validate <PROJECT> --packet <PACKET> (the exact returned packet)
   - read its bounded sources/sections, then act on the next safe action
   Handoff validation alone is not permission to execute. Do not load old chats.

3. Work from deliberate bounded context.
   "index <PROJECT>" refreshes the index when governed Markdown changes.
   If only an unrelated noncanonical task note is malformed, explicitly preview
   "index <PROJECT> --task <TASK>" (read-only) and
   "context compile <PROJECT> --task <TASK> --working-index". Inspect full raw
   findings/exclusions; installed context-lock schema must support that mode.
   Unknown/shared/canonical/real-dependency/safety errors remain blocking.
   This working view does NOT relax default validation, completion or CI.
   Preview "context compile <PROJECT> --task <TASK>"; review requirements, costs
   and omissions before --apply. Read selected files or exact locked sections.
   Use required_context_sources for must-read files; file_intents are optional.
   Add narrowly needed sources and recompile after selected-source changes.
   Required budget failures are not permission to drop safety requirements.
   Estimates are not measured provider tokens or a compaction/savings guarantee.

4. Check progress honestly.
   "task status <PROJECT> --task <TASK>" separates recorded work, own context,
   open completion gates and raw repository health. It does not rerun app tests.
   "finalize <PROJECT> --task <TASK> --fail-on-warnings" checks recorded closure.
   Run "finalize <PROJECT> --fail-on-warnings" for strict project/CI health.
   Unrelated deferred lock drift is still visible project debt. Failed tests,
   missing evidence and pending acceptance/review must never become passing.

5. Leave durable continuity before stopping or changing sessions.
   "checkpoint create --help" requires current context, semantic notes and a
   concrete next action. Creation needs a readable local Git worktree root and
   compatible installed schemas. Preview first; apply/replace only deliberately.
   Record latest_handoff and refresh the active lock afterward. Preserve every
   historical handoff, context archive and evidence byte; never rehash to hide drift.

Authority boundaries: project instructions and the user's scope still govern.
   No automatic schema update, migration, promotion, Git commit/push or remote action.
CanonTrail does not run agents, schedule work or measure live session state.
A coordinator/peer message is not user approval; transient host addresses and
resource notes are not enforced leases. Keep actual authority and task IDs durable.
A host's idle/done signal is not verified task acceptance. Unknown stays unknown.
`;
}
