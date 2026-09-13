---
topic_id: artifact-protocol
stand: "2026-09-06"
status: design-target
truth_level: design-target
verification:
  state: structurally-reviewed
  evidence:
    - schemas/artifact-header.schema.json
    - schemas/change-record.schema.json
    - schemas/compatibility.schema.json
    - schemas/context-lock.schema.json
    - schemas/evidence-record.schema.json
    - schemas/task-state.schema.json
    - schemas/handoff.schema.json
    - src/context.ts
    - test/context.test.ts
    - src/handoff.ts
    - test/handoff.test.ts
    - schemas/resume-packet.schema.json
    - src/resume.ts
    - test/resume.test.ts
    - src/checkpoint.ts
    - test/checkpoint.test.ts
    - schemas/maintenance.schema.json
    - src/docs.ts
    - test/docs.test.ts
    - src/initializer.ts
    - src/validator.ts
    - test/initializer.test.ts
    - test/validator.test.ts
    - src/finalize.ts
    - src/finalize-guard.ts
    - test/finalize.test.ts
    - src/evidence.ts
    - test/evidence.test.ts
    - examples/feature-save-schema/
    - schemas/migration-plan.schema.json
    - src/migration.ts
    - test/migration.test.ts
    - schemas/migration-transaction.schema.json
    - schemas/migration-execution.schema.json
    - test/migration-transformation.test.ts
read_if_task_touches:
  - artifact formats
  - documentation governance
  - context compilation
  - handoffs
  - external workflow compatibility
  - canonical promotion
primary_systems:
  - documentation protocol
  - context continuity
  - validation
safe_to_edit:
  - Update matching JSON Schemas and the worked example in the same change.
  - Record unresolved product decisions in ROADMAP.md.
do_not_use_instead:
  - VISION.md
  - schemas/
---

# Artifact Protocol

## 1. Scope

This protocol governs documentation identity, progressive context, task/session continuity, external workflow references, evidence, and canonical promotion. It does not define brainstorming, consensus, planning methodology, code execution, agent dispatch, or worktree orchestration.

The terms MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY describe the MVP design target.

## 2. Core vocabulary

**Governed document** — A Markdown document with identity, truth level, verification state, routing metadata, and editing constraints.

**Canonical document** — The single current authoritative location for one topic.

**External workflow artifact** — A spec, plan, state file, summary, review, or other artifact owned by another system. It is an input, never canonical by default.

**Context manifest/lock** — The exact, bounded set of source versions selected for a task or session and the reasons for selection and omission.

**Active context lock** — The current mutable working view of a task that has not reached a terminal task state.

**Historical context lock** — The immutable recorded working view of a task in `verified`, `done`, or `superseded` state. Later repository drift does not rewrite or invalidate its historical payload.

**Compact evidence record** — A task-owned, self-hashed observation that separates its evidence kind and result from the full source files it identifies by hash.

**Handoff** — A validated checkpoint allowing a fresh session or different agent to resume safely.

**Promotion** — The explicit, evidence-backed update that moves verified knowledge into its canonical documentation destination.

**Feature document** — A product-facing description of one stable user capability or lifecycle. It links to cross-cutting architecture, data, testing, and operations truth instead of duplicating those topics.

**Durable project knowledge** — The governed, hierarchical, evidence-backed body of project truth retained across tasks, providers, sessions, and compaction boundaries.

**Bounded working context** — The smallest sufficient, reproducible view of durable project knowledge and task evidence selected for one task or session.

**Controlled context expansion** — The explicit addition of a narrowly relevant source when the bounded working context proves insufficient, followed by context-lock recompilation.

## 3. Truth and verification

Truth level and workflow status are independent.

| Truth level | Meaning |
|---|---|
| `canonical` | Current authoritative truth for one topic. |
| `design-target` | Intended future state not guaranteed to match implementation. |
| `active-snapshot` | Current operational state such as a task or handoff. |
| `draft` | Unapproved discovery material that must not direct work as truth. |
| `historical` | Retained provenance that is no longer current guidance. |

Governed Markdown MUST provide `stand`, `status`, `truth_level`, `verification`, `read_if_task_touches`, `primary_systems`, `safe_to_edit`, and `do_not_use_instead`. Canonical documents MUST provide a stable `topic_id`.

`unclassified` is a context-lock-only source classification, not a governed Markdown truth level. It means that an ordinary selected repository source such as implementation code, a test, or machine-local configuration has no governed documentary authority. Selection does not make such a source canonical. A compiler MUST preserve the indexed truth level for governed documents and use `unclassified` only when the selected source has no governed index entry.

External artifacts MUST retain their external ownership and MUST NOT be indexed as canonical solely because they contain confident or approved language.

### 3.1 Usage guidance and standalone references

`do_not_use_instead` retains a string array of usage constraints. It is not an evidence list or a general Markdown dependency parser. A complete bare path-like string is interpreted relative to the repository root, never guessed relative to the current document. A single-backtick span occupying the entire trimmed entry declares the same standalone reference; this form disambiguates paths containing Markdown punctuation. Explicit standalone code-formatted paths are checked even without a recognized extension. Absolute or drive-prefixed usage paths are rejected rather than reinterpreted as repository-relative. Missing paths, repository escapes and unsupported backslash separators retain their existing checks.

Entries with surrounding prose and code spans, Markdown link notation, or line breaks remain narrative and MUST be preserved verbatim in the document and context index. CanonTrail MUST NOT resolve the entire sentence as a filename or infer a dependency from its embedded file-like words. A passing validator does not assert that narrative mentions exist. For a dependency requiring deterministic validation, record a separate standalone path entry (and keep the explanation), or use the appropriate evidence field when it actually supplies verification.

For legacy bare entries, a slash alone identifies a path only without whitespace; recognized filename extensions (md, yaml/yml, json, ts, js, cs) or a trailing-slash directory also allow spaces. Ambiguous prose ending in such a filename should use marked-up narrative; a standalone path with markup characters should use the sole-backtick form. This lexical contract is intentionally not a natural-language classifier. `verification.evidence` and `supersedes` are unchanged and MUST NOT receive the narrative exemption. No header or index shape changes and no automatic migration, promotion, reference rewriting or missing-reference exception follow from this rule. See the worked example in `examples/usage-constraints/README.md`.

## 4. Default project layout

```text
.agent-context/
├── config.yaml
├── context-index.json
├── compatibility.yaml
├── adoption-manifest.json
├── documentation-plan.yaml
├── maintenance.yaml
├── migrations/
│   └── <migration-id>/
│       └── migration.plan.json
├── schemas/
└── tasks/
    └── <external-or-local-task-id>/
        ├── state.yaml
        ├── change.yaml
        ├── brief.md
        ├── context.lock.json
        ├── handoff.yaml
        └── evidence/

docs/canontrail/
├── project-overview.md
├── architecture.md
├── features/
│   └── README.md
├── systems/
├── workflows.md
├── data-and-assets.md
├── testing.md
└── operations.md
```

Projects MAY select different canonical documentation destinations. `.agent-context/` stores protocol state and references; it MUST NOT become a duplicate product-wiki tree.

## 5. Safe initialization and adoption

`canontrail init` targets an empty project. A non-empty project requires `--adopt`.

Initialization and adoption MUST NOT overwrite existing files, install hooks, create commits or worktrees, or perform remote Git/hosting operations. Unity adoption MUST exclude standard generated directories and generated IDE project files, and MUST keep CanonTrail artifacts outside `Assets/`.

Mechanical inventory MUST remain locally bounded. If its file budget is exhausted, the inventory MUST NOT present partial traversal as complete discovery. It MUST distinguish directories excluded by policy from reached non-excluded directories that were not entered, record the complete count plus a deterministic bounded path sample of the latter, and emit a visible warning. Descendants of an unscanned directory remain unknown until a later targeted inventory; they MUST NOT be described as safely excluded or semantically documented.

Large-project adoption MAY declare repository-relative documentation roots and owned source roots. Declared roots MUST already exist as directories, resolve inside the repository, and MUST NOT traverse a configured or profile-generated exclusion. The inventory scans documentation roots first, owned source roots second, and the remaining repository as fallback, preserving user order within each class. Overlapping roots MUST NOT duplicate global file or byte counts. The same global safety bound applies across every phase.

