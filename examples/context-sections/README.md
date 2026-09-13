---
topic_id: explicit-context-sections-example
stand: "2026-09-07"
status: current
truth_level: active-snapshot
verification:
  state: internally-reviewed
  evidence: [ARTIFACT_PROTOCOL.md]
read_if_task_touches: [explicit source sections]
primary_systems: [context compiler]
safe_to_edit: [Keep exact byte identities and limitations explicit.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Explicit section, full source identity

`source.txt` is a four-line synthetic source. `selection.json` shows the exact task fields and the additional lock-source fields for lines 2–3. It is a fragment illustration, not a complete standalone Context Lock. Tests recompute both hashes from the bytes. The selected estimate excludes lines 1 and 4, but changing either line still requires reevaluation of the full source identity.

Use the task fields in a fixture with the shipped schemas and run context compile. Do not add the same path to required_context_sources or --include: those request the complete file and intentionally conflict. Fresh sessions follow line_ranges; neither a saved excerpt report nor merely listing a source path proves the model read it.

A human compile report identifies this fragment as `inclusive lines 2..3` with `remainder not selected`. The exact selected token estimate is recomputed from `source.txt` by the worked-example test. Paths must match each directory entry's spelling, including on case-insensitive filesystems. Both selection fields must be supported by the installed context-lock schema; even schemas containing those field names are checked against the actual prospective lock and task payload before writes.

Counterexample: changing this range to 1..1 and recalculating all receiving-lock and resume-packet hashes remains invalid when task state still declares 2..3. Removing selection fields is also invalid. A valid receiving archive need not equal a newer active lock, but still must satisfy the task's requirements and its own source hashes.
