import { parseDocument } from "yaml";
import type { GovernedHeader } from "./types.js";

export interface ParsedFrontmatter {
  header: GovernedHeader;
  body: string;
}

export function parseFrontmatter(source: string): ParsedFrontmatter {
  const normalized = source.replace(/^\uFEFF/, "");
  const lines = normalized.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    throw new Error("missing opening YAML frontmatter delimiter");
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && (line.trim() === "---" || line.trim() === "..."));
  if (closingIndex < 0) {
    throw new Error("missing closing YAML frontmatter delimiter");
  }

  const document = parseDocument(lines.slice(1, closingIndex).join("\n"));
  if (document.errors.length > 0) {
    throw new Error(document.errors.map((error) => error.message).join("; "));
  }
  const value: unknown = document.toJS();
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("frontmatter must contain a mapping");
  }

  return {
    header: value as GovernedHeader,
    body: lines.slice(closingIndex + 1).join("\n"),
  };
}