The adoption report and manifest MUST record each requested root's kind, normalized path, scanned file and byte counts, documentation-candidate count, unscanned-directory count, and `complete`, `partial`, or `unscanned` coverage. Repository fallback coverage MUST remain separately visible. A partial or unscanned root is an explicit discovery gap, not evidence that its descendants are generated, irrelevant, or documented.

Markdown below explicitly declared documentation roots or conventional `docs`, `doc`, or `documentation` directory segments MAY be recorded as candidate existing documentation, as may README files at any depth. External workflow paths remain subject to their ownership boundary. Candidate discovery MUST NOT mutate, govern, canonize, or semantically trust an existing document; later evidence-backed adoption decides its topic ownership and truth level.

The initialized schema directory MUST contain every validator required by the shipped artifact commands, including context locks, handoffs, compact evidence, task/change state, maintenance, and resume packets. A fresh initialization MUST NOT expose a command whose generated artifact cannot be validated from that initialized schema set.

Mechanical inventory MAY be recorded immediately. Semantic documentation MUST start as `draft/unverified`, be split by subsystem or stable product feature where appropriate, and require evidence-backed review before promotion. Full bootstrap includes a draft feature catalog so product boundaries can be reviewed without asserting that source directories are user-facing features.

Configured governed paths MUST prevent CanonTrail from imposing its metadata format on unrelated existing Markdown.

Fresh initialization MUST include `.agent-context/migrations` in `governed_paths`. If that control tree exists, repository validation MUST fail visibly when its complete root is not governed or any configured exclusion overlaps it, including an ancestor or descendant. Older configurations MUST NOT be silently rewritten or broaden unrelated Markdown ownership; older projects without migration artifacts remain valid under their existing scope. A linked or unreadable migration control root MUST NOT silently pass as an empty artifact set. Physical coverage includes every descendant, including broken links and special filesystem entries, independently of scanner exclusions. The actual control-root spelling MUST match the protocol path rather than an alias; distinct names on a case-sensitive volume remain distinct. Incomplete or unreadable descendant coverage MUST fail visibly, not be reported as absence.

### 5.1 Documentation migration

Adoption discovers a documentation boundary; migration changes how existing knowledge is governed. They are not the same operation. Migration MUST begin with a deterministic plan over explicitly selected repository-relative documentation roots. The plan records every Markdown source path, byte count, SHA-256 identity, detected source format and metadata, proposed role and action, target path, confidence, review requirement, and reason. Unsupported file extensions MUST be summarized and unreadable or unsafe entries MUST be reported rather than silently omitted.

`canontrail migrate plan` is dry-run by default. An applied planning run MAY create only `.agent-context/migrations/<migration-id>/migration.plan.json` using exclusive creation. It MUST NOT rewrite, move, merge, split, delete, archive, or promote source documents; perform Git mutations; or contact a remote. Requested roots MUST exist as directories and resolve inside the project. Symbolic links are not followed. `.git` and `.agent-context` cannot be selected as documentation roots; a broader selected root skips those control subtrees and reports the omission. Every plan document source and proposed target MUST satisfy the same Markdown containment boundary recorded by the plan's normalized roots; a self-hash does not excuse an internally contradictory inventory. Planning assumes a stable local source tree and cannot provide an atomic snapshot while another process replaces entries concurrently; every later transformation MUST therefore recheck each recorded source hash immediately before writing.

Format adapters MAY recognize declared metadata, but they MUST preserve the source bytes and distinguish an authoritative declaration from words occurring only in prose. Generic parseable YAML frontmatter is not by itself a CanonTrail governance declaration. Recognition requires CanonTrail-specific markers, and only a complete governed header may be treated as already governed without review; partial recognizable headers remain review items. Path conventions MAY conservatively identify historical, review, handoff, or externally owned material. They MUST NOT infer user-facing features or canonical topic ownership from folders alone. Unknown or incomplete metadata becomes a review item.

A migration plan is an immutable, self-hashed proposal. Planning is not transformation, verification, or canonical promotion. A later transformation phase requires an explicit reviewed task, exact source-hash preconditions, collision and redirect policy, rollback evidence, and risk-appropriate independent review. Creating a second product-wiki tree beside the existing owner is non-conforming.

New version-1 plans MUST use the neutral `legacy-header-v1` adapter/source-format vocabulary. A deprecated adapter input MAY normalize to this selector before planning. Retained plans using the previous source-format vocabulary MUST remain readable without rewriting their bytes or hashes. Exactly one complete source-count vocabulary is allowed per plan, and every document format MUST belong to that vocabulary with exact counts. A recomputed self-hash MUST NOT make mixed vocabularies or missing counts acceptable. This additive schema support does not automatically update a target's older schema. A freshly generated plan's changed hash requires newly bound review decisions; historical approval MUST NOT be rebound silently. The worked examples in `examples/migration-plan/README.md` distinguish current output from retained input.

A transformation preview MUST bind to the exact migration-plan hash and copy the plan's normalized, deterministically sorted `documentation_roots` into migration-transaction version 2. Those roots are covered by the transaction self-hash. Every executable operation MUST additionally bind to a reviewed decision set, the source path and hash, target path and precondition, deterministic output hash, and complete target header. Preview, repository validation, execution, and rollback MUST use the same document-path policy: every decision and operation source and target is normalized with forward slashes, uses the exact stored spelling, is Markdown, avoids `.git/` and `.agent-context/`, remains inside at least one transaction-bound reviewed documentation root, and avoids platform-special names such as NTFS alternate-data-stream syntax, Windows device names, forbidden control characters, and trailing-dot or trailing-space segments. The executor and repository validator MUST enforce a bijection: every execute decision has exactly one matching operation and every operation has exactly one execute decision naming the same action, target path, and deeply equal complete target header. Decisions and operations remain path-sorted, while operation IDs are unique and sequential. A legacy version-1 transaction, a transaction without roots, or one with empty, malformed, duplicate, or unsorted roots MUST fail closed and cannot be executed or rolled back. Missing decisions or operations, duplicate identities, operation/decision divergence, unsupported semantic classification, merge/split work, target collisions, or root-boundary violations remain explicit blockers or validation errors. Writing the immutable transaction proposal is not permission to execute it.

Executable header normalization MUST NOT make removed legacy verification knowledge recoverable only through an opaque transaction preimage. Every non-empty free-text `Verification:` declaration removed from a supported legacy header MUST remain visible verbatim in the transformed Markdown, clearly labeled as migration provenance rather than a CanonTrail verification result. This preservation MUST NOT strengthen the reviewed target header's verification state, invent evidence, or promote the document. Transaction preimages remain the byte-exact rollback authority but are not a substitute for legible project knowledge.

Legacy-header recognition, removal, and visible-provenance extraction MUST use the same label grammar. Metadata-looking examples inside fenced code, metadata after the first real second-level section, and labels that only begin with a recognized word MUST remain ordinary body content. The generated provenance section MUST follow surviving pre-section prose and precede the first real second-level section, must use a non-colliding heading, and MUST preserve each removed declaration's value exactly. Transformation MUST preserve an input UTF-8 BOM, line-ending convention, and untouched body spacing; intentional header replacement and provenance insertion are the only allowed postimage changes.

The initial executable `normalize-header` adapter is in-place only: `target_path` MUST equal `source_path`, and the target precondition MUST name that same source hash. Copying or moving a document requires a separately designed relocation, redirect, and source-retirement policy. Preview, repository validation, and execution MUST reject relocation, non-Markdown targets, targets outside the reviewed documentation roots, and paths beneath reserved `.git/` or `.agent-context/` trees.

Document identity checks MUST additionally compare every existing resolved filesystem component with its exact stored spelling. Windows short-name and case aliases MUST NOT authorize access to control trees or bypass reviewed roots. CanonTrail-owned transaction paths remain a separate control-path role, not product documents. Stored roots and document paths MUST NOT contain trailing separators, repeated separators, or dot components; the whole-project root `.` is a permitted root only, never a document path. CLI input MAY be canonicalized before a plan is created. Read-only validation checks identity for existing components without invalidating a historical plan solely because a document no longer exists.

