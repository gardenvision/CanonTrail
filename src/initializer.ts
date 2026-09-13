import { constants } from "node:fs";
import { access, mkdir, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify } from "yaml";
import { detectCompatibility, type CompatibilityReport } from "./compatibility.js";
import { generateContextIndex, normalizePath } from "./indexer.js";

export type InitProfile = "auto" | "generic" | "unity";
export type DocumentationMode = "none" | "baseline" | "full";

export interface InitOptions {
  adopt?: boolean;
  localOnly?: boolean;
  profile?: InitProfile;
  documentation?: DocumentationMode;
  ownedSourceRoots?: string[];
  documentationRoots?: string[];
  dryRun?: boolean;
}

export type InventoryRootKind = "documentation" | "owned-source" | "repository-fallback";
export type InventoryCoverageStatus = "complete" | "partial" | "unscanned";

export interface InventoryRootCoverage {
  kind: InventoryRootKind;
  path: string;
  status: InventoryCoverageStatus;
  files: number;
  bytes: number;
  documentationFiles: number;
  unscannedDirectories: number;
}

export interface InventoryOptions {
  maxFiles?: number;
  ownedSourceRoots?: string[];
  documentationRoots?: string[];
}

export interface ProjectInventory {
  profile: Exclude<InitProfile, "auto">;
  unityVersion?: string;
  fileLimit: number;
  totalFiles: number;
  totalBytes: number;
  documentationFiles: string[];
  documentationFileCount: number;
  ownedSourceRoots: string[];
  documentationRoots: string[];
  rootCoverage: InventoryRootCoverage[];
  topLevelCounts: Record<string, number>;
  extensionCounts: Record<string, number>;
  subsystemCandidates: string[];
  truncated: boolean;
  /** Directories matched by name against the exclude list; their contents were never entered or counted. */
  excludedDirectories: string[];
  excludedDirectoryCount: number;
  /**
   * Directories that were not excluded by name but were also never entered, because the inventory
   * budget was already exhausted by the time the walk reached them. Distinct from excludedDirectories:
   * these still need manual review before being trusted as "safely skipped".
   */
  unscannedDirectories: string[];
  unscannedDirectoryCount: number;
}

export interface InitFileResult {
  path: string;
  kind: string;
  action: "create" | "skip" | "conflict";
  detail?: string;
}

export interface InitReport {
  root: string;
  mode: "new" | "adopt";
  profile: Exclude<InitProfile, "auto">;
  localOnly: boolean;
  documentation: DocumentationMode;
  dryRun: boolean;
  ok: boolean;
  inventory: ProjectInventory;
  files: InitFileResult[];
  created: string[];
  skipped: string[];
  conflicts: string[];
  warnings: string[];
  safety: {
    remoteOperationsPerformed: false;
    commitsCreated: false;
    hooksInstalled: false;
    existingFilesOverwritten: false;
  };
}

interface IntendedFile {
  path: string;
  kind: string;
  content: string;
  proposeOnConflict?: boolean;
}

const SCHEMA_FILES = [
  "artifact-header.schema.json",
  "change-record.schema.json",
  "compatibility.schema.json",
  "context-inspection.schema.json",
  "context-lock.schema.json",
  "evidence-record.schema.json",
  "finalize-scope.schema.json",
  "handoff.schema.json",
  "maintenance.schema.json",
  "migration-plan.schema.json",
  "migration-content-preview.schema.json",
  "migration-execution.schema.json",
  "migration-transaction.schema.json",
  "resume-packet.schema.json",
  "task-state.schema.json",
] as const;

const UNIVERSAL_EXCLUDES = new Set([
  ".git",
  ".agent-context",
  ".gsd",
  ".idea",
  ".planning",
  ".vs",
  ".vscode",
  "coverage",
  "dist",
  "node_modules",
]);

const UNITY_EXCLUDES = new Set([
  "Build",
  "Builds",
  "Built",
  "Library",
  "Logs",
  "MemoryCaptures",
  "Obj",
  "Recordings",
  "Temp",
  "UserSettings",
]);

// Unity/IDE-generated project files that are regenerated from source on every open and never carry
// project-owned content. Matched by extension regardless of location, mirroring the "Unity-generated
// IDE project files" exclusion every real Unity project's .gitignore already carries.
const UNITY_GENERATED_FILE_EXTENSIONS = new Set([
  ".csproj",
  ".unityproj",
  ".sln",
  ".slnx",
  ".suo",
  ".user",
  ".userprefs",
  ".pidb",
  ".booproj",
  ".svd",
  ".pdb",
  ".mdb",
  ".opendb",
]);

const MAX_INVENTORY_FILES = 100_000;
const DOCUMENTATION_DIRECTORY_NAMES = new Set(["doc", "docs", "documentation"]);

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function sortedRecord(values: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...values].sort(([left], [right]) => left.localeCompare(right)));
}

function addCount(values: Map<string, number>, key: string): void {
  values.set(key, (values.get(key) ?? 0) + 1);
}

function pathIsWithin(relativePath: string, rootPath: string): boolean {
  return rootPath === "." || relativePath === rootPath || relativePath.startsWith(`${rootPath}/`);
}

