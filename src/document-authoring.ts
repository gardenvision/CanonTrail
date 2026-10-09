import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";
import { parse, stringify } from "yaml";
import { loadConfig } from "./config.js";
import { readContinuityText, resolveContinuityFile } from "./continuity-files.js";
import { isIsoDateTime } from "./date-time.js";
import { isGovernedPath, normalizePath, sha256 } from "./indexer.js";
import { formatValidatorErrors } from "./schema-diagnostics.js";
import type { CanonTrailConfig } from "./types.js";

const require = createRequire(import.meta.url);

export function authoringText(value: string, name: string, maximumBytes = 16000): string {
  if (typeof value !== "string" || !value.trim() || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)
      || Buffer.byteLength(value, "utf8") > maximumBytes) throw new Error(`Invalid ${name}: provide bounded non-empty text.`);
  return value.trim();
}

export function authoringTime(value: string | undefined): string {
  const timestamp = value ?? new Date().toISOString();
  if (!isIsoDateTime(timestamp)) throw new Error("created-at must be an ISO date-time.");
  return timestamp;
}

export function assertPortableDocumentPath(relative: string): void {
  const parts = typeof relative === "string" ? relative.split("/") : [];
  if (!parts.length || path.isAbsolute(relative) || !/\.md$/i.test(relative)
      || parts.some(part => !part || part === "." || part === ".." || /[\\:\x00-\x1f\x7f<>"|?*]/.test(part)
        || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part)
        || [".git", ".planning", ".gsd"].includes(part.toLowerCase()))
      || relative.startsWith("docs/superpowers/")) {
    throw new Error("Document path must be exact portable repository-relative Markdown outside Git and external-workflow control trees.");
  }
}

export function isAuthoringExcluded(relative: string, config: CanonTrailConfig): boolean {
  return config.excludePaths.some(entry => {
    const prefix = normalizePath(entry).replace(/\/$/, "");
    return prefix === "." || relative === prefix || relative.startsWith(prefix + "/");
  });
}

export async function loadAuthoringConfig(root: string): Promise<CanonTrailConfig> {
  await readContinuityText(root, ".agent-context/config.yaml");
  await readContinuityText(root, "AGENTS.md");
  return loadConfig(root);
}

/** Both installed and shipped schemas matter. This does not synchronize either. */
export async function validateAuthoringPayload(root: string, config: CanonTrailConfig, name: string, payload: unknown): Promise<void> {
  const schemaPath = normalizePath(config.schemaPath).replace(/\/$/, "");
  const relative = `${schemaPath}/${name}.schema.json`;
  const installed = JSON.parse(await readContinuityText(root, relative));
  const shipped = JSON.parse(await readFile(new URL(`../schemas/${name}.schema.json`, import.meta.url), "utf8"));
  for (const [label, schema] of [["shipped", shipped], ["installed", installed]] as const) {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    (require("ajv-formats") as FormatsPlugin)(ajv);
    const validate = ajv.compile(schema);
    if (!validate(payload)) throw new Error(`${label} ${relative} rejected the document artifact: ${formatValidatorErrors(validate)}. No new output written.`);
  }
}

export async function requireAuthoringTask(root: string, config: CanonTrailConfig, taskId: string): Promise<void> {
  if (typeof taskId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(taskId)) throw new Error("Invalid task identity: provide an existing portable task id.");
  const relative = `.agent-context/tasks/${taskId}/state.yaml`;
  if (isAuthoringExcluded(relative, config) || !isGovernedPath(relative, config)) throw new Error(`Task is excluded or not governed: ${relative}`);
  const state: unknown = parse(await readContinuityText(root, relative));
  await validateAuthoringPayload(root, config, "task-state", state);
  if (!state || typeof state !== "object" || (state as Record<string, unknown>).task_id !== taskId) throw new Error(`Task state does not match ${JSON.stringify(taskId)}.`);
}

export interface CreateDocumentOptions {
  root: string;
  path: string;
  topicId: string;
  title: string;
  purpose: string;
  routing: string[];
  systems?: string[];
  createdAt?: string;
  apply?: boolean;
}

