import { rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Atomic file replacement: write a sibling temporary file, then rename over
 * the target. Readers observe either the previous complete content or the new
 * complete content, never a truncated or partially written file. Used for
 * resume-critical artifacts (context locks, handoffs, evidence records and the
 * context index) whose torn writes would only surface later as self-hash or
 * stale-content findings.
 */
export async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temporary, content, "utf8");
  try {
    await rename(temporary, filePath);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
