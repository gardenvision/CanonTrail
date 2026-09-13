import { sha256 } from "./indexer.js";

export interface ContextSection { path: string; from: number; to: number; content_hash: string }
export interface LockedSection { line_ranges?: Array<[number, number]>; selection_hash?: string; estimated_tokens: number }
const hashPattern = /^sha256:[a-f0-9]{64}$/;
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function parseContextSections(value: unknown): ContextSection[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("context_sections must be an array");
  const paths = new Set<string>();
  return value.map(entry => {
    if (!record(entry) || Object.keys(entry).some(k => !["path", "from", "to", "content_hash"].includes(k))
        || typeof entry.path !== "string" || !entry.path || entry.path !== entry.path.trim()
        || /[\\:\x00-\x1f\x7f]/.test(entry.path)
        || entry.path.split("/").some(p => !p || p === "." || p === ".." || p.toLowerCase() === ".git")
        || !Number.isSafeInteger(entry.from) || !Number.isSafeInteger(entry.to)
        || (entry.from as number) < 1 || (entry.to as number) < (entry.from as number)
        || typeof entry.content_hash !== "string" || !hashPattern.test(entry.content_hash)) {
      throw new Error("Invalid context_sections entry: exact relative path, inclusive lines and full source SHA-256 required");
    }
    if (paths.has(entry.path)) throw new Error("Duplicate context section path: " + entry.path);
    paths.add(entry.path);
    return entry as unknown as ContextSection;
  });
}

/** One contiguous range in v1. Preserve BOM and every CR/LF byte, no terminal phantom line. */
export function selectContextSection(bytes: Buffer, from: number, to: number): Buffer {
  if (bytes.length > 8 * 1024 * 1024) throw new Error("Section source exceeds 8 MiB limit");
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 1 || to < from) throw new Error("Invalid section line range");
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  if (text.includes("\0")) throw new Error("NUL-containing source cannot be sectioned");
  const lines = text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)?.filter(line => line.length > 0) ?? [];
  if (to > lines.length) throw new Error(`Section exceeds ${lines.length} source lines`);
  return Buffer.from(lines.slice(from - 1, to).join(""), "utf8");
}

/** Shape checks also work for historical locks when the old file no longer exists. */
export function validateLockedSection(source: LockedSection, bytes?: Buffer): void {
  if (source.line_ranges === undefined && source.selection_hash === undefined) return;
  const ranges = source.line_ranges;
  if (!Array.isArray(ranges) || ranges.length !== 1 || !Array.isArray(ranges[0]) || ranges[0].length !== 2
      || !ranges[0].every(Number.isSafeInteger) || ranges[0][0] < 1 || ranges[0][1] < ranges[0][0]
      || typeof source.selection_hash !== "string" || !hashPattern.test(source.selection_hash)) {
    throw new Error("Partial source requires exactly one valid line range and selection_hash");
  }
  if (bytes !== undefined) {
    const selected = selectContextSection(bytes, ...ranges[0]);
    if (sha256(selected) !== source.selection_hash) throw new Error("Section byte hash does not match");
    if (Math.ceil(selected.length / 4) !== source.estimated_tokens) throw new Error("Section token estimate does not match selected bytes");
  }
}