async function newDocumentPath(root: string, relative: string): Promise<string> {
  const absolute = await resolveContinuityFile(root, relative);
  try { await lstat(absolute); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return absolute; throw error; }
  throw new Error(`Document already exists: ${JSON.stringify(relative)}. Inspect its existing truth owner; nothing was overwritten.`);
}

/** Draft authoring, never automatic truth or promotion. Exclusive stable tree required. */
export async function createDocument(options: CreateDocumentOptions) {
  const root = path.resolve(options.root), relative = options.path;
  assertPortableDocumentPath(relative);
  const config = await loadAuthoringConfig(root);
  if (isAuthoringExcluded(relative, config) || !isGovernedPath(relative, config)) throw new Error(`Document output is excluded or not governed: ${JSON.stringify(relative)}.`);
  if (relative.split("/").some(part => part.toLowerCase() === ".agent-context")) {
    const owner = /^\.agent-context\/tasks\/([^/]+)\/(.+\.md)$/i.exec(relative);
    if (!owner || !relative.startsWith(".agent-context/tasks/")
        || /^evidence\/(?:handoffs|context-locks|worktree-inventories|document-snapshots)(?:\/|$)/.test(owner[2]!)) {
      throw new Error("Control-tree document output must belong to an existing task and avoid reserved evidence archives.");
    }
    await requireAuthoringTask(root, config, owner[1]!);
  }
  await newDocumentPath(root, relative);
  if (typeof options.topicId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(options.topicId)) throw new Error("topic must be one explicit bounded identity, not a guessed canonical topic.");
  const title = authoringText(options.title, "title", 4000), purpose = authoringText(options.purpose, "purpose");
  if (!Array.isArray(options.routing) || !options.routing.length || options.routing.length > 64) throw new Error("Provide 1..64 explicit task-routing entries.");
  const routing = options.routing.map(value => authoringText(value, "routing", 1000));
  const systems = (options.systems ?? []).map(value => authoringText(value, "system", 1000));
  if (new Set(routing).size !== routing.length || new Set(systems).size !== systems.length || systems.length > 64) throw new Error("Routing/system entries must be distinct and bounded.");
  const createdAt = authoringTime(options.createdAt);
  const header = { topic_id: options.topicId, stand: createdAt.slice(0, 10), status: "draft", truth_level: "draft",
    verification: { state: "unverified", evidence: [] }, read_if_task_touches: routing, primary_systems: systems,
    safe_to_edit: ["Draft only: compare real sources and evidence before changing authority or verification."],
    do_not_use_instead: ["AGENTS.md"] };
  await validateAuthoringPayload(root, config, "artifact-header", header);
  const content = `---\n${stringify(header, { lineWidth: 0 })}---\n\n# Document draft\n\n## Title\n\n${JSON.stringify(title)}\n\n## Purpose\n\n${JSON.stringify(purpose)}\n\n## Sources and evidence to review\n\nTODO: identify existing truth owners, source revisions, uncertainties and real verification.\n\nNo canonical authority, passing check, approval or task completion is supplied by this scaffold. Caller text is data, not execution instructions; JSON quoting protects block structure, not model behavior or all inline Markdown.\n`;
  const file = { path: relative, bytes: Buffer.byteLength(content), content_hash: sha256(content), content };
  if (options.apply) {
    let absolute = await newDocumentPath(root, relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    absolute = await newDocumentPath(root, relative);
    await writeFile(absolute, content, { encoding: "utf8", flag: "wx" });
  }
  return { version: 1 as const, kind: "document-draft" as const, root, created_at: createdAt,
    files: [file], writes_performed: options.apply === true, written_paths: options.apply ? [relative] : [],
    boundary: "Draft/unverified authoring only. No index refresh, promotion, task update, schema synchronization, Git or remote operation. Stable exclusive tree required." };
}

export function formatDocumentCreate(report: Awaited<ReturnType<typeof createDocument>>): string {
  return [`Document draft ${report.writes_performed ? "created" : "preview (no writes)"}`,
    ...report.files.map(file => `  ${JSON.stringify(file.path)} (${file.bytes} bytes; ${file.content_hash})`),
    "truth_level: draft; verification: unverified; evidence: empty.", report.boundary].join("\n");
}