Execution MUST require explicit confirmation of the transaction self-hash and a blocker-free version-2 transaction. Direct execute and rollback MUST validate the complete artifact against the transaction schema shipped with the running CanonTrail version; a prior repository-wide validation run is not a precondition for enforcing that contract. Before resolving or reading a document path, execution and rollback MUST validate the hash-bound documentation-root contract and all decision/operation path bindings. Execution MUST then recheck all source and target preconditions before the first source-document write and resolve containment plus content preconditions again immediately before each individual write. Automatic failure recovery and rollback MUST repeat that containment check immediately before restoring or removing a path. These checks narrow the local TOCTOU window but do not claim an atomic filesystem snapshot or protection from an actor that replaces path components in the final system-call interval; high-impact execution requires an otherwise stable, exclusive source tree.

Execution stages exact preimages and postimages plus a transaction-bound intent in CanonTrail-owned transaction evidence and avoids Git or remote operations. Intent, apply, and rollback records MUST conform to the migration-execution schema shipped with the running CanonTrail version and contain the exact deterministic operation projection from their parent transaction; self-hash and parent-hash equality alone are insufficient. Before an idempotent apply result or rollback is accepted, required staged images MUST exist and match the transaction's source and output hashes and sizes. A transaction ID is single-use: repeating a completed execute or rollback MAY return the existing valid record, but an execute after rollback MUST fail and an interrupted execution MUST require explicit rollback before a new transaction ID is created. Existing malformed, divergent, or incomplete execution evidence MUST produce a state-specific failure and MUST NOT be deleted or overwritten automatically. Rollback MUST restore only transaction-owned preimages, remove only transaction-created paths, and refuse to overwrite any post-transaction drift. Planning, transformation, rollback, verification, and canonical promotion remain separate lifecycle decisions.

Control-path identity is separate from document-path authority. Plan/transaction outputs, execution directories, intent/apply/rollback records, and staged image files MUST use exact-spelled, repository-local regular paths without symbolic-link or junction traversal. Existing components are checked before reads and immediately before control-file writes. Returning a previous rollback record MUST first validate its required intent and all staged images, just as the initial rollback does. No implicit evidence-retention exception applies after success. These checks retain the same stable-tree/final-system-call limitation as document writes.

`reviewed_by` is audit metadata, not cryptographic authentication. Self-hashes detect accidental or unconfirmed drift only when the expected hash is obtained through a trusted channel; a local writer can recompute unsigned hashes. A real high-impact target therefore requires an external reviewer attestation or equivalent trusted approval that names the exact decision and transaction hashes, in addition to CanonTrail's structural binding checks.

Recovery guidance MUST distinguish partial staging from a recoverable execution. Before a valid intent and all required staged images exist, rollback is unavailable: preserve and inspect the partial evidence, then prepare a new transaction ID. Advice to run rollback requires validated durable intent and images; it does not promise that source-drift or containment checks will allow restoration. Evidence MUST NOT be deleted automatically to make a failed attempt appear clean.

#### Read-only exact content inspection

Transformation preview MAY expose full before/after content through explicit `--show-content`. This option MUST reject `--apply` before scanning or writing and MUST NOT invoke execution, stage recovery evidence or write exported documents. Ordinary report shape and transaction hashes MUST remain unchanged when the option is absent.

The opt-in report-only `content_preview` follows `schemas/migration-content-preview.schema.json`. It is outside the transaction hash and never constitutes an approval or execution artifact. Each view binds by operation ID and exact source/target path to a generated operation, using the same in-memory preimage/postimage buffers that supplied the operation hashes. UTF-8 encoding of each JSON-decoded `content` string MUST reproduce its byte count and SHA-256; before/after hashes and output size MUST agree with the transaction. BOM, line endings, Unicode and spacing MUST remain intact. No hidden truncation or normalization is permitted.

Blocked and skipped paths MUST NOT receive invented postimages. Partial views MUST retain the complete transaction blocker/skip summary and explicitly avoid implying approval. Human display MUST distinguish source text from terminal controls and document rendering: numbered JSON-quoted lines expose controls/format characters and preserve line endings. The display itself is not the hashed byte stream. Full source content is sensitive local output, not default context or automatically published evidence. The standalone report schema is packaged with CanonTrail for report consumers; it does not add a persisted project artifact or require rewriting initialized project schemas.

### 5.2 Cross-platform operation

Windows, Linux and macOS are target platforms. Support claims MUST distinguish designed behavior, configured CI and actually executed revision-bound evidence. Tests MUST probe filesystem case, Unicode and link capabilities rather than infer them solely from the OS label; unavailable native capabilities remain visible and MUST NOT be reported as passing.

Migration path identity MUST include exact directory-entry spelling in addition to resolved containment because realpath may retain caller-supplied alias spelling on a case-insensitive filesystem. Portable artifact naming restrictions apply on every platform, without rewriting existing filenames. An atomic in-place POSIX replacement MUST preserve the existing basic rwx permission bits. The current byte-exact rollback contract does not promise restoration of ACLs, ownership, timestamps, xattrs or hard-link topology; these require separate safety evidence where relevant.

Repository configuration path selectors retain exact stored spelling on every host. Coverage validation MUST NOT invent a hidden migration subtree by lowercasing an exclusion that the scanner does not match. Existing fail-closed migration coverage and no-configuration-rewrite requirements remain in force.

## 6. External workflow compatibility

Compatibility adapters are read-only by default. Each adapter declares:

- stable adapter ID and supported layout/version range;
- detected roots and artifacts;
- artifact role such as specification, plan, requirements, roadmap, state, context, or summary;
- ownership as `external-tool`;
- whether a source is design or operational state;
- selectors for context inclusion;
- evidence that may be imported;
- an explicit canonical-promotion boundary.

Durable external evidence MAY be linked into a CanonTrail change record only as repository-relative provenance containing source system, artifact kind, external authority, exact content hash, and observation time. Discovery and linking are dry-run by default; apply requires an explicitly selected CanonTrail-owned `change.yaml`. CanonTrail MUST NOT copy the external content or modify its source file.

Artifact kinds retain different weight: an execution summary is an external claim, a verification report is verification evidence, a UAT record is human-acceptance evidence, and a review is review evidence. Linking any of them MUST NOT automatically pass a CanonTrail acceptance case, impact row, check, independent review, or canonical promotion gate. A validator MUST report missing or hash-stale linked sources.

### 6.1 Project-owned compact evidence

Project-owned observations MAY be recorded under `.agent-context/tasks/<task-id>/evidence/` as compact evidence records. Each record MUST identify one bounded claim, one independent result, its observation time and producer, one evidence kind, subject paths and SHA-256 identities, and its own payload hash. It references subject identity but MUST NOT copy full test, implementation, report, screenshot, or snapshot content into the record.

Evidence kinds are deliberately separate: `technical-test`, `technical-build`, `semantic-runtime`, `visual-render`, `screenshot`, and `data-safety-snapshot`. Their result is independently `pass`, `fail`, `inconclusive`, or `not-run`. A passing semantic runtime observation MUST NOT imply a passing rendered visual review; an inconclusive black screenshot MUST NOT erase an independently valid semantic result. Destructive runtime or emulator testing SHOULD reference a pre-test database, emulator, or equivalent safety snapshot when preservation matters.

Subject hashes are historical identities, not instructions to load those full subjects into the current context and not assertions that the current working-tree bytes still match. The record's schema, task ownership, references, and self-hash remain deterministically validated. A task or change that cites a task-owned evidence file makes that compact record required bounded context; the referenced subject source remains unloaded unless another selector independently requires it.

Files beneath the current task's `evidence/` directory are archival outputs by default. Listing one only in broad `file_intents` MUST produce a visible optional omission rather than selecting it merely because budget remains. A direct task/change `evidence_refs` citation, persistent `required_context_sources`, or explicit `--include` is a stronger review need and MUST still select the exact file as required context. CanonTrail defers but never deletes or rewrites the raw artifact.

