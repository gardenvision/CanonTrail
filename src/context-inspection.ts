import { lstat, open, opendir, readFile, readdir, realpath } from "node:fs/promises";
import { validateLockedSection } from "./context-sections.js";
import { createRequire } from "node:module";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";
import { parse } from "yaml";
import { loadConfig } from "./config.js";
import { computeContextLockHash, isSupportedText, type ContextLock } from "./context.js";
import { resolveCompletionScope } from "./finalize-scope.js";
import { sha256 } from "./indexer.js";
import type { CanonTrailConfig } from "./types.js";
import { compareCodeUnits } from "./ordering.js";

const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const require = createRequire(import.meta.url);
const ajv = new Ajv2020({ allErrors: true });
(require("ajv-formats") as FormatsPlugin)(ajv);
const validators = new Map<string, ReturnType<typeof ajv.compile>>();
const taskPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function localPath(value: string): string {
  // Exact portable spelling. No aliases or normalization that change the requested identity.
  if (!value || value !== value.trim() || /[\\:\x00-\x1f\x7f]/.test(value) || path.posix.isAbsolute(value)
      || value.split("/").some(p => !p || p === "." || p === ".." || p.toLowerCase() === ".git")) {
    throw new Error("Expected an exact repository-relative path, without traversal or control paths.");
  }
  return value;
}

function taskRoot(taskId: string): string {
  if (!taskPattern.test(taskId)) throw new Error("Invalid task id.");
  return `.agent-context/tasks/${taskId}`;
}

function excluded(file: string, config: Pick<CanonTrailConfig, "excludePaths">): boolean {
  return config.excludePaths.some(entry => {
    const prefix = entry.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
    return prefix === "." || file === prefix || file.startsWith(prefix + "/");
  });
}

async function readSource(root: string, relative: string, config: Pick<CanonTrailConfig, "excludePaths">): Promise<Buffer> {
  localPath(relative);
  if (excluded(relative, config)) throw new Error("Source is excluded: " + relative);
  if (!isSupportedText(relative)) throw new Error("Unsupported text source: " + relative);
  const realRoot = await realpath(root);
  let parent = realRoot;
  const parts = relative.split("/");
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (!(await readdir(parent)).includes(part)) throw new Error("Missing or aliased source component: " + relative);
    parent = path.join(parent, part);
    const info = await lstat(parent);
    if (info.isSymbolicLink() || (info.isFile() && info.nlink !== 1)
        || (i < parts.length - 1 ? !info.isDirectory() : !info.isFile())) {
      throw new Error("Source must use regular, unlinked repository entries: " + relative);
    }
  }
  const resolved = await realpath(parent);
  const inside = path.relative(realRoot, resolved);
  if (inside === ".." || inside.startsWith(".." + path.sep) || path.isAbsolute(inside)) throw new Error("Source escapes repository.");
  const handle = await open(resolved, "r");
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > MAX_SOURCE_BYTES) throw new Error("Source exceeds 8 MiB inspection limit.");
    const buffer = Buffer.alloc(MAX_SOURCE_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const result = await handle.read(buffer, length, buffer.length - length, length);
      if (result.bytesRead === 0) break;
      length += result.bytesRead;
    }
    const after = await handle.stat();
    if (length > MAX_SOURCE_BYTES || before.size !== after.size || before.mtimeMs !== after.mtimeMs || length !== after.size) {
      throw new Error("Source changed while reading or exceeds inspection limit.");
    }
    return buffer.subarray(0, length);
  } finally { await handle.close(); }
}

function utf8(bytes: Buffer): string {
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  if (text.includes("\0")) throw new Error("NUL-containing source is not supported text.");
  return text;
}

