import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import type { CanonTrailConfig } from "./types.js";

const DEFAULT_CONFIG: CanonTrailConfig = {
  version: 1,
  indexPath: ".agent-context/context-index.json",
  schemaPath: "schemas",
  excludePaths: [".git", "node_modules", "dist", "coverage"],
  governedPaths: ["."],
  requireFrontmatterForAllMarkdown: true,
  requireTopicIdForCanonical: true,
  allowMissingReferences: [],
};

function stringArray(value: unknown, field: string, fallback: string[]): string[] {
  if (value === undefined) {
    return [...fallback];
  }
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error(`${field} must be an array of non-empty strings`);
  }
  return [...value];
}

function booleanValue(value: unknown, field: string, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be a boolean`);
  }
  return value;
}

export async function loadConfig(root: string): Promise<CanonTrailConfig> {
  const configPath = path.join(root, ".agent-context", "config.yaml");
  let raw: string;
  try {
    raw = await readFile(configPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { ...DEFAULT_CONFIG, excludePaths: [...DEFAULT_CONFIG.excludePaths] };
    }
    throw error;
  }

  const value: unknown = parse(raw);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(".agent-context/config.yaml must contain a mapping");
  }
  const record = value as Record<string, unknown>;
  if (record.version !== 1) {
    throw new Error("config version must be 1");
  }
  if (record.index_path !== undefined && (typeof record.index_path !== "string" || record.index_path.length === 0)) {
    throw new Error("index_path must be a non-empty string");
  }
  if (record.schema_path !== undefined && (typeof record.schema_path !== "string" || record.schema_path.length === 0)) {
    throw new Error("schema_path must be a non-empty string");
  }

  return {
    version: 1,
    indexPath: (record.index_path as string | undefined) ?? DEFAULT_CONFIG.indexPath,
    schemaPath: (record.schema_path as string | undefined) ?? DEFAULT_CONFIG.schemaPath,
    excludePaths: stringArray(record.exclude_paths, "exclude_paths", DEFAULT_CONFIG.excludePaths),
    governedPaths: stringArray(record.governed_paths, "governed_paths", DEFAULT_CONFIG.governedPaths),
    requireFrontmatterForAllMarkdown: booleanValue(
      record.require_frontmatter_for_all_markdown,
      "require_frontmatter_for_all_markdown",
      DEFAULT_CONFIG.requireFrontmatterForAllMarkdown,
    ),
    requireTopicIdForCanonical: booleanValue(
      record.require_topic_id_for_canonical,
      "require_topic_id_for_canonical",
      DEFAULT_CONFIG.requireTopicIdForCanonical,
    ),
    allowMissingReferences: stringArray(record.allow_missing_references, "allow_missing_references", []),
  };
}
