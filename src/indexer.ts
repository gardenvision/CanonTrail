import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "./config.js";
import { parseFrontmatter } from "./frontmatter.js";
import type {
  CanonTrailConfig,
  ContextIndex,
  ContextIndexDocument,
  DocumentRecord,
} from "./types.js";
import { compareCodeUnits } from "./ordering.js";
import { readContinuityBytes, resolveContinuityFile, writeMutableContinuity } from "./continuity-files.js";

/** Version 1 did not identify its locale/code-unit ordering. Version 2 keeps
 * the document payload hash recipe but explicitly fixes UTF-16 ordering. */
export function contextIndexFormatProblem(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "context index must be an object";
  const record = value as Record<string, unknown>;
  if (record.version === 1) return "legacy context index format 1 has unspecified path ordering; rebuild with one pinned current CLI (format 2, UTF-16 code-unit order) before current use";
  if (record.version !== 2 || record.document_order !== "utf16-code-unit" || record.hash_algorithm !== "sha256") {
    return "unsupported context index format or ordering; use its compatible CLI and inspect before replacing it";
  }
  return undefined;
}

/** A configured cache path does not authorize replacing another control role,
 * including an absent differently-cased role on a case-sensitive filesystem. */
export function assertContextIndexDestination(config: CanonTrailConfig): void {
  const relative = normalizePath(config.indexPath), folded = relative.toLowerCase();
  const schemaRoot = normalizePath(config.schemaPath).replace(/\/$/, "").toLowerCase();
  if (!relative.endsWith(".json") || folded === schemaRoot || folded.startsWith(schemaRoot + "/")
      || /^(?:\.agent-context\/(?:tasks|migrations)(?:\/|$)|\.planning(?:\/|$)|\.gsd(?:\/|$)|docs\/superpowers(?:\/|$))/.test(folded)
      || folded === ".agent-context/adoption-manifest.json"
      || /(?:^|\/)(?:context\.lock\.json|(?:.*\.)?resume\.packet\.json|.*\.(?:document-snapshot|worktree-inventory)\.json)$/.test(folded)
      || folded.split("/").includes(".git")) {
    throw new Error("Index output must be a separate JSON cache, not a schema, task/migration, adoption/provenance, Git or external-workflow artifact (portable role names are case-insensitive).");
  }
}

/** An explicit rebuild may repair malformed JSON at a separate declared cache
 * destination, or replace a recognizable old/current cache. A generic version
 * label is not cache ownership and unknown future formats remain protected. */
export function assertContextIndexReplacement(bytes: Buffer | undefined): void {
  if (!bytes) return;
  let value: unknown;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { return; } // Explicit index regeneration may repair malformed JSON.
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (record.version !== 1 && record.version !== undefined) {
      const problem = contextIndexFormatProblem(value);
      if (problem) throw new Error(problem + "; index not written");
    }
    const allowedKeys = new Set(["version", "document_order", "hash_algorithm", "root_hash", "documents"]);
    const recognizable = Object.keys(record).every(key => allowedKeys.has(key))
      && record.hash_algorithm === "sha256" && typeof record.root_hash === "string"
      && /^sha256:[a-f0-9]{64}$/.test(record.root_hash) && Array.isArray(record.documents)
      && record.documents.every(document => typeof document === "object" && document !== null && !Array.isArray(document)
        && typeof document.path === "string" && typeof document.content_hash === "string"
        && /^sha256:[a-f0-9]{64}$/.test(document.content_hash));
    if (!recognizable) throw new Error("Existing index destination is not a recognizable context-index cache; inspect its ownership and choose a separate cache path; index not written");
    if ((record.version === 1 || record.version === undefined)
        && (record.document_order === undefined || record.document_order === "utf16-code-unit")) return;
  }
  const problem = contextIndexFormatProblem(value);
  if (problem) throw new Error(problem + "; index not written");
}

