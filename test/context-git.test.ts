import { describe, expect, it } from "vitest";
import { matchingGitBlobs } from "../src/context-git.js";

describe("selected Git identity probes", () => {
  it("starts no per-source Git operation without a base revision", async () => {
    let count = 0;
    expect(await matchingGitBlobs("fixture", undefined, ["a.ts", "b.ts"], async () => { count++; return "x"; })).toEqual([null, null]);
    expect(count).toBe(0);
  });
  it("uses one pinned revision, retains input order and bounds concurrent processes", async () => {
    let active = 0, peak = 0;
    const calls: string[][] = [];
    const files = Array.from({ length: 17 }, (_, i) => `source ${i}.ts`);
    const result = await matchingGitBlobs("fixture", "revision", files, async (_root, args) => {
      calls.push(args); active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, args[0] === "rev-parse" ? 1 : 2)); active--;
      const file = args[0] === "rev-parse" ? args[1]!.slice("revision:".length) : args[3]!;
      return "blob-" + file;
    });
    expect(result).toEqual(files.map(file => "blob-" + file));
    expect(peak).toBe(4); expect(calls).toHaveLength(34);
    expect(calls.filter(a => a[0] === "rev-parse").every(a => a[1]!.startsWith("revision:"))).toBe(true);
    expect(calls.filter(a => a[0] === "hash-object")).toEqual(expect.arrayContaining(files.map(f => ["hash-object", `--path=${f}`, "--", f])));
  });
  it("does not invent Git identity for untracked or changed sources", async () => {
    const calls: string[][] = [];
    const result = await matchingGitBlobs("fixture", "base", ["untracked", "dirty", "clean"], async (_root, args) => {
      calls.push(args);
      if (args[1] === "base:untracked") return undefined;
      return args[0] === "hash-object" && args[3] === "dirty" ? "new" : "old";
    });
    expect(result).toEqual([null, null, "old"]);
    expect(calls.some(a => a[0] === "hash-object" && a[3] === "untracked")).toBe(false);
  });
});
