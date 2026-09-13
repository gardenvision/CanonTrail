import { access, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { safeRepositoryFile } from "./context-source-path.js";
import { assertSectionContextSchemas } from "./context-schema.js";
import path from "node:path";
import { matchingGitBlobs, readGitValue as gitValue } from "./context-git.js";
import { parseContextSections, selectContextSection, validateLockedSection, type ContextSection } from "./context-sections.js";
import { parse } from "yaml";
import { detectCompatibility, type IntegrationId } from "./compatibility.js";
import { loadConfig } from "./config.js";
import { isIsoDateTime } from "./date-time.js";
import {
  buildContextIndex,
  discoverMarkdown,
  normalizePath,
  sha256,
} from "./indexer.js";
import type {
  CanonTrailConfig,
  ContextIndex,
  ContextIndexDocument,
  GovernedHeader,
} from "./types.js";

const INTEGRATION_IDS = new Set<IntegrationId>(["superpowers", "gsd-core", "gsd-pi"]);
const TEXT_EXTENSIONS = new Set([
  ".c", ".cc", ".cpp", ".cs", ".css", ".go", ".gradle", ".h", ".hpp", ".html",
  ".ini", ".java", ".js", ".json", ".jsx", ".kt", ".kts", ".md", ".meta", ".properties",
  ".ps1", ".py", ".rs", ".scss", ".sh", ".sql", ".svelte", ".toml", ".ts", ".tsx", ".txt",
  ".vue", ".xml", ".yaml", ".yml",
]);
const STOP_WORDS = new Set([
  "about", "after", "against", "agent", "and", "before", "between", "canonical", "change", "context",
  "docs", "from", "into", "must", "oder", "project", "repository", "source", "src", "task", "tasks",
  "test", "tests", "that", "the", "this", "through", "und", "with", "without",
]);

type GovernedTruthLevel = GovernedHeader["truth_level"];
type ContextSourceTruthLevel = GovernedTruthLevel | "unclassified";
type ContextLevel = "L0" | "L1" | "L2" | "L3" | "L4" | "L5";
type RequiredContextCategory =
  | "governing-task"
  | "metadata-routed-canonical"
  | "external-workflow"
  | "explicit-required"
  | "task-evidence"
  | "other-required";

const REQUIRED_CONTEXT_CATEGORIES: readonly RequiredContextCategory[] = [
  "governing-task",
  "metadata-routed-canonical",
  "external-workflow",
  "explicit-required",
  "task-evidence",
  "other-required",
];

export interface ContextLockSource {
  line_ranges?: Array<[number, number]>;
  selection_hash?: string;
  path: string;
  content_hash: string;
  git_blob: string | null;
  truth_level: ContextSourceTruthLevel;
  level: ContextLevel;
  priority: number;
  selection_reason: string;
  selector: string;
  estimated_tokens: number;
  ownership: "project" | "external-tool";
  source_system: string | null;
}

export interface ContextLockOmission {
  candidate: string;
  reason: string;
  required: boolean;
}

export interface ContextLock {
  task_id: string;
  agent_run_id: string | null;
  created_at: string;
  context_index_hash: string;
  base_revision?: string;
  budget: {
    total_tokens: number;
    reserved_output_tokens: number;
    reserved_input_tokens?: number;
    estimated_input_tokens: number;
  };
  sources: ContextLockSource[];
  omissions: ContextLockOmission[];
  raw_transcripts_included: false;
  lock_hash: string;
}

export interface CompileContextOptions {
  root: string;
  taskId: string;
  totalTokens?: number;
  reservedOutputTokens?: number;
  inputSafetyTokens?: number;
  includePaths?: string[];
  outputPath?: string;
  agentRunId?: string | null;
  createdAt?: string;
  apply?: boolean;
}

export interface ContextCompileReport {
  root: string;
  task_id: string;
  output_path: string;
  mode: "dry-run" | "applied";
  output_modified: boolean;
  selected_sources: number;
  omitted_candidates: number;
  omitted_file_intents: string[];
  required_context_breakdown: Array<{
    category: RequiredContextCategory;
    source_count: number;
    estimated_tokens: number;
  }>;
  lock: ContextLock;
}

export interface ApplyContextPreviewOptions {
  root: string;
  previewPath: string;
}

export interface ContextPreviewApplyReport {
  root: string;
  task_id: string;
  preview_path: string;
  output_path: string;
  mode: "preview-applied";
  output_modified: boolean;
  lock: ContextLock;
}

interface TaskState {
  context_sections?: ContextSection[];
  task_id: string;
  objective: string;
  source_system?: string;
  source_ref?: string;
  acceptance_criteria?: Array<{ statement?: string }>;
  documentation_impact?: string[];
  file_intents?: string[];
  required_context_sources?: string[];
  checks?: Array<{ evidence_refs?: string[] }>;
}

interface Candidate {
  path: string;
  truthLevel: ContextSourceTruthLevel;
  level: ContextLevel;
  priority: number;
  reason: string;
  selector: string;
  required: boolean;
  ownership: "project" | "external-tool";
  sourceSystem: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}

function sameResolvedPath(left: string, right: string): boolean {
  const resolvedLeft = path.resolve(left);
  const resolvedRight = path.resolve(right);
  return process.platform === "win32"
    ? resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
    : resolvedLeft === resolvedRight;
}

function parsePreviewLock(value: unknown): ContextLock {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "task_id", "agent_run_id", "created_at", "context_index_hash", "base_revision", "budget",
    "sources", "omissions", "raw_transcripts_included", "lock_hash",
  ])) {
    throw new Error("preview lock root is invalid");
  }
  if (
    typeof value.task_id !== "string" || !value.task_id || /[\\/]/.test(value.task_id) ||
    !(typeof value.agent_run_id === "string" || value.agent_run_id === null) ||
    typeof value.created_at !== "string" || !isIsoDateTime(value.created_at) ||
    typeof value.context_index_hash !== "string" || !/^sha256:[a-f0-9]{64}$/i.test(value.context_index_hash) ||
    !(value.base_revision === undefined || typeof value.base_revision === "string") ||
    value.raw_transcripts_included !== false ||
    typeof value.lock_hash !== "string" || !/^sha256:[a-f0-9]{64}$/i.test(value.lock_hash) ||
    !isRecord(value.budget) || !hasOnlyKeys(value.budget, ["total_tokens", "reserved_output_tokens", "reserved_input_tokens", "estimated_input_tokens"]) ||
    !Number.isInteger(value.budget.total_tokens) || (value.budget.total_tokens as number) <= 0 ||
    !Number.isInteger(value.budget.reserved_output_tokens) || (value.budget.reserved_output_tokens as number) < 0 ||
    !(value.budget.reserved_input_tokens === undefined ||
      (Number.isInteger(value.budget.reserved_input_tokens) && (value.budget.reserved_input_tokens as number) >= 0)) ||
    !Number.isInteger(value.budget.estimated_input_tokens) || (value.budget.estimated_input_tokens as number) < 0 ||
    (value.budget.reserved_output_tokens as number) +
      (typeof value.budget.reserved_input_tokens === "number" ? value.budget.reserved_input_tokens : 0) +
      (value.budget.estimated_input_tokens as number) > (value.budget.total_tokens as number) ||
    !Array.isArray(value.sources) || !Array.isArray(value.omissions)
  ) {
    throw new Error("preview lock payload is invalid");
  }
  const truthLevels = new Set<ContextSourceTruthLevel>([
    "canonical", "design-target", "active-snapshot", "draft", "historical", "unclassified",
  ]);
  const contextLevels = new Set<ContextLevel>(["L0", "L1", "L2", "L3", "L4", "L5"]);
  for (const source of value.sources) {
    if (
      !isRecord(source) || !hasOnlyKeys(source, [
        "path", "content_hash", "git_blob", "truth_level", "level", "priority", "selection_reason",
        "selector", "estimated_tokens", "ownership", "source_system", "line_ranges", "selection_hash",
      ]) ||
      typeof source.path !== "string" || !source.path ||
      typeof source.content_hash !== "string" || !/^sha256:[a-f0-9]{64}$/i.test(source.content_hash) ||
      !(source.git_blob === null || typeof source.git_blob === "string") ||
      !truthLevels.has(source.truth_level as ContextSourceTruthLevel) || !contextLevels.has(source.level as ContextLevel) ||
      !Number.isInteger(source.priority) || !Number.isInteger(source.estimated_tokens) || (source.estimated_tokens as number) < 0 ||
      typeof source.selection_reason !== "string" || typeof source.selector !== "string" ||
      !["project", "external-tool"].includes(String(source.ownership)) ||
      !(source.source_system === null || typeof source.source_system === "string")
    ) {
      throw new Error("preview lock contains an invalid source");
    }
    validateLockedSection(source as unknown as ContextLockSource);
  }
  for (const omission of value.omissions) {
    if (
      !isRecord(omission) || !hasOnlyKeys(omission, ["candidate", "reason", "required"]) ||
      typeof omission.candidate !== "string" || typeof omission.reason !== "string" || typeof omission.required !== "boolean"
    ) {
      throw new Error("preview lock contains an invalid omission");
    }
    if (omission.required) throw new Error(`preview lock omits required context: ${omission.candidate}`);
  }
  return value as unknown as ContextLock;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function positiveInteger(value: number, field: string, allowZero = false): number {
  if (!Number.isInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new Error(`${field} must be ${allowZero ? "a non-negative" : "a positive"} integer`);
  }
  return value;
}

