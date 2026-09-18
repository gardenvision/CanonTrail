---
topic_id: finding-codes
stand: "2026-09-18"
status: public-source-alpha
truth_level: draft
verification:
  state: internally-reviewed
  evidence: [src/validator.ts, src/finalize.ts, src/docs.ts, src/context.ts, src/resume.ts, src/evidence.ts, src/handoff.ts]
read_if_task_touches: [validation findings, error codes, troubleshooting, CI failures]
primary_systems: [validation reference]
safe_to_edit: [Keep codes, triggers and remedies consistent with the running CLI and validator sources.]
do_not_use_instead: [docs/usage.md]
---

# Finding codes

Validation, finalization and documentation audits report stable codes such as `LOCK004` or `CHANGE004`. This page maps the codes you meet in normal operation to their trigger and remedy. Sources of truth remain the emitting modules (`src/validator.ts`, `src/finalize.ts`, `src/docs.ts`, `src/context.ts`, `src/resume.ts`, `src/handoff.ts`, `src/evidence.ts`).

Exit codes: `0` pass — `1` failed validation/finalization/index preflight or CLI error — `2` `init` conflicts (dry run or applied; nothing overwritten). See [Troubleshooting](usage.md#troubleshooting) for step-by-step remedies.

## Context locks (`LOCK`)

| Code | Severity | Trigger | Remedy |
|---|---|---|---|
| `LOCK001` | error | estimated input plus reserves exceeds the lock's total token budget | recompile with a larger `--total-tokens` or smaller reserves |
| `LOCK002` | error | duplicate source path inside one lock | remove the duplicate citation, then recompile |
| `LOCK003` | error | source path missing or not resolving with exact spelling | restore the file or fix the reference, then recompile |
| `LOCK004` | error | source bytes differ from the recorded `content_hash` | reread the source, update the task, recompile; in `finalize --task` unrelated drift is reported separately |
| `LOCK005` | error | a `required` candidate was omitted | raise the budget or include the source explicitly; required input is never silently dropped |
| `LOCK006` | warning | raw transcripts included in the lock | keep raw session transcripts out of context sources |
| `LOCK007` | error | lock self-hash does not match its payload | rebuild the lock from its sources; inspect the file if this was unexpected |
| `LOCK008` | error | index compatibility: stale index, lock/task identity mismatch, or task-relevant index changes | follow the message: `canontrail index .`, then recompile the lock (or restore the task state) |
| `LOCK009` | error | section bytes, selection hash or token estimate mismatch | recompile from the exact range (`context excerpt` shows it) |

## Context index (`INDEX`)

| Code | Severity | Trigger | Remedy |
|---|---|---|---|
| `INDEX001` | error | context index missing | run `canontrail index .` |
| `INDEX002` | error | index unreadable or invalid | regenerate with `canontrail index .`; inspect unexpected edits |
| `INDEX003` | error | index stale (governed documents changed) | run `canontrail index .`, then rerun the original command; `context compile ... --refresh-index` refreshes automatically |

## References (`REF`)

| Code | Severity | Trigger | Remedy |
|---|---|---|---|
| `REF001` | error | document reference missing or not repository-relative | fix the reference or create the file; duplicates are collapsed with `(referenced N times)` |
| `REF002` | error | reference uses `\` separators | use `/` |

## Changes (`CHANGE`)

| Code | Severity | Trigger | Remedy |
|---|---|---|---|
| `CHANGE001` / `CHANGE002` | error | duplicate impact area / missing impact areas for decided-and-later changes | complete the ten-area impact matrix exactly once each |
| `CHANGE003` / `CHANGE004` / `CHANGE016` | error | canonical source / evidence / feature-document reference missing | fix the path or create the file; duplicates are collapsed |
| `CHANGE005` | error | affected terminology requires a passing project-wide search | record the terminology search with evidence |
| `CHANGE006` | error | affected diagrams or visuals require an applicable and passing visual review | record the visual review (or mark it not applicable with rationale) |
| `CHANGE007` / `CHANGE008` | error | independent review must name a different reviewer and carry evidence | complete or waive the independent review explicitly |
| `CHANGE009`–`CHANGE013` | error | external evidence duplicates, missing/stale hashes, non-candidates or kind mismatch | relink with `evidence --change … --source … --apply` |
| `CHANGE014` | error | duplicate feature document id or path | keep feature entries unique |
| `CHANGE015` | error | documentation-structure reassessment or a required draft is still open | resolve the structure decision, draft required feature documents |
| `CHANGE017` / `CHANGE018` | error | feature document evidence or verification state not closed for the change status | close evidence and verification before the change verifies |

## Tasks (`TASK`)

| Code | Severity | Trigger | Remedy |
|---|---|---|---|
| `TASK001` / `TASK002` | error | a completed task still has open acceptance criteria or checks without passing evidence | close them (or mark `not-applicable` where valid) |
| `TASK003` | error | task-state dependency cycle | break the cycle or record the dependency as a reference instead |
| `TASK004` | error | a task check invokes `canontrail finalize` itself (circular completion dependency) | record the underlying project-owned checks instead |
| `TASK005` | error | invalid explicit context sections | fix `context_sections` (`from` ≤ `to`, exact hash) |

## Handoffs (`HANDOFF`)

| Code | Severity | Trigger | Remedy |
|---|---|---|---|
| `HANDOFF000` | error | latest handoff does not exist | create a checkpoint/handoff |
| `HANDOFF001` | error | `next_safe_action` too vague to resume safely | write a concrete next action (≥ 20 characters, not `continue`/`resume`) |
| `HANDOFF002` | error | dirty worktree requires `uncommitted_summary` | record the summary |
| `HANDOFF003` | error | a check has no evidence | attach evidence or mark it `not-run` |
| `HANDOFF004` | error | `resume_sources` reference missing | restore the file or update the handoff deliberately |
| `HANDOFF005` | warning | handoff self-hash mismatch on the create path (filtered there) | rebuild the handoff; validation still fails closed |
| `HANDOFF006` | error | archived source context lock missing, invalid or mismatched | recreate the arcfhive with `handoff create --replace` after restoring inputs |
| `HANDOFF007` | error | handoff task_id does not match its task directory | fix the handoff or its location |

## Resume packets (`RESUME`)

| Code | Severity | Trigger | Remedy |
|---|---|---|---|
| `RESUME000` | error | requested packet was not loaded by the governed scan | use the exact packet path returned by `resume create` |
| `RESUME001`–`RESUME005` | error | self-hash, raw-transcript, duplicate, vague-action or filename/owner mismatches | recreate with `resume create --apply` and keep the packet immutable |
| `RESUME006` / `RESUME007` | error | source-session or receiving-context archive invalid | restore the archive or recreate the packet |
| `RESUME008` | error | resume source missing or changed | refresh the receiving context; sources must match the recorded hashes |
| `RESUME009` | error | active context lock path does not match the owning task | recompile the owning task lock |
| `RESUME010` | error | receiving context cannot satisfy task requirements | recompile with the missing requirements selected |
| `RESUME011` | error | packet schema cannot be established | check `.agent-context/schemas` completeness |

## Evidence records (`EVIDENCE`)

| Code | Severity | Trigger | Remedy |
|---|---|---|---|
| `EVIDENCE001` | error | path, task_id and evidence_id do not identify the same task-owned record | keep the file under its owning task |
| `EVIDENCE002` | error | duplicate evidence_id | choose a unique `EVID-…` id |
| `EVIDENCE003` | error | record self-hash mismatch | recreate the record; do not edit it in place |
| `EVIDENCE004` | error | subject path not normalized repository-relative | use normalized `/` paths |
| `EVIDENCE005` | error | a referenced path is missing | fix references or restore files |

## Schemas and documents (`SCHEMA` / `DOC` / `CANON` / `CFG` / `MAINT`)

| Code | Severity | Trigger | Remedy |
|---|---|---|---|
| `SCHEMA001`–`SCHEMA004` | error | schemas directory unreadable, schema load/compile failed, or a validator is unavailable | restore `.agent-context/schemas` from the tool copy |
| `SCHEMA005` | error | artifact does not conform to its schema | fix the artifact; the diagnostic names the schema |
| `DOC001` / `DOC005` | error | repository files or structured artifacts cannot be scanned | check permissions and paths |
| `DOC002` | error | Markdown frontmatter invalid | fix the header block at the named file |
| `DOC003` | error | duplicate `artifact_id` | keep artifact ids unique |
| `DOC004` | error | structured artifact cannot be parsed | fix YAML/JSON syntax |
| `CANON001` / `CANON002` | error | canonical document missing `topic_id` / topic owned twice | fix the header; keep one canonical owner per topic |
| `CFG001` / `CFG002` | error | configuration cannot be read / migration coverage incomplete | fix `config.yaml`; include `.agent-context/migrations` in `governed_paths` |
| `MAINT001` / `MAINT002` | error | frozen-example policy cannot be validated / a frozen entry is ineligible | fix `.agent-context/maintenance.yaml` |

## Finalization (`FINALIZE`)

| Code | Severity | Trigger | Remedy |
|---|---|---|---|
| `FINALIZE001` | error | documentation audit could not complete | check permissions and `maintenance.yaml`; never fake a healthy audit |
| `FINALIZE100`–`106` | error | invalid task id; missing state/change/lock; mismatched id; status not `verified`/`done`; open acceptance criterion | close the named item |
| `FINALIZE107` / `FINALIZE108` | error | task check not passing / passing check without evidence | record evidence or fix the check |
| `FINALIZE109`–`111` | error | task state or change record unreadable | fix the YAML |
| `FINALIZE112` / `FINALIZE113` | error | no project-owned check / no change verification check recorded | record the checks |
| `FINALIZE114` | error | a check invokes finalize itself | record underlying checks instead |
| `FINALIZE115` / `FINALIZE116` | error | a verified change still has open acceptance cases or verification checks | close them or mark `not-applicable` |
| `INDEX003` (in finalize) | error | index stale | `canontrail index .`, then rerun finalize |

## Documentation audit (`DOCS`)

| Code | Severity | Trigger | Remedy |
|---|---|---|---|
| `DOCS101` / `DOCS102` | warning | document older than its staleness threshold / future stand date | refresh or archive deliberately; frozen examples are exempt by policy |
| `DOCS201` | warning | same `topic_id` with conflicting non-historical metadata | review the topic owners |
| `DOCS301`–`DOCS304` | warning | task directory without state, without brief/change, or handoff linkage problems | complete the task artifacts |
| `DOCS401` / `DOCS402` | warning | superseded document still non-historical | archive or reclassify |
| `DOCS501` / `DOCS502` | warning | active change without documentation-structure decision / reassessment required | record the decision |
| `DOCS601`–`DOCS603` | warning | lifecycle drift between task state, brief and change record | align the statuses |

## Readiness and migration

`RDY001`–`RDY024` cover the GSD readiness projection (file, frontmatter, schema version, ownership and phase-shape checks); `MIGRATION001`–`MIGRATION205` cover migration planning, transformation and execution gates. Both families stay tied to their owning documents: [Integrations](integrations.md) and [Migration](migration.md); their exact triggers live in `src/readiness.ts` and `src/migration.ts`.