async function normalizeInventoryRoots(
  root: string,
  values: string[],
  field: string,
  excluded: Set<string>,
): Promise<string[]> {
  const normalized: string[] = [];
  const seen = new Set<string>();
  const realRoot = await realpath(root);
  for (const rawValue of values) {
    const slashPath = rawValue.trim().replaceAll("\\", "/");
    if (!slashPath) throw new Error(`${field} must contain non-empty repository-relative directory paths`);
    if (path.isAbsolute(rawValue) || path.posix.isAbsolute(slashPath) || /^[a-zA-Z]:\//.test(slashPath)) {
      throw new Error(`${field} must be repository-relative: ${rawValue}`);
    }
    const candidate = path.posix.normalize(slashPath).replace(/^\.\//, "");
    if (candidate === "." || candidate === ".." || candidate.startsWith("../")) {
      throw new Error(`${field} must name a directory below the repository root: ${rawValue}`);
    }
    const segments = candidate.split("/");
    const excludedSegment = segments.find((segment) => excluded.has(segment.toLowerCase()));
    if (excludedSegment) {
      throw new Error(`${field} is inside excluded directory '${excludedSegment}': ${candidate}`);
    }
    const absolute = path.join(root, ...segments);
    let candidateStats;
    try {
      candidateStats = await stat(absolute);
    } catch {
      throw new Error(`${field} does not exist: ${candidate}`);
    }
    if (!candidateStats.isDirectory()) throw new Error(`${field} must name a directory: ${candidate}`);
    const realCandidate = await realpath(absolute);
    const relation = normalizePath(path.relative(realRoot, realCandidate));
    if (relation === ".." || relation.startsWith("../") || path.isAbsolute(relation)) {
      throw new Error(`${field} resolves outside the repository: ${candidate}`);
    }
    const key = process.platform === "win32" ? relation.toLowerCase() : relation;
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(relation);
    }
  }
  return normalized;
}

function isProjectDocumentation(relativePath: string, documentationRoots: string[]): boolean {
  const lower = relativePath.toLowerCase();
  if (!lower.endsWith(".md") || lower.startsWith("docs/superpowers/")) return false;
  const segments = lower.split("/");
  if (path.posix.basename(lower) === "readme.md") return true;
  if (segments.some((segment) => DOCUMENTATION_DIRECTORY_NAMES.has(segment))) return true;
  return documentationRoots.some((rootPath) => pathIsWithin(relativePath, rootPath));
}

async function detectProfile(root: string, requested: InitProfile): Promise<Exclude<InitProfile, "auto">> {
  if (requested !== "auto") return requested;
  const unityMarkers = ["Assets", "Packages", "ProjectSettings"];
  const markerStates = await Promise.all(unityMarkers.map((marker) => exists(path.join(root, marker))));
  return markerStates.every(Boolean) ? "unity" : "generic";
}

