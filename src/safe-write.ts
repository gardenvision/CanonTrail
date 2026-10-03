import { rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Atomic file replacement: write a sibling temporary file, then rename over
 * the target. Concurrent readers observe either the previous complete content
 * or the new complete content, not a partially written replacement. This is
 * atomic visibility, not fsync-backed power-loss durability, POSIX mode
 * preservation or a multi-file transaction. Used for
 * resume-critical artifacts (context locks, handoffs, evidence records and the
 * context index) whose torn writes would only surface later as self-hash or
 * stale-content findings.
 */
export async function writeFileAtomic(filePath: string, content: string | Buffer): Promise<void> {
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
  try {
    await rename(temporary, filePath);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