The version-1 `record_hash` recipe is byte-exact. Remove `record_hash`, then construct the payload with properties in this order: `version`, `evidence_id`, `task_id`, `kind`, `status`, `claim`, `summary`, `observed_at`, `producer`, `subjects`, `references`. Within `producer`, use `tool`, `command`; within every subject, use `path`, `role`, `content_hash`. CanonTrail sorts subjects by path and references lexicographically before serialization. Serialize once with JavaScript `JSON.stringify` without spacing, encode the result as UTF-8, calculate SHA-256, lowercase the hexadecimal digest, and prefix it with `sha256:`. Object-property order is byte-significant in version 1. External producers that cannot preserve this recipe SHOULD use CanonTrail's recorder and verifier rather than hand-authoring the hash.

Before CanonTrail reads or writes a project-evidence path, lexical containment and resolved filesystem containment MUST both remain inside the repository. An in-repository symbolic link MUST NOT authorize reading, hashing, or writing an out-of-repository target.

### Superpowers

The default adapter recognizes `docs/superpowers/specs/` and `docs/superpowers/plans/`. Specs are external design material and plans are external execution instructions. CanonTrail MUST NOT rewrite either directory. Superpowers 5.x does not define a standard durable repository file for its code-review response; an adapter MUST report that absence instead of treating a plan or inferred path as review evidence.

### GSD Core

