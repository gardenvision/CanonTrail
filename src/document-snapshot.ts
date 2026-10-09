import { lstat, readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { decodeContinuityText, preflightImmutable, readContinuityBytes, resolveContinuityFile, writeImmutableContinuity } from "./continuity-files.js";
import { assertPortableDocumentPath, authoringText, authoringTime, isAuthoringExcluded, loadAuthoringConfig, requireAuthoringTask, validateAuthoringPayload } from "./document-authoring.js";
import { isGovernedPath, normalizePath, sha256 } from "./indexer.js";
import { compareCodeUnits } from "./ordering.js";
import type { CanonTrailConfig, Diagnostic } from "./types.js";

const MAX_BYTES = 8 * 1024 * 1024;
const SUFFIX = ".document-snapshot.json";
const RECORD_PATH = /^\.agent-context\/tasks\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/evidence\/document-snapshots\/([a-f0-9]{64})\.document-snapshot\.json$/;

export interface DocumentSnapshotRecord {
  version: 1;
  kind: "document-snapshot";
  task_id: string;
  source_path: string;
  source_content_hash: string;
  source_bytes: number;
  captured_at: string;
  purpose: string;
  archive_path: string;
  record_hash: string;
}

/** Construct the documented order; caller-authored property order is not authority. */
export function computeDocumentSnapshotHash(record: Omit<DocumentSnapshotRecord, "record_hash">): string {
  const payload = { version: record.version, kind: record.kind, task_id: record.task_id, source_path: record.source_path,
    source_content_hash: record.source_content_hash, source_bytes: record.source_bytes, captured_at: record.captured_at,
    purpose: record.purpose, archive_path: record.archive_path };
  return sha256(JSON.stringify(payload));
}

function snapshotPaths(taskId: string, sourceHash: string, recordHash?: string) {
  const base = `.agent-context/tasks/${taskId}/evidence/document-snapshots`;
  return { base, archive: `${base}/${sourceHash.slice(7)}.source.bin`,
    record: recordHash ? `${base}/${recordHash.slice(7)}${SUFFIX}` : undefined };
}

function requireSnapshotCoverage(config: CanonTrailConfig, base: string): void {
  if (!isGovernedPath(base, config) || config.excludePaths.some(value => {
    const prefix = normalizePath(value).replace(/\/$/, "");
    return prefix === "." || prefix === base || prefix.startsWith(base + "/") || base.startsWith(prefix + "/");
  })) throw new Error(`Document snapshot archive needs complete governed/non-excluded coverage: ${base}. Review configuration explicitly; nothing was rewritten.`);
}

async function boundedBytes(root: string, relative: string, maximum: number): Promise<Buffer> {
  const absolute = await resolveContinuityFile(root, relative, true);
  if ((await lstat(absolute)).size > maximum) throw new Error(`Document snapshot input exceeds ${maximum} bytes: ${JSON.stringify(relative)}`);
  const bytes = (await readContinuityBytes(root, relative))!;
  if (bytes.length > maximum) throw new Error(`Document snapshot input grew beyond its bound: ${JSON.stringify(relative)}`);
  return bytes;
}

function documentText(bytes: Buffer, relative: string): string {
  const text = decodeContinuityText(bytes, relative);
  if (text.includes("\0")) throw new Error(`Document snapshot source contains NUL text: ${JSON.stringify(relative)}`);
  return text;
}

export interface CaptureDocumentSnapshotOptions {
  root: string;
  taskId: string;
  sourcePath: string;
  purpose: string;
  expectedHash?: string;
  createdAt?: string;
  apply?: boolean;
}

/** Explicit local provenance capture. Never modifies or reclassifies the source. */
export async function captureDocumentSnapshot(options: CaptureDocumentSnapshotOptions) {
  const root = path.resolve(options.root), config = await loadAuthoringConfig(root);
  await requireAuthoringTask(root, config, options.taskId);
  assertPortableDocumentPath(options.sourcePath);
  if (isAuthoringExcluded(options.sourcePath, config)) throw new Error(`Snapshot source is excluded: ${JSON.stringify(options.sourcePath)}`);
  const purpose = authoringText(options.purpose, "snapshot purpose", 4000), createdAt = authoringTime(options.createdAt);
  const source = await boundedBytes(root, options.sourcePath, MAX_BYTES);
  documentText(source, options.sourcePath);
  const hash = sha256(source);
  if (options.expectedHash !== undefined && (!/^sha256:[a-f0-9]{64}$/.test(options.expectedHash) || options.expectedHash !== hash)) {
    throw new Error("Snapshot expected source hash does not match; no output written.");
  }
  const paths = snapshotPaths(options.taskId, hash);
  requireSnapshotCoverage(config, paths.base);
  const payload: Omit<DocumentSnapshotRecord, "record_hash"> = { version: 1, kind: "document-snapshot", task_id: options.taskId,
    source_path: options.sourcePath, source_content_hash: hash, source_bytes: source.length, captured_at: createdAt, purpose,
    archive_path: paths.archive };
  const record: DocumentSnapshotRecord = { ...payload, record_hash: computeDocumentSnapshotHash(payload) };
  const recordPath = snapshotPaths(options.taskId, hash, record.record_hash).record!;
  await validateAuthoringPayload(root, config, "document-snapshot", record);
  const recordBytes = Buffer.from(JSON.stringify(record, null, 2) + "\n", "utf8");
  const files = [{ path: paths.archive, bytes: source.length, content_hash: hash },
    { path: recordPath, bytes: recordBytes.length, content_hash: sha256(recordBytes) }];
  await preflightImmutable(root, paths.archive, source);
  await preflightImmutable(root, recordPath, recordBytes);
  const written: string[] = [];
  if (options.apply) {
    // Input drift and both known collisions are checked before the first output.
    const current = await boundedBytes(root, options.sourcePath, MAX_BYTES);
    if (!current.equals(source)) throw new Error("Snapshot source changed after preflight; no output written.");
    await preflightImmutable(root, paths.archive, source);
    await preflightImmutable(root, recordPath, recordBytes);
    try {
      if (await writeImmutableContinuity(root, paths.archive, source)) written.push(paths.archive);
      if (await writeImmutableContinuity(root, recordPath, recordBytes)) written.push(recordPath);
    } catch (error) {
      throw new Error(`Snapshot creation stopped; any partial new evidence is preserved for inspection, not removed. Cause: ${(error as Error).message}`);
    }
  }
  return { version: 1 as const, kind: "document-snapshot-capture" as const, root, record_path: recordPath, record,
    files, writes_performed: written.length > 0, written_paths: written,
    boundary: "Historical noncanonical bytes only, not verification or approval. Source, index, task state, Git and remotes are unchanged. Stable exclusive inputs required; two-file creation is not crash-atomic." };
}

/** Integrity of retained evidence; never resolve an old source against today's tree. */
export async function verifyDocumentSnapshot(root: string, relative: string, config: CanonTrailConfig) {
  const match = RECORD_PATH.exec(relative);
  if (!match) throw new Error("Snapshot record must use its exact hash-named path in its task's document-snapshots archive.");
  requireSnapshotCoverage(config, path.posix.dirname(relative));
  const bytes = await boundedBytes(root, relative, 32000);
  const record: DocumentSnapshotRecord = JSON.parse(decodeContinuityText(bytes, relative));
  await validateAuthoringPayload(root, config, "document-snapshot", record);
  if (!bytes.equals(Buffer.from(JSON.stringify(record, null, 2) + "\n", "utf8"))) {
    throw new Error("Snapshot record serialization is not exact generated JSON (no BOM, duplicate keys or alternate whitespace).");
  }
  assertPortableDocumentPath(record.source_path);
  if (authoringText(record.purpose, "snapshot purpose", 4000) !== record.purpose) throw new Error("Snapshot purpose is not normalized bounded text.");
  if (record.task_id !== match[1] || record.record_hash.slice(7) !== match[2]
      || computeDocumentSnapshotHash(record) !== record.record_hash) throw new Error("Snapshot self-hash, filename or task owner does not match.");
  const paths = snapshotPaths(record.task_id, record.source_content_hash, record.record_hash);
  if (paths.archive !== record.archive_path || paths.record !== relative) throw new Error("Snapshot preimage/record paths are not bound to their task and hashes.");
  const source = await boundedBytes(root, record.archive_path, MAX_BYTES);
  if (source.length !== record.source_bytes || sha256(source) !== record.source_content_hash) throw new Error("Snapshot preimage bytes or hash do not match the record.");
  const content = documentText(source, record.archive_path);
  return { record, content, record_path: relative };
}

export async function readDocumentSnapshot(options: { root: string; recordPath: string; maxTokens?: number }) {
  const root = path.resolve(options.root), config = await loadAuthoringConfig(root);
  const maxTokens = options.maxTokens ?? 4000;
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 32000) throw new Error("Snapshot read budget must be 1..32000 estimated content tokens.");
  const result = await verifyDocumentSnapshot(root, options.recordPath, config);
  const estimate = Math.ceil(result.record.source_bytes / 4);
  if (estimate > maxTokens) throw new Error(`Snapshot content needs ${estimate} estimated tokens, above read budget ${maxTokens}; nothing was truncated. Choose a deliberate larger budget (up to 32000) or inspect the verified local archive.`);
  return { version: 1 as const, kind: "document-snapshot-read" as const, root, ...result, estimated_tokens: estimate,
    writes_performed: false as const, boundary: "Historical noncanonical source text. Current source comparison, semantic sufficiency, approval and verification are not asserted. No truncation or writes." };
}

