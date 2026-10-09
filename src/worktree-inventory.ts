import { readFile } from "node:fs/promises";
import { decodeContinuityText, resolveContinuityFile, writeImmutableContinuity } from "./continuity-files.js";
import { isIsoDateTime } from "./date-time.js";
import { sha256 } from "./indexer.js";

export interface WorktreeEntry { code: string; path: string; original_path?: string }
export interface WorktreeInventory {
  version: 1;
  task_id: string;
  created_at: string;
  entries: WorktreeEntry[];
}
export interface WorktreeInventoryRef { path: string; content_hash: string; entry_count: number }

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const validCode = (value: string) => /^[ MTADRCU?!]{2}$/.test(value) && value !== "  " && value !== "!!";
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
function exactKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key));
}

/** Git -z returns destination first, then the original path for renames/copies.
 * Paths are observed data, NOT paths we open: preserve Unicode, whitespace,
 * controls and POSIX backslashes verbatim instead of normalizing identities. */
export function parseWorktreeStatus(output: string): WorktreeEntry[] {
  if (output && !output.endsWith("\0")) throw new Error("Incomplete Git status inventory (missing NUL terminator)");
  const records = output ? output.slice(0, -1).split("\0") : [];
  const entries: WorktreeEntry[] = [];
  for (let index = 0; index < records.length; index++) {
    const item = records[index]!, code = item.slice(0, 2), name = item.slice(3);
    if (item[2] !== " " || !validCode(code) || !name) throw new Error("Malformed Git status inventory entry");
    const entry: WorktreeEntry = { code, path: name };
    if (/[RC]/.test(code)) {
      const original = records[++index];
      if (!original) throw new Error("Incomplete Git rename/copy inventory entry");
      entry.original_path = original;
    }
    entries.push(entry);
  }
  entries.sort((a, b) => compare(a.path, b.path));
  if (new Set(entries.map(entry => entry.path)).size !== entries.length) throw new Error("Duplicate Git status inventory path");
  return entries;
}

export function validateWorktreeInventoryShape(value: unknown): asserts value is WorktreeInventory {
  if (!record(value) || !exactKeys(value, ["version", "task_id", "created_at", "entries"])
      || value.version !== 1 || typeof value.task_id !== "string" || !value.task_id
      || typeof value.created_at !== "string" || !isIsoDateTime(value.created_at) || !Array.isArray(value.entries)) {
    throw new Error("Invalid worktree inventory header");
  }
  let previous: string | undefined;
  for (const entry of value.entries) {
    if (!record(entry) || !exactKeys(entry, ["code", "path", "original_path"])
        || typeof entry.code !== "string" || !validCode(entry.code)
        || typeof entry.path !== "string" || !entry.path || entry.path.includes("\0")
        || (previous !== undefined && compare(previous, entry.path) >= 0)
        || (/[RC]/.test(entry.code) !== (typeof entry.original_path === "string" && entry.original_path.length > 0))
        || (entry.original_path !== undefined && (typeof entry.original_path !== "string" || entry.original_path.includes("\0")))) {
      throw new Error("Invalid, unsorted or duplicate worktree inventory entry");
    }
    previous = entry.path;
  }
}

export function inventoryReference(value: WorktreeInventory, bytes: string): WorktreeInventoryRef {
  const hash = sha256(Buffer.from(bytes, "utf8"));
  return { path: `.agent-context/tasks/${value.task_id}/evidence/worktree-inventories/${hash.slice(7)}.worktree-inventory.json`, content_hash: hash, entry_count: value.entries.length };
}

/** New sidecars are immutable control evidence. Never follow a link/alias or
 * overwrite another file. These checks assume a stable tree, not an atomic FS. */
export async function resolveInventoryPath(root: string, relative: string, mustExist: boolean): Promise<string> {
  if (!/^\.agent-context\/tasks\/[^/]+\/evidence\/worktree-inventories\/[a-f0-9]{64}\.worktree-inventory\.json$/.test(relative)
      || relative.split("/").some(part => !part || part === "." || part === ".." || /[\\:\x00-\x1f\x7f<>"|?*]/.test(part) || /[. ]$/.test(part))) {
    throw new Error("Invalid owning hash-addressed worktree inventory path");
  }
  return resolveContinuityFile(root, relative, mustExist);
}

export function parseWorktreeInventoryBytes(bytes: Buffer): WorktreeInventory {
  const text = decodeContinuityText(bytes, "worktree inventory");
  if (text.startsWith("\uFEFF")) throw new Error("Worktree inventory must use canonical JSON bytes without a BOM");
  const value: unknown = JSON.parse(text);
  validateWorktreeInventoryShape(value);
  if (!Buffer.from(JSON.stringify(value, null, 2) + "\n").equals(bytes)) {
    throw new Error("Worktree inventory must use canonical JSON bytes (no duplicate keys or alternate serialization)");
  }
  return value;
}

/** Git can return success despite an incomplete traversal. Any diagnostic is
 * ambiguous here: refuse the capture instead of certifying its completeness. */
export function parseGitStatusCapture(stdout: Buffer, stderr: Buffer): WorktreeEntry[] {
  const diagnostic = decodeContinuityText(stderr, "Git status diagnostic");
  if (diagnostic.trim()) throw new Error(`Git status diagnostic; completeness cannot be established: ${JSON.stringify(diagnostic.slice(0, 2000))}${diagnostic.length > 2000 ? " (diagnostic excerpt)" : ""}`);
  return parseWorktreeStatus(decodeContinuityText(stdout, "Git status"));
}

export async function verifyWorktreeInventory(root: string, handoff: Record<string, unknown>): Promise<WorktreeInventory | undefined> {
  if (handoff.worktree_inventory === undefined) return; // Legacy inline disclosure.
  const ref = handoff.worktree_inventory;
  if (!record(ref) || !exactKeys(ref, ["path", "content_hash", "entry_count"])
      || typeof ref.path !== "string" || typeof ref.content_hash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(ref.content_hash)
      || !Number.isSafeInteger(ref.entry_count) || (ref.entry_count as number) < 0) throw new Error("Invalid worktree inventory binding");
  const expected = `.agent-context/tasks/${String(handoff.task_id)}/evidence/worktree-inventories/${ref.content_hash.slice(7)}.worktree-inventory.json`;
  if (ref.path !== expected) throw new Error("Worktree inventory owner/hash-derived path does not match the handoff");
  const bytes = await readFile(await resolveInventoryPath(root, ref.path, true));
  if (sha256(bytes) !== ref.content_hash) {
    throw new Error(`Worktree inventory content hash does not match: ${ref.path}. Check for content or Git line-ending conversion and review .gitattributes; this artifact requires exact bytes. Restore proven original bytes instead of rehashing historical evidence to accept the mismatch.`);
  }
  const inventory = parseWorktreeInventoryBytes(bytes);
  if (inventory.task_id !== handoff.task_id || inventory.created_at !== handoff.created_at
      || inventory.entries.length !== ref.entry_count || (inventory.entries.length > 0) !== handoff.worktree_dirty) {
    throw new Error("Worktree inventory task/time/count/dirty binding does not match the handoff");
  }
  return inventory;
}

export async function writeWorktreeInventory(root: string, ref: WorktreeInventoryRef, bytes: string): Promise<void> {
  const expectedBytes = Buffer.from(bytes, "utf8");
  if (sha256(expectedBytes) !== ref.content_hash) throw new Error("Worktree inventory output hash does not match");
  await resolveInventoryPath(root, ref.path, false);
  parseWorktreeInventoryBytes(expectedBytes);
  await writeImmutableContinuity(root, ref.path, expectedBytes);
}
