import { readFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { ValidateFunction } from "ajv/dist/2020.js";
import { parse } from "yaml";
import { computeContextLockHash, type ContextLock } from "./context.js";
import { validateLockedSection } from "./context-sections.js";
import { safeRepositoryFile } from "./context-source-path.js";
import { validateHandoffSemantics } from "./handoff.js";
import { sha256 } from "./indexer.js";
import { validateResumePacketSemantics, type ResumePacket } from "./resume.js";
import type { Diagnostic } from "./types.js";

type RecordValue = Record<string, unknown>;
export type ResumeValidationPurpose = "retained-integrity" | "current-use";

function relativePath(value: string): void {
  if (!value || path.isAbsolute(value) || /[\\:\x00-\x1f\x7f]/.test(value)
      || value.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error(`Expected an exact repository-relative path: ${value}`);
  }
}

/** Audit immutable receipt provenance. A successful audit is not permission to
 * consume its read_order now and does not authenticate an unsigned producer. */
export async function auditResumeReferences(
  root: string,
  artifactPath: string,
  value: RecordValue,
  validators: Map<string, ValidateFunction>,
  purpose: ResumeValidationPurpose,
  diagnostics: Diagnostic[],
): Promise<{ lock: ContextLock; taskRoot: string | undefined } | undefined> {
  const fail = (code: string, message: string, error?: unknown) => diagnostics.push({
    severity: "error", code, path: artifactPath, message,
    ...(error ? { detail: error instanceof Error ? error.message : String(error) } : {}),
  });
  function schema(name: string, candidate: unknown): void {
    const check = validators.get(name);
    if (!check) throw new Error(`Required ${name} schema validator is unavailable`);
    if (!check(candidate)) throw new Error(`${name} schema: ${JSON.stringify(check.errors)}`);
  }
  async function bytes(relative: string): Promise<Buffer> {
    relativePath(relative);
    const exact = await safeRepositoryFile(root, relative);
    if (!exact) throw new Error(`Required provenance file does not exist: ${relative}`);
    return readFile(exact);
  }
  try { schema("resume-packet", value); }
  catch (error) { fail("RESUME011", "resume packet schema cannot be established", error); return; }
  const packet = value as unknown as ResumePacket;
  for (const finding of validateResumePacketSemantics(value)) fail(finding.code, finding.message);
  const owner = /^\.agent-context\/tasks\/([^/]+)\//.exec(artifactPath);
  const taskRoot = owner ? `.agent-context/tasks/${owner[1]}` : undefined;
  const namedHash = /^\.agent-context\/tasks\/[^/]+\/evidence\/resume-packets\/([a-f0-9]{64})\.resume\.packet\.json$/.exec(artifactPath);
  if (owner && owner[1] !== packet.task_id) fail("RESUME005", "resume packet task_id does not match its operational owner");
  if (namedHash && packet.packet_hash !== `sha256:${namedHash[1]}`) fail("RESUME005", "resume packet filename does not match packet_hash");
  if (taskRoot) {
    try {
      const state: unknown = parse((await bytes(`${taskRoot}/state.yaml`)).toString("utf8"));
      schema("task-state", state);
      if ((state as RecordValue).task_id !== packet.task_id) throw new Error("Owning task identity does not match");
    } catch (error) { fail("RESUME005", "resume packet owner cannot be established", error); }
  }

  let handoff: RecordValue, handoffBytes: Buffer;
  try {
    if (taskRoot && packet.handoff_path !== `${taskRoot}/handoff.yaml`) throw new Error("Packet must name its owning latest handoff path");
    relativePath(packet.handoff_path);
    // A retained archive is the byte-exact receipt, even when latest has the same
    // semantic self-hash but different YAML serialization. Never mask corruption
    // in an existing archive by falling back to a convenient latest copy.
    const archived = taskRoot && purpose === "retained-integrity"
      ? await safeRepositoryFile(root, taskRoot + "/evidence/handoffs/" + packet.handoff_hash.slice(7) + ".yaml")
      : undefined;
    const chosen = archived ?? await safeRepositoryFile(root, packet.handoff_path);
    if (!chosen) throw new Error("Bound handoff provenance does not exist");
    const candidate = await readFile(chosen);
    const parsed: unknown = parse(candidate.toString("utf8"));
    schema("handoff", parsed);
    handoff = parsed as RecordValue;
    handoffBytes = candidate!;
    if (validateHandoffSemantics(handoff).length) throw new Error("Handoff semantic/self-hash validation failed");
    const fields = ["task_id", "handoff_hash", "source_session_id", "source_context_lock_path", "source_context_lock_hash",
      "objective", "next_safe_action", "worktree_dirty", "uncommitted_summary", "blockers", "open_questions", "do_not_repeat"];
    if (fields.some(field => !isDeepStrictEqual(handoff[field], value[field]))) throw new Error("Packet projection does not match its bound handoff");
  } catch (error) { fail("RESUME006", "resume packet does not match its validated handoff provenance", error); return; }

  async function archivedLock(relative: string, hash: string): Promise<ContextLock> {
    if (taskRoot && relative !== `${taskRoot}/evidence/context-locks/${hash.slice(7)}.json`) {
      throw new Error("Context archive must use its exact owning task and hash-derived path");
    }
    const parsed: unknown = JSON.parse((await bytes(relative)).toString("utf8"));
    schema("context-lock", parsed);
    const lock = parsed as ContextLock;
    const { lock_hash: _ignored, ...payload } = lock;
    if (lock.task_id !== packet.task_id || lock.lock_hash !== hash || computeContextLockHash(payload) !== hash) {
      throw new Error("Context archive task/hash identity does not match");
    }
    const budget = lock.budget;
    if (budget.estimated_input_tokens + budget.reserved_output_tokens + (budget.reserved_input_tokens ?? 0) > budget.total_tokens
        || lock.sources.reduce((sum, source) => sum + source.estimated_tokens, 0) !== budget.estimated_input_tokens) {
      throw new Error("Context archive budget or selected estimate sum is inconsistent");
    }
    if (lock.raw_transcripts_included !== false || lock.omissions.some(omission => omission.required)) {
      throw new Error("Context archive discloses transcripts or omitted required sources");
    }
    const seen = new Set<string>();
    for (const source of lock.sources) {
      // Historical identities must be well-formed, but are not resolved against
      // today's tree: deletion or drift of a source does not alter old evidence.
      relativePath(source.path);
      if (seen.has(source.path)) throw new Error(`Duplicate archived source: ${source.path}`);
      seen.add(source.path);
      validateLockedSection(source);
    }
    return lock;
  }
  try { await archivedLock(packet.source_context_lock_path, packet.source_context_lock_hash); }
  catch (error) { fail("RESUME006", "resume packet source-session context archive is invalid", error); }

  let lock: ContextLock;
  try {
    lock = await archivedLock(packet.receiving_context_lock_path, packet.receiving_context_lock_hash);
    if (lock.agent_run_id !== packet.receiving_session_id || lock.created_at !== packet.created_at
        || !isDeepStrictEqual(packet.read_order, lock.sources.map(source => source.path))
        || !isDeepStrictEqual(packet.omissions, lock.omissions)) {
      throw new Error("Packet session/read-order/omissions do not match the receiving archive");
    }
    const handoffSource = lock.sources.find(source => source.path === packet.handoff_path);
    if (!handoffSource || !handoffSource.selector.split(",").includes("explicit-include")
        || handoffSource.line_ranges !== undefined || handoffSource.selection_hash !== undefined
        || handoffSource.content_hash !== sha256(handoffBytes)) {
      throw new Error("Receiving archive must select the complete exact bound handoff bytes");
    }
  } catch (error) { fail("RESUME007", "resume packet receiving context archive is invalid", error); return; }
  try {
    relativePath(packet.active_context_lock_path);
    if (taskRoot && packet.active_context_lock_path !== `${taskRoot}/context.lock.json`) throw new Error("Active context path is outside the owner");
  } catch (error) { fail("RESUME009", "active context lock path does not match the owning task", error); }
  if (!taskRoot && lock.sources.some(source => source.line_ranges !== undefined || source.selection_hash !== undefined)) {
    fail("RESUME010", "sectioned receiving context requires an operational task owner");
  }
  return { lock, taskRoot };
}
