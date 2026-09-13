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
    entries.sort((left, right) => left.name.localeCompare(right.name));
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
  return found.sort((left, right) => left.localeCompare(right));
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
  const indexed = documents.map(indexDocument).sort((left, right) => left.path.localeCompare(right.path));
  return {
    version: 1,
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
  const documents = await discoverMarkdown(root, config);
  const index = buildContextIndex(documents);
  const outputPath = path.join(root, ...normalizePath(config.indexPath).split("/"));
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serializeContextIndex(index), {
    encoding: "utf8",
    ...(options.exclusive ? { flag: "wx" } : {}),
  });
  return { index, path: normalizePath(path.relative(root, outputPath)) };
}