export function normalizeRelativePath(value: string, field: string): string {
  const normalized = normalizePath(value.trim().replace(/^\.\//, ""));
  if (!normalized || path.isAbsolute(value) || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`${field} must be a repository-relative path: ${value}`);
  }
  return normalized;
}

function isExcluded(relativePath: string, config: CanonTrailConfig): boolean {
  return config.excludePaths.some((entry) => {
    const excluded = normalizePath(entry).replace(/\/$/, "");
    return relativePath === excluded || relativePath.startsWith(`${excluded}/`);
  });
}

export function isSupportedText(relativePath: string): boolean {
  return TEXT_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase());
}

function estimateTokens(content: string | Buffer): number {
  const bytes = typeof content === "string" ? Buffer.byteLength(content, "utf8") : content.byteLength;
  return bytes === 0 ? 0 : Math.max(1, Math.ceil(bytes / 4));
}

function normalizedWords(value: string): string[] {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function terms(values: string[]): Set<string> {
  const result = new Set<string>();
  for (const value of values) {
    for (const token of normalizedWords(value)) {
      if (token.length >= 3 && !STOP_WORDS.has(token)) result.add(token);
    }
  }
  return result;
}

interface WordSequence {
  words: string[];
  boundaries: Set<number>;
}

function wordSequence(value: string): WordSequence {
  const words: string[] = [];
  const boundaries = new Set([0]);
  for (const unit of value.split(/[^a-z0-9]+/i).filter(Boolean)) {
    words.push(...normalizedWords(unit));
    boundaries.add(words.length);
  }
  return { words, boundaries };
}

function containsWords(sequence: WordSequence, needle: string[]): boolean {
  // Match whole lexical units: FooBar is not an exact mention inside FooBarProxy.
  return needle.length > 0 && [...sequence.boundaries].some(offset =>
    sequence.boundaries.has(offset + needle.length) &&
    needle.every((word, index) => sequence.words[offset + index] === word));
}

function relevance(
  document: ContextIndexDocument,
  taskTerms: Set<string>,
  taskWordSequences: WordSequence[],
): { matched: number; strongScore: number } {
  const countMatches = (value: string): number => [...terms([value])].filter(token => taskTerms.has(token)).length;
  // Separate routing entries describe alternative topic triggers. Do not combine fragments from
  // unrelated entries (or the two metadata fields) into a mandatory source.
  let strongScore = 0;
  for (const route of document.read_if_task_touches) {
    strongScore = Math.max(strongScore, countMatches(route));
  }
  // A compound system name is one identity. Shared words in InvoiceTotalsExporter must not
  // establish InvoiceTotalsCalculator; retain such overlap only as an optional candidate.
  for (const system of document.primary_systems) {
    const words = normalizedWords(system);
    if (taskWordSequences.some(sequence => containsWords(sequence, words))) {
      strongScore = Math.max(strongScore, terms([system]).size);
    }
  }
  return {
    matched: countMatches([...document.read_if_task_touches, ...document.primary_systems].join(" ")),
    strongScore,
  };
}

function levelOrder(level: ContextLevel): number {
  return Number(level.slice(1));
}

function addCandidate(candidates: Map<string, Candidate>, candidate: Candidate): void {
  const previous = candidates.get(candidate.path);
  if (!previous) {
    candidates.set(candidate.path, candidate);
    return;
  }
  const reasons = [...new Set([...previous.reason.split("; "), ...candidate.reason.split("; ")])];
  const selectors = [...new Set([...previous.selector.split(","), ...candidate.selector.split(",")])].filter(Boolean);
  candidates.set(candidate.path, {
    ...previous,
    truthLevel: previous.truthLevel === "canonical" || candidate.truthLevel !== "canonical" ? previous.truthLevel : "canonical",
    level: levelOrder(previous.level) <= levelOrder(candidate.level) ? previous.level : candidate.level,
    priority: Math.min(previous.priority, candidate.priority),
    reason: reasons.join("; "),
    selector: selectors.join(","),
    required: previous.required || candidate.required,
    ownership: previous.ownership === "external-tool" || candidate.ownership === "external-tool" ? "external-tool" : "project",
    sourceSystem: previous.sourceSystem ?? candidate.sourceSystem,
  });
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether a candidate repository-relative path refers to the same physical file as the task's own
 * context-lock output. A plain string comparison is not enough: it misses a path that differs only
 * by case on a case-insensitive filesystem (Windows), and it misses a symbolic or hard-link alias of
 * the exact same file the compiler is about to overwrite -- which would let
 * the compiler read a previous lock's bytes as an "ordinary" input and then immediately make its own
 * replacement stale, the exact bug the self-exclusion guard exists to prevent. When the output does
 * not exist yet (a first compile) there is nothing for a symlink to alias, so only the cheap,
 * filesystem-free comparison applies.
 */
async function isSameAsOutput(root: string, outputPath: string, candidatePath: string): Promise<boolean> {
  const outputAbsolute = path.join(root, ...outputPath.split("/"));
  const candidateAbsolute = path.join(root, ...candidatePath.split("/"));
  if (sameResolvedPath(candidateAbsolute, outputAbsolute)) return true;
  if (!(await exists(outputAbsolute)) || !(await exists(candidateAbsolute))) return false;
  try {
    const [outputReal, candidateReal] = await Promise.all([realpath(outputAbsolute), realpath(candidateAbsolute)]);
    if (sameResolvedPath(outputReal, candidateReal)) return true;
    // File IDs can exceed Number.MAX_SAFE_INTEGER (notably on NTFS). Rounded Numbers
    // can make distinct files look identical; keep both device and inode exact.
    const [outputStats, candidateStats] = await Promise.all([
      stat(outputReal, { bigint: true }),
      stat(candidateReal, { bigint: true }),
    ]);
    return outputStats.dev === candidateStats.dev && outputStats.ino === candidateStats.ino;
  } catch {
    return false;
  }
}

const TASK_LOCK_PATH_PATTERN = /^\.agent-context\/tasks\/[^/]+\/context\.lock\.json$/i;

/**
 * Walks the chain of *other* tasks' context locks a candidate source transitively points at, looking
 * for a path back to the current task's own output. The direct self-reference case (a task naming its
 * own lock) is already rejected by isSameAsOutput before this ever runs; this catches the case that
 * guard cannot see on its own -- task A requiring task B's lock, whose own recorded sources in turn
 * require task A's lock, so neither compile looks self-referential in isolation even though applying
 * both would make each task's "current" view permanently depend on the other's, and a lock recompiled
 * after such a cycle exists can never be verified as reflecting only its own bounded working view.
 * Returns the reference chain (candidatePath first) when a cycle is found, otherwise undefined.
 */
async function findContextLockCycle(
  root: string,
  outputPath: string,
  candidatePath: string,
  visited: Set<string> = new Set(),
): Promise<string[] | undefined> {
  if (await isSameAsOutput(root, outputPath, candidatePath)) return [candidatePath];
  if (visited.has(candidatePath) || !TASK_LOCK_PATH_PATTERN.test(candidatePath)) return undefined;
  visited.add(candidatePath);
  let absolute: string | undefined;
  try {
    absolute = await safeRepositoryFile(root, candidatePath);
  } catch {
    return undefined;
  }
  if (!absolute) return undefined;
  let referencedLock: unknown;
  try {
    referencedLock = JSON.parse(await readFile(absolute, "utf8"));
  } catch {
    return undefined;
  }
  if (!isRecord(referencedLock) || !Array.isArray(referencedLock.sources)) return undefined;
  for (const source of referencedLock.sources) {
    if (!isRecord(source) || typeof source.path !== "string") continue;
    const chain = await findContextLockCycle(root, outputPath, source.path, visited);
    if (chain) return [candidatePath, ...chain];
  }
  return undefined;
}

async function loadContextIndex(root: string, config: CanonTrailConfig): Promise<ContextIndex> {
  const indexPath = path.join(root, ...normalizePath(config.indexPath).split("/"));
  const raw = await readFile(indexPath, "utf8");
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || value.version !== 1 || typeof value.root_hash !== "string" || !Array.isArray(value.documents)) {
    throw new Error(`${config.indexPath} is not a valid context index`);
  }
  const current = buildContextIndex(await discoverMarkdown(root, config));
  if (current.root_hash !== value.root_hash) {
    throw new Error(`context index is stale; run 'canontrail index .' before compiling context`);
  }
  return current;
}

async function loadTaskState(root: string, taskId: string): Promise<{ state: TaskState; path: string }> {
  const statePath = `.agent-context/tasks/${taskId}/state.yaml`;
  const absolute = await safeRepositoryFile(root, statePath);
  if (!absolute) throw new Error(`required task state does not exist: ${statePath}`);
  const value: unknown = parse(await readFile(absolute, "utf8"));
  if (!isRecord(value) || value.task_id !== taskId || typeof value.objective !== "string") {
    throw new Error(`${statePath} must contain matching task_id and objective`);
  }
  return {
    state: {
      task_id: taskId,
      objective: value.objective,
      ...(typeof value.source_system === "string" ? { source_system: value.source_system } : {}),
      ...(typeof value.source_ref === "string" ? { source_ref: value.source_ref } : {}),
      acceptance_criteria: Array.isArray(value.acceptance_criteria)
        ? value.acceptance_criteria.filter(isRecord).map((entry) => ({
          ...(typeof entry.statement === "string" ? { statement: entry.statement } : {}),
        }))
        : [],
      documentation_impact: strings(value.documentation_impact),
      file_intents: strings(value.file_intents),
      required_context_sources: strings(value.required_context_sources),
      context_sections: parseContextSections(value.context_sections),
      checks: Array.isArray(value.checks)
        ? value.checks.filter(isRecord).map((entry) => ({ evidence_refs: strings(entry.evidence_refs) }))
        : [],
    },
    path: statePath,
  };
}

function routedIndexDocuments(index: ContextIndex, state: TaskState) {
  const taskTexts = [
    state.objective,
    ...(state.acceptance_criteria ?? []).map((entry) => entry.statement ?? ""),
  ];
  const taskTerms = terms(taskTexts);
  // Keep sentence/criterion boundaries, but retain dots inside qualified identifiers.
  const taskWordSequences = taskTexts.flatMap(text => text.split(/[.!?;](?:\s|$)|[\r\n]+/).map(wordSequence));
  const matches: Array<{ document: ContextIndexDocument; match: { matched: number; strongScore: number } }> = [];
  for (const document of index.documents) {
    if (!["canonical", "design-target"].includes(document.truth_level)) continue;
    if (document.path === "AGENTS.md") continue;
    const match = relevance(document, taskTerms, taskWordSequences);
    if (match.matched === 0) continue;
    matches.push({ document, match });
  }
  return matches;
}

/** Keep required-evidence discovery identical for compile and receiving/active
 * validation. Selector labels alone cannot prove that required evidence survived. */
async function taskEvidencePaths(root: string, state: TaskState): Promise<string[]> {
  const references = new Set<string>();
  for (const check of state.checks ?? []) for (const reference of check.evidence_refs ?? []) references.add(reference);
  const taskRoot = `.agent-context/tasks/${state.task_id}`;
  const change = await safeRepositoryFile(root, `${taskRoot}/change.yaml`);
  if (change) {
    const collect = (value: unknown): void => {
      if (Array.isArray(value)) { for (const entry of value) collect(entry); }
      else if (isRecord(value)) for (const [key, entry] of Object.entries(value)) {
        if (key === "evidence_refs") { for (const reference of strings(entry)) references.add(reference); }
        else collect(entry);
      }
    };
    collect(parse(await readFile(change, "utf8")));
  }
  const paths = new Set<string>();
  for (const reference of references) {
    let normalized: string;
    try { normalized = normalizeRelativePath(reference, "task evidence reference"); } catch { continue; }
    if (normalized.startsWith(`${taskRoot}/evidence/`) && isSupportedText(normalized)) paths.add(normalized);
  }
  return [...paths].sort((a, b) => a.localeCompare(b));
}

/** Read-only index compatibility, not exact re-application of an old preview.
 * The caller must separately verify current index integrity and ALL selected source hashes.
 * Optional additions need not change a still sufficient working view. */
export async function contextIndexCompatibilityReasons(
  root: string,
  index: ContextIndex,
  lock: ContextLock,
): Promise<string[]> {
  if (!lock.task_id || /[\\/]/.test(lock.task_id)) throw new Error("invalid context task identity");
  const { state, path: statePath } = await loadTaskState(root, lock.task_id);
  const required = new Set(["AGENTS.md", statePath]);
  for (const name of ["brief.md", "change.yaml"]) {
    const candidate = ".agent-context/tasks/" + lock.task_id + "/" + name;
    if (await safeRepositoryFile(root, candidate)) required.add(candidate);
  }
  for (const source of state.required_context_sources ?? []) {
    required.add(normalizeRelativePath(source, "required context source"));
  }
  for (const evidence of await taskEvidencePaths(root, state)) required.add(evidence);
  const routed = routedIndexDocuments(index, state);
  if (state.source_ref && state.source_system && INTEGRATION_IDS.has(state.source_system as IntegrationId)) required.add(normalizeRelativePath(state.source_ref, "external source_ref"));
  for (const { document, match } of routed) {
    if (document.truth_level === "canonical" && match.strongScore >= 2) required.add(document.path);
  }
  const routedPaths = new Set(routed.map(({ document }) => document.path));
  const selected = new Map(lock.sources.map(source => [source.path, source]));
  const indexed = new Map(index.documents.map(document => [document.path, document]));
  const reasons: string[] = [];
  for (const candidate of [...required].sort()) {
    if (!selected.has(candidate)) reasons.push("Required context is not selected: " + candidate);
    else if (selected.get(candidate)?.line_ranges) reasons.push("Required whole source was narrowed: " + candidate);
  }
  for (const section of state.context_sections ?? []) {
    const source = selected.get(section.path);
    if (!source || source.content_hash !== section.content_hash || JSON.stringify(source.line_ranges) !== JSON.stringify([[section.from, section.to]])) {
      reasons.push("Required section differs from task state: " + section.path);
    }
  }
  for (const source of lock.sources.filter(s => s.line_ranges !== undefined)) {
    if (source.path.split("/")[0]?.toLowerCase() === ".agent-context" || source.level === "L0" || source.ownership === "external-tool"
        || source.selector.split(",").some(s => ["explicit-include", "task-required-context", "task-evidence-reference", "external-source-ref"].includes(s))) reasons.push("Required/control source was narrowed: " + source.path);
    if (!(state.context_sections ?? []).some(s => s.path === source.path)) reasons.push("Unrequested partial source: " + source.path);
  }
  for (const source of lock.sources) {
    const document = indexed.get(source.path);
    // Cited evidence and external workflow selectors deliberately carry their own
    // authority; only selectors using indexedTruth (or current metadata routing)
    // can be compared directly to the governed document header.
    const indexedAuthority = routedPaths.has(source.path) || source.selector.split(",").some(selector =>
      ["governing-instructions", "task-brief", "metadata-routing", "task-required-context", "explicit-include", "task-file-intent", "task-context-section"].includes(selector));
    if (document && indexedAuthority && source.truth_level !== document.truth_level) {
      reasons.push("Selected documentary authority changed: " + source.path);
    } else if (!document && source.selector.split(",").includes("metadata-routing")) {
      reasons.push("Selected metadata-routed document is no longer indexed: " + source.path);
    }
  }
  return reasons.sort();
}

function indexedTruth(
  index: ContextIndex,
  sourcePath: string,
  fallback: ContextSourceTruthLevel,
): ContextSourceTruthLevel {
  return index.documents.find((document) => document.path === sourcePath)?.truth_level ?? fallback;
}

async function assertUnclassifiedContextSchema(root: string, config: CanonTrailConfig): Promise<void> {
  const schemaPath = normalizeRelativePath(
    `${normalizePath(config.schemaPath).replace(/\/$/, "")}/context-lock.schema.json`,
    "context-lock schema path",
  );
  const absolute = await safeRepositoryFile(root, schemaPath);
  if (!absolute) {
    throw new Error(`context-lock schema is unavailable: ${schemaPath}`);
  }
  let schema: unknown;
  try {
    schema = JSON.parse(await readFile(absolute, "utf8"));
  } catch (error) {
    throw new Error(`context-lock schema cannot be read: ${(error as Error).message}`);
  }
  const truthLevel = isRecord(schema) && isRecord(schema.properties) &&
    isRecord(schema.properties.sources) && isRecord(schema.properties.sources.items) &&
    isRecord(schema.properties.sources.items.properties) &&
    isRecord(schema.properties.sources.items.properties.truth_level)
    ? schema.properties.sources.items.properties.truth_level
    : undefined;
  if (!truthLevel || !Array.isArray(truthLevel.enum) || !truthLevel.enum.includes("unclassified")) {
    throw new Error(
      `context-lock schema does not support truth_level unclassified; synchronize ${schemaPath} before applying this lock`,
    );
  }
}

function requiredContextCategory(candidate: Candidate): RequiredContextCategory {
  const selectors = new Set(candidate.selector.split(",").filter(Boolean));
  if (["governing-instructions", "task-state", "task-brief", "task-change"].some((selector) => selectors.has(selector))) {
    return "governing-task";
  }
  if (selectors.has("external-source-ref")) return "external-workflow";
  if (selectors.has("task-required-context") || selectors.has("explicit-include") || selectors.has("task-context-section")) return "explicit-required";
  if (selectors.has("task-evidence-reference")) return "task-evidence";
  if (selectors.has("metadata-routing") && candidate.truthLevel === "canonical") {
    return "metadata-routed-canonical";
  }
  return "other-required";
}

function requiredContextBreakdown(
  prepared: Array<{ candidate: Candidate; tokens: number }>,
): ContextCompileReport["required_context_breakdown"] {
  const totals = new Map<RequiredContextCategory, { source_count: number; estimated_tokens: number }>(
    REQUIRED_CONTEXT_CATEGORIES.map((category) => [category, { source_count: 0, estimated_tokens: 0 }]),
  );
  for (const entry of prepared) {
    if (!entry.candidate.required) continue;
    const total = totals.get(requiredContextCategory(entry.candidate))!;
    total.source_count += 1;
    total.estimated_tokens += entry.tokens;
  }
  return REQUIRED_CONTEXT_CATEGORIES.map((category) => ({ category, ...totals.get(category)! }));
}

function formatRequiredContextBreakdown(
  breakdown: ContextCompileReport["required_context_breakdown"],
): string {
  return breakdown
    .filter((entry) => entry.source_count > 0)
    .map((entry) => `${entry.category}=${entry.estimated_tokens} tokens/${entry.source_count} sources`)
    .join(", ");
}

export function computeContextLockHash(value: Omit<ContextLock, "lock_hash">): string {
  return sha256(JSON.stringify(value));
}

export function serializeContextLock(lock: ContextLock): string {
  return `${JSON.stringify(lock, null, 2)}\n`;
}

export async function compileContext(options: CompileContextOptions): Promise<ContextCompileReport> {
  const root = path.resolve(options.root);
  const taskId = options.taskId.trim();
  if (!taskId || /[\\/]/.test(taskId)) throw new Error("task id must be a non-empty path segment");
  const totalTokens = positiveInteger(options.totalTokens ?? 32_000, "total tokens");
  const reservedOutputTokens = positiveInteger(options.reservedOutputTokens ?? 8_000, "reserved output tokens", true);
  const inputSafetyTokens = positiveInteger(options.inputSafetyTokens ?? 1_024, "input safety tokens", true);
  if (reservedOutputTokens + inputSafetyTokens >= totalTokens) {
    throw new Error("reserved output plus input safety tokens must be lower than total tokens");
  }
  const createdAt = options.createdAt ?? new Date().toISOString();
  if (!isIsoDateTime(createdAt)) throw new Error("created-at must be an ISO date-time");

  const config = await loadConfig(root);
  const index = await loadContextIndex(root, config);
  const { state, path: statePath } = await loadTaskState(root, taskId);
  const taskRoot = `.agent-context/tasks/${taskId}`;
  const defaultOutput = `${taskRoot}/context.lock.json`;
  const outputPath = normalizeRelativePath(options.outputPath ?? defaultOutput, "output path");
  if (path.posix.basename(outputPath) !== "context.lock.json" || !outputPath.startsWith(`${taskRoot}/`)) {
    throw new Error(`output must be the task-owned ${defaultOutput}`);
  }
  const candidates = new Map<string, Candidate>();
  const omissions: ContextLockOmission[] = [];
  const existingFileIntents = new Set<string>();

  addCandidate(candidates, {
    path: "AGENTS.md",
    truthLevel: indexedTruth(index, "AGENTS.md", "canonical"),
    level: "L0",
    priority: 0,
    reason: "Repository governing instructions.",
    selector: "governing-instructions",
    required: true,
    ownership: "project",
    sourceSystem: null,
  });
  addCandidate(candidates, {
    path: statePath,
    truthLevel: "active-snapshot",
    level: "L0",
    priority: 1,
    reason: "Current task objective, acceptance criteria, and file intents.",
    selector: "task-state",
    required: true,
    ownership: "project",
    sourceSystem: null,
  });
  for (const [name, priority, reason] of [
    ["brief.md", 2, "Current task brief."],
    ["change.yaml", 3, "Current change decision and acceptance oracle."],
  ] as const) {
    const candidatePath = `${taskRoot}/${name}`;
    if (await safeRepositoryFile(root, candidatePath)) {
      addCandidate(candidates, {
        path: candidatePath,
        truthLevel: name.endsWith(".md") ? indexedTruth(index, candidatePath, "active-snapshot") : "active-snapshot",
        level: "L0",
        priority,
        reason,
        selector: `task-${name.replace(/\..+$/, "")}`,
        required: true,
        ownership: "project",
        sourceSystem: null,
      });
    }
  }

  for (const { document, match } of routedIndexDocuments(index, state)) {
    const strongMatch = match.strongScore >= 2;
    const score = strongMatch ? match.strongScore : 1;
    addCandidate(candidates, {
      path: document.path,
      truthLevel: document.truth_level,
      level: "L1",
      priority: document.truth_level === "canonical" ? 10 - Math.min(score, 5) : 15 - Math.min(score, 5),
      reason: !strongMatch && match.matched > 1
        ? `Weak routing metadata shared ${match.matched} normalized semantic task terms, but no single routing entry or complete system name established a strong match.`
        : `${strongMatch ? "Strong" : "Weak"} routing metadata matched ${score} normalized semantic task term${score === 1 ? "" : "s"}.${strongMatch ? " Evidence is within one routing entry or a complete primary-system name." : ""}`,
      selector: "metadata-routing",
      required: document.truth_level === "canonical" && strongMatch,
      ownership: "project",
      sourceSystem: null,
    });
  }

  if (state.source_system && INTEGRATION_IDS.has(state.source_system as IntegrationId) && state.source_ref) {
    const sourceRef = normalizeRelativePath(state.source_ref, "external source_ref");
    const compatibility = await detectCompatibility(root);
    const integration = compatibility.integrations.find((entry) => entry.id === state.source_system);
    const artifact = integration?.artifacts.find((entry) => entry.path === sourceRef);
    if (!artifact) throw new Error(`required external task source is not detected by ${state.source_system}: ${sourceRef}`);
    addCandidate(candidates, {
      path: sourceRef,
      truthLevel: artifact.authority === "external-design" ? "design-target" : "active-snapshot",
      level: "L2",
      priority: 20,
      reason: "Exact source_ref owned by the task's external workflow.",
      selector: "external-source-ref",
      required: true,
      ownership: "external-tool",
      sourceSystem: state.source_system,
    });
  }

  for (const requiredSource of state.required_context_sources ?? []) {
    const normalized = normalizeRelativePath(requiredSource, "required context source");
    if (await isSameAsOutput(root, outputPath, normalized)) {
      throw new Error(`required context source cannot be the context lock output itself: ${normalized}`);
    }
    if (isExcluded(normalized, config)) {
      throw new Error(`required context source is inside a configured excluded path: ${normalized}`);
    }
    if (!isSupportedText(normalized)) {
      throw new Error(`required context source is not a supported text source: ${normalized}`);
    }
    if (!(await safeRepositoryFile(root, normalized))) {
      throw new Error(`required context source does not exist: ${normalized}`);
    }
    const requiredCycle = await findContextLockCycle(root, outputPath, normalized);
    if (requiredCycle) {
      throw new Error(
        `required context source creates a circular context-lock dependency: ${[outputPath, ...requiredCycle].join(" -> ")}`,
      );
    }
    addCandidate(candidates, {
      path: normalized,
      truthLevel: indexedTruth(index, normalized, "unclassified"),
      level: "L3",
      priority: 25,
      reason: "Persistently required by the current task state.",
      selector: "task-required-context",
      required: true,
      ownership: "project",
      sourceSystem: null,
    });
  }

  for (const includePath of options.includePaths ?? []) {
    const normalized = normalizeRelativePath(includePath, "include path");
    if (await isSameAsOutput(root, outputPath, normalized)) {
      throw new Error(`explicit include cannot be the context lock output itself: ${normalized}`);
    }
    if (isExcluded(normalized, config)) throw new Error(`explicit include is inside a configured excluded path: ${normalized}`);
    if (!isSupportedText(normalized)) throw new Error(`explicit include is not a supported text source: ${normalized}`);
    if (!(await safeRepositoryFile(root, normalized))) throw new Error(`required explicit include does not exist: ${normalized}`);
    const includeCycle = await findContextLockCycle(root, outputPath, normalized);
    if (includeCycle) {
      throw new Error(
        `explicit include creates a circular context-lock dependency: ${[outputPath, ...includeCycle].join(" -> ")}`,
      );
    }
    addCandidate(candidates, {
      path: normalized,
      truthLevel: indexedTruth(index, normalized, "unclassified"),
      level: "L3",
      priority: 25,
      reason: "Explicitly required by --include.",
      selector: "explicit-include",
      required: true,
      ownership: "project",
      sourceSystem: null,
    });
  }

  for (const normalized of await taskEvidencePaths(root, state)) {
    if (!(await safeRepositoryFile(root, normalized))) throw new Error(`referenced task evidence does not exist: ${normalized}`);
    addCandidate(candidates, {
      path: normalized,
      truthLevel: "historical",
      level: "L4",
      priority: 22,
      reason: "Compact or directly cited task evidence.",
      selector: "task-evidence-reference",
      required: true,
      ownership: "project",
      sourceSystem: null,
    });
  }

  const taskEvidenceRoot = `${taskRoot}/evidence/`;
  for (const fileIntent of state.file_intents ?? []) {
    let normalized: string;
    try {
      normalized = normalizeRelativePath(fileIntent, "file intent");
    } catch {
      omissions.push({ candidate: fileIntent, reason: "File intent is not a concrete repository-relative path.", required: false });
      continue;
    }
    if (await isSameAsOutput(root, outputPath, normalized)) {
      if (await safeRepositoryFile(root, normalized)) existingFileIntents.add(normalized);
      omissions.push({
        candidate: normalized,
        reason: "Task-owned context lock output cannot be selected as its own input.",
        required: false,
      });
    } else if (isExcluded(normalized, config)) {
      omissions.push({ candidate: normalized, reason: "File intent is inside a configured excluded path.", required: false });
    } else if (!isSupportedText(normalized)) {
      omissions.push({ candidate: normalized, reason: "File intent is not a supported text source.", required: false });
    } else if (!(await safeRepositoryFile(root, normalized))) {
      omissions.push({ candidate: normalized, reason: "File intent does not exist yet; it may be a planned output.", required: false });
    } else {
      existingFileIntents.add(normalized);
      const fileIntentCycle = await findContextLockCycle(root, outputPath, normalized);
      if (fileIntentCycle) {
        omissions.push({
          candidate: normalized,
          reason: `File intent creates a circular context-lock dependency: ${[outputPath, ...fileIntentCycle].join(" -> ")}`,
          required: false,
        });
        continue;
      }
      if (normalized.startsWith(taskEvidenceRoot)) {
        if (!candidates.has(normalized)) {
          omissions.push({
            candidate: normalized,
            reason: "Task-owned evidence file intent is archival by default; cite it or require it explicitly to load it.",
            required: false,
          });
        }
        continue;
      }
      addCandidate(candidates, {
        path: normalized,
        truthLevel: indexedTruth(index, normalized, "unclassified"),
        level: "L3",
        priority: 30,
        reason: "Existing file declared by the current task.",
        selector: "task-file-intent",
        required: false,
        ownership: "project",
        sourceSystem: null,
      });
    }
  }

  const handoffPath = `${taskRoot}/handoff.yaml`;
  if (await safeRepositoryFile(root, handoffPath)) {
    addCandidate(candidates, {
      path: handoffPath,
      truthLevel: "active-snapshot",
      level: "L4",
      priority: 40,
      reason: "Latest durable checkpoint for this task.",
      selector: "latest-handoff",
      required: false,
      ownership: "project",
      sourceSystem: null,
    });
  } else {
    omissions.push({ candidate: handoffPath, reason: "No handoff exists for this task yet.", required: false });
  }

  const sections = new Map((state.context_sections ?? []).map(section => [section.path, section]));
  // Resume creates its receiving lock via a dry run before writing immutable artifacts.
  // Preflight both schemas here as well as on preview application, not only compile --apply.
  if (sections.size) await assertSectionContextSchemas(root, config);
  for (const section of sections.values()) {
    const normalized = normalizeRelativePath(section.path, "section path");
    if (normalized.split("/")[0]?.toLowerCase() === ".agent-context") throw new Error("Task and control artifacts cannot be sectioned: " + normalized);
    if (normalized !== section.path || isExcluded(normalized, config) || !isSupportedText(normalized)
        || await isSameAsOutput(root, outputPath, normalized) || await findContextLockCycle(root, outputPath, normalized)) {
      throw new Error("Unsafe or excluded context section: " + section.path);
    }
    if (candidates.get(normalized)?.required) throw new Error("Cannot narrow a required whole context source: " + normalized);
    addCandidate(candidates, { path: normalized, truthLevel: indexedTruth(index, normalized, "unclassified"), level: "L3", priority: 25,
      reason: "Explicit hash-bound source section from task state.", selector: "task-context-section", required: true, ownership: "project", sourceSystem: null });
  }
  const prepared: Array<{ candidate: Candidate; content: Buffer; tokens: number; section?: ContextSection; selected?: Buffer }> = [];
  for (const candidate of [...candidates.values()].sort((left, right) => left.priority - right.priority || left.path.localeCompare(right.path))) {
    const absolute = await safeRepositoryFile(root, candidate.path);
    if (!absolute) {
      if (candidate.required) throw new Error(`required context source does not exist: ${candidate.path}`);
      omissions.push({ candidate: candidate.path, reason: "Optional candidate no longer exists.", required: false });
      continue;
    }
    const content = await readFile(absolute);
    const section = sections.get(candidate.path);
    if (section && sha256(content) !== section.content_hash) throw new Error("Context section source changed: " + candidate.path);
    const selected = section ? selectContextSection(content, section.from, section.to) : undefined;
    prepared.push({ candidate, content, tokens: estimateTokens(selected ?? content), ...(section && selected ? { section, selected } : {}) });
  }

  const availableInputTokens = totalTokens - reservedOutputTokens - inputSafetyTokens;
  const requiredTokens = prepared.filter((entry) => entry.candidate.required).reduce((sum, entry) => sum + entry.tokens, 0);
  const requiredBreakdown = requiredContextBreakdown(prepared);
  if (requiredTokens > availableInputTokens) {
    throw new Error(
      `required context needs ${requiredTokens} estimated tokens but only ${availableInputTokens} input tokens are available; ` +
      `breakdown: ${formatRequiredContextBreakdown(requiredBreakdown)}`,
    );
  }

  let usedTokens = 0;
  let remainingRequiredTokens = requiredTokens;
  const sources: ContextLockSource[] = [];
  for (const entry of prepared) {
    if (entry.candidate.required) {
      remainingRequiredTokens -= entry.tokens;
    }
    if (
      !entry.candidate.required &&
      usedTokens + entry.tokens + remainingRequiredTokens > availableInputTokens
    ) {
      omissions.push({
        candidate: entry.candidate.path,
        reason: `Optional candidate needs ${entry.tokens} estimated tokens and does not fit after reserving ${remainingRequiredTokens} for later required sources.`,
        required: false,
      });
      continue;
    }
    usedTokens += entry.tokens;
    sources.push({
      path: entry.candidate.path,
      content_hash: sha256(entry.content),
      ...(entry.section && entry.selected ? { line_ranges: [[entry.section.from, entry.section.to]] as Array<[number, number]>, selection_hash: sha256(entry.selected) } : {}),
      git_blob: null,
      truth_level: entry.candidate.truthLevel,
      level: entry.candidate.level,
      priority: entry.candidate.priority,
      selection_reason: entry.candidate.reason,
      selector: entry.candidate.selector,
      estimated_tokens: entry.tokens,
      ownership: entry.candidate.ownership,
      source_system: entry.candidate.sourceSystem,
    });
  }

  omissions.sort((left, right) => left.candidate.localeCompare(right.candidate) || left.reason.localeCompare(right.reason));
  const selectedPaths = new Set(sources.map((source) => source.path));
  const omittedFileIntents = [...existingFileIntents]
    .filter((fileIntent) => !selectedPaths.has(fileIntent))
    .sort((left, right) => left.localeCompare(right));
  const baseRevision = await gitValue(root, ["rev-parse", "HEAD"]);
  const gitBlobs = await matchingGitBlobs(root, baseRevision, sources.map(source => source.path));
  sources.forEach((source, index) => { source.git_blob = gitBlobs[index]!; });
  const lockWithoutHash: Omit<ContextLock, "lock_hash"> = {
    task_id: taskId,
    agent_run_id: options.agentRunId ?? null,
    created_at: createdAt,
    context_index_hash: index.root_hash,
    ...(baseRevision ? { base_revision: baseRevision } : {}),
    budget: {
      total_tokens: totalTokens,
      reserved_output_tokens: reservedOutputTokens,
      reserved_input_tokens: inputSafetyTokens,
      estimated_input_tokens: usedTokens,
    },
    sources,
    omissions,
    raw_transcripts_included: false,
  };
  const lock: ContextLock = { ...lockWithoutHash, lock_hash: computeContextLockHash(lockWithoutHash) };
  // Dry-run locks are also consumed by resume; validate the actual prospective
  // payload, not just the presence of feature field names, before any consumer writes.
  if (sections.size) await assertSectionContextSchemas(root, config, lock);
  const serialized = serializeContextLock(lock);
  let outputModified = false;
  if (options.apply) {
    if (sources.some((source) => source.truth_level === "unclassified")) {
      await assertUnclassifiedContextSchema(root, config);
    }
    const absoluteOutput = path.join(root, ...outputPath.split("/"));
    let previous: string | undefined;
    try {
      previous = await readFile(absoluteOutput, "utf8");
    } catch {
      previous = undefined;
    }
    if (previous !== serialized) {
      await writeFile(absoluteOutput, serialized, "utf8");
      outputModified = true;
    }
  }

  return {
    root,
    task_id: taskId,
    output_path: outputPath,
    mode: options.apply ? "applied" : "dry-run",
    output_modified: outputModified,
    selected_sources: sources.length,
    omitted_candidates: omissions.length,
    omitted_file_intents: omittedFileIntents,
    required_context_breakdown: requiredBreakdown,
    lock,
  };
}

export async function applyContextPreview(options: ApplyContextPreviewOptions): Promise<ContextPreviewApplyReport> {
  const root = path.resolve(options.root);
  const previewPath = path.resolve(root, options.previewPath);
  let preview: unknown;
  try {
    preview = JSON.parse(await readFile(previewPath, "utf8"));
  } catch (error) {
    throw new Error(`context preview cannot be read: ${(error as Error).message}`);
  }
  if (!isRecord(preview) || preview.mode !== "dry-run" || preview.output_modified !== false) {
    throw new Error("context preview must be a dry-run JSON compile report");
  }
  const lock = parsePreviewLock(preview.lock);
  if (preview.task_id !== lock.task_id) throw new Error("context preview task identity does not match its lock");
  if (typeof preview.root !== "string" || !sameResolvedPath(preview.root, root)) {
    throw new Error("context preview was created for a different repository root");
  }
  const outputPath = `.agent-context/tasks/${lock.task_id}/context.lock.json`;
  if (preview.output_path !== outputPath) throw new Error("context preview output path does not match its task-owned lock");

  const { lock_hash: _ignored, ...payload } = lock;
  if (computeContextLockHash(payload) !== lock.lock_hash) throw new Error("context preview lock self-hash does not match its payload");
  const config = await loadConfig(root);
  const index = await loadContextIndex(root, config);
  if (lock.context_index_hash !== index.root_hash) throw new Error("context preview uses a stale context index");
  const currentRevision = await gitValue(root, ["rev-parse", "HEAD"]);
  if (lock.base_revision !== undefined && currentRevision !== lock.base_revision) {
    throw new Error("context preview uses a different Git base revision");
  }

  const seen = new Set<string>();
  for (const source of lock.sources) {
    const normalized = normalizeRelativePath(source.path, "preview source");
    if (normalized !== source.path) throw new Error(`context preview source is not normalized: ${source.path}`);
    if (seen.has(normalized)) throw new Error(`context preview contains duplicate source: ${normalized}`);
    seen.add(normalized);
    const absolute = await safeRepositoryFile(root, normalized);
    if (!absolute) throw new Error(`context preview source no longer exists: ${normalized}`);
    const content = await readFile(absolute);
    if (sha256(content) !== source.content_hash) {
      throw new Error(`context preview source changed: ${normalized}`);
    }
    validateLockedSection(source, content);
  }
  if (lock.sources.some(source => source.line_ranges)) {
    await assertSectionContextSchemas(root, config, lock);
  }
  const sectionReasons = await contextIndexCompatibilityReasons(root, index, lock);
  if (sectionReasons.length) throw new Error("Context preview does not satisfy task context: " + sectionReasons.join("; "));

  if (lock.sources.some((source) => source.truth_level === "unclassified")) {
    await assertUnclassifiedContextSchema(root, config);
  }

  const serialized = serializeContextLock(lock);
  const absoluteOutput = path.join(root, ...outputPath.split("/"));
  let previous: string | undefined;
  try {
    previous = await readFile(absoluteOutput, "utf8");
  } catch {
    previous = undefined;
  }
  const outputModified = previous !== serialized;
  if (outputModified) await writeFile(absoluteOutput, serialized, "utf8");
  return {
    root,
    task_id: lock.task_id,
    preview_path: previewPath,
    output_path: outputPath,
    mode: "preview-applied",
    output_modified: outputModified,
    lock,
  };
}

export function formatContextPreviewApplyReport(report: ContextPreviewApplyReport): string {
  return [
    `Context preview applied: ${report.task_id}`,
    `Preview: ${report.preview_path}`,
    `Output: ${report.output_path} (${report.output_modified ? "written" : "unchanged"})`,
    `Lock hash: ${report.lock.lock_hash}`,
  ].join("\n");
}

export function formatContextCompileReport(report: ContextCompileReport): string {
  const outputState = report.mode === "dry-run"
    ? "not written"
    : report.output_modified ? "written" : "unchanged";
  const lines = [
    `Context compile ${report.mode}: ${report.task_id}`,
    `Selected sources: ${report.selected_sources}`,
    `Estimated input: ${report.lock.budget.estimated_input_tokens}/${report.lock.budget.total_tokens - report.lock.budget.reserved_output_tokens - (report.lock.budget.reserved_input_tokens ?? 0)} tokens`,
    `Input safety reserve: ${report.lock.budget.reserved_input_tokens ?? 0} tokens`,
    ...report.lock.sources.filter(source => source.line_ranges).map(source =>
      `Section: ${JSON.stringify(source.path)}; inclusive lines ${source.line_ranges!.map(range => range.join("..")).join(", ")}; ${source.estimated_tokens} selected estimated tokens; remainder not selected.`),
    "Required context:",
    ...report.required_context_breakdown
      .filter((entry) => entry.source_count > 0)
      .map((entry) => `  - ${entry.category}: ${entry.estimated_tokens} tokens across ${entry.source_count} source${entry.source_count === 1 ? "" : "s"}`),
    `Omitted candidates: ${report.omitted_candidates}`,
    `Output: ${report.output_path} (${outputState})`,
    `Lock hash: ${report.lock.lock_hash}`,
  ];
  if (report.omitted_file_intents.length > 0) {
    lines.push(
      `WARNING: ${report.omitted_file_intents.length} existing file_intent${report.omitted_file_intents.length === 1 ? " was" : "s were"} omitted from the lock:`,
      ...report.omitted_file_intents.map((fileIntent) => `  - ${fileIntent}`),
      "Increase the context budget or require these paths with --include before relying on them.",
    );
  }
  return lines.join("\n");
}
