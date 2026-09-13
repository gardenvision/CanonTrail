import { createHash } from "node:crypto";
import type { MigrationTransactionOperation } from "./migration.js";

export interface MigrationContentImage {
  content: string;
  content_hash: string;
  bytes: number;
}

export interface MigrationContentView {
  operation_id: string;
  source_path: string;
  target_path: string;
  before: MigrationContentImage;
  after: MigrationContentImage;
}

/** Report-only data: never part of a transaction, approval or execution record. */
export interface MigrationContentPreview {
  version: 1;
  encoding: "utf-8";
  views: MigrationContentView[];
}

function image(bytes: Buffer): MigrationContentImage {
  const content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  if (!Buffer.from(content, "utf8").equals(bytes)) throw new Error("content preview is not lossless UTF-8");
  return {
    content,
    content_hash: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    bytes: bytes.length,
  };
}

/** Called with the very buffers used by prepareMigrationTransformation, without rereading or staging. */
export function createMigrationContentView(
  operation: MigrationTransactionOperation,
  beforeBytes: Buffer,
  afterBytes: Buffer,
): MigrationContentView {
  const before = image(beforeBytes);
  const after = image(afterBytes);
  if (before.content_hash !== operation.source_hash
    || after.content_hash !== operation.output_hash || after.bytes !== operation.output_bytes) {
    throw new Error(`content preview does not match operation ${operation.operation_id}`);
  }
  return {
    operation_id: operation.operation_id,
    source_path: operation.source_path,
    target_path: operation.target_path,
    before,
    after,
  };
}

// JSON quoting keeps source text data, not terminal instructions. Escape all remaining
// controls/format characters too (including bidi controls and BOM); JSON restores exact text.
function quote(value: string): string {
  return JSON.stringify(value).replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, (character) =>
    character.split("").map((unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, "0")}`).join(""));
}

function numberedLines(content: string): string[] {
  const lines = content.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) ?? [""];
  return lines.map((line, index) => `${index + 1} | ${quote(line)}`);
}

export function formatMigrationContentPreview(preview: MigrationContentPreview): string {
  const lines = [
    "Read-only content view — not execution, independent review or promotion.",
    "Only generated operations are shown; blockers and skipped files remain in the transaction summary.",
    "Complete UTF-8 before/after text follows as numbered JSON strings (including line endings).",
    "Decode each quoted line and concatenate to reconstruct bytes; do not hash this formatted display.",
    "Full source text may be sensitive. Inspect locally before sharing logs.",
  ];
  for (const view of preview.views) {
    lines.push("", `${view.operation_id}: ${quote(view.source_path)} -> ${quote(view.target_path)}`);
    for (const [label, value] of [["BEFORE", view.before], ["AFTER", view.after]] as const) {
      lines.push(`${label}: ${value.bytes} bytes; ${value.content_hash}`);
      for (const line of numberedLines(value.content)) lines.push(line);
    }
  }
  if (preview.views.length === 0) lines.push("No generated operation content is available.");
  return lines.join("\n");
}
