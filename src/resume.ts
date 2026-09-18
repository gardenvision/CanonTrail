import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { safeRepositoryFile } from "./context-source-path.js";
import { assertSectionContextSchemas } from "./context-schema.js";
import { loadConfig } from "./config.js";
import { validateLockedSection } from "./context-sections.js";
import path from "node:path";
import { parse } from "yaml";
import {
  compileContext,
  computeContextLockHash,
  serializeContextLock,
  type ContextLock,
  type ContextLockOmission,
} from "./context.js";
import { isIsoDateTime } from "./date-time.js";
import { verifyHandoffForTask, type Handoff } from "./handoff.js";
import { normalizePath, sha256 } from "./indexer.js";
import { writeFileAtomic } from "./safe-write.js";

type JsonRecord = Record<string, unknown>;

export interface ResumePacket {
  resume_packet_id: string;
  task_id: string;
  created_at: string;
  receiving_session_id: string;
  handoff_path: string;
  handoff_hash: string;
  source_session_id: string;
  source_context_lock_path: string;
  source_context_lock_hash: string;
  receiving_context_lock_path: string;
  receiving_context_lock_hash: string;
  active_context_lock_path: string;
  objective: string;
  next_safe_action: string;
  blockers: string[];
  open_questions: string[];
  do_not_repeat: string[];
  worktree_dirty: boolean;
  uncommitted_summary: string | null;
  read_order: string[];
  omissions: ContextLockOmission[];
  bootstrap_instruction: string;
  raw_transcripts_included: false;
  packet_hash: string;
}

export interface CreateResumeOptions {
  root: string;
  taskId: string;
  receivingSessionId: string;
  totalTokens?: number;
  reservedOutputTokens?: number;
  inputSafetyTokens?: number;
  includePaths?: string[];
  createdAt?: string;
  packetId?: string;
  apply?: boolean;
}

export interface ResumeCreateReport {
  root: string;
  task_id: string;
  mode: "dry-run" | "applied";
  packet_path: string;
  receiving_context_archive_path: string;
  active_context_lock_path: string;
  packet_written: boolean;
  context_archive_written: boolean;
  active_context_modified: boolean;
  packet: ResumePacket;
  context_lock: ContextLock;
}