export function normalizePath(value: string): string {
  return value.split(path.sep).join("/").replace(/^\.\//, "");
}

export function sha256(value: string | Buffer): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function isExcluded(relativePath: string, config: CanonTrailConfig): boolean {
  const normalized = normalizePath(relativePath);
  return config.excludePaths.some((entry) => {
    const excluded = normalizePath(entry).replace(/\/$/, "");
    return normalized === excluded || normalized.startsWith(`${excluded}/`);
  });
}

export function isGovernedPath(relativePath: string, config: CanonTrailConfig): boolean {
  const normalized = normalizePath(relativePath);
  return config.governedPaths.some((entry) => {
    const governed = normalizePath(entry).replace(/\/$/, "");
    return governed === "." || normalized === governed || normalized.startsWith(`${governed}/`);
  });
}

export async function walkFiles(root: string, config: CanonTrailConfig): Promise<string[]> {
  const found: string[] = [];

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareCodeUnits(left.name, right.name));
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = normalizePath(path.relative(root, absolutePath));
      if (isExcluded(relativePath, config)) {
        continue;
      }
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (entry.isFile()) {
        found.push(relativePath);
      }
    }
  }

  await walk(root);
  return found.sort((left, right) => compareCodeUnits(left, right));
}

export async function discoverMarkdown(root: string, config: CanonTrailConfig): Promise<DocumentRecord[]> {
  const paths = (await walkFiles(root, config)).filter(
    (filePath) => filePath.toLowerCase().endsWith(".md") && isGovernedPath(filePath, config),
  );
  return Promise.all(
    paths.map(async (relativePath) => {
      const absolutePath = path.join(root, ...relativePath.split("/"));
      const source = await readFile(absolutePath, "utf8");
      try {
        const parsed = parseFrontmatter(source);
        return {
          absolutePath,
          path: relativePath,
          source,
          body: parsed.body,
          header: parsed.header,
        } satisfies DocumentRecord;
      } catch (error) {
        return {
          absolutePath,
          path: relativePath,
          source,
          body: source,
          parseError: (error as Error).message,
        } satisfies DocumentRecord;
      }
    }),
  );
}

function indexDocument(document: DocumentRecord): ContextIndexDocument {
  if (!document.header) {
    throw new Error(`${document.path}: cannot index a document without valid frontmatter`);
  }
  const header = document.header;
  return {
    path: document.path,
    content_hash: sha256(document.source),
    stand: header.stand,
    status: header.status,
    truth_level: header.truth_level,
    verification_state: header.verification.state,
    read_if_task_touches: [...header.read_if_task_touches],
    primary_systems: [...header.primary_systems],
    do_not_use_instead: [...header.do_not_use_instead],
    ...(header.artifact_id ? { artifact_id: header.artifact_id } : {}),
    ...(header.artifact_kind ? { artifact_kind: header.artifact_kind } : {}),
    ...(header.topic_id ? { topic_id: header.topic_id } : {}),
  };
}

export function buildContextIndex(documents: DocumentRecord[]): ContextIndex {
  const invalid = documents.find((document) => !document.header);
  if (invalid) {
    throw new Error(`${invalid.path}: ${invalid.parseError ?? "invalid frontmatter"}`);
  }
  const indexed = documents.map(indexDocument).sort((left, right) => compareCodeUnits(left.path, right.path));
  return {
    version: 2,
    document_order: "utf16-code-unit",
    hash_algorithm: "sha256",
    root_hash: sha256(JSON.stringify(indexed)),
    documents: indexed,
  };
}

export function serializeContextIndex(index: ContextIndex): string {
  return `${JSON.stringify(index, null, 2)}\n`;
}

export async function generateContextIndex(
  rootInput: string,
  options: { exclusive?: boolean } = {},
): Promise<{ index: ContextIndex; path: string }> {
  const root = path.resolve(rootInput);
  const config = await loadConfig(root);
  assertContextIndexDestination(config);
  const documents = await discoverMarkdown(root, config);
  const index = buildContextIndex(documents);
  const relativeOutput = normalizePath(config.indexPath);
  const outputPath = await resolveContinuityFile(root, relativeOutput);
  const previous = await readContinuityBytes(root, relativeOutput, false);
  assertContextIndexReplacement(previous);
  const serialized = serializeContextIndex(index);
  if (options.exclusive) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, serialized, { encoding: "utf8", flag: "wx" });
  } else {
    await writeMutableContinuity(root, relativeOutput, Buffer.from(serialized), previous);
  }
  return { index, path: normalizePath(path.relative(root, outputPath)) };
}