async function inspectedConfig(root: string): Promise<CanonTrailConfig> {
  // Do not let a linked control directory/config file bypass source read containment.
  try {
    await lstat(path.join(root, ".agent-context/config.yaml"));
    await readSource(root, ".agent-context/config.yaml", { excludePaths: [] });
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  return loadConfig(root);
}

async function validateShape(name: string, value: unknown): Promise<void> {
  let validate = validators.get(name);
  if (!validate) {
    // Use shipped schemas, not a potentially stale/relaxed project schema.
    const schema = JSON.parse(await readFile(new URL(`../schemas/${name}.schema.json`, import.meta.url), "utf8"));
    validate = ajv.compile(schema);
    validators.set(name, validate);
  }
  if (!validate(value)) throw new Error(`Invalid ${name}: ${ajv.errorsText(validate.errors)}`);
}

async function readLock(root: string, taskId: string, config: CanonTrailConfig): Promise<ContextLock> {
  const value = JSON.parse(utf8(await readSource(root, `${taskRoot(taskId)}/context.lock.json`, config))) as ContextLock;
  await validateShape("context-lock", value);
  const { lock_hash, ...payload } = value;
  if (value.task_id !== taskId || computeContextLockHash(payload) !== lock_hash) throw new Error("Context lock identity or self-hash mismatch.");
  const paths = value.sources.map(s => localPath(s.path));
  for (const source of value.sources) validateLockedSection(source);
  if (new Set(paths).size !== paths.length) throw new Error("Duplicate lock sources.");
  const sum = value.sources.reduce((total, source) => total + source.estimated_tokens, 0);
  const budget = value.budget;
  if (!Number.isSafeInteger(sum) || sum !== budget.estimated_input_tokens
      || sum + budget.reserved_output_tokens + (budget.reserved_input_tokens ?? 0) > budget.total_tokens
      || value.omissions.some(item => item.required)) throw new Error("Inconsistent lock budget or required omission.");
  return value;
}

export async function excerptContextSource(options: {
  root: string; source: string; from: number; to: number; maxTokens?: number; expectedHash?: string; taskId?: string;
}) {
  const maxTokens = options.maxTokens ?? 4000;
  if (![options.from, options.to, maxTokens].every(Number.isSafeInteger) || options.from < 1
      || options.to < options.from || maxTokens < 1 || maxTokens > 32000) throw new Error("Invalid line range or token limit (1..32000).");
  const root = path.resolve(options.root);
  const config = await inspectedConfig(root);
  const bytes = await readSource(root, options.source, config);
  const sourceHash = sha256(bytes);
  if (options.expectedHash !== undefined && options.expectedHash !== sourceHash) throw new Error("Source hash differs from expected identity.");
  const text = utf8(bytes);
  // Keep BOM and every CR/LF byte. A terminal newline does not invent an extra line.
  const lines = text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)?.filter(line => line.length > 0) ?? [];
  if (options.to > lines.length) throw new Error(`Line range exceeds ${lines.length} source lines.`);
  const content = lines.slice(options.from - 1, options.to).join("");
  const excerptBytes = Buffer.from(content, "utf8");
  const tokens = Math.ceil(excerptBytes.length / 4);
  if (tokens > maxTokens) throw new Error(`Excerpt needs ${tokens} estimated tokens; limit is ${maxTokens}. No truncated excerpt emitted.`);
  let selection: { task_id: string; lock_hash: string; whole_source_selected: boolean; recorded_source_hash: string | null } | null = null;
  if (options.taskId !== undefined) {
    const lock = await readLock(root, options.taskId, config);
    const source = lock.sources.find(s => s.path === options.source);
    selection = { task_id: options.taskId, lock_hash: lock.lock_hash,
      whole_source_selected: !!source && source.content_hash === sourceHash && !("line_ranges" in source),
      recorded_source_hash: source?.content_hash ?? null };
  }
  return {
    version: 1 as const, kind: "source-excerpt" as const, root,
    source: { path: options.source, content_hash: sourceHash, bytes: bytes.length, total_lines: lines.length },
    excerpt: { start_line: options.from, end_line: options.to, content, content_hash: sha256(excerptBytes), bytes: excerptBytes.length, estimated_tokens: tokens },
    lock_selection: selection, writes_performed: false as const,
    boundary: "Exact source output, not proof of model reading or canonical authority. The whole_source_selected flag means whole-file coverage only; inspect line_ranges and selection_hash in the lock for explicit section coverage.",
  };
}