export interface ResumeFinding {
  code: "RESUME001" | "RESUME002" | "RESUME003" | "RESUME004";
  message: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function normalizeRelativePath(value: string, field: string): string {
  const normalized = normalizePath(value.trim().replace(/^\.\//, ""));
  if (!normalized || path.isAbsolute(value) || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`${field} must be a repository-relative path: ${value}`);
  }
  return normalized;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function immutableState(filePath: string, content: string): Promise<"missing" | "identical"> {
  if (!(await exists(filePath))) return "missing";
  if (await readFile(filePath, "utf8") !== content) {
    throw new Error(`immutable artifact already exists with different content: ${filePath}`);
  }
  return "identical";
}

async function writeImmutable(filePath: string, content: string): Promise<boolean> {
  await mkdir(path.dirname(filePath), { recursive: true });
  try {
    await writeFile(filePath, content, { encoding: "utf8", flag: "wx" });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (await readFile(filePath, "utf8") !== content) {
      throw new Error(`immutable artifact already exists with different content: ${filePath}`);
    }
    return false;
  }
}

export function computeResumePacketHash(value: Omit<ResumePacket, "packet_hash"> | JsonRecord): string {
  return sha256(JSON.stringify(canonicalize(value)));
}

export function serializeResumePacket(packet: ResumePacket): string {
  return `${JSON.stringify(packet, null, 2)}\n`;
}

export function validateResumePacketSemantics(value: JsonRecord): ResumeFinding[] {
  const findings: ResumeFinding[] = [];
  const packetHash = typeof value.packet_hash === "string" ? value.packet_hash : "";
  const { packet_hash: _ignored, ...payload } = value;
  if (packetHash.toLowerCase() !== computeResumePacketHash(payload).toLowerCase()) {
    findings.push({ code: "RESUME001", message: "resume packet self-hash does not match its payload" });
  }
  if (value.raw_transcripts_included !== false) {
    findings.push({ code: "RESUME002", message: "resume packet must exclude raw transcripts" });
  }
  const readOrder = Array.isArray(value.read_order)
    ? value.read_order.filter((entry): entry is string => typeof entry === "string")
    : [];
  if (new Set(readOrder).size !== readOrder.length) {
    findings.push({ code: "RESUME003", message: "resume packet read_order contains duplicate paths" });
  }
  const nextAction = typeof value.next_safe_action === "string" ? value.next_safe_action.trim() : "";
  if (nextAction.length < 20 || /^(?:continue|finish|keep working|resume)\.?$/i.test(nextAction)) {
    findings.push({ code: "RESUME004", message: "resume packet next_safe_action is too vague" });
  }
  return findings;
}

async function verifyProspectiveSources(root: string, lock: ContextLock): Promise<void> {
  for (const source of lock.sources) {
    const relative = normalizeRelativePath(source.path, "context source");
    const absolute = await safeRepositoryFile(root, relative);
    if (!absolute) throw new Error(`context source disappeared before resume apply: ${relative}`);
    const content = await readFile(absolute);
    if (sha256(content) !== source.content_hash) {
      throw new Error(`context source changed before resume apply: ${relative}`);
    }
    validateLockedSection(source, content);
  }
  const { lock_hash: _ignored, ...payload } = lock;
  if (computeContextLockHash(payload) !== lock.lock_hash) throw new Error("receiving context lock self-hash is invalid");
}

export async function createResumePacket(options: CreateResumeOptions): Promise<ResumeCreateReport> {
  const root = path.resolve(options.root);
  const taskId = options.taskId.trim();
  if (!taskId || /[\\/]/.test(taskId)) throw new Error("task id must be a non-empty path segment");
  const receivingSessionId = options.receivingSessionId.trim();
  if (!receivingSessionId) throw new Error("receiving session id must be non-empty");
  const createdAt = options.createdAt ?? new Date().toISOString();
  if (!isIsoDateTime(createdAt)) throw new Error("created-at must be an ISO date-time");
  const taskRoot = `.agent-context/tasks/${taskId}`;
  const handoffPath = `${taskRoot}/handoff.yaml`;
  const handoffAbsolute = await safeRepositoryFile(root, handoffPath);
  if (!handoffAbsolute) throw new Error(`required latest handoff does not exist: ${handoffPath}`);
  const handoffRaw = await readFile(handoffAbsolute, "utf8");
  const handoffValue: unknown = parse(handoffRaw);
  if (!isRecord(handoffValue)) throw new Error("latest handoff must contain a mapping");
  await verifyHandoffForTask(root, taskId, handoffValue);
  const handoff = handoffValue as unknown as Handoff;

  const includePaths = [...new Set([handoffPath, ...(options.includePaths ?? [])])];
  const contextReport = await compileContext({
    root,
    taskId,
    ...(options.totalTokens === undefined ? {} : { totalTokens: options.totalTokens }),
    ...(options.reservedOutputTokens === undefined ? {} : { reservedOutputTokens: options.reservedOutputTokens }),
    ...(options.inputSafetyTokens === undefined ? {} : { inputSafetyTokens: options.inputSafetyTokens }),
    includePaths,
    agentRunId: receivingSessionId,
    createdAt,
    apply: false,
  });
  const contextLock = contextReport.lock;
  const handoffSource = contextLock.sources.find((source) => source.path === handoffPath);
  if (!handoffSource || !handoffSource.selector.split(",").includes("explicit-include")) {
    throw new Error("receiving context lock does not contain the latest handoff as required context");
  }
  if (handoffSource.content_hash !== sha256(Buffer.from(handoffRaw, "utf8"))) {
    throw new Error("receiving context lock handoff hash does not match the latest handoff bytes");
  }

  const lockHex = contextLock.lock_hash.replace(/^sha256:/, "");
  const receivingArchivePath = `${taskRoot}/evidence/context-locks/${lockHex}.json`;
  const activeContextPath = `${taskRoot}/context.lock.json`;
  const bootstrapInstruction = "Run canontrail resume validate --packet with this exact packet path before current use; repository integrity validation is not resume approval. Read read_order in order; for sources with line_ranges read only those exact inclusive lines after checking the full source hash and selection_hash. Other sources are whole-file inputs. Do not load the previous transcript, and begin only with next_safe_action after confirming source hashes.";
  const withoutHash: Omit<ResumePacket, "packet_hash"> = {
    resume_packet_id: options.packetId?.trim() || `R-${taskId}-${createdAt.replace(/[^0-9]/g, "").slice(0, 14)}`,
    task_id: taskId,
    created_at: createdAt,
    receiving_session_id: receivingSessionId,
    handoff_path: handoffPath,
    handoff_hash: handoff.handoff_hash,
    source_session_id: handoff.source_session_id,
    source_context_lock_path: handoff.source_context_lock_path,
    source_context_lock_hash: handoff.source_context_lock_hash,
    receiving_context_lock_path: receivingArchivePath,
    receiving_context_lock_hash: contextLock.lock_hash,
    active_context_lock_path: activeContextPath,
    objective: handoff.objective,
    next_safe_action: handoff.next_safe_action,
    blockers: [...handoff.blockers],
    open_questions: [...handoff.open_questions],
    do_not_repeat: [...handoff.do_not_repeat],
    worktree_dirty: handoff.worktree_dirty,
    uncommitted_summary: handoff.uncommitted_summary,
    read_order: contextLock.sources.map((source) => source.path),
    omissions: contextLock.omissions.map((omission) => ({ ...omission })),
    bootstrap_instruction: bootstrapInstruction,
    raw_transcripts_included: false,
  };
  const packet: ResumePacket = { ...withoutHash, packet_hash: computeResumePacketHash(withoutHash) };
  const findings = validateResumePacketSemantics(packet as unknown as JsonRecord).filter((finding) => finding.code !== "RESUME001");
  if (findings.length > 0) throw new Error(findings.map((finding) => finding.message).join("; "));
  const packetHex = packet.packet_hash.replace(/^sha256:/, "");
  const packetPath = `${taskRoot}/evidence/resume-packets/${packetHex}.resume.packet.json`;
  const packetText = serializeResumePacket(packet);
  const contextText = serializeContextLock(contextLock);
  const packetAbsolute = path.join(root, ...packetPath.split("/"));
  const archiveAbsolute = path.join(root, ...receivingArchivePath.split("/"));
  const activeAbsolute = path.join(root, ...activeContextPath.split("/"));

  await immutableState(packetAbsolute, packetText);
  await immutableState(archiveAbsolute, contextText);
  await verifyProspectiveSources(root, contextLock);
  if (contextLock.sources.some(source => source.line_ranges)) {
    await assertSectionContextSchemas(root, await loadConfig(root), contextLock);
  }

  let packetWritten = false;
  let contextArchiveWritten = false;
  let activeContextModified = false;
  if (options.apply) {
    contextArchiveWritten = await writeImmutable(archiveAbsolute, contextText);
    let previousActive: string | undefined;
    try {
      previousActive = await readFile(activeAbsolute, "utf8");
    } catch {
      previousActive = undefined;
    }
    if (previousActive !== contextText) {
      await writeFileAtomic(activeAbsolute, contextText);
      activeContextModified = true;
    }
    packetWritten = await writeImmutable(packetAbsolute, packetText);
  }

  return {
    root,
    task_id: taskId,
    mode: options.apply ? "applied" : "dry-run",
    packet_path: packetPath,
    receiving_context_archive_path: receivingArchivePath,
    active_context_lock_path: activeContextPath,
    packet_written: packetWritten,
    context_archive_written: contextArchiveWritten,
    active_context_modified: activeContextModified,
    packet,
    context_lock: contextLock,
  };
}

export function formatResumeCreateReport(report: ResumeCreateReport): string {
  return [
    `Resume create ${report.mode}: ${report.task_id}`,
    `Packet: ${report.packet_path} (${report.mode === "dry-run" ? "not written" : report.packet_written ? "written" : "unchanged"})`,
    `Receiving context: ${report.receiving_context_archive_path}`,
    `Active context: ${report.active_context_lock_path} (${report.mode === "dry-run" ? "not written" : report.active_context_modified ? "written" : "unchanged"})`,
    `Read order: ${report.packet.read_order.length} sources`,
    `Next safe action: ${report.packet.next_safe_action}`,
    `Packet hash: ${report.packet.packet_hash}`,
  ].join("\n");
}
