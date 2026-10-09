---
topic_id: task-working-index-example
stand: "2026-10-08"
status: implemented-awaiting-review
truth_level: draft
verification:
  state: unverified
  evidence: [test/working-index.test.ts]
read_if_task_touches: [task working index, peer document isolation]
primary_systems: [documentation governance, context continuity]
safe_to_edit: [Keep opt-in working scope distinct from repository completion.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md, docs/usage.md]
---

# A working view, not a release waiver

Two independent tasks share a repository. One peer has an unfinished noncanonical
evidence note with an invalid header verification value. Its full diagnostics
must remain visible, but it need not prevent orientation and context compilation
for an unrelated task.

After reviewing the current installed schemas, preview the owned working view:

```sh
node <CANONTRAIL_HOME>/dist/cli.js index <PROJECT> --task T-DOCUMENT-001 --json
node <CANONTRAIL_HOME>/dist/cli.js context compile <PROJECT> --task T-DOCUMENT-001 --working-index --total-tokens 48000 --reserve-output 8000 --json
```

Both commands are read-only. `index --task` never replaces the global index.
The compiler report includes the complete structural preflight, exclusions and
isolated findings; its lock explicitly contains `context_index_scope: task-working`.
Static active-lock integrity stays checked; only current source/index freshness
is skipped for orientation. A corrupted peer lock is not an isolatable note.
The prospective lock is validated against the installed schema even in dry run.
To apply a reviewed context, repeat the compile command with `--apply` (or use the
existing saved-preview flow). Applying context is not permission to edit peer
files, repair evidence or declare completion.

Shared documents, canonical/design-target truth anywhere, unknown/unparsable
headers, physically uncertain paths, structured corruption and a declared or
referenced peer dependency are not isolatable. Adding the peer note as a real
required source makes its defect blocking again. Fix the note in its own task.

A validated handoff archives the exact scoped lock. Fresh `resume create` infers
that mode from the verified source archive and reconstructs present-day scope;
`resume validate` checks the exact receiving packet. A self-hash is not approval.

Default `index`, `validate`, `docs audit`, `finalize` and repository CI remain
strict. The unrelated note still makes the global checks fail until its owner
repairs it. This opt-in mode does not relax existing completion rules and cannot
turn failed repository checks into a merge-ready result.