The default adapter recognizes `.planning/` and common artifacts such as `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `CONTEXT.md`, phase plans, summaries, `*-VERIFICATION.md`, `*-UAT.md`, and review reports. They remain GSD-owned operational/design state.

### GSD Pi

The initial detector recognizes `.gsd/` Markdown/JSON/YAML projections. Databases, caches, logs, credentials, and runtime internals MUST NOT be ingested as documentation.

Compatibility detection MUST degrade safely when an unknown version or partial layout is encountered. It reports what it found and does not guess destructive migrations.

## 7. Progressive context

A project MAY retain comprehensive durable knowledge about its stable features, systems, contracts, decisions, operations, and evidence. Progressive disclosure is the default: an agent works from a bounded view and follows routing metadata to deeper knowledge only when the task requires it.

| Level | Content | Default behavior |
|---|---|---|
| L0 | Governing instructions, task objective, acceptance criteria | Always include. |
| L1 | Relevant canonical documentation | Include by deterministic routing. |
| L2 | Relevant external spec/plan/state references | Include only for the owning task/workflow. |
| L3 | Exact target code, dependencies, and tests | Select on demand. |
| L4 | Latest handoff and compact failure evidence | Include when resuming or debugging. |
| L5 | Old plans, archived docs, and raw transcripts | Exclude by default. |

The compiler reserves output/tool budget and a separate input safety margin before adding sources. Required instructions, objective, acceptance criteria, relevant canonical truth, and directly cited task evidence MUST NOT be silently omitted.

Every context lock records exact paths and hashes, truth levels, external ownership where applicable, selection reasons, priority, token estimates, omissions, and whether raw transcripts were intentionally included.

The initial compiler uses this deterministic selector order:

1. require `AGENTS.md`, task `state.yaml`, and existing task `brief.md` or `change.yaml` at L0;
2. derive semantic task terms from the objective and acceptance criteria, then route indexed canonical and design-target documents at L1. A strong match requires either two or more distinct normalized terms within one `read_if_task_touches` entry, or a complete normalized `primary_systems` name with at least two distinct non-stop terms in one task sentence/criterion. Partial system-name fragments and matches pooled across separate metadata entries remain weak. Strong canonical matches are required; weak canonical plus all design-target matches remain optional;
3. require the exact `source_ref` at L2 when the task declares a detected Superpowers or GSD owner;
4. add task `required_context_sources` and explicit `--include` paths as required L3 sources and directly cited task evidence as required L4 context, then add existing task `file_intents` as optional L3 sources; uncited task-evidence file intents are archival omissions, and any existing file intent omitted by policy or budget MUST be exposed prominently in the human report and separately in the machine report;
5. add the task's latest handoff as optional L4 context;
6. exclude L5 history and raw transcripts.

Selection requires a fresh deterministic context index. Index regeneration preflights governed documents and schemas but does not let an expected stale prior lock block the new index; normal repository validation still checks every active lock. Sources are ordered by stable priority and path. The initial token estimate is `ceil(UTF-8 bytes / 4)`, with the output/tool reserve and input safety reserve subtracted before selection. New compilations default to a 1,024-token input safety reserve; callers MAY set another non-negative deterministic amount. Existing locks without the additive field remain readable with a historical safety value of zero. Space for every later required source is reserved before an optional source may be selected. If the complete required set does not fit, compilation MUST fail before replacing an existing lock. A path declared in `required_context_sources` MUST already exist as a supported, non-excluded repository text source; missing, unsafe, excluded, unsupported, or over-budget required sources fail before an existing lock is replaced. Missing, excluded, unsupported, planned, or over-budget optional candidates MUST appear in sorted omissions with a reason.

The chosen task-owned context-lock output MUST NOT be an input to the same compilation. Identity includes platform-equivalent path case and filesystem aliases of an existing output, not only literal path strings. A legacy `file_intents` entry that names that output is ignored and recorded as an explicit optional omission, whether or not an older lock already exists. Naming the output through `required_context_sources` or an explicit `--include` is a circular hard requirement and MUST fail before an existing lock is replaced.

Cross-task context-lock dependencies MUST remain acyclic. Before adding another task lock through `required_context_sources` or `--include`, the compiler traverses its recorded task-lock sources and fails before write if the chain returns to the current output. The same cycle reached only through optional `file_intents` is omitted with the deterministic dependency chain instead of failing the compilation. This rule prevents previous or mutually dependent lock bytes from making a replacement stale immediately; it does not rewrite historical locks or reject an acyclic one-way dependency.

Complete-system matching preserves lexical-unit boundaries: a name such as `InvoiceTotalsCalculator` is not a complete mention inside `InvoiceTotalsCalculatorProxy`. Normalization retains the existing ASCII CamelCase splitting followed by case folding and delimiter splitting; variants with the same resulting word sequence are equivalent. It does not reconstruct missing word boundaries in flattened all-lowercase/all-uppercase identifiers and MUST NOT concatenate across sentence or acceptance-criterion boundaries. Dotted qualified names remain intact when there is no sentence-separating whitespace. A complete single-term system remains weak under the existing two-term threshold. Natural-language routing entries still use flexible overlap, not exact phrase identity. These are lexical signals, not inference of ownership, synonyms, negation or semantic dependencies. Multiple documents declaring the same complete system remain eligible as strong matches; the compiler MUST NOT silently choose one owner. Weak candidates are still selected when budget allows. See `examples/context-routing/README.md`.

Automatic relevance MUST NOT arise solely from shared path prefixes, topic-ID prefixes, project names embedded in file intents, or documentation-impact paths. A weak canonical match remains visible and selectable when budget permits, but it is not reserved as mandatory context. A task MUST use `required_context_sources` when even a one-term or otherwise weakly routed source is unsafe to omit.

The machine and human compile reports group required source counts and estimated tokens into stable categories: governing/task artifacts, metadata-routed canonical truth, external workflow, explicit task/CLI requirements, cited task evidence, and other future required selectors. An over-budget failure MUST expose the same non-empty category totals rather than only one aggregate number.

`canontrail context compile` is dry-run by default. `--apply` writes only `.agent-context/tasks/<task-id>/context.lock.json`; it does not modify selected sources, external workflow artifacts, Git state, or remotes. A source records a Git blob only when its current Git-normalized bytes match `HEAD`; untracked or modified content uses `null` and remains identified by its current SHA-256 hash. A lock contains a hash of its complete payload. Active-lock validation checks that self-hash, every available selected source content hash, and compatibility with the current task-required context. Selected-source drift invalidates an active lock and requires the owner to inspect changes and recompile.

The recorded `context_index_hash` identifies the index used at compilation; it MUST NOT be silently rewritten. A different current index hash MAY remain compatible only after validation independently reconstructs the current index from governed documents, confirms that the stored index is exactly fresh, reloads the matching task, and proves that its current governing/task sources, explicit `required_context_sources`, and strongly metadata-routed canonical documents are already selected. Metadata routing MUST use the same matching rules as the compiler. Newly relevant or promoted canonical requirements missing from the selection MUST produce an actionable `LOCK008` with their paths. Missing task identity or an unavailable/inconsistent current index MUST fail closed.

Selected document authority MUST remain compatible with its selector: indexed-authority sources are checked against current governed metadata; deliberately historical cited-evidence and externally owned workflow classifications MUST NOT be confused with a document header. Lost governance of a metadata-routed selected document requires recompilation. All selected source hashes, including optional files, remain strict. Unselected optional additions, unrelated document edits, or peer task reports alone MUST NOT invalidate otherwise sufficient locks or cause peer-lock rewrites. These checks inspect a repository snapshot; they do not serialize agents or authorize concurrent edits to the same files. Exact saved-preview application remains stricter and still rejects any index identity drift. See `examples/parallel-context/README.md` for positive and negative cases.

Before applying a lock that contains an `unclassified` source, the compiler MUST verify that the target project's configured context-lock schema supports that additive value. An older unsynchronized schema fails visibly before replacing an existing lock. Existing locks remain valid and are not migrated or rewritten automatically.

Once task state is `verified`, `done`, or `superseded`, its lock is historical evidence. Repository validation continues to check its schema, budget, duplicate sources, required omissions, transcript disclosure, and self-hash, but MUST NOT compare it with the later context index or current working-tree bytes. It MUST NOT rewrite that lock. Task-scoped finalization is stricter: the named task's lock is checked as active/current even when the task has already been marked terminal, so completion cannot hide a stale final working view.

A JSON dry-run report MAY be saved as an exact preview. `canontrail context apply-preview` rechecks the preview's task identity, output ownership, complete self-hash, context index, Git base when present, and every selected source hash before writing the previewed lock bytes. It MUST fail without replacing the active lock when the preview or repository has drifted. This exact-apply path avoids creating a new timestamp and hash between safety review and application; a normal independent `compile --apply` remains a new compilation unless `--created-at` is fixed explicitly.

The first context lock is a bounded starting view, not a declaration that no other project knowledge exists. If work exposes a relevant dependency, uncertainty, contradiction, or failure outside that view, the agent MUST identify the narrow information need, follow the context index and document routing, add the exact source through task routing, `required_context_sources`, file intents, or an explicit include, and recompile before treating that source as active context. Use `required_context_sources` only for the small persistent set whose omission would make the task's working view unsafe; `file_intents` remains the broader and potentially partly planned change surface, while `--include` remains a one-compilation override. It MUST NOT respond by indiscriminately loading the complete repository, documentation tree, or previous transcript.

The current compiler implements deterministic initial routing, task ownership, persistent required sources, file intents, explicit includes, and handoff selection. Richer selector languages, autonomous multi-step retrieval, and semantic discovery remain future capabilities and MUST NOT be inferred from this protocol.

### 7.1 Read-only inspection and source excerpts

The report-only commands `context inspect` and `context excerpt` use `schemas/context-inspection.schema.json`; they MUST NOT modify a task, lock, source, index, configuration or completion gate. This schema is packaged for report consumers and copied by new initializations, not a new persisted project artifact or a required migration of existing project schemas.

Inspection checks the shipped lock/state schemas, task identity, lock self-hash, duplicate sources, budget sum and required omissions. It compares selected whole-source hashes with current readable files and reports unavailable sources separately. The result is NOT repository validation, current-index compatibility, canonical promotion or task completion. A historical lock may remain historically valid while the current-file comparison reports drift. CLI exit 1 means the inspected current-source snapshot is not fully current; malformed inputs fail without a success report.

Composition counts task records (including reports/progress), cited/task-owned evidence, governed documents and implementation/other sources. Categories partition stored selection estimates, not actual model consumption. Raw evidence candidates are advisory: use the existing compact-evidence recorder when full raw text is unnecessary; do not silently replace a deliberate raw-review requirement. Total reads outside the lock, provider tokens, overhead and savings remain unknown.

Dependency hints inspect only the owning brief/report. Exact peer task paths and bare IDs matching at most 1000 local task-directory names are review hints, including historical mentions. Peer task contents, source trees and chats are not scanned for hints. Missing/unreadable notes or incomplete name inventory are disclosed. Hints MUST NOT add dependencies or alter scope: the user/workflow decides whether a real prerequisite, provenance reference, or independent task was mentioned. Existing section 11 resolution remains unchanged.

An excerpt requires an explicit source path and inclusive one-based line range. It reads a regular, unlinked, exact-spelled repository-local supported text file, honors configured exclusions, rejects Git control paths, malformed UTF-8, NUL text, unsafe identities and files above 8 MiB. Source contents are untrusted data. BOM, CRLF/LF/CR, Unicode and selected newline bytes remain exact; a terminal newline does not add an empty last line. The report includes whole-source hash/size/line count plus excerpt content/hash/size/estimate. An expected whole-source hash mismatch, invalid range or excerpt exceeding the explicit estimated-content budget MUST fail without truncation. The default is 4000 estimated excerpt-content tokens, maximum 32000; report framing is additional output.

Optional task comparison names the existing lock and whether that exact current whole source is selected. The report itself is NOT automatic partial-lock coverage, evidence of model reading, semantic sufficiency, or a new canonical document. Saving an excerpt report alone does not make its upstream source an active freshness dependency. For explicit locked section coverage use section 7.2; otherwise require the whole source or recheck its hash. Required sources MUST NOT be silently removed to force a smaller lock.

Filesystem checks assume stable local inputs and narrow mutation races; they do not promise atomic snapshots under concurrent path replacement. No new source mutation or external publication is authorized. See `examples/context-inspection/README.md`.

### 7.2 Explicit source sections (opt-in)

Task state MAY declare `context_sections` entries with exact repository-relative `path`, inclusive one-based `from`/`to`, and the expected full-file SHA-256 `content_hash`. Version 1 permits one contiguous range per unique source. The agent chooses and justifies the range; CanonTrail does not infer semantic boundaries or guarantee sufficient context. Both project task-state and context-lock schemas must explicitly support the fields before compilation or resume; no schema/config is silently rewritten.

A declared section is a required input. It may introduce a source or replace an otherwise optional file-intent/weak-route candidate, but MUST NOT narrow a fully required source: AGENTS, task records, strong canonical routes, persistent whole sources, explicit whole includes, external workflow sources and directly cited task evidence retain whole-file coverage. Control/task artifacts under .agent-context cannot be sectioned. A conflicting request fails with an explicit explanation rather than silently widening, truncating or dropping an input.

Source identities use the exact spelling of each on-disk directory entry on every platform. A case alias accepted by Windows or a case-insensitive macOS/Linux volume MUST NOT become a second source identity. Distinct correctly spelled names on a case-sensitive volume remain distinct; implementations MUST NOT enforce identity by blanket lowercasing. Historical source paths are not retrospectively rewritten or re-resolved.

Schema preflight MUST check support for both lock selection fields (`line_ranges` and `selection_hash`) and task `context_sections`, and validate the prospective section lock and current task payload against the installed schemas before compile/apply/resume writes any output. A field name alone does not establish compatible validation. Incompatible or missing schemas fail explicitly without changing existing output or project configuration.

The selected lock source retains full-file `content_hash` and optional full-file `git_blob`. Its additional `line_ranges: [[from, to]]` and `selection_hash` identify exact selected UTF-8 bytes. Only `ceil(selected bytes / 4)` contributes to its estimated input tokens. The remainder is explicitly not selected even though the source path is present. Full-file sources omit both fields. This is not actual model-token telemetry; instructions, discovery reads and report framing remain additional work.

Section extraction rejects malformed UTF-8, NUL text, invalid/out-of-bounds ranges and sources above 8 MiB, preserving BOM and CRLF/LF/CR bytes. Any full-source change, even outside the chosen range, requires deliberate re-evaluation and a new hash/range before recompilation. It is not safe to update only the hash automatically. Active validation/apply/resume verify full hash, selected bytes/hash, range and token estimate, plus agreement with task state and full-source requirements. Historical locks retain immutable shape/self-hash validation and are not rewritten after unrelated future source changes. A fresh resume reads exact locked ranges instead of treating every read_order path as a whole-file instruction.

Git identity discovery is optional and performed only after budget selection. One base revision is captured; at most four per-source Git probes run concurrently against that revision. If no revision exists, per-source probes are skipped. Git retains responsibility for attribute/filter normalization; source SHA-256 remains independent. No process-count optimization relaxes drift checks or test deadlines.

Explicit current-use receiving-packet validation (resume validate --packet) MUST compare its archived receiving lock directly with current task-required whole sources and declared sections, even if the mutable active lock is valid or has since been independently recompiled. Correctly recomputed self-hashes do not authorize a different range, removal of selection fields, or narrowed/missing required sources. This check does not require the receiving archive to equal the latest active lock and does not rewrite the historical source-session archive. Human compile/inspection reports SHOULD display section paths, inclusive bounds, selected estimates and the explicitly unselected remainder.

Operational `resume validate` accepts packets only inside their `.agent-context/tasks/<task-id>/` owner. Historical, hand-written whole-file worked examples outside that operational tree retain repository-level structural validation, not current-task approval. Sectioned receiving artifacts outside an operational task cannot establish task policy and fail validation. Moving a live packet into examples is therefore not a way to obtain resume approval.

See `examples/context-sections/README.md` for byte-reproducible input and lock fields. See `docs/alpha-readiness.md` for this candidate's still-open review and platform gates; opt-in functionality is not an independent approval or a rollout to existing projects. Private historical review records are not part of this distribution.

## 8. Task and session continuity

The provider-neutral entrypoint SHOULD explain CanonTrail's capabilities and first determine whether the arriving session is starting a new task, resuming a validated handoff, continuing an unfinished documentation bootstrap, or performing documentation maintenance. Provider bridges SHOULD route to that entrypoint instead of duplicating these rules.

Task state MAY reference an external source system and source artifact. External task IDs are opaque strings; CanonTrail MUST NOT require another tool to adopt CanonTrail's ID format.

A checkpoint is required at task pause, agent/provider switch, external blocker, phase transition, explicit handoff, or pre-compaction trigger.

A handoff records objective, completed work, decisions and authority, changed/inspected files, checks and evidence, blockers, open questions, dirty-worktree disclosure, do-not-repeat guidance, resume sources, and one concrete next safe action.

`canontrail handoff create` compiles those fields from durable task state, the current task context lock, an optional structured checkpoint input, and local Git status. It is dry-run by default. Apply writes only the task-owned latest `handoff.yaml` and an immutable copy of the source session's exact context lock under task evidence. It does not update task state, compile receiving-session context, commit, push, create worktrees, or write external workflow artifacts.

Handoff and checkpoint creation require the target to be a readable local Git worktree because dirty-state disclosure is a required safety input. Validation of an already durable handoff and resume packet does not perform remote operations or require Git network access. Context compilation continues to degrade safely when Git identity is unavailable and records no Git blob/base claim in that case.

`canontrail checkpoint create` is the provider-neutral checkpoint entry point. It records the checkpoint trigger and optional source-provider provenance, then delegates to the same handoff creation and validation lifecycle. It does not create a second checkpoint truth artifact. The supported trigger vocabulary is pause, agent switch, provider switch, external blocker, phase transition, explicit handoff, and pre-compaction.

A provider adapter MAY map a documented lifecycle event to the provider-neutral command. The initial Claude Code adapter accepts only a `PreCompact` event, maps its session identity and manual/automatic trigger, checks that its working directory is inside the selected repository, and deliberately ignores the transcript path. The adapter MUST NOT read or summarize a transcript, invoke, delay, or block compaction, install a hook, edit provider settings, or infer missing semantic checkpoint content. In the absence of a documented lifecycle hook, a provider uses the explicit checkpoint command.

An existing latest handoff MUST NOT be replaced implicitly. Explicit replacement first verifies and archives the previous handoff by its self-hash. Handoff validation checks the schema, concrete next action, dirty-worktree disclosure, check evidence, resume references, task-directory ownership, handoff self-hash, and the archived source-context lock's task identity and self-hash. A receiving session validates the handoff and then compiles its own new context lock; the archived lock preserves what the source session actually used.

`canontrail resume create` performs that receiving-session transition deterministically. It requires a valid latest handoff, compiles the handoff as unomittable context, records the receiving session identity, rechecks every selected source immediately before apply, archives the exact receiving context lock by hash, updates the task's active context lock to the same bytes, and writes an immutable self-hashed resume packet under task evidence. The packet records the source and receiving locks, exact handoff, ordered sources, omissions, checkpoint guidance, and one provider-neutral bootstrap instruction.

Resume creation is dry-run by default. It MUST fail before changing the active lock when the handoff, source-session archive, required budget, selected source, immutable output, or cross-artifact identity is invalid. It MUST NOT include the old transcript, start or configure a provider, create a worktree, change Git history or remotes, or mutate project source and external workflow artifacts. Old packets continue to reference their immutable receiving-lock archives even after the active lock is later recompiled. Later source/task drift is a current-use failure, not corruption of an otherwise intact retained receipt; section 8.1 defines the separate validation purposes.

A fresh session SHOULD receive the governing instructions, relevant canonical documentation, external task reference, latest context lock, latest valid handoff, and exact code/test slice. It SHOULD NOT receive the full previous transcript.

### 8.1 Retained receipts versus current use

A persisted resume packet is an immutable receipt of one receiving context, not a standing authorization to use that context indefinitely. Validation purpose is supplied by the caller, never inferred from a packet-authored flag, an absent pointer, or terminal task status. No stored packet/state shape or lifecycle migration is required.

Repository validate, documentation audit, index preflight and finalize MUST check every governed packet for retained integrity and provenance. This mode MUST NOT compare historical selected source bytes or requirements with today's task/tree. Their disappearance or later legitimate edits are not corruption of the old receipt. A repository PASS is therefore NOT approval to consume any saved read_order. Current active-context-lock checks, task completion and all unrelated repository gates remain unchanged.

Retained integrity MUST include packet schema/self-hash, operational task identity, exact hash-derived owner paths for both context archives, archive schemas/task/hash bindings, receiving session/time, budget sums, duplicate sources, required omissions, transcript exclusion, section shape, read order and omissions. Historical selected paths are validated lexically without resolving their old identities against today's filesystem. The original required-source decision cannot be reconstructed from hashes alone; integrity is not producer authentication or proof of original semantic sufficiency.

The packet's handoff projection (including blockers, open questions and do-not-repeat guidance) and the receiving lock's whole-handoff source MUST bind both the handoff self-hash and its exact original byte hash. For retained integrity, an existing exact owning evidence/handoffs/<handoff-hash-hex>.yaml archive takes precedence; only if absent may the matching current handoff supply those bytes. A corrupted archive MUST NOT be hidden by falling back to latest. This permits retained provenance after replacement or removal of latest, including equal semantic hashes with differing YAML serialization. Missing or corrupt bound provenance still fails. Packets and source-session archives MUST NOT be rewritten to repair drift.

The explicit resume validate --packet request MUST additionally validate that exact governed operational packet for current use: current owning task schema and requirements, exact declared sections and full required sources against the receiving archive, current selected byte/range hashes, and the current owning latest handoff. It MUST NOT substitute the historical handoff archive or a valid mutable active lock for these checks. A terminal status, a recompiled active lock or consistently recomputed packet/archive self-hashes grants no exception. The targeted packet must participate in the governed scan, and referenced schema/provenance failures must remain visible in its own result.

Repository JSON reports declare resume_validation.purpose and current_use_packet_path (null for retained integrity); targeted reports declare validation_scope: current-use. Neither command mutates or retires receipts. Current-use approval is a snapshot check, not protection against subsequent concurrent filesystem mutation or authorization for the task's next action beyond the user's/workflow's grant. Non-operational whole-file examples remain structural illustrations, never resumable tasks. See examples/resume-history/README.md for the A/B continuation and rejection contract.

## 9. Canonical promotion

External workflow completion does not automatically update project truth. Promotion MUST:

1. identify the existing canonical destination;
2. reject competing topic ownership;
3. compare intended behavior with implementation and evidence;
4. update current behavior, metadata, date, and verification evidence;
5. preserve unimplemented intent as design target or history;
6. regenerate the context index;
7. validate references and supersession.

## 10. Documentation maintenance

The default weekly audit is report-first. It checks staleness, duplicate ownership, contradictions, broken evidence, orphaned handoffs/tasks, superseded drafts, external-layout drift, and context-index freshness.

Cleanup MUST NOT delete, rewrite, merge, or promote documentation without review. Deterministic safe fixes MAY be offered as explicit patches.

`canontrail docs status` summarizes governed-document counts by truth and verification level, configured freshness, task continuity, context-index state, and finding totals. `canontrail docs audit` returns the corresponding sorted findings with stable codes, severity, category, path, and related paths. Both commands are read-only and accept `--as-of YYYY-MM-DD` so recurring and test runs are reproducible.

Freshness thresholds come from `.agent-context/maintenance.yaml`. Missing policies use documented defaults for backward compatibility; malformed policies fail visibly. The initial defaults are 180 days for canonical truth, 90 for design targets, 30 for active snapshots and drafts, and no age limit for history. A project MAY override or disable each threshold explicitly. Future `stand` dates beyond the configured tolerance are reported separately.

### 10.1 Frozen synthetic examples (age only)

A maintainer MAY explicitly list immutable teaching inputs in optional `frozen_examples` maintenance entries containing an exact `path`, a raw-byte `content_hash` (`sha256:` plus 64 lowercase hex digits), and a meaningful `rationale`. No declaration is generated automatically by init. Omission and an empty list retain the existing behavior. A directory name alone grants no exception.

Eligible documents MUST be indexed Markdown under the literal `examples/` root, with `truth_level` of `active-snapshot` or `draft`. Canonical or design-target documentation and operational `.agent-context`/`.git` paths (including nested control components) MUST NOT qualify. Paths must use exact entry spelling, without traversal, globs or ambiguous separators. Linked ancestors, symlinks/junctions and multiply linked files are ineligible. Actual raw UTF-8 bytes must match both document discovery and the declared hash. Keep the repository stable during this read-only check; it is not an atomic filesystem transaction.

The exemption affects only age-based `DOCS101`. It does not change source bytes, `stand`, original truth/routing metadata, context hashes, task lifecycle, promotion, schema/reference checks, or future-date `DOCS102`. This is external maintenance metadata for an immutable example, not a historical task-state transition. A rebound example hash never repairs a stale context lock. Never designate live project instructions as synthetic input merely to suppress age findings.

Malformed declarations produce `MAINT001`; missing, changed, unindexed, wrongly classified or physically ineligible sources produce `MAINT002`. Validation reads this policy explicitly even when its path is excluded from the artifact inventory. An invalid declaration makes the policy fail closed: no listed example receives an age exemption. Normal errors remain blocking in validation and finalization. Audit/status reports expose the exact accepted examples and hashes; human audit output labels them `FROZEN [age-only]`. Future-dated sources are reported instead of being counted as exempt.

Hashes establish byte identity, not reviewer authenticity or publication permission. Policy changes require normal change-integrity and risk review. The shipped example in `examples/feature-save-schema/README.md` shows the narrow use case; whole-directory exclusions or altered historical locks are not substitutes.

Deterministic metadata can identify a contradiction candidate when non-historical documents share one `topic_id` but disagree on truth level, status, or verification state. This is a review signal, not a semantic contradiction verdict. Superseded-but-active documents and task directories without state, task state without a brief/change record, broken `latest_handoff`, and untracked latest handoffs are likewise reported rather than changed.

The audit normalizes only documented lifecycle vocabulary and reports task-state disagreement with the task brief, an exactly matching documentation-plan subsystem task ID, or an impossible task/change lifecycle combination. Equivalent states such as task `done`, brief `completed`, plan `completed`, and change `implemented` are not contradictions because implementation completion and independent change verification are separate gates. Unknown vocabulary is not guessed.

The audit also reports active legacy changes that have no documentation-structure decision and active decisions that explicitly require structural reassessment. These findings are migration and review signals. CanonTrail does not infer product features merely from branches, directory names, framework conventions, or the number of agents involved.

## 11. Required deterministic validators

Repository validation proves structural, schema, reference, hash, and deterministic lifecycle invariants. A structural validation PASS is not a claim that narrative statements, evidence recency, test reliability, or product semantics are current; those require audit findings, current evidence, and review.

- governed metadata and canonical-topic ownership;
- configured governed-path boundaries;
- broken references and evidence paths;
- context-lock schema, budget, duplicate source, and hash integrity;
- handoff completeness and dirty-worktree disclosure;
- retained resume-packet handoff/immutable-lock/session/read-order/hash integrity, plus current source/task compatibility only for explicitly requested current use;
- task-state schema, dependency cycles, and evidence completeness;
- change-record lifecycle, documentation-structure closure, ten-area impact coverage, acceptance evidence, terminology/visual checks, and review independence;
- external compatibility manifest conformance;
- stale deterministic context index.

`canontrail finalize` aggregates repository validation, documentation audit, and an optional task-completion gate into one deterministic report. Repository-only finalization is suitable for independent CI. Task finalization additionally requires the named task state, a bounded context lock with current selected sources and task-relevant index compatibility, verified change record, closed task acceptance criteria, and passing task checks with evidence. A task check MUST NOT invoke CanonTrail `finalize` itself; finalization is the terminal aggregator, and such a check is a circular dependency. Detection is command-aware: supported direct CLI forms and local npm, pnpm, yarn, or bun package-script chains are resolved, while narrative prose that merely discusses CanonTrail and finalization remains valid evidence text. The task records the underlying application tests, builds, reviews, or observations instead.

With `--task`, completion MUST distinguish task relevance from repository health. Only validator-classified `LOCK004` (changed selected source bytes) and `LOCK008` (changed task requirements against an independently reconstructed current index) belonging to unrelated active tasks MAY be deferred. The task directory, lock and state identities MUST agree. The named task, recursively declared local dependencies and peer task artifacts referenced by state, lock or either supported change-record spelling (`change.yaml` and `change.yml`) remain relevant. Both records contribute references when both exist. Unresolved identity/dependency scope MUST fall back to repository-wide strictness. Existing filesystem aliases (including case aliases, links and multiply linked files) MUST NOT make a selected peer appear unrelated: uncertain physical ownership retains global strictness. Distinct names on case-sensitive filesystems MUST NOT be conflated by lowercasing. Historical dependencies retain section 7's historical-lock rules; only the explicitly finalized task is reactivated for a current check.

Dependency discovery MUST inspect schema-defined references: task source/handoff/check evidence and documentation-impact paths, file intents and required sources; lock source paths and omission candidates; change canonical source, acceptance/impact/verification/review evidence, feature-document paths/evidence and external-evidence paths. Objective prose, command descriptions, worktree/owner metadata and selection explanations are not file references. Documentary references use the validator's `#fragment` semantics; selected filesystem paths remain literal, including real filenames containing `#`. Both forms retain physical-identity safeguards. Schema evolution requires revisiting this reference-field inventory and its completeness tests.