export async function inventoryProject(
  rootInput: string,
  requestedProfile: InitProfile = "auto",
  options: InventoryOptions = {},
): Promise<ProjectInventory> {
  const root = path.resolve(rootInput);
  const profile = await detectProfile(root, requestedProfile);
  const maxFiles = options.maxFiles ?? MAX_INVENTORY_FILES;
  const excluded = new Set(
    [...UNIVERSAL_EXCLUDES, ...(profile === "unity" ? UNITY_EXCLUDES : [])].map((entry) => entry.toLowerCase()),
  );
  const documentationRoots = await normalizeInventoryRoots(root, options.documentationRoots ?? [], "documentation root", excluded);
  const ownedSourceRoots = await normalizeInventoryRoots(root, options.ownedSourceRoots ?? [], "owned source root", excluded);
  const extensionCounts = new Map<string, number>();
  const topLevelCounts = new Map<string, number>();
  const documentationFiles = new Set<string>();
  const subsystemCandidates = new Set<string>();
  const excludedDirectories = new Set<string>();
  const unscannedDirectories = new Set<string>();
  const visitedDirectories = new Set<string>();
  const truncatedCoverage = new Set<string>();
  const coverageCounters = [
    ...documentationRoots.map((rootPath) => ({ kind: "documentation" as const, path: rootPath, files: 0, bytes: 0, documentationFiles: 0 })),
    ...ownedSourceRoots.map((rootPath) => ({ kind: "owned-source" as const, path: rootPath, files: 0, bytes: 0, documentationFiles: 0 })),
    { kind: "repository-fallback" as const, path: ".", files: 0, bytes: 0, documentationFiles: 0 },
  ];
  let totalFiles = 0;
  let totalBytes = 0;
  let truncated = false;
  let repositoryFallbackPhase = false;

  function directoryKey(directory: string): string {
    const resolved = path.resolve(directory);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  }

  function matchingCoverage(relativePath: string): typeof coverageCounters {
    return coverageCounters.filter((coverage) =>
      pathIsWithin(relativePath, coverage.path) &&
      (coverage.kind !== "repository-fallback" || repositoryFallbackPhase));
  }

  // Once the budget is exhausted, every directory that was already entered still finishes classifying
  // its immediate entries. This lets a large early subtree (for example Assets/) consume the budget
  // without hiding later generated siblings such as Library/, Build/, or Temp/. Recursion into a
  // reached non-excluded directory stops after truncation and that directory is recorded as unscanned.
  // Descendants of an unscanned directory remain unknown; the inventory therefore discloses a bounded
  // path sample plus the complete reached-directory count instead of claiming full-project discovery.
  async function walk(directory: string): Promise<void> {
    const currentKey = directoryKey(directory);
    if (visitedDirectories.has(currentKey)) return;
    visitedDirectories.add(currentKey);
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolutePath = path.join(directory, entry.name);
      const relativePath = normalizePath(path.relative(root, absolutePath));
      const segments = relativePath.split("/");
      if (entry.isDirectory()) {
        if (excluded.has(entry.name.toLowerCase())) {
          excludedDirectories.add(relativePath);
          continue;
        }
        if (visitedDirectories.has(directoryKey(absolutePath))) continue;
        if (truncated) {
          unscannedDirectories.add(relativePath);
          continue;
        }
        await walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (truncated) continue;
      const extension = path.extname(entry.name).toLowerCase() || "(none)";
      if (profile === "unity" && UNITY_GENERATED_FILE_EXTENSIONS.has(extension)) continue;
      totalFiles += 1;
      if (totalFiles > maxFiles) {
        truncated = true;
        for (const coverage of matchingCoverage(relativePath)) {
          truncatedCoverage.add(`${coverage.kind}:${coverage.path}`);
        }
        continue;
      }
      const fileStats = await stat(absolutePath);
      totalBytes += fileStats.size;
      addCount(topLevelCounts, segments.length > 1 ? segments[0] ?? "(root)" : "(root)");
      addCount(extensionCounts, extension);
      const lower = relativePath.toLowerCase();
      const documentation = isProjectDocumentation(relativePath, documentationRoots);
      if (documentation) documentationFiles.add(relativePath);
      for (const coverage of matchingCoverage(relativePath)) {
        coverage.files += 1;
        coverage.bytes += fileStats.size;
        if (documentation) coverage.documentationFiles += 1;
      }
      if (profile === "unity" && lower.endsWith(".asmdef")) {
        subsystemCandidates.add(path.basename(entry.name, path.extname(entry.name)));
      }
      if (profile === "unity" && segments[0] === "Assets" && segments[1] === "Scripts" && segments[2]) {
        subsystemCandidates.add(segments[2]);
      }
    }
  }

  for (const rootPath of [...documentationRoots, ...ownedSourceRoots]) {
    const absolute = path.join(root, ...rootPath.split("/"));
    if (visitedDirectories.has(directoryKey(absolute))) continue;
    if (truncated) {
      unscannedDirectories.add(rootPath);
      continue;
    }
    await walk(absolute);
  }
  repositoryFallbackPhase = true;
  await walk(root);
  let unityVersion: string | undefined;
  if (profile === "unity") {
    try {
      const versionText = await readFile(path.join(root, "ProjectSettings", "ProjectVersion.txt"), "utf8");
      unityVersion = versionText.match(/^m_EditorVersion:\s*(.+)$/m)?.[1]?.trim();
    } catch {
      // The markers are enough to select the profile; version discovery is optional.
    }
  }

  const rootCoverage: InventoryRootCoverage[] = coverageCounters.map((coverage) => {
    const coverageKey = `${coverage.kind}:${coverage.path}`;
    const relevantUnscanned = [...unscannedDirectories].filter((candidate) => pathIsWithin(candidate, coverage.path)).length;
    const absolute = coverage.path === "." ? root : path.join(root, ...coverage.path.split("/"));
    const started = visitedDirectories.has(directoryKey(absolute));
    const status: InventoryCoverageStatus = !started
      ? "unscanned"
      : truncatedCoverage.has(coverageKey) || relevantUnscanned > 0 || (coverage.kind === "repository-fallback" && truncated)
        ? "partial"
        : "complete";
    return {
      kind: coverage.kind,
      path: coverage.path,
      status,
      files: coverage.files,
      bytes: coverage.bytes,
      documentationFiles: coverage.documentationFiles,
      unscannedDirectories: relevantUnscanned,
    };
  });

  return {
    profile,
    ...(unityVersion ? { unityVersion } : {}),
    fileLimit: maxFiles,
    totalFiles: Math.min(totalFiles, maxFiles),
    totalBytes,
    documentationFiles: [...documentationFiles].sort((left, right) => left.localeCompare(right)).slice(0, 200),
    documentationFileCount: documentationFiles.size,
    ownedSourceRoots,
    documentationRoots,
    rootCoverage,
    topLevelCounts: sortedRecord(topLevelCounts),
    extensionCounts: sortedRecord(extensionCounts),
    subsystemCandidates: [...subsystemCandidates].sort((left, right) => left.localeCompare(right)).slice(0, 100),
    truncated,
    excludedDirectories: [...excludedDirectories].sort((left, right) => left.localeCompare(right)).slice(0, 500),
    excludedDirectoryCount: excludedDirectories.size,
    unscannedDirectories: [...unscannedDirectories].sort((left, right) => left.localeCompare(right)).slice(0, 500),
    unscannedDirectoryCount: unscannedDirectories.size,
  };
}

