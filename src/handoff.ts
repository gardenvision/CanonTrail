import { validateLockedSection } from "./context-sections.js";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";
import { Document, isScalar, parse, Scalar } from "yaml";
import { loadConfig } from "./config.js";
import { computeContextLockHash, type ContextLock } from "./context.js";
import { isIsoDateTime } from "./date-time.js";
import { normalizePath, sha256 } from "./indexer.js";
import { safeRepositoryFile } from "./context-source-path.js";
import { decodeContinuityText, preflightImmutable, readContinuityBytes, readContinuityText,
  writeImmutableContinuity, writeMutableContinuity } from "./continuity-files.js";
import { inventoryReference, parseGitStatusCapture, resolveInventoryPath, verifyWorktreeInventory,
  writeWorktreeInventory, type WorktreeEntry, type WorktreeInventory, type WorktreeInventoryRef } from "./worktree-inventory.js";
import { compareCodeUnits } from "./ordering.js";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const addFormats = require("ajv-formats") as FormatsPlugin;

type JsonRecord = Record<string, unknown>;
type DecisionAuthority = "delegated" | "approved" | "provisional";
type FileState = "created" | "modified" | "deleted" | "inspected";
type CheckStatus = "pass" | "fail" | "blocked" | "not-run";

export const CHECKPOINT_TRIGGERS = [
  "pause",
  "agent-switch",
  "provider-switch",
  "external-blocker",
  "phase-transition",
  "explicit-handoff",
  "pre-compaction",
] as const;

export type CheckpointTrigger = typeof CHECKPOINT_TRIGGERS[number];

export interface HandoffDecision {
  statement: string;
  authority: DecisionAuthority;
  source: string;
}

export interface HandoffFile {
  path: string;
  state: FileState;
  summary: string;
}

export interface HandoffCheck {
  name: string;
  status: CheckStatus;
  evidence: string;
}

export interface Handoff {
  handoff_id: string;
  task_id: string;
  source_system?: string;
  source_ref?: string;
  created_at: string;
  source_session_id: string;
  checkpoint_trigger?: CheckpointTrigger;
  source_provider?: string;
  source_provider_event?: string;
  source_context_lock_path: string;
  source_context_lock_hash: string;
  objective: string;
  completed: string[];
  decisions: HandoffDecision[];
  files: HandoffFile[];
  checks: HandoffCheck[];
  blockers: string[];
  open_questions: string[];
  next_safe_action: string;
  do_not_repeat: string[];
  resume_sources: string[];
  worktree_dirty: boolean;
  uncommitted_summary: string | null;
  worktree_inventory?: WorktreeInventoryRef;
  handoff_hash: string;
}

export interface HandoffDraft {
  completed?: string[];
  decisions?: HandoffDecision[];
  files?: HandoffFile[];
  checks?: HandoffCheck[];
  blockers?: string[];
  open_questions?: string[];
  next_safe_action?: string;
  do_not_repeat?: string[];
  resume_sources?: string[];
  uncommitted_summary?: string | null;
}

export interface CreateHandoffOptions {
  root: string;
  taskId: string;
  sourceSessionId: string;
  checkpointTrigger?: CheckpointTrigger;
  sourceProvider?: string;
  sourceProviderEvent?: string;
  inputPath?: string;
  nextSafeAction?: string;
  handoffId?: string;
  createdAt?: string;
  replace?: boolean;
  apply?: boolean;
}

export interface HandoffCreateReport {
  root: string;
  task_id: string;
  mode: "dry-run" | "applied";
  output_path: string;
  source_context_archive_path: string;
  previous_handoff_archive_path: string | null;
  output_modified: boolean;
  handoff: Handoff;
}

export interface HandoffFinding {
  code: "HANDOFF001" | "HANDOFF002" | "HANDOFF003" | "HANDOFF005";
  message: string;
}

interface TaskState {
  task_id: string;
  objective: string;
  source_system?: string;
  source_ref?: string;
  file_intents: string[];
  checks: Array<{ id: string; status?: string; evidence_refs: string[] }>;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error(`${field} must be an array of non-empty strings`);
  }
  return [...value];
}