Interpretation is field-specific, not a blanket text heuristic. Task source/handoff/documentation-impact/file-intent/required-source declarations and omission candidates use compiler-style whitespace trimming; stored lock sources and feature/external artifact identities remain literal. Documentary canonical-source and evidence references retain validator fragment handling and external-URI treatment; a pure `#fragment` names no file. The compiler also consumes exact trimmed supported evidence files within the owning task's evidence directory (from state checks and `change.yaml`), so that actual identity must be checked as well. Feature updates/non-planned targets and external references also undergo the validator's reference check; both real consumer interpretations remain relevant when they differ. A literal selected `safe#part.ts` does not imply a reference to `safe`. Extensionless paths must not be skipped, and unsupported control characters in genuine reference fields require strict fallback rather than silent omission.

Deferral MUST NOT hide or rewrite findings: raw `repository.ok`, counts and diagnostics remain unchanged, and a failed `project-health` gate explicitly marks only those classified findings `blocking: false`. The additive `completion_scope` report lists the relevant tasks, fallback reason and deferred findings; its report-only contract and example are `schemas/finalize-scope.schema.json` and `examples/parallel-context/task-completion-scope.json`. Fresh initialization includes this report schema alongside the other shipped schemas, but no existing project configuration or stored task/lock artifact must be migrated. The only non-blocking failed gate is this task-scoped project-health gate. Schema, integrity, paths, missing sources, budget, required omissions, unknown findings, global-index failures, documentation audit and warning policy remain blocking under their normal rules. Open target acceptance, project checks or review gates still fail.

