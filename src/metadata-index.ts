import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseConfigText } from "./config.js";
import { decodeContinuityText, resolveContinuityFile, writeMutableContinuity } from "./continuity-files.js";
import { safeRepositoryFile } from "./context-source-path.js";
import { parseFrontmatter } from "./frontmatter.js";
import { assertContextIndexDestination, assertContextIndexReplacement, buildContextIndex, isGovernedPath, normalizePath, serializeContextIndex } from "./indexer.js";
import { compareCodeUnits } from "./ordering.js";
import { governedMetadataReferences, validateIndexMetadata } from "./validator.js";
import type { CanonTrailConfig, ContextIndex, Diagnostic, DocumentRecord } from "./types.js";

const MAX_TEXT_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 100000;
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;
const boundary = "Metadata projection only: repository integrity, continuity archives, task completion, CI, release and canonical promotion are NOT approved. Run strict validate/docs audit/finalize separately. Stable exclusive tree required.";

export interface MetadataIndexReport {
  version: 1;
  purpose: "metadata-index-rebuild";
  validation_scope: "index-inputs";
  root: string;
  path: string | null;
  ok: boolean;
  index_written: boolean;
  repository_validation_performed: false;
  completion_approval: false;
  continuity_validation: "not-performed";
  diagnostics: Diagnostic[];
  missing_configured_paths: string[];
  stats: { markdown_documents: number; schemas: number; structured_payloads_validated: 0 };
  index: ContextIndex | null;
  boundary: string;
}

function excluded(relative: string, config: CanonTrailConfig): boolean {
  return relative.split("/").some(part => part.toLowerCase() === ".git") || config.excludePaths.some(value => {
    const prefix = normalizePath(value).replace(/\/$/, "");
    return prefix === "." || relative === prefix || relative.startsWith(prefix + "/");
  });
}

/** Enumerate only configured governed roots. Non-Markdown payloads are never
 * opened, but links cannot silently conceal metadata. Coverage is bounded. */