function governedHeader(topicId: string, date: string, systems: string[], taskTouches: string[]): string {
  return `---
topic_id: ${topicId}
stand: "${date}"
status: needs-discovery
truth_level: draft
verification:
  state: unverified
  evidence:
    - .agent-context/adoption-manifest.json
read_if_task_touches:
${taskTouches.map((entry) => `  - ${entry}`).join("\n")}
primary_systems:
${systems.map((entry) => `  - ${entry}`).join("\n")}
safe_to_edit:
  - Preserve verified findings and attach evidence when promoting claims.
do_not_use_instead: []
---`;
}

function overviewDocument(inventory: ProjectInventory, date: string): string {
  const extensions = Object.entries(inventory.extensionCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 12)
    .map(([extension, count]) => `- \`${extension}\`: ${count}`)
    .join("\n");
  const coverage = inventory.rootCoverage
    .map((entry) => `- \`${entry.kind}:${entry.path}\`: ${entry.status}; ${entry.files} files, ${entry.documentationFiles} documentation candidates`)
    .join("\n");
  return `${governedHeader("canontrail-project-overview", date, ["project"], ["project scope", "feature planning", "onboarding"])}

# Project overview

> Bootstrap draft. Inventory facts are generated mechanically; purpose, boundaries, and behavior still require review.

## Detected shape

- Profile: **${inventory.profile}**${inventory.unityVersion ? `\n- Unity editor: **${inventory.unityVersion}**` : ""}
- Scanned source files: **${inventory.totalFiles}**
- Scanned bytes: **${inventory.totalBytes}**
- Documentation candidates: **${inventory.documentationFileCount}**
- Inventory truncated: **${inventory.truncated ? "yes" : "no"}**

## Inventory root coverage

${coverage}

## Leading file types

${extensions || "- No files detected."}

## Discovery still required

- Confirm the product purpose and user-facing outcomes.
- Identify authoritative entry points and runtime boundaries.
- Replace inferred descriptions with code or test evidence.
`;
}

function architectureDocument(inventory: ProjectInventory, date: string): string {
  const topLevels = Object.entries(inventory.topLevelCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 20)
    .map(([name, count]) => `- \`${name}\`: ${count} files`)
    .join("\n");
  return `${governedHeader("canontrail-system-architecture", date, ["architecture"], ["architecture", "dependencies", "cross-system changes"])}

# Architecture

> Bootstrap draft. Directory counts are evidence; architectural roles are not yet verified.

## Top-level inventory

${topLevels || "- No source areas detected."}

## Required discovery

- Map runtime entry points, dependency direction, persistence, and external interfaces.
- Record invariants next to the subsystem that owns them.
- Add evidence references before changing this document from \`draft\`.
`;
}

function systemsDocument(inventory: ProjectInventory, date: string): string {
  const systems = inventory.subsystemCandidates.length
    ? inventory.subsystemCandidates.map((name) => `- [ ] Investigate \`${name}\`; assign an owner, boundaries, dependencies, and tests.`).join("\n")
    : "- [ ] Discover subsystem boundaries from source entry points and dependency declarations.";
  return `${governedHeader("canontrail-subsystem-catalog", date, ["subsystems"], ["system ownership", "implementation tasks"])}

# Subsystem catalog

> Candidate list only. A checked item means its documentation was reviewed against source evidence.

${systems}
`;
}

function featuresDocument(date: string): string {
  return `${governedHeader("canontrail-feature-catalog", date, ["product features"], ["feature planning", "user outcomes", "documentation structure"])}

# Feature catalog

> Bootstrap draft. Product features are user-facing capabilities, not branches or source directories. Add a feature document only after reviewing product ownership and existing canonical locations.

## When a feature document is useful

- The capability has an independently understandable user outcome or lifecycle.
- Multiple changes repeatedly modify the same capability.
- Its behavior no longer fits clearly in the project overview or a cross-cutting workflow document.
- A fresh contributor needs one bounded product view that links to architecture, data, tests, and operations without duplicating them.

## Structure review queue

- [ ] Identify stable user-facing capabilities from requirements, observed behavior, and implementation evidence.
- [ ] Keep architecture, shared data contracts, testing strategy, and operations in their existing cross-cutting truth locations.
- [ ] Create feature documents as \`truth_level: draft\` with \`verification.state: unverified\` before implementation completion when the current change requires them.
- [ ] Promote a verified feature document only after the owning change passes its evidence and review gates.
`;
}