`canontrail validate` and `canontrail finalize` without `--task` MUST remain repository-wide and strict. A task PASS while project health fails is not integration, CI, release, migration or promotion permission. CI/release owners MUST also run repository-only finalization; the shipped GitHub action always runs it even when an optional task is supplied. GSD/Superpowers continue to own execution and scheduling. Shared-resource order and release guidance lives in `docs/parallel-work.md`, not in an automatic CanonTrail lock service.

Finalization is read-only by default. An explicit `--refresh-index` MAY rewrite only the deterministic context index after a structural preflight; it MUST NOT refresh context locks, change lifecycle status, execute arbitrary project commands, modify external workflow artifacts, or promote documentation. Selected-source drift or task-relevant index incompatibility exposed after refresh remains a failure in raw repository health, assessed for task completion by the scope rules above. The owning workflow must resolve it explicitly. An unrelated index update alone is assessed by section 7 and does not force an unchanged peer task to recompile.

Repository and documentation warnings are advisory by default for local inspection and remain owned by their respective report gate. A caller MAY use `--fail-on-warnings` as a strict workflow or CI boundary; it MUST explicitly fail either gate when that gate has warnings and MUST NOT rely on duplicated validator findings imported through another gate. The report MUST keep project-owned application tests and external workflow verification distinct from CanonTrail's deterministic gates.

