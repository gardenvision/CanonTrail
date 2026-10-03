import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { writeFileAtomic } from "./safe-write.js";

/** Continuity control artifacts use portable exact identities. Observed Git
 * filenames are data and deliberately do NOT pass through this normalizer. */
export async function resolveContinuityFile(root: string, relative: string, required = false): Promise<string> {
  const parts = relative.split("/");
  if (!relative || path.isAbsolute(relative) || parts.some(part => !part || part === "." || part === ".."
      || /[\\:\x00-\x1f\x7f<>"|?*]/.test(part) || /[. ]$/.test(part)
      || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part))) {
    throw new Error(`Continuity artifact requires an exact portable repository-relative path: ${relative}`);
  }
  let cursor = await realpath(root);
  for (let i = 0; i < parts.length; i++) {
    const parent = cursor;
    cursor = path.join(parent, parts[i]!);
    let info;
    try { info = await lstat(cursor); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (required) throw new Error(`Continuity provenance is missing: ${relative}`);
      return path.join(cursor, ...parts.slice(i + 1));
    }
    if (info.isSymbolicLink() || !(await readdir(parent)).includes(parts[i]!)) {
      throw new Error(`Continuity path traverses a link or filesystem alias: ${relative}`);
    }
    if (i === parts.length - 1 ? !info.isFile() || info.nlink !== 1 : !info.isDirectory()) {
      throw new Error(`Continuity path is not an unlinked regular file/directory: ${relative}`);
    }
  }
  return cursor;
}

/** Preserve a BOM rather than silently removing bytes; the document parser
 * decides whether it is legal. Fatal decoding never fabricates U+FFFD. */
export function decodeContinuityText(bytes: Uint8Array, label: string): string {
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new Error(`Continuity artifact is not valid UTF-8: ${label}`); }
}

export async function readContinuityBytes(root: string, relative: string, required = true): Promise<Buffer | undefined> {
  const absolute = await resolveContinuityFile(root, relative, required);
  try { return await readFile(absolute); }
  catch (error) {
    if (!required && (error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function readContinuityText(root: string, relative: string): Promise<string> {
  return decodeContinuityText((await readContinuityBytes(root, relative))!, relative);
}

export async function preflightImmutable(root: string, relative: string, expected: Buffer): Promise<"missing" | "identical"> {
  const current = await readContinuityBytes(root, relative, false);
  if (current === undefined) return "missing";
  if (!current.equals(expected)) throw new Error(`Immutable artifact already exists with different content: ${relative}`);
  return "identical";
}

/** Stable exclusive tree required. Recheck at use; this is NOT a multi-file
 * transaction or a guarantee against a hostile concurrent namespace swap. */
export async function writeImmutableContinuity(root: string, relative: string, bytes: Buffer): Promise<boolean> {
  if (await preflightImmutable(root, relative, bytes) === "identical") return false;
  let absolute = await resolveContinuityFile(root, relative);
  await mkdir(path.dirname(absolute), { recursive: true });
  absolute = await resolveContinuityFile(root, relative);
  try { await writeFile(absolute, bytes, { flag: "wx" }); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    await preflightImmutable(root, relative, bytes); return false;
  }
}

export async function writeMutableContinuity(root: string, relative: string, bytes: Buffer, expectedBefore: Buffer | undefined): Promise<boolean> {
  const current = await readContinuityBytes(root, relative, false);
  if (current === undefined ? expectedBefore !== undefined : expectedBefore === undefined || !current.equals(expectedBefore)) {
    throw new Error(`Continuity output changed since preflight: ${relative}`);
  }
  if (current?.equals(bytes)) return false;
  let absolute = await resolveContinuityFile(root, relative);
  await mkdir(path.dirname(absolute), { recursive: true });
  absolute = await resolveContinuityFile(root, relative);
  if (current === undefined) await writeFile(absolute, bytes, { flag: "wx" });
  else await writeFileAtomic(absolute, bytes);
  return true;
}