function genericDraft(topicId: string, title: string, date: string, sections: string[]): string {
  return `${governedHeader(topicId, date, [topicId.replace(/^canontrail-/, "")], [title.toLowerCase()])}

# ${title}

> Bootstrap draft. Complete each section with source or test evidence before promotion.

${sections.map((section) => `## ${section}\n\n- [ ] Discover and verify.`).join("\n\n")}
`;
}

function agentsDocument(date: string, profile: ProjectInventory["profile"], localOnly: boolean): string {
  const unityRules = profile === "unity"
    ? `\n## Unity safety\n\n- Treat \`Library/\`, \`Temp/\`, \`Obj/\`, \`Logs/\`, \`Build/\`, \`Builds/\`, \`UserSettings/\`, and \`MemoryCaptures/\` as generated and out of scope.\n- Keep CanonTrail artifacts outside \`Assets/\`; do not move them into Unity's import tree.\n- Inspect text source and metadata first. Do not load or rewrite large binary assets for documentation discovery.\n`
    : "";
  return `---
topic_id: canontrail-agent-entrypoint
stand: "${date}"
status: active
truth_level: design-target
verification:
  state: structurally-reviewed
  evidence:
    - .agent-context/adoption-manifest.json
read_if_task_touches:
  - all repository work
primary_systems:
  - canontrail
safe_to_edit:
  - Keep provider-neutral rules here and provider bridges thin.
do_not_use_instead: []
---

# CanonTrail agent instructions

CanonTrail preserves comprehensive, hierarchical project knowledge while giving each task the smallest sufficient, reproducible working view. It provides canonical documentation, task context locks, evidence continuity, handoffs, and maintenance reports; it does not plan or execute the project for you.

## Start every session

- Read \`.agent-context/config.yaml\` and \`.agent-context/documentation-plan.yaml\` first.
- Determine whether this is a new task, a resumed task with a handoff, unfinished documentation bootstrap, or documentation maintenance.
- For a new task, create or update its durable task record with objective, scope, dependencies, acceptance criteria, and intended sources before implementation.
- For a resumed task, validate the handoff and follow its next safe action before recompiling the receiving session's context.
- For unfinished documentation bootstrap, derive product boundaries and features from project evidence and review; do not invent hard-coded feature names or treat source folders as product truth.
- Load only the governed documents, exact code, tests, and evidence relevant to the task. If a new dependency, uncertainty, contradiction, or failure appears, add the narrow source and recompile the context lock instead of reading the complete repository or documentation tree.

## Safety boundary

- CanonTrail initialization and maintenance never push, fetch, publish, create remotes, commit, install hooks, or create worktrees automatically.
${localOnly ? "- This project is local-only: do not perform remote Git or hosting operations unless a human explicitly changes that policy.\n" : "- Remote Git operations always require an explicit human request; they are never implied by CanonTrail tasks.\n"}- Never overwrite an existing project file during adoption. Surface conflicts for human merging.
${unityRules}
## Documentation discipline

- Treat bootstrap documents marked \`draft\` and \`unverified\` as discovery queues, not established truth.
- Treat Superpowers, GSD, and other workflow artifacts as externally owned inputs. Do not rewrite them or silently promote them to canonical documentation.
- At the start of a task, record its objective, scope, dependencies, acceptance criteria, and context sources.
- Before implementing or resuming a task, run canontrail context compile . --task <task-id> --apply; recompile after selected sources change or validation reports task-relevant index changes; unrelated index updates alone do not require rewriting a valid lock.
- Before implementing a non-trivial change, create or update the task's change.yaml; do not implement an idea as if it were decided.
- For every decided non-trivial change, record whether feature documentation is unchanged, updated, created, or structurally reassessed. Draft required feature documents during implementation; do not wait for canonical promotion review.
- Close requirement, data/contracts, domain logic, tests/reference cases, example data, UI/API, documentation, diagrams/visuals, terminology, and operations/compatibility before marking the change verified.
- High- and critical-risk changes require an independent reviewer other than the author, or a recorded human waiver.
- During work, record decisions, changed files, checks, blockers, and evidence as they occur.
- Before compaction, pause, blocker, phase transition, or changing agent/session/provider, update the structured checkpoint input and run canontrail checkpoint create with the next safe action and uncommitted-work summary.
- After applying a handoff/checkpoint, ensure state.yaml sets latest_handoff to .agent-context/tasks/<task-id>/handoff.yaml and recompile the active context after updating state; creation does not edit task state, and archived source locks stay unchanged.
- Provider checkpoint adapters may validate documented lifecycle events, but must not read transcripts, control compaction, install hooks, or edit provider settings.
- Once per week, run canontrail docs audit . using \`.agent-context/maintenance.yaml\`; findings never authorize cleanup, archival, or promotion without review.
- Before claiming a task complete, run the project-owned tests and reviews, record their evidence, run \`canontrail index .\`, recompile the task context lock, and run \`canontrail finalize . --task <task-id> --fail-on-warnings\`.
- Promote documentation to canonical only after evidence-backed review. Finalization never performs canonical promotion or application-specific tests automatically.
`;
}

function configDocument(inventory: ProjectInventory, localOnly: boolean, documentation: DocumentationMode): string {
  const profile = inventory.profile;
  const excludes = [
    ".git",
    "node_modules",
    "dist",
    "coverage",
    ".agent-context/generated",
    ".planning",
    ".gsd",
    "docs/superpowers",
    "CLAUDE.md",
    "GEMINI.md",
    ".github/copilot-instructions.md",
    ".cursor/rules",
    ...(profile === "unity" ? [...UNITY_EXCLUDES] : []),
  ];
  return stringify({
    version: 1,
    index_path: ".agent-context/context-index.json",
    schema_path: ".agent-context/schemas",
    governed_paths: ["docs/canontrail", ".agent-context/tasks", ".agent-context/migrations", ".agent-context/compatibility.yaml"],
    exclude_paths: excludes,
    require_frontmatter_for_all_markdown: true,
    require_topic_id_for_canonical: true,
    allow_missing_references: [],
    project: { profile, local_only: localOnly },
    execution: {
      remote_operations: localOnly ? "disabled" : "explicit-human-request-only",
      worktrees: profile === "unity" || localOnly ? "manual-disabled-by-default" : "manual",
      hooks: "not-installed",
    },
    documentation: { root: "docs/canontrail", bootstrap_mode: documentation },
    discovery: {
      documentation_roots: inventory.documentationRoots,
      owned_source_roots: inventory.ownedSourceRoots,
      priority_order: ["documentation_roots", "owned_source_roots", "repository_fallback"],
      inventory_file_limit: inventory.fileLimit,
    },
  });
}