An exception during the documentation-audit stage of finalization MUST yield a failed documentation gate with diagnostic `FINALIZE001`, overall `ok: false`, and `documentation: null`. Null means the audit report is unavailable, not that zero documents passed. The CLI emits its normal text or JSON failure report and exits nonzero, independent of warning policy. Successful reports keep their existing shape. This error boundary does not change repository validation, standalone audit behavior, other finalization stages, task completion predicates, or write authority.

## 12. Change integrity

A change record connects a decision to its complete implementation and evidence. It complements an external task or plan; it does not replace the workflow that owns planning or execution.

### 12.1 Applicability and lifecycle

A change is non-trivial when it changes observable behavior, a requirement, a data or public contract, canonical documentation, a compatibility promise, or more than one impact area. Such work MUST maintain `.agent-context/tasks/<task-id>/change.yaml` using `schemas/change-record.schema.json`.

Pure spelling, formatting, comment-only, generated-output, or mechanically equivalent refactors MAY omit the record only when they change none of those items. Uncertainty means the record is required.

The lifecycle is `idea` → `decided` or `rejected` → `implemented` → `verified` → `superseded`. Implementation MUST NOT begin from `idea`, except for emergency containment. A rejected or superseded record is immutable apart from provenance corrections; renewed work creates a new revision or a superseding record.

Emergency containment MAY precede a `decided` record only to reduce immediate harm. The agent MUST record the containment, known uncertainty, rollback path, and required backfill before claiming completion. Containment alone cannot reach `verified`.

### 12.2 Decision and acceptance

Before implementation, a `decided` record MUST identify the canonical requirement or decision source and state why the selected behavior is authoritative. It MUST include at least one acceptance case with:

- starting condition;
- expected result;
- failure or uncertainty behavior;
- a counterexample when one can distinguish an overly broad implementation;
- an oracle independent enough to determine whether the behavior is correct.

Passing tests prove only what their assertions encode. They do not prove that the requirement or oracle was correct.

### 12.3 Impact closure

Every `decided`, `implemented`, `verified`, or `superseded` record MUST classify exactly these ten areas: requirement, data/contracts, domain logic, tests/reference cases, example data, UI/API, documentation, diagrams/visuals, terminology, and operations/compatibility.

Each area is `affected`, `not-affected`, or `pending`. `not-affected` requires a concrete rationale. `affected` requires file or command evidence. A record cannot become `verified` while any area is pending, an acceptance case is not passing, a required check lacks evidence, or a critical item remains unverifiable.

When terminology is affected, verification MUST record the searched old/new terms and scope. When UI, diagrams, or other visual behavior is affected, verification MUST include rendered or observed visual evidence; source-code inspection alone is insufficient.

### 12.4 Documentation structure and feature-document lifecycle

Before the risk gate, every new decided non-trivial change MUST record one documentation-structure decision:

- `no-feature-document-change` — existing documentation granularity remains appropriate;
- `update-existing-feature-documents` — named feature documents must be updated;
- `create-feature-documents` — one or more named feature documents must be created;
- `reassess-documentation-structure` — the owning agent must resolve product boundaries before implementation can be declared complete.

The rationale MUST explain why the current product granularity remains suitable or what must change. Feature-document entries record a stable feature ID, `create` or `update`, repository-relative Markdown path, lifecycle state, and evidence references. Duplicate IDs are invalid.

Feature-document lifecycle is `planned` → `drafted` → `verified` → `promoted`. A document SHOULD be created as governed `truth_level: draft` with `verification.state: unverified` while implementation is in progress. An outstanding implementation or independent review MUST NOT prevent drafting. Conversely, a draft MUST NOT direct work as canonical truth.

An implemented change cannot retain `reassess-documentation-structure` or a merely `planned` feature document. A verified change requires every declared feature document to be `verified` or `promoted` with evidence. `promoted` remains a separate canonical update after the change verification gate; review and branch strategy do not create that state implicitly.

Validation cross-checks lifecycle claims with the referenced governed Markdown header. A newly created `drafted` feature document remains `truth_level: draft` and not document-verified; `verified` requires document verification state `verified` or `reviewed`; `promoted` additionally requires `truth_level: canonical`. A change entry marked `verified` while its document remains `draft/internally-reviewed` is invalid.

Change-record schema version 1 enforces this structure. Unversioned legacy records remain readable. While active, they receive a report-only migration finding rather than an automatic rewrite; completed legacy records are not retroactively invalidated.

Branch layout, the number of conversations or agents, and external workflow ownership MUST NOT determine whether a feature document exists. Product responsibility and independently understandable user behavior determine the boundary. Source-layout heuristics MAY only produce review candidates and MUST NOT create or promote feature documents automatically.

### 12.5 Risk and independent review

Risk is:

- `low`: local and readily reversible, with no user-visible or contract effect;
- `medium`: user-visible or multi-area, but bounded and reversible;
- `high`: cross-system, migration, security, data-loss, release, or difficult rollback exposure;
- `critical`: credible safety, security, irreversible data, or production-wide exposure.

High- and critical-risk changes MUST receive an independent review by a reviewer other than the author before `verified`. A human MAY waive the review only with recorded approver, rationale, and expiry where temporary. A reviewer MUST inspect the canonical source, acceptance oracle, impact decisions, diff, and evidence rather than relying only on the author's summary or the same tests.

### 12.6 Definition of done

`verified` is the completion gate. It requires the decided behavior to be implemented, documentation structure closed, all ten impact areas closed, acceptance and counterexample behavior checked against the stated oracle, terminology and visual checks where applicable, deterministic checks recorded, no unresolved unverifiable item, and risk-appropriate review. Canonical documentation promotion happens only after this gate.

Superpowers, GSD, or another workflow MAY own its spec, plan, tasks, reviews, worktrees, and execution. CanonTrail references those artifacts as read-only evidence and still owns the change-integrity record and canonical promotion decision.

After the owning workflow has executed its project-specific tests and reviews and the durable records reflect their evidence, it SHOULD run task-scoped `canontrail finalize`. A passing finalization report confirms that the recorded completion gates are structurally and deterministically closed; it does not prove the external test oracle, rerun application tests, or perform canonical promotion.

## 13. Protocol invariants

An implementation is non-conforming if it:

- treats an external plan, state file, summary, or model answer as canonical truth without promotion;
- overwrites files during adoption;
- resumes from only an opaque chat summary;
- hides omitted required context;
- marks documentation verified without evidence;
- marks a non-trivial change verified without closed impacts, acceptance evidence, and risk-appropriate review;
- creates a second canonical location for an existing topic;
- mutates Superpowers, GSD, or another adapter's source artifacts by default;
- requires one provider or execution methodology in the protocol core;
- treats the complete repository or documentation corpus as the default working context instead of a bounded view with controlled expansion;
- injects full historical transcripts by default.