type CompositionCategory = "governing-task" | "task-evidence" | "governed-document" | "implementation-and-other";
function category(source: ContextLock["sources"][number]): CompositionCategory {
  const selectors = source.selector.split(",");
  if (/^\.agent-context\/tasks\/[^/]+\/evidence\//.test(source.path)) return "task-evidence";
  if (/^\.agent-context\/tasks\/[^/]+\//.test(source.path)) return "governing-task";
  if (selectors.some(s => ["governing-instructions", "task-state", "task-brief", "task-change", "task-handoff"].includes(s))) return "governing-task";
  if (selectors.includes("task-evidence-reference")) return "task-evidence";
  if (["canonical", "design-target"].includes(source.truth_level)) return "governed-document";
  return "implementation-and-other";
}

export async function inspectTaskContext(options: { root: string; taskId: string }) {
  const root = path.resolve(options.root);
  const base = taskRoot(options.taskId);
  const config = await inspectedConfig(root);
  const lock = await readLock(root, options.taskId, config);
  const state = parse(utf8(await readSource(root, `${base}/state.yaml`, config))) as { task_id: string; dependencies: string[] };
  await validateShape("task-state", state);
  if (state.task_id !== options.taskId) throw new Error("Task state identity mismatch.");
  const rows: Array<{ path: string; estimated_tokens: number; category: CompositionCategory; freshness: "current" | "changed" | "unavailable"; detail: string | null }> = [];
  for (const source of lock.sources) {
    let freshness: "current" | "changed" | "unavailable";
    let detail: string | null = null;
    try {
      const bytes = await readSource(root, source.path, config);
      freshness = sha256(bytes) === source.content_hash ? "current" : "changed";
      if (freshness === "current") validateLockedSection(source, bytes);
      if (source.line_ranges) detail = "Selected inclusive lines: " + source.line_ranges.map(r => r.join("..")) + "; remainder not selected.";
    }
    catch (error) { freshness = "unavailable"; detail = (error as Error).message; }
    rows.push({ path: source.path, estimated_tokens: source.estimated_tokens, category: category(source), freshness, detail });
  }
  const composition = (["governing-task", "task-evidence", "governed-document", "implementation-and-other"] as const).map(name => {
    const matching = rows.filter(row => row.category === name);
    return { category: name, source_count: matching.length, estimated_tokens: matching.reduce((sum, row) => sum + row.estimated_tokens, 0) };
  });
  const mentions = new Map<string, string[]>();
  const noteIssues: Array<{ path: string; message: string }> = [];
  const knownTasks = new Set<string>();
  try {
    const directory = await opendir(path.join(root, ".agent-context/tasks"));
    let count = 0;
    for await (const entry of directory) {
      if (++count > 1000) throw new Error("Task-directory name inventory exceeded 1000 entries; bare-ID hints unavailable.");
      if (entry.isDirectory() && taskPattern.test(entry.name)) knownTasks.add(entry.name);
    }
  } catch (error) {
    knownTasks.clear();
    noteIssues.push({ path: ".agent-context/tasks", message: (error as Error).message });
  }
  // Deliberately bounded to two task-owned notes. Do not scan all tasks, source trees or chats.
  for (const name of ["brief.md", "report.md"]) {
    const file = `${base}/${name}`;
    try {
      const text = utf8(await readSource(root, file, config));
      const candidates = new Set([...text.matchAll(/\.agent-context\/tasks\/([A-Za-z0-9][A-Za-z0-9._-]*)\//g)].map(match => match[1]!));
      for (const token of text.match(/[A-Za-z0-9][A-Za-z0-9._-]*/g) ?? []) if (knownTasks.has(token)) candidates.add(token);
      for (const peer of candidates) {
        if (peer === options.taskId || state.dependencies.includes(peer)) continue;
        const from = mentions.get(peer) ?? [];
        if (!from.includes(file)) from.push(file);
        mentions.set(peer, from);
      }
    } catch (error) { noteIssues.push({ path: file, message: (error as Error).message }); }
  }
  const scope = await resolveCompletionScope(root, options.taskId);
  return {
    version: 1 as const, kind: "context-inspection" as const, root, task_id: options.taskId,
    lock_hash: lock.lock_hash, lock_created_at: lock.created_at, budget: lock.budget,
    input_headroom: lock.budget.total_tokens - lock.budget.reserved_output_tokens - (lock.budget.reserved_input_tokens ?? 0) - lock.budget.estimated_input_tokens,
    source_snapshot_ok: rows.every(row => row.freshness === "current"), composition, sources: rows, omissions: lock.omissions,
    declared_dependencies: state.dependencies,
    completion_scope: { mode: scope.mode, relevant_task_ids: scope.relevant_task_ids, fallback_reason: scope.fallback_reason },
    dependency_hints: [...mentions].sort(([a], [b]) => compareCodeUnits(a, b)).map(([task_id, mentioned_in]) => ({ task_id, mentioned_in, action: "Review whether this is a prerequisite, a historical reference, or independent work; no dependency was added." })),
    note_inspection_issues: noteIssues,
    compact_evidence_candidates: lock.sources.filter(s => s.selector.split(",").includes("task-evidence-reference") && !/\.evidence\.(?:ya?ml|json)$/.test(s.path)).map(s => s.path),
    writes_performed: false as const,
    boundary: "Stored selection only; unrecorded reads and actual model-token usage are unknown. Source freshness is not full repository validation or task completion. Dependency hints never change gates; compact evidence must not discard a deliberate raw-review requirement.",
  };
}

export function formatContextInspection(report: Awaited<ReturnType<typeof inspectTaskContext>>): string {
  return [`Context inspection: ${JSON.stringify(report.task_id)}`, `Selected input estimate: ${report.budget.estimated_input_tokens}; additional headroom: ${report.input_headroom}`,
    `Selected source snapshot: ${report.source_snapshot_ok ? "current" : "drift/unavailable"}`,
    ...report.composition.map(row => `  ${row.category}: ${row.estimated_tokens} tokens / ${row.source_count} sources`),
    ...report.sources.filter(row => row.freshness !== "current").map(row => `  ${row.freshness}: ${JSON.stringify(row.path)}`),
    ...report.sources.filter(row => row.detail).map(row => `  Source detail: ${JSON.stringify(row.path)}; ${row.estimated_tokens} selected estimated tokens; ${JSON.stringify(row.detail)}`),
    `Omitted candidates: ${report.omissions.length}`,
    ...report.dependency_hints.map(hint => `Dependency review hint: ${JSON.stringify(hint.task_id)} (not an inferred dependency)`),
    ...report.note_inspection_issues.map(issue => `Note unavailable: ${JSON.stringify(issue.path)}: ${JSON.stringify(issue.message)}`),
    `Cited raw-evidence candidates: ${report.compact_evidence_candidates.length}; consider existing evidence record when full text is unnecessary.`, report.boundary, "No writes performed."].join("\n");
}

export function formatContextExcerpt(report: Awaited<ReturnType<typeof excerptContextSource>>): string {
  const lines = report.excerpt.content.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)?.filter(Boolean) ?? [];
  return [`Source: ${JSON.stringify(report.source.path)} ${report.source.content_hash}`,
    `Lines ${report.excerpt.start_line}..${report.excerpt.end_line}; ${report.excerpt.estimated_tokens} estimated content tokens; excerpt ${report.excerpt.content_hash}`,
    ...lines.map((line, index) => `${report.excerpt.start_line + index}: ${JSON.stringify(line)}`),
    report.boundary, "No writes performed."].join("\n");
}
