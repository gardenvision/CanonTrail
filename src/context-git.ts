import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export async function readGitValue(root: string, args: string[]): Promise<string | undefined> {
  try {
    const result = await execFileAsync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
    return result.stdout.trim() || undefined;
  } catch { return undefined; }
}

/** Git is optional. Probe only selected sources, against one immutable base revision.
 * Four workers bound process pressure without serial Windows process-start latency.
 * Keep Git's own attribute/filter normalization; raw source SHA-256 is separate.
 */
export async function matchingGitBlobs(
  root: string, revision: string | undefined, paths: string[],
  run: typeof readGitValue = readGitValue,
): Promise<Array<string | null>> {
  const result: Array<string | null> = paths.map(() => null);
  if (!revision) return result;
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, paths.length) }, async () => {
    while (next < paths.length) {
      const index = next++;
      const file = paths[index]!;
      const baseBlob = await run(root, ["rev-parse", `${revision}:${file}`]);
      if (!baseBlob) continue;
      const workingBlob = await run(root, ["hash-object", `--path=${file}`, "--", file]);
      if (workingBlob?.toLowerCase() === baseBlob.toLowerCase()) result[index] = baseBlob;
    }
  }));
  return result;
}
