import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stringify } from "yaml";
import { compileContext } from "../src/context.js";
import { generateContextIndex } from "../src/indexer.js";

// Model the filesystem's exact identifiers, not the guard's return value. Number-based
// callers receive the same lossy projection as node:fs; BigInt callers receive exact IDs.
const model = vi.hoisted(() => ({
  identities: new Map<string, { dev: bigint; ino: bigint }>(),
  probes: [] as Array<{ path: string; exact: boolean }>,
}));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    stat: async (...args: Parameters<typeof actual.stat>) => {
      const result = await actual.stat(...args);
      const key = String(args[0]);
      const id = model.identities.get(key);
      if (!id) return result;
      const exact = typeof args[1] === "object" && args[1]?.bigint === true;
      model.probes.push({ path: key, exact });
      return Object.assign(result, { dev: exact ? id.dev : Number(id.dev), ino: exact ? id.ino : Number(id.ino) });
    },
  };
});

const roots: string[] = [];
afterEach(async () => {
  model.identities.clear();
  model.probes.length = 0;
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 5 });
});

async function modelIdentity(file: string, id: { dev: bigint; ino: bigint }) {
  // The compiler stats realpath results; macOS temporary roots may be aliases too.
  model.identities.set(await realpath(file), id);
}

function expectExactProbes() {
  expect(model.identities.size).toBe(2);
  expect(new Set(model.probes.map(probe => probe.path))).toEqual(new Set(model.identities.keys()));
  expect(model.probes.every(probe => probe.exact)).toBe(true);
}

async function fixture(mode: "required" | "include", pathMode: "plain" | "directory-alias") {
  const container = await mkdtemp(path.join(tmpdir(), "ct-exact-id-")); roots.push(container);
  let root = container;
  if (pathMode === "directory-alias") {
    const physical = path.join(container, "physical");
    await mkdir(physical);
    root = path.join(container, "alias");
    await symlink(physical, root, process.platform === "win32" ? "junction" : "dir");
    expect(path.normalize(await realpath(root))).not.toBe(path.normalize(root));
  }
  const taskId = "T-EXACT-ID", base = `.agent-context/tasks/${taskId}`;
  await cp(path.resolve("schemas"), path.join(root, "schemas"), { recursive: true });
  await mkdir(path.join(root, base), { recursive: true });
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, ".agent-context/config.yaml"), stringify({ version: 1, index_path: ".agent-context/context-index.json", schema_path: "schemas", governed_paths: ["."], exclude_paths: [".git"], require_frontmatter_for_all_markdown: true, require_topic_id_for_canonical: true, allow_missing_references: [] }));
  await writeFile(path.join(root, "AGENTS.md"), `---\n${stringify({ topic_id: "exact-file-identity", stand: "2026-09-10", status: "current", truth_level: "canonical", verification: { state: "reviewed", evidence: [] }, read_if_task_touches: [], primary_systems: [], safe_to_edit: ["Fixture only"], do_not_use_instead: [] })}---\n\n# Fixture\n`);
  const source = "src/Required.ts";
  await writeFile(path.join(root, source), "export const important = true;\n");
  await writeFile(path.join(root, base, "state.yaml"), stringify({ task_id: taskId, status: "in-progress", objective: "Preserve exact file identity", acceptance_criteria: [{ id: "AC", statement: "Required inputs stay distinct", verification: "fixture", status: "pending" }], dependencies: [], file_intents: [], required_context_sources: mode === "required" ? [source] : [], checks: [] }));
  await generateContextIndex(root);
  const compile = () => compileContext({ root, taskId, totalTokens: 16000, reservedOutputTokens: 0, inputSafetyTokens: 0, includePaths: mode === "include" ? [source] : [], createdAt: "2026-09-10T00:00:00Z", apply: true });
  await compile();
  return { root, output: path.join(root, base, "context.lock.json"), source, compile };
}

describe("exact context output file identity", () => {
  it.each([
    ["inode", "required", "plain"], ["inode", "include", "plain"],
    ["device", "required", "plain"], ["device", "include", "plain"],
    ["inode", "required", "directory-alias"], ["inode", "include", "directory-alias"],
  ] as const)("does not merge distinct high %s IDs for a %s source via %s root", async (field, mode, pathMode) => {
    const f = await fixture(mode, pathMode);
    const a = 9007199254740992n, b = 9007199254740993n;
    expect(a).not.toBe(b);
    expect(Number(a)).toBe(Number(b));
    const outputId = { dev: field === "device" ? a : 11n, ino: field === "inode" ? a : 31n };
    const sourceId = { dev: field === "device" ? b : 11n, ino: field === "inode" ? b : 31n };
    await modelIdentity(f.output, outputId);
    await modelIdentity(path.join(f.root, f.source), sourceId);
    const report = await f.compile();
    expectExactProbes();
    expect(report.lock.sources.filter(s => s.path === f.source)).toHaveLength(1);
    expect(report.lock.sources.some(s => s.path.endsWith("/context.lock.json"))).toBe(false);
    expect(JSON.parse(await readFile(f.output, "utf8")).lock_hash).toBe(report.lock.lock_hash);
  });

  it.each([
    ["required", "plain"], ["include", "plain"],
    ["required", "directory-alias"], ["include", "directory-alias"],
  ] as const)("still rejects exact equal high IDs for a %s alias via %s root without rewriting output", async (mode, pathMode) => {
    const f = await fixture(mode, pathMode), before = await readFile(f.output);
    const same = { dev: 9007199254740993n, ino: 9007199254740997n };
    await modelIdentity(f.output, same);
    await modelIdentity(path.join(f.root, f.source), same);
    await expect(f.compile()).rejects.toThrow(/context lock output itself/);
    expectExactProbes();
    expect(await readFile(f.output)).toEqual(before);
  });
});