function normalizeRelativePath(value: string, field: string): string {
  const normalized = normalizePath(value.trim().replace(/^\.\//, ""));
  if (!normalized || path.isAbsolute(value) || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`${field} must be a repository-relative path: ${value}`);
  }
  return normalized;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function computeHandoffHash(value: Omit<Handoff, "handoff_hash"> | JsonRecord): string {
  return sha256(JSON.stringify(canonicalize(value)));
}

export function serializeHandoff(handoff: Handoff): string {
  const document = new Document(handoff);
  const timestamp = document.get("created_at", true);
  if (isScalar(timestamp)) timestamp.type = Scalar.QUOTE_DOUBLE;
  return document.toString({ lineWidth: 0 });
}

export function validateHandoffSemantics(value: JsonRecord): HandoffFinding[] {
  const findings: HandoffFinding[] = [];
  const nextAction = typeof value.next_safe_action === "string" ? value.next_safe_action.trim() : "";
  if (nextAction.length < 20 || /^(?:continue|finish|keep working|resume)\.?$/i.test(nextAction)) {
    findings.push({ code: "HANDOFF001", message: "next_safe_action is too vague to resume safely" });
  }
  if (value.worktree_dirty === true) {
    const summary = typeof value.uncommitted_summary === "string" ? value.uncommitted_summary.trim() : "";
    if (!summary) findings.push({ code: "HANDOFF002", message: "dirty worktree requires uncommitted_summary" });
  }
  const checks = Array.isArray(value.checks) ? value.checks.filter(isRecord) : [];
  for (const check of checks) {
    if (check.status !== "not-run" && (typeof check.evidence !== "string" || check.evidence.trim().length === 0)) {
      findings.push({ code: "HANDOFF003", message: `check '${String(check.name)}' has no evidence` });
    }
  }
  const handoffHash = typeof value.handoff_hash === "string" ? value.handoff_hash : "";
  const { handoff_hash: _ignored, ...payload } = value;
  if (handoffHash.toLowerCase() !== computeHandoffHash(payload).toLowerCase()) {
    findings.push({ code: "HANDOFF005", message: "handoff self-hash does not match its payload" });
  }
  return findings;
}

function parseArrayOfRecords<T extends JsonRecord>(
  value: unknown,
  field: string,
  parseEntry: (entry: JsonRecord, index: number) => T,
): T[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((entry) => !isRecord(entry))) {
    throw new Error(`${field} must be an array of mappings`);
  }
  return value.map((entry, index) => parseEntry(entry as JsonRecord, index));
}

function requiredString(entry: JsonRecord, field: string): string {
  const value = entry[field];
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} must be a non-empty string`);
  return value;
}

async function loadDraft(root: string, inputPath?: string): Promise<HandoffDraft> {
  if (!inputPath) return {};
  const relative = normalizeRelativePath(inputPath, "input path");
  const absolute = await safeRepositoryFile(root, relative);
  if (!absolute) throw new Error(`handoff input does not exist: ${relative}`);
  const value: unknown = parse(decodeContinuityText(await readFile(absolute), relative));
  if (!isRecord(value)) throw new Error("handoff input must contain a mapping");
  const decisions = parseArrayOfRecords(value.decisions, "decisions", (entry) => {
    const authority = requiredString(entry, "authority");
    if (!new Set(["delegated", "approved", "provisional"]).has(authority)) throw new Error("decision authority is invalid");
    return {
      statement: requiredString(entry, "statement"),
      authority: authority as DecisionAuthority,
      source: requiredString(entry, "source"),
    };
  });
  const files = parseArrayOfRecords(value.files, "files", (entry) => {
    const state = requiredString(entry, "state");
    if (!new Set(["created", "modified", "deleted", "inspected"]).has(state)) throw new Error("file state is invalid");
    return {
      path: normalizeRelativePath(requiredString(entry, "path"), "file path"),
      state: state as FileState,
      summary: requiredString(entry, "summary"),
    };
  });
  const checks = parseArrayOfRecords(value.checks, "checks", (entry) => {
    const status = requiredString(entry, "status");
    if (!new Set(["pass", "fail", "blocked", "not-run"]).has(status)) throw new Error("check status is invalid");
    if (typeof entry.evidence !== "string") throw new Error("check evidence must be a string");
    return { name: requiredString(entry, "name"), status: status as CheckStatus, evidence: entry.evidence };
  });
  const nextSafeAction = value.next_safe_action === undefined ? undefined : requiredString(value, "next_safe_action");
  const uncommittedSummary = value.uncommitted_summary === undefined
    ? undefined
    : value.uncommitted_summary === null ? null : requiredString(value, "uncommitted_summary");
  const completed = strings(value.completed, "completed");
  const blockers = strings(value.blockers, "blockers");
  const openQuestions = strings(value.open_questions, "open_questions");
  const doNotRepeat = strings(value.do_not_repeat, "do_not_repeat");
  const resumeSources = strings(value.resume_sources, "resume_sources")
    ?.map((entry) => normalizeRelativePath(entry, "resume source"));
  const allowed = new Set([
    "completed", "decisions", "files", "checks", "blockers", "open_questions", "next_safe_action",
    "do_not_repeat", "resume_sources", "uncommitted_summary",
  ]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`handoff input contains unknown fields: ${unknown.join(", ")}`);
  return {
    ...(completed ? { completed } : {}),
    ...(decisions ? { decisions } : {}),
    ...(files ? { files } : {}),
    ...(checks ? { checks } : {}),
    ...(blockers ? { blockers } : {}),
    ...(openQuestions ? { open_questions: openQuestions } : {}),
    ...(nextSafeAction ? { next_safe_action: nextSafeAction } : {}),
    ...(doNotRepeat ? { do_not_repeat: doNotRepeat } : {}),
    ...(resumeSources ? { resume_sources: resumeSources } : {}),
    ...(uncommittedSummary !== undefined ? { uncommitted_summary: uncommittedSummary } : {}),
  };
}

async function loadTaskState(root: string, taskId: string): Promise<TaskState> {
  const statePath = `.agent-context/tasks/${taskId}/state.yaml`;
  const value: unknown = parse(await readContinuityText(root, statePath));
  if (!isRecord(value) || value.task_id !== taskId || typeof value.objective !== "string") {
    throw new Error(`${statePath} must contain matching task_id and objective`);
  }
  const checks = Array.isArray(value.checks) ? value.checks.filter(isRecord).map((entry) => ({
    id: typeof entry.id === "string" ? entry.id : "unnamed check",
    ...(typeof entry.status === "string" ? { status: entry.status } : {}),
    evidence_refs: Array.isArray(entry.evidence_refs)
      ? entry.evidence_refs.filter((reference): reference is string => typeof reference === "string")
      : [],
  })) : [];
  return {
    task_id: taskId,
    objective: value.objective,
    ...(typeof value.source_system === "string" ? { source_system: value.source_system } : {}),
    ...(typeof value.source_ref === "string" ? { source_ref: value.source_ref } : {}),
    file_intents: Array.isArray(value.file_intents) ? value.file_intents.filter((entry): entry is string => typeof entry === "string").map(entry => entry.trim().replace(/^\.\//, "")) : [],
    checks,
  };
}

async function loadContextLock(root: string, taskId: string): Promise<{ lock: ContextLock; raw: Buffer; path: string }> {
  const lockPath = `.agent-context/tasks/${taskId}/context.lock.json`;
  const raw = (await readContinuityBytes(root, lockPath))!;
  const value: unknown = JSON.parse(decodeContinuityText(raw, lockPath));
  if (!isRecord(value) || value.task_id !== taskId || typeof value.lock_hash !== "string") {
    throw new Error(`${lockPath} must contain matching task_id and lock_hash`);
  }
  const { lock_hash: _ignored, ...payload } = value;
  if (computeContextLockHash(payload as Omit<ContextLock, "lock_hash">) !== value.lock_hash) {
    throw new Error(`${lockPath} has an invalid self-hash`);
  }
  validateArchivedSectionShapes(value);
  return { lock: value as unknown as ContextLock, raw, path: lockPath };
}

function validateArchivedSectionShapes(value: JsonRecord): void {
  if (!Array.isArray(value.sources)) throw new Error("context archive has no sources");
  for (const source of value.sources) {
    if (!isRecord(source)) throw new Error("context archive has an invalid source");
    validateLockedSection(source as unknown as ContextLock["sources"][number]);
  }
}

async function gitStatus(root: string): Promise<WorktreeEntry[]> {
  let prefix: string;
  try {
    const result = await execFileAsync("git", ["--no-optional-locks", "rev-parse", "--show-prefix"], {
      cwd: root,
      encoding: "buffer",
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
    // Strip Git's final line ending only: whitespace can be part of a path.
    if (decodeContinuityText(result.stderr, "Git root diagnostic").trim()) throw new Error(`Git root diagnostic: ${JSON.stringify(result.stderr.toString("utf8"))}`);
    prefix = decodeContinuityText(result.stdout, "Git root").replace(/\r?\n$/, "");
  } catch (error) {
    throw new Error(`The Git worktree root must be identifiable before creating a handoff safely: ${(error as Error).message}`);
  }
  if (prefix !== "") {
    throw new Error("The CanonTrail project root must be the Git worktree root to create a handoff/checkpoint; nested project roots are not supported. No handoff artifacts were written. Do not move or reinitialize an existing project merely to bypass this boundary.");
  }
  try {
    const result = await execFileAsync("git", ["--no-optional-locks", "status", "--porcelain=v1", "-z", "--untracked-files=all"], {
      cwd: root,
      encoding: "buffer",
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
    return parseGitStatusCapture(result.stdout, result.stderr);
  } catch (error) {
    throw new Error(`Complete UTF-8 Git worktree status is required to create a handoff safely (16 MiB capture limit; no truncation). Resolve Git diagnostics or access/path limits and retry; no Git configuration was changed. ${(error as Error).message}`);
  }
}

function defaultChecks(state: TaskState): HandoffCheck[] {
  return state.checks.map((check) => ({
    name: check.id,
    status: check.status === "pass" ? "pass"
      : check.status === "fail" ? "fail"
        : check.status === "blocked" ? "blocked" : "not-run",
    evidence: check.evidence_refs.join(", "),
  }));
}

function mergeFiles(gitEntries: WorktreeEntry[], draftFiles: HandoffFile[], relevant: Set<string>): HandoffFile[] {
  const merged = new Map<string, HandoffFile>();
  for (const entry of gitEntries) {
    if (!relevant.has(entry.path) && !(entry.original_path && relevant.has(entry.original_path))) continue;
    merged.set(entry.path, {
      path: entry.path,
      state: entry.code.includes("D") ? "deleted" : entry.code === "??" || entry.code.includes("A") ? "created" : "modified",
      summary: `Git status ${entry.code.trim()} before handoff; selected by task context or exact file intent.${entry.original_path ? ` Original path: ${JSON.stringify(entry.original_path)}.` : ""}`,
    });
  }
  for (const file of draftFiles) merged.set(file.path, file);
  return [...merged.values()].sort((left, right) => compareCodeUnits(left.path, right.path));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

async function validateConfiguredArtifact(root: string, name: string, value: unknown, requiredProperty?: string): Promise<void> {
  const config = await loadConfig(root);
  const schemaPath = normalizeRelativePath(`${config.schemaPath}/${name}.schema.json`, `${name} schema path`);
  const schemaFile = await safeRepositoryFile(root, schemaPath);
  if (!schemaFile) throw new Error(`${name} schema does not exist: ${schemaPath}; review and synchronize the installed schemas explicitly`);
  const schema: unknown = JSON.parse(decodeContinuityText(await readFile(schemaFile), schemaPath));
  if (!isRecord(schema)) throw new Error(`${name} schema is invalid: ${schemaPath}`);
  if (requiredProperty && (!isRecord(schema.properties) || !isRecord(schema.properties[requiredProperty]))) {
    throw new Error(`${name} schema does not explicitly support ${requiredProperty}; review and synchronize the installed schemas before creating a compact handoff. No automatic schema migration.`);
  }
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (!validate(value)) {
    const detail = (validate.errors ?? [])
      .map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
      .join("; ");
    throw new Error(`${name} does not satisfy the current schema: ${detail}; review installed schema compatibility`);
  }
}

export async function verifyHandoffForTask(root: string, taskId: string, value: JsonRecord): Promise<void> {
  await validateConfiguredArtifact(root, "handoff", value);
  const inventory = await verifyWorktreeInventory(root, value);
  if (inventory) await validateConfiguredArtifact(root, "worktree-inventory", inventory);
  const findings = validateHandoffSemantics(value);
  if (findings.length > 0) {
    throw new Error(`existing handoff is invalid and cannot be safely archived: ${findings.map((entry) => entry.message).join("; ")}`);
  }
  if (value.task_id !== taskId) throw new Error("existing handoff task_id does not match its task directory");
  const resumeSources = Array.isArray(value.resume_sources)
    ? value.resume_sources.filter((entry): entry is string => typeof entry === "string")
    : [];
  const missingResumeSources: string[] = [];
  for (const source of resumeSources) {
    const relative = normalizeRelativePath(source, "existing resume source");
    if (!(await safeRepositoryFile(root, relative))) missingResumeSources.push(relative);
  }
  if (missingResumeSources.length > 0) {
    throw new Error(
      `existing handoff cannot be safely archived; missing resume source(s): ${missingResumeSources.join(", ")}; ` +
      "restore the file(s), or deliberately update the existing handoff's resume_sources and re-validate it before replacing",
    );
  }
  if (typeof value.source_context_lock_path !== "string" || typeof value.source_context_lock_hash !== "string") {
    throw new Error("existing handoff does not identify archived source context");
  }
  const archivePath = normalizeRelativePath(value.source_context_lock_path, "existing source context lock path");
  if (archivePath !== `.agent-context/tasks/${taskId}/evidence/context-locks/${value.source_context_lock_hash.slice(7)}.json`) {
    throw new Error("existing handoff source context archive is outside the owning task");
  }
  const archive: unknown = JSON.parse(await readContinuityText(root, archivePath));
  if (!isRecord(archive) || typeof archive.lock_hash !== "string") {
    throw new Error("existing handoff source context archive is invalid");
  }
  const { lock_hash: _ignored, ...payload } = archive;
  if (
    computeContextLockHash(payload as Omit<ContextLock, "lock_hash">) !== archive.lock_hash ||
    archive.lock_hash !== value.source_context_lock_hash ||
    archive.task_id !== taskId
  ) {
    throw new Error("existing handoff source context archive does not match the handoff");
  }
  validateArchivedSectionShapes(archive);
}

export async function createHandoff(options: CreateHandoffOptions): Promise<HandoffCreateReport> {
  const root = path.resolve(options.root);
  const taskId = options.taskId.trim();
  if (!taskId || /[\\/]/.test(taskId)) throw new Error("task id must be a non-empty path segment");
  const sourceSessionId = options.sourceSessionId.trim();
  if (!sourceSessionId) throw new Error("source session id must be non-empty");
  if (options.checkpointTrigger && !CHECKPOINT_TRIGGERS.includes(options.checkpointTrigger)) {
    throw new Error(`unsupported checkpoint trigger: ${options.checkpointTrigger}`);
  }
  const sourceProvider = options.sourceProvider?.trim();
  if (options.sourceProvider !== undefined && !sourceProvider) {
    throw new Error("source provider must be non-empty when supplied");
  }
  const sourceProviderEvent = options.sourceProviderEvent?.trim();
  if (options.sourceProviderEvent !== undefined && !sourceProviderEvent) {
    throw new Error("source provider event must be non-empty when supplied");
  }
  if (sourceProviderEvent && !sourceProvider) {
    throw new Error("source provider event requires a source provider");
  }
  const createdAt = options.createdAt ?? new Date().toISOString();
  if (!isIsoDateTime(createdAt)) throw new Error("created-at must be an ISO date-time");
  const taskRoot = `.agent-context/tasks/${taskId}`;
  const outputPath = `${taskRoot}/handoff.yaml`;
  const [state, context, draft, gitEntries] = await Promise.all([
    loadTaskState(root, taskId),
    loadContextLock(root, taskId),
    loadDraft(root, options.inputPath),
    gitStatus(root),
  ]);
  const lockHex = context.lock.lock_hash.replace(/^sha256:/, "");
  const sourceArchivePath = `${taskRoot}/evidence/context-locks/${lockHex}.json`;
  const existingHandoff = await readContinuityBytes(root, outputPath, false);
  if (existingHandoff && !options.replace) {
    throw new Error(`handoff already exists; use --replace to archive and replace ${outputPath}`);
  }

  let previousArchivePath: string | null = null;
  if (existingHandoff) {
    const previous: unknown = parse(decodeContinuityText(existingHandoff, outputPath));
    if (!isRecord(previous)) throw new Error("existing handoff is invalid and cannot be safely archived");
    await verifyHandoffForTask(root, taskId, previous);
    const previousHash = String(previous.handoff_hash).replace(/^sha256:/, "");
    previousArchivePath = `${taskRoot}/evidence/handoffs/${previousHash}.yaml`;
  }

  const draftFiles = draft.files ?? [];
  const files = mergeFiles(gitEntries, draftFiles, new Set([...context.lock.sources.map(source => source.path), ...state.file_intents]));
  const inventory: WorktreeInventory = { version: 1, task_id: taskId, created_at: createdAt, entries: gitEntries };
  const inventoryBytes = JSON.stringify(inventory, null, 2) + "\n";
  const inventoryRef = inventoryReference(inventory, inventoryBytes);
  const worktreeDirty = gitEntries.length > 0;
  const uncommittedSummary = worktreeDirty
    ? draft.uncommitted_summary ?? `Git reports ${gitEntries.length} changed/untracked entries; ${files.length} task-selected or explicitly reported files are listed below. The complete hash-bound worktree_inventory is separate on-demand safety evidence, not an ownership claim or file-content backup.`
    : draft.uncommitted_summary ?? null;
  const resumeSources = unique([
    ...context.lock.sources.map((source) => source.path),
    context.path,
    ...(draft.resume_sources ?? []),
  ]);
  const timestampId = createdAt.replace(/[^0-9]/g, "").slice(0, 14);
  const withoutHash: Omit<Handoff, "handoff_hash"> = {
    handoff_id: options.handoffId?.trim() || `H-${taskId}-${timestampId}`,
    task_id: taskId,
    ...(state.source_system ? { source_system: state.source_system } : {}),
    ...(state.source_ref ? { source_ref: state.source_ref } : {}),
    created_at: createdAt,
    source_session_id: sourceSessionId,
    ...(options.checkpointTrigger ? { checkpoint_trigger: options.checkpointTrigger } : {}),
    ...(sourceProvider ? { source_provider: sourceProvider } : {}),
    ...(sourceProviderEvent ? { source_provider_event: sourceProviderEvent } : {}),
    source_context_lock_path: sourceArchivePath,
    source_context_lock_hash: context.lock.lock_hash,
    objective: state.objective,
    completed: draft.completed ?? [],
    decisions: draft.decisions ?? [],
    files,
    checks: draft.checks ?? defaultChecks(state),
    blockers: draft.blockers ?? [],
    open_questions: draft.open_questions ?? [],
    next_safe_action: options.nextSafeAction?.trim() || draft.next_safe_action || "",
    do_not_repeat: draft.do_not_repeat ?? [],
    resume_sources: resumeSources,
    worktree_dirty: worktreeDirty,
    uncommitted_summary: uncommittedSummary,
    worktree_inventory: inventoryRef,
  };
  const handoff: Handoff = { ...withoutHash, handoff_hash: computeHandoffHash(withoutHash) };
  const semanticFindings = validateHandoffSemantics(handoff as unknown as JsonRecord).filter((entry) => entry.code !== "HANDOFF005");
  if (semanticFindings.length > 0) throw new Error(semanticFindings.map((entry) => entry.message).join("; "));
  // Fail BEFORE any archive/output write on old or restrictive installed schemas.
  await validateConfiguredArtifact(root, "handoff", handoff, "worktree_inventory");
  await validateConfiguredArtifact(root, "worktree-inventory", inventory);
  await resolveInventoryPath(root, inventoryRef.path, false);
  const serialized = Buffer.from(serializeHandoff(handoff), "utf8");
  const outputModified = !existingHandoff?.equals(serialized);
  // Complete deterministic preflight, including the LAST potential collision,
  // before creating a sidecar. A dry run observes these same boundaries.
  await preflightImmutable(root, inventoryRef.path, Buffer.from(inventoryBytes));
  await preflightImmutable(root, sourceArchivePath, context.raw);
  if (existingHandoff && previousArchivePath) await preflightImmutable(root, previousArchivePath, existingHandoff);
  for (const source of context.lock.sources) {
    const absolute = await safeRepositoryFile(root, source.path);
    if (!absolute) throw new Error(`Current context source is missing: ${source.path}; review and recompile before handoff creation`);
    const bytes = await readFile(absolute);
    if (sha256(bytes) !== source.content_hash) throw new Error(`Current context source changed: ${source.path}; review and recompile before handoff creation`);
    validateLockedSection(source, bytes);
  }
  for (const source of resumeSources) {
    if (!(await safeRepositoryFile(root, source))) throw new Error(`New handoff has a missing resume source: ${source}`);
  }

  if (options.apply) {
    await writeWorktreeInventory(root, inventoryRef, inventoryBytes);
    await writeImmutableContinuity(root, sourceArchivePath, context.raw);
    if (existingHandoff && previousArchivePath) {
      await writeImmutableContinuity(root, previousArchivePath, existingHandoff);
    }
    if (outputModified) await writeMutableContinuity(root, outputPath, serialized, existingHandoff);
  }

  return {
    root,
    task_id: taskId,
    mode: options.apply ? "applied" : "dry-run",
    output_path: outputPath,
    source_context_archive_path: sourceArchivePath,
    previous_handoff_archive_path: previousArchivePath,
    output_modified: Boolean(options.apply && outputModified),
    handoff,
  };
}

export function formatHandoffCreateReport(report: HandoffCreateReport): string {
  const outputState = report.mode === "dry-run" ? "not written" : report.output_modified ? "written" : "unchanged";
  return [
    `Handoff create ${report.mode}: ${report.task_id}`,
    `Output: ${report.output_path} (${outputState})`,
    `Source context archive: ${report.source_context_archive_path}`,
    `Previous handoff archive: ${report.previous_handoff_archive_path ?? "none"}`,
    `Worktree dirty: ${report.handoff.worktree_dirty}`,
    ...(report.handoff.worktree_inventory ? [
      `Worktree inventory: ${report.handoff.worktree_inventory.entry_count} entries (${JSON.stringify(report.handoff.worktree_inventory.path)}; ${outputState})`,
      `Task-selected/explicit files: ${report.handoff.files.length}; inventory is verified separately, not automatically loaded as context.`,
    ] : []),
    `Resume sources: ${report.handoff.resume_sources.length}`,
    `Handoff hash: ${report.handoff.handoff_hash}`,
    `Next${report.mode === "dry-run" ? " (after --apply)" : ""}: ensure ${JSON.stringify(`.agent-context/tasks/${report.task_id}/state.yaml`)} sets latest_handoff to ${JSON.stringify(report.output_path)}.`,
    "Task state was not modified. After updating it, recompile the active task context; keep archived source context unchanged.",
  ].join("\n");
}