function compatibilityDocument(report: CompatibilityReport, date: string): string {
  return stringify({
    version: 1,
    generated: date,
    policy: {
      external_artifacts_are_read_only: true,
      external_artifacts_are_canonical: false,
      canonical_promotion_is_explicit: true,
    },
    integrations: report.integrations.map((integration) => ({
      id: integration.id,
      detected: integration.detected,
      roots: integration.roots,
      artifact_count: integration.artifacts.length,
    })),
  });
}

function documentationPlan(inventory: ProjectInventory, date: string, mode: DocumentationMode): string {
  const subsystemTasks = inventory.subsystemCandidates.map((system, index) => ({
    id: `DOC-SYS-${String(index + 1).padStart(3, "0")}`,
    system,
    status: "planned",
    required_evidence: ["source entry points", "dependency declarations", "tests or runtime checks"],
  }));
  return stringify({
    version: 1,
    created: date,
    mode,
    status: mode === "none" ? "not-requested" : "bootstrap-required",
    policy: {
      generated_docs_begin_as: "draft/unverified",
      feature_documents_begin_as: "draft/unverified",
      structure_review_required_for: "every non-trivial change",
      canonical_promotion_requires: ["source evidence", "cross-check", "human or designated reviewer approval"],
      one_giant_summary: "forbidden",
    },
    phases: [
      { id: "DOC-001", title: "Mechanical inventory", status: "completed", evidence: [".agent-context/adoption-manifest.json"] },
      { id: "DOC-002", title: "Subsystem discovery", status: "planned", depends_on: ["DOC-001"] },
      { id: "DOC-003", title: "Product-feature boundary and documentation-structure review", status: "planned", depends_on: ["DOC-002"] },
      { id: "DOC-004", title: "Evidence-backed subsystem and feature drafts", status: "planned", depends_on: ["DOC-003"] },
      { id: "DOC-005", title: "Cross-system review and contradiction check", status: "planned", depends_on: ["DOC-004"] },
      { id: "DOC-006", title: "Approve and promote canonical truth", status: "planned", depends_on: ["DOC-005"] },
    ],
    subsystem_tasks: subsystemTasks,
  });
}

function maintenanceDocument(date: string): string {
  return stringify({
    version: 1,
    created: date,
    cadence: "weekly",
    mode: "report-first",
    remote_required: false,
    stale_after_days: {
      canonical: 180,
      "design-target": 90,
      "active-snapshot": 30,
      draft: 30,
      historical: null,
    },
    future_date_tolerance_days: 1,
    checks: [
      "stale documents",
      "duplicate topic ownership",
      "contradiction candidates",
      "broken evidence and file references",
      "orphaned task and handoff artifacts",
      "active changes missing documentation-structure decisions",
      "superseded drafts safe to archive",
      "context index freshness",
    ],
    mutation_policy: "Never delete, rewrite, merge, archive, or promote documentation without review.",
  });
}

function manifestDocument(
  inventory: ProjectInventory,
  date: string,
  mode: "new" | "adopt",
  localOnly: boolean,
  documentation: DocumentationMode,
): string {
  return `${JSON.stringify({
    version: 1,
    initialized_on: date,
    mode,
    profile: inventory.profile,
    local_only: localOnly,
    documentation_mode: documentation,
    inventory,
    safety: {
      remote_operations_performed: false,
      commits_created: false,
      hooks_installed: false,
      worktrees_created: false,
      existing_files_overwritten: false,
    },
  }, null, 2)}\n`;
}

