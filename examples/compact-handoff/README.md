---
topic_id: compact-handoff-example
stand: "2026-09-27"
status: worked-example
truth_level: design-target
verification:
  state: internally-reviewed
  evidence: [test/compact-handoff.test.ts, test/compact-handoff-review.test.ts, examples/compact-handoff/inventory.fixture.json]
read_if_task_touches: [compact handoff usage, separate worktree inventory]
primary_systems: [context continuity]
safe_to_edit: [Keep examples synthetic and distinguish status inventory from content backup.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# A small handoff, a complete safety inventory

The fixture has two observations: an unrelated untracked output and one modified selected source. It contains no file contents. Hash the exact bytes of `inventory.fixture.json` with SHA-256, prefix the digest with `sha256:`, and bind them as:

```json
{
  "worktree_inventory": {
    "path": ".agent-context/tasks/T-EXAMPLE/evidence/worktree-inventories/<raw-sha256-hex>.worktree-inventory.json",
    "content_hash": "sha256:<raw-sha256-hex>",
    "entry_count": 2
  }
}
```

This is a handoff-field excerpt, not a runnable complete handoff or an invented digest. The fixture's spacing and final newline are part of its raw hash. Version-1 inventory JSON must round-trip to two-space indentation plus one final LF, without BOM or duplicate keys. Entry order is lexicographic UTF-16 code-unit order, not host locale. `test/compact-handoff.test.ts` validates these fixture bytes and bindings.

Only `src/feature.ts` belongs in the automatically selected `files` list when the task/lock selects it. `peer/unrelated-output.txt` remains fully visible in the separately retained inventory, not implicitly required model context. An explicit checkpoint file declaration can add a relevant path not in the lock. Directory intents do not recursively import an entire project.

Create with the usual `handoff create` or `checkpoint create` dry run, inspect the count/path and semantic notes, then apply explicitly. Dry run writes neither the inventory nor a handoff/archive. Applied output uses the exact hash-derived task path; it never overwrites a different inventory. Renames and copies retain destination and original paths. A normal checkpoint update uses `--replace`; its old handoff and all bound provenance remain historical.

Creation currently requires the CanonTrail project root to be the Git worktree root; nested project roots fail explicitly before writes. This avoids mixing Git-relative inventory paths with project-relative selected sources. Linked worktree roots are supported; do not move/reinitialize an existing nested project to bypass the check.

Review consumer `.gitattributes` before staging: `.agent-context/** -text` preserves control-artifact bytes unless overridden or filtered. Other selected source paths need their own reviewed byte-preservation rules. `eol=lf` alone cannot preserve an originally CRLF-hashed file. `test/compact-handoff-review.test.ts` clones a synthetic project with `core.autocrlf=true`: the protected inventory keeps its exact bytes and validates; the unprotected inventory gains CRLF and correctly fails. Both clones have clean Git status. The failure does not authorize changing a historical hash. See `docs/usage.md` for recovery and transport boundaries.

The receiving session validates the handoff, creates and validates its exact receiving packet, and reads the selected context. The full inventory is verified by tools separately. Removing it later breaks both retained packet provenance and current resume validation. Later changes to the *working tree* do not invalidate this historical status observation.

Refresh the active context after reviewing changed selected sources before creating a checkpoint. Git stderr warnings, even with exit zero, reject capture rather than silently certify an incomplete list. All immutable collisions and linked/aliased control destinations are checked before any output; stored archives use exact bytes and strict UTF-8 reads. An unbound archived handoff is still audited, without comparing its old selected files with today's tree. Unexpected I/O/crash failure or hostile concurrent changes remain outside the non-atomic stable-tree guarantee. `test/continuity-write-hardening.test.ts` provides the negative and preservation controls.

An older project first needs reviewed synchronization of the configured handoff and worktree-inventory schemas. Old handoffs remain supported as-is. No real project is modified by this example. No actual model-token savings, ownership proof, atomic snapshot, ignored-file coverage or backup is claimed.