/** Reserved evidence roles remain visible even when scanner configuration is wrong. */
export async function auditDocumentSnapshots(root: string, config: CanonTrailConfig, extraRecordPaths: string[] = []): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [], records = new Set<string>(), preimages = new Set<string>(), referenced = new Set<string>();
  const issue = (code: string, relative: string, error: unknown, severity: "error" | "warning" = "error") =>
    diagnostics.push({ code, severity, path: relative, message: "Document snapshot evidence needs review", detail: (error as Error).message ?? String(error) });
  try {
    const probe = await resolveContinuityFile(root, ".agent-context/tasks/__snapshot_inventory_probe__");
    const tasks = path.dirname(probe);
    let entries: Dirent[];
    try { entries = await readdir(tasks, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") entries = []; else throw error; }
    for (const task of entries.sort((a, b) => compareCodeUnits(a.name, b.name))) {
      if (!task.isDirectory() && !task.isSymbolicLink()) continue;
      const base = `.agent-context/tasks/${task.name}/evidence/document-snapshots`;
      try {
        const marker = await resolveContinuityFile(root, `${base}/__snapshot_inventory_probe__`);
        const directory = path.dirname(marker);
        let files;
        try { files = await readdir(directory, { withFileTypes: true }); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
        requireSnapshotCoverage(config, base);
        for (const file of files.sort((a, b) => compareCodeUnits(a.name, b.name))) {
          const relative = `${base}/${file.name}`;
          if (!file.isFile()) throw new Error(`Archive contains an unsafe non-regular entry: ${JSON.stringify(relative)}`);
          if (/^[a-f0-9]{64}\.document-snapshot\.json$/.test(file.name)) records.add(relative);
          else if (/^[a-f0-9]{64}\.source\.bin$/.test(file.name)) preimages.add(relative);
          else issue("SNAP004", relative, new Error("Unexpected file in the reserved flat document-snapshot archive."));
        }
      } catch (error) { issue("SNAP004", base, error); }
    }
  } catch (error) { issue("SNAP004", ".agent-context/tasks", error); }
  for (const relative of extraRecordPaths) records.add(relative);
  for (const relative of [...records].sort(compareCodeUnits)) {
    try { referenced.add((await verifyDocumentSnapshot(root, relative, config)).record.archive_path); }
    catch (error) { issue("SNAP001", relative, error); }
  }
  for (const relative of [...preimages].sort(compareCodeUnits)) {
    try {
      const bytes = await boundedBytes(root, relative, MAX_BYTES);
      documentText(bytes, relative);
      if (sha256(bytes).slice(7) !== path.posix.basename(relative).slice(0, 64)) throw new Error("Preimage hash does not match its exact filename.");
      if (!referenced.has(relative)) issue("SNAP005", relative, new Error("Unreferenced document preimage; a partial capture may remain. Preserve and inspect it; do not delete it to force success."), "warning");
    } catch (error) { issue("SNAP002", relative, error); }
  }
  return diagnostics;
}

export function formatDocumentSnapshotCapture(report: Awaited<ReturnType<typeof captureDocumentSnapshot>>): string {
  return [`Document snapshot ${report.writes_performed ? "captured" : "preview / already present (no writes)"}: ${JSON.stringify(report.record.source_path)}`,
    ...report.files.map(file => `  ${JSON.stringify(file.path)} (${file.bytes} bytes; ${file.content_hash})`),
    "Read explicitly with document snapshot-read --record <record path>; do not index the raw preimage as current truth.", report.boundary].join("\n");
}

export function formatDocumentSnapshotRead(report: Awaited<ReturnType<typeof readDocumentSnapshot>>): string {
  // JSON quoting exposes controls/line endings rather than executing terminal formatting.
  return [`Historical document snapshot: ${JSON.stringify(report.record.source_path)} (${report.record.source_content_hash})`,
    `Estimated content: ${report.estimated_tokens} tokens; current source comparison: not performed.`,
    `Content (JSON-quoted, exact after decoding): ${JSON.stringify(report.content)}`, report.boundary].join("\n");
}