async function intendedFiles(
  root: string,
  inventory: ProjectInventory,
  date: string,
  mode: "new" | "adopt",
  localOnly: boolean,
  documentation: DocumentationMode,
): Promise<IntendedFile[]> {
  const compatibility = await detectCompatibility(root);
  const files: IntendedFile[] = [
    { path: ".agent-context/config.yaml", kind: "configuration", content: configDocument(inventory, localOnly, documentation) },
    { path: ".agent-context/adoption-manifest.json", kind: "inventory", content: manifestDocument(inventory, date, mode, localOnly, documentation) },
    { path: ".agent-context/documentation-plan.yaml", kind: "documentation-plan", content: documentationPlan(inventory, date, documentation) },
    { path: ".agent-context/maintenance.yaml", kind: "maintenance-policy", content: maintenanceDocument(date) },
    { path: ".agent-context/compatibility.yaml", kind: "compatibility-manifest", content: compatibilityDocument(compatibility, date) },
    { path: "AGENTS.md", kind: "provider-entrypoint", content: agentsDocument(date, inventory.profile, localOnly), proposeOnConflict: true },
    { path: "CLAUDE.md", kind: "provider-bridge", content: "@AGENTS.md\n", proposeOnConflict: true },
    { path: "GEMINI.md", kind: "provider-bridge", content: "@AGENTS.md\n", proposeOnConflict: true },
    {
      path: ".github/copilot-instructions.md",
      kind: "provider-bridge",
      content: "Follow the repository-wide instructions in `AGENTS.md`. Read the relevant `docs/canontrail/` files before editing and preserve CanonTrail evidence and handoff rules.\n",
      proposeOnConflict: true,
    },
    {
      path: ".cursor/rules/canontrail.mdc",
      kind: "provider-bridge",
      content: "---\ndescription: CanonTrail repository protocol\nalwaysApply: true\n---\n\nRead and follow @AGENTS.md. Load only the relevant governed documents from `docs/canontrail/` and keep task evidence and handoffs current.\n",
      proposeOnConflict: true,
    },
  ];

  for (const schemaFile of SCHEMA_FILES) {
    const source = new URL(`../schemas/${schemaFile}`, import.meta.url);
    files.push({
      path: `.agent-context/schemas/${schemaFile}`,
      kind: "protocol-schema",
      content: await readFile(source, "utf8"),
    });
  }

  if (documentation !== "none") {
    files.push(
      { path: "docs/canontrail/project-overview.md", kind: "bootstrap-documentation", content: overviewDocument(inventory, date) },
      { path: "docs/canontrail/architecture.md", kind: "bootstrap-documentation", content: architectureDocument(inventory, date) },
      { path: "docs/canontrail/systems/README.md", kind: "bootstrap-documentation", content: systemsDocument(inventory, date) },
    );
  }
  if (documentation === "full") {
    files.push(
      { path: "docs/canontrail/features/README.md", kind: "bootstrap-documentation", content: featuresDocument(date) },
      { path: "docs/canontrail/workflows.md", kind: "bootstrap-documentation", content: genericDraft("canontrail-workflows", "Workflows", date, ["Primary user flows", "Background processing", "Failure and recovery paths"]) },
      { path: "docs/canontrail/data-and-assets.md", kind: "bootstrap-documentation", content: genericDraft("canontrail-data-assets", "Data and assets", date, ["Persistent data", "Schemas and migrations", "Large and generated assets"]) },
      { path: "docs/canontrail/testing.md", kind: "bootstrap-documentation", content: genericDraft("canontrail-testing", "Testing", date, ["Test layers", "Critical regression cases", "Manual verification"]) },
      { path: "docs/canontrail/operations.md", kind: "bootstrap-documentation", content: genericDraft("canontrail-operations", "Operations", date, ["Build and release", "Configuration", "Diagnostics and recovery"]) },
    );
  }
  return files;
}

function proposedPath(relativePath: string): string {
  return `.agent-context/generated/bridges/${relativePath.replace(/[\\/]/g, "__")}.proposed`;
}

async function resolveFiles(root: string, intended: IntendedFile[]): Promise<{ results: InitFileResult[]; creates: IntendedFile[] }> {
  const results: InitFileResult[] = [];
  const creates: IntendedFile[] = [];
  for (const file of intended) {
    const absolutePath = path.join(root, ...file.path.split("/"));
    if (!(await exists(absolutePath))) {
      results.push({ path: file.path, kind: file.kind, action: "create" });
      creates.push(file);
      continue;
    }
    const existing = await readFile(absolutePath, "utf8");
    if (existing === file.content) {
      results.push({ path: file.path, kind: file.kind, action: "skip", detail: "already identical" });
      continue;
    }
    results.push({ path: file.path, kind: file.kind, action: "conflict", detail: "existing file preserved" });
    if (file.proposeOnConflict) {
      const proposal: IntendedFile = {
        path: proposedPath(file.path),
        kind: "merge-proposal",
        content: file.content,
      };
      const proposalAbsolute = path.join(root, ...proposal.path.split("/"));
      if (!(await exists(proposalAbsolute))) {
        results.push({ path: proposal.path, kind: proposal.kind, action: "create", detail: `merge proposal for ${file.path}` });
        creates.push(proposal);
      } else if ((await readFile(proposalAbsolute, "utf8")) === proposal.content) {
        results.push({ path: proposal.path, kind: proposal.kind, action: "skip", detail: "proposal already identical" });
      } else {
        results.push({ path: proposal.path, kind: proposal.kind, action: "conflict", detail: "existing proposal also preserved" });
      }
    }
  }
  return { results, creates };
}

function isMeaningfullyNonEmpty(inventory: ProjectInventory): boolean {
  return inventory.totalFiles > 0;
}

/**
 * Human-readable warnings derived purely from a completed inventory, kept separate from
 * initializeProject so the unscanned-directory disclosure can be unit tested without a filesystem
 * fixture large enough to trip the real inventory budget.
 */
export function inventoryWarnings(inventory: ProjectInventory): string[] {
  const warnings: string[] = [];
  if (inventory.truncated) {
    warnings.push(`inventory stopped after ${inventory.fileLimit} files; split later discovery by subsystem`);
  }
  if (inventory.unscannedDirectoryCount > 0) {
    const preview = inventory.unscannedDirectories.slice(0, 10).join(", ");
    const more = inventory.unscannedDirectoryCount > 10 ? `, +${inventory.unscannedDirectoryCount - 10} more` : "";
    const count = inventory.unscannedDirectoryCount;
    const pronoun = count === 1 ? "it" : "them";
    warnings.push(
      `${count} director${count === 1 ? "y was" : "ies were"} never scanned because the inventory budget ran out before reaching ${pronoun}; verify manually whether they need exclusion: ${preview}${more}`,
    );
  }
  return warnings;
}

