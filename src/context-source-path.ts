import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";

/** Exact directory-entry spelling, not OS-dependent case folding. Missing optional
 * sources remain missing; aliases accepted by the filesystem are explicit errors.
 * Preserve the compiler's existing contained-link support, checking containment
 * before descending through each component. Historical locks need not call this. */
export async function safeRepositoryFile(root: string, relative: string): Promise<string | undefined> {
  const parts = relative.split("/");
  if (!relative || path.isAbsolute(relative) || /[\\:\x00-\x1f\x7f]/.test(relative)
      || parts.some(part => !part || part === "." || part === "..")) {
    throw new Error(`Source requires an exact repository-relative path: ${relative}`);
  }
  const realRoot = await realpath(root);
  let parent = realRoot;
  for (const part of parts) {
    let entries: string[];
    try { entries = await readdir(parent); }
    catch (error) {
      if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return undefined;
      throw error;
    }
    const candidate = path.join(parent, part);
    if (!entries.includes(part)) {
      try { await lstat(candidate); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
      }
      throw new Error(`Source path spelling is not an exact directory entry: ${relative}`);
    }
    try { parent = await realpath(candidate); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
    const inside = path.relative(realRoot, parent);
    if (inside === ".." || inside.startsWith(".." + path.sep) || path.isAbsolute(inside)) {
      throw new Error(`Source resolves outside the repository: ${relative}`);
    }
  }
  return parent;
}
