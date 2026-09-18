import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { compareCodeUnits } from "./ordering.js";

const CONTROL_ROOT = ".agent-context/migrations";

/** Control files are allowed below .agent-context, never through aliases or links.
 * This checks stable-tree identity, not atomic protection against a final-syscall race.
 */
export async function resolveMigrationControlPath(
  root: string, relative: string, kind: "file" | "directory" | "entry", mustExist = true,
): Promise<string> {
  const segments = relative.split("/");
  if (
    (relative !== ".agent-context" && relative !== CONTROL_ROOT && !relative.startsWith(CONTROL_ROOT + "/"))
    || (relative === ".agent-context" && kind !== "directory")
    || segments.some((part) => !part || part === "." || part === ".." || /[\\:\x00-\x1f\x7f<>"|?*]/.test(part) || /[. ]$/.test(part))
  ) throw new Error(`invalid migration control path: ${relative}`);
  const rootReal = await realpath(root);
  let cursor = rootReal;
  for (let index = 0; index < segments.length; index += 1) {
    const name = segments[index]!;
    const parent = cursor;
    cursor = path.join(parent, name);
    let entry;
    try { entry = await lstat(cursor); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (mustExist) throw new Error(`migration control path does not exist: ${relative}`);
      return path.join(cursor, ...segments.slice(index + 1));
    }
    if (entry.isSymbolicLink()) throw new Error(`migration control path must not traverse a symbolic link: ${relative}`);
    const resolved = await realpath(cursor);
    const actual = path.relative(rootReal, resolved).split(path.sep).join("/");
    if (actual === ".." || actual.startsWith("../") || path.isAbsolute(actual)) {
      throw new Error(`migration control path resolves outside the project: ${relative}`);
    }
    // realpath alone can retain an alias on case-insensitive filesystems.
    if (actual !== segments.slice(0, index + 1).join("/") || !(await readdir(parent)).includes(name)) {
      throw new Error(`migration control path uses a filesystem alias instead of exact stored spelling: ${relative}`);
    }
    const expectedKind = index === segments.length - 1 ? kind : "directory";
    const regular = expectedKind === "directory" ? entry.isDirectory()
      : expectedKind === "file" ? entry.isFile() : entry.isDirectory() || entry.isFile();
    if (!regular) {
      throw new Error(`migration control path is not a regular ${expectedKind}: ${relative}`);
    }
    cursor = resolved;
  }
  return cursor;
}

function protocolSpelling(relative: string): string {
  const parts = relative.split("/");
  if (parts[3]?.toLowerCase() === "migration.plan.json") parts[3] = "migration.plan.json";
  if (parts[3]?.toLowerCase() === "transactions") {
    parts[3] = "transactions";
    if (parts[5]?.toLowerCase() === "transaction.json") parts[5] = "transaction.json";
    if (parts[5]?.toLowerCase() === "execution") {
      parts[5] = "execution";
      if (["intent.json", "apply.record.json", "rollback.record.json"].includes(parts[6]?.toLowerCase() ?? "")) {
        parts[6] = parts[6]!.toLowerCase();
      }
    }
  }
  return parts.join("/");
}

/** Inspect the entire control subtree independently of configured scanner exclusions.
 * Never follow links (including broken ones), silently skip special files, or infer
 * absence from an unreadable directory. A missing tree remains backward-compatible.
 */
export async function inspectMigrationControlTree(root: string): Promise<boolean> {
  const absolute = await resolveMigrationControlPath(root, CONTROL_ROOT, "directory", false);
  try { await lstat(absolute); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  const pending = [CONTROL_ROOT];
  while (pending.length > 0) {
    const relative = pending.pop()!;
    const directory = await resolveMigrationControlPath(root, relative, "directory");
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareCodeUnits(left.name, right.name));
    for (const entry of entries) {
      const child = relative + "/" + entry.name;
      if (entry.isSymbolicLink()) throw new Error(`migration control path must not traverse a symbolic link: ${child}`);
      // Check a recognized protocol spelling only for an actual filesystem alias.
      // A missing/distinct POSIX spelling is not silently canonicalized or governed.
      const canonical = protocolSpelling(child);
      if (canonical !== child) await resolveMigrationControlPath(root, canonical, "entry", false);
      if (entry.isDirectory()) pending.push(child);
      else if (entry.isFile()) await resolveMigrationControlPath(root, child, "file");
      else throw new Error(`migration control path is not a regular file or directory: ${child}`);
    }
  }
  return true;
}