export async function initializeProject(rootInput: string, options: InitOptions = {}): Promise<InitReport> {
  const root = path.resolve(rootInput);
  const mode = options.adopt ? "adopt" : "new";
  const localOnly = options.localOnly ?? false;
  const dryRun = options.dryRun ?? false;
  const profileOption = options.profile ?? "auto";
  if (!(await exists(root))) {
    throw new Error(`project root does not exist: ${root}`);
  }
  const inventory = await inventoryProject(root, profileOption, {
    ownedSourceRoots: options.ownedSourceRoots ?? [],
    documentationRoots: options.documentationRoots ?? [],
  });
  if (mode === "new" && isMeaningfullyNonEmpty(inventory)) {
    throw new Error("project is not empty; use 'canontrail init --adopt' to preserve and document an existing project");
  }
  const documentation = options.documentation ?? (mode === "adopt" && inventory.documentationFileCount === 0 ? "full" : "baseline");
  const date = new Date().toISOString().slice(0, 10);
  const intended = await intendedFiles(root, inventory, date, mode, localOnly, documentation);
  const resolved = await resolveFiles(root, intended);
  const warnings: string[] = [...inventoryWarnings(inventory)];
  const configConflict = resolved.results.some((file) => file.path === ".agent-context/config.yaml" && file.action === "conflict");
  if (configConflict) {
    warnings.push("existing CanonTrail configuration was preserved; merge configuration manually before validation");
  }
  const conflicts = resolved.results.filter((file) => file.action === "conflict").map((file) => file.path);
  if (conflicts.length > 0) {
    warnings.push("existing files were preserved; review generated bridge proposals where available");
  }
  const created: string[] = [];
  if (!dryRun) {
    for (const file of resolved.creates) {
      const absolutePath = path.join(root, ...file.path.split("/"));
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, file.content, { encoding: "utf8", flag: "wx" });
      created.push(file.path);
    }
    const indexPath = path.join(root, ".agent-context", "context-index.json");
    if (!configConflict && !(await exists(indexPath))) {
      try {
        const result = await generateContextIndex(root, { exclusive: true });
        created.push(result.path);
        resolved.results.push({ path: result.path, kind: "context-index", action: "create" });
      } catch (error) {
        warnings.push(`context index was not generated: ${(error as Error).message}`);
      }
    } else if (await exists(indexPath)) {
      resolved.results.push({ path: ".agent-context/context-index.json", kind: "context-index", action: "skip", detail: "existing index preserved" });
    }
  } else {
    resolved.results.push({ path: ".agent-context/context-index.json", kind: "context-index", action: "create", detail: "generated after scaffold files" });
  }

  const skipped = resolved.results.filter((file) => file.action === "skip").map((file) => file.path);
  return {
    root,
    mode,
    profile: inventory.profile,
    localOnly,
    documentation,
    dryRun,
    ok: conflicts.length === 0 && !configConflict,
    inventory,
    files: resolved.results,
    created,
    skipped,
    conflicts,
    warnings,
    safety: {
      remoteOperationsPerformed: false,
      commitsCreated: false,
      hooksInstalled: false,
      existingFilesOverwritten: false,
    },
  };
}

export function formatInitReport(report: InitReport): string {
  const verb = report.dryRun ? "Would initialize" : "Initialized";
  const lines = [
    `${verb} ${report.root} (${report.mode}, ${report.profile}, documentation=${report.documentation}${report.localOnly ? ", local-only" : ""}).`,
    `${report.dryRun ? "Planned" : "Created"}: ${report.files.filter((file) => file.action === "create").length}; skipped: ${report.skipped.length}; conflicts: ${report.conflicts.length}.`,
    "Safety: no remote operations, commits, hooks, worktrees, or overwrites.",
  ];
  for (const coverage of report.inventory.rootCoverage) {
    if (coverage.kind === "repository-fallback" && report.inventory.ownedSourceRoots.length === 0 && report.inventory.documentationRoots.length === 0) continue;
    const files = `${coverage.files} file${coverage.files === 1 ? "" : "s"}`;
    const documentationCandidates = `${coverage.documentationFiles} documentation candidate${coverage.documentationFiles === 1 ? "" : "s"}`;
    const unscannedDirectories = `${coverage.unscannedDirectories} unscanned director${coverage.unscannedDirectories === 1 ? "y" : "ies"}`;
    lines.push(
      `Coverage ${coverage.kind}:${coverage.path}: ${coverage.status}; ${files}, ${documentationCandidates}, ${unscannedDirectories}.`,
    );
  }
  for (const conflict of report.conflicts) lines.push(`CONFLICT ${conflict}: existing file preserved`);
  for (const warning of report.warnings) lines.push(`WARN ${warning}`);
  if (report.documentation === "full") {
    lines.push("A staged full-project documentation campaign was created; bootstrap documents remain draft/unverified until evidence review.");
  }
  return lines.join("\n");
}