async function projectionPaths(root: string, config: CanonTrailConfig): Promise<{ documents: string[]; missing: string[] }> {
  const visited = new Set<string>(), documents = new Set<string>(), missing = new Set<string>();
  async function inspect(relative: string): Promise<void> {
    if (excluded(relative, config) || visited.has(relative)) return;
    if (visited.size >= MAX_ENTRIES) throw new Error("Metadata-index coverage exceeded 100000 entries; choose narrower governed roots/exclusions explicitly.");
    visited.add(relative);
    if (relative === "") {
      for (const entry of await readdir(root)) await inspect(entry);
      return;
    }
    // Resolve a directory through a nonexistent regular-file probe so every
    // ancestor and its exact spelling is checked, not just the final realpath.
    const absolute = path.join(root, ...relative.split("/"));
    const info = await lstat(absolute);
    if (info.isDirectory()) {
      await resolveContinuityFile(root, relative + "/__metadata_index_probe__");
      const entries = await readdir(absolute);
      entries.sort(compareCodeUnits);
      for (const entry of entries) await inspect(relative + "/" + entry);
    } else if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Metadata coverage encounters an unsafe entry: ${relative}`);
    else if (/\.md$/i.test(relative) && isGovernedPath(relative, config)) documents.add(relative);
  }
  for (const raw of config.governedPaths) {
    const relative = normalizePath(raw).replace(/\/$/, "");
    if (relative.split("/").some(part => part.toLowerCase() === ".git")) throw new Error("Git control paths cannot be governed metadata roots.");
    if (relative === ".") await inspect("");
    else {
      // Initializers may name future roots. Prove and report their absence,
      // not a made-up complete scope; recheck this set before replacement.
      const absolute = await safeRepositoryFile(root, relative);
      if (!absolute) {
        await resolveContinuityFile(root, relative + "/__metadata_absence_probe__");
        // A missing differently-cased spelling on a case-sensitive host is
        // not portable absence of an existing configured source on Windows.
        let parent = root;
        for (const part of relative.split("/")) {
          const names = await readdir(parent);
          if (!names.includes(part)) {
            if (names.some(name => name.toLowerCase() === part.toLowerCase())) throw new Error(`Absent governed path is a case alias of an existing entry: ${relative}`);
            break;
          }
          parent = path.join(parent, part);
        }
        if (!excluded(relative, config) && !visited.has(relative)) {
          if (visited.size >= MAX_ENTRIES) throw new Error("Metadata-index coverage exceeded 100000 entries; choose narrower governed roots/exclusions explicitly.");
          visited.add(relative); missing.add(relative);
        }
      } else await inspect(relative);
    }
  }
  return { documents: [...documents].sort(compareCodeUnits), missing: [...missing].sort(compareCodeUnits) };
}

async function boundedInput(root: string, relative: string): Promise<Buffer> {
  const absolute = await resolveContinuityFile(root, relative, true);
  if ((await lstat(absolute)).size > MAX_TEXT_BYTES) throw new Error(`Metadata input exceeds 8 MiB: ${relative}`);
  const bytes = await readFile(absolute);
  if (bytes.length > MAX_TEXT_BYTES) throw new Error(`Metadata input exceeds 8 MiB: ${relative}`);
  const text = decodeContinuityText(bytes, relative);
  if (text.includes("\0")) throw new Error(`Metadata input contains NUL text: ${relative}`);
  return bytes;
}

async function exactReferences(root: string, documents: DocumentRecord[]): Promise<void> {
  for (const document of documents) for (const reference of governedMetadataReferences(document)) {
    const relative = (reference.split("#", 1)[0] ?? "").replace(/^\.\//, "").replace(/\/$/, "");
    if (!relative) continue;
    if (relative.split("/").some(part => part.toLowerCase() === ".git")) throw new Error(`Metadata refers to Git control identity: ${document.path}`);
    const absolute = await safeRepositoryFile(root, relative);
    const directory = absolute !== undefined && (await lstat(absolute)).isDirectory();
    // Missing-reference exceptions remain a configured policy, but an unsafe
    // lexical/physical path is never an allowed-missing-reference exemption.
    await resolveContinuityFile(root, directory ? relative + "/__metadata_reference_probe__" : relative);
  }
}

/** Explicit metadata projection, never a diagnostic filter over repository
 * validation. Capture exact input bytes and guard them again before writing. */
export async function rebuildMetadataIndex(rootInput: string): Promise<MetadataIndexReport> {
  const root = path.resolve(rootInput);
  const report: MetadataIndexReport = {
    version: 1, purpose: "metadata-index-rebuild", validation_scope: "index-inputs", root,
    path: null, ok: false, index_written: false, repository_validation_performed: false,
    completion_approval: false, continuity_validation: "not-performed", diagnostics: [], missing_configured_paths: [],
    stats: { markdown_documents: 0, schemas: 0, structured_payloads_validated: 0 }, index: null, boundary,
  };
  try {
    const inputs = new Map<string, Buffer>();
    inputs.set(".agent-context/config.yaml", await boundedInput(root, ".agent-context/config.yaml"));
    let totalBytes = inputs.get(".agent-context/config.yaml")!.length;
    function capture(relative: string, bytes: Buffer): void {
      totalBytes += bytes.length;
      if (totalBytes > MAX_TOTAL_BYTES) throw new Error("Metadata input set exceeds 128 MiB; explicitly choose narrower governed roots/exclusions.");
      inputs.set(relative, bytes);
    }
    const config = parseConfigText(decodeContinuityText(inputs.get(".agent-context/config.yaml")!, ".agent-context/config.yaml"));
    if ([config.schemaPath, config.indexPath, ...config.governedPaths, ...config.excludePaths].some(value => value.includes("\\"))) {
      throw new Error("Metadata-index config paths must use portable '/' separators on every platform.");
    }
    const schemaRoot = normalizePath(config.schemaPath).replace(/\/$/, "");
    if (schemaRoot.split("/").some(part => part.toLowerCase() === ".git")) throw new Error("Installed metadata schemas cannot use Git control paths.");
    await resolveContinuityFile(root, schemaRoot + "/__metadata_schema_probe__");
    const schemaNames = (await readdir(path.join(root, ...schemaRoot.split("/"))))
      .filter(name => name.endsWith(".schema.json")).sort(compareCodeUnits);
    const schemas = new Map<string, string>();
    for (const name of schemaNames) {
      const relative = schemaRoot + "/" + name, bytes = await boundedInput(root, relative);
      capture(relative, bytes);
      schemas.set(name, decodeContinuityText(bytes, relative));
    }
    const projection = await projectionPaths(root, config), paths = projection.documents;
    report.missing_configured_paths = projection.missing;
    const documents: DocumentRecord[] = [];
    for (const relative of paths) {
      const bytes = await boundedInput(root, relative);
      capture(relative, bytes);
      const source = decodeContinuityText(bytes, relative);
      try {
        const parsed = parseFrontmatter(source);
        documents.push({ path: relative, absolutePath: path.join(root, ...relative.split("/")), source, body: parsed.body, header: parsed.header });
      } catch (error) {
        documents.push({ path: relative, absolutePath: path.join(root, ...relative.split("/")), source, body: source, parseError: (error as Error).message });
      }
    }
    report.stats.markdown_documents = documents.length;
    const preflight = await validateIndexMetadata(root, config, documents, schemas);
    report.diagnostics = preflight.diagnostics;
    report.diagnostics.push(...projection.missing.map(relative => ({ severity: "warning" as const, code: "INDEX006", path: relative,
      message: "Configured governed path is absent; no metadata from that planned scope was indexed", detail: "Absence is rechecked before writing. Create/review this scope before treating it as usable documentation; metadata reconstruction is not repository approval." })));
    report.stats.schemas = preflight.schemaCount;
    await exactReferences(root, documents);
    if (report.diagnostics.some(d => d.severity === "error")) return report;
    const relativeOutput = normalizePath(config.indexPath);
    assertContextIndexDestination(config);
    if (inputs.has(relativeOutput)) throw new Error("Metadata index output cannot replace a captured input.");
    report.path = relativeOutput;
    let before: Buffer | undefined;
    const output = await resolveContinuityFile(root, relativeOutput);
    try { await lstat(output); before = await boundedInput(root, relativeOutput); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    assertContextIndexReplacement(before);
    const index = buildContextIndex(documents);
    for (const [relative, bytes] of inputs) {
      if (!(await boundedInput(root, relative)).equals(bytes)) throw new Error(`Metadata input changed after preflight: ${relative}`);
    }
    if (JSON.stringify(await projectionPaths(root, config)) !== JSON.stringify(projection)
        || JSON.stringify((await readdir(path.join(root, ...schemaRoot.split("/")))).filter(name => name.endsWith(".schema.json")).sort(compareCodeUnits)) !== JSON.stringify(schemaNames)) {
      throw new Error("Metadata or schema file inventory changed after preflight.");
    }
    report.index_written = await writeMutableContinuity(root, relativeOutput, Buffer.from(serializeContextIndex(index)), before);
    report.index = index;
    report.ok = true;
  } catch (error) {
    report.diagnostics.push({ severity: "error", code: "INDEX005", message: "Metadata index inputs/output could not be safely verified; index not written", detail: (error as Error).message });
    report.ok = false;
  }
  report.diagnostics.sort((a, b) => compareCodeUnits(a.path ?? "", b.path ?? "") || compareCodeUnits(a.code, b.code));
  return report;
}

export function formatMetadataIndex(report: MetadataIndexReport): string {
  return [
    `Metadata index ${report.ok ? "rebuilt" : "FAILED"}: ${report.path ?? "no output"} (format 2, UTF-16 code-unit order)`,
    `Documents: ${report.stats.markdown_documents}; schemas: ${report.stats.schemas}; structured payloads validated: 0; index changed: ${report.index_written}.`,
    ...(report.missing_configured_paths.length ? [`Absent configured paths: ${report.missing_configured_paths.map(p => JSON.stringify(p)).join(", ")}; these scopes were NOT indexed.`] : []),
    ...report.diagnostics.map(d => `${d.severity.toUpperCase()} ${d.code} ${d.path ?? ""}: ${d.message}${d.detail ? "\n  " + d.detail : ""}`),
    report.boundary,
  ].join("\n");
}
