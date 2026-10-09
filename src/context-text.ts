import { open, readFile } from "node:fs/promises";
import path from "node:path";

/** Text-only code families, not a blanket engine-asset or extensionless opt-in. */
export const ADDITIONAL_TEXT_EXTENSIONS = new Set([".mjs", ".cjs", ".hlsl", ".glsl", ".shader", ".compute", ".cginc"]);
const MAX_ADDITIONAL_SOURCE_BYTES = 8 * 1024 * 1024;

export function isAdditionalTextSource(relative: string): boolean {
  return ADDITIONAL_TEXT_EXTENSIONS.has(path.posix.extname(relative).toLowerCase());
}

/** Called only after repository containment/identity checks. Additional formats
 * use bounded reads and strict encoding, without changing legacy file policies. */
export async function readContextSourceBytes(absolute: string, relative: string): Promise<Buffer> {
  if (!isAdditionalTextSource(relative)) return readFile(absolute);
  const handle = await open(absolute, "r");
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > MAX_ADDITIONAL_SOURCE_BYTES) throw new Error(`Text code source must be a regular file of at most 8 MiB: ${relative}`);
    const buffer = Buffer.alloc(before.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    const after = await handle.stat();
    if (length !== before.size || length !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
      throw new Error(`Text code source changed while reading: ${relative}`);
    }
    const bytes = buffer.subarray(0, length);
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { throw new Error(`Text code source is not valid UTF-8: ${relative}`); }
    if (text.includes("\0")) throw new Error(`NUL-containing code source is not text: ${relative}`);
    return bytes;
  } finally { await handle.close(); }
}
