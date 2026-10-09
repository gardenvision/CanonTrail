import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { compileContext } from "../src/context.js";
import { createHandoff, verifyHandoffForTask } from "../src/handoff.js";
import { generateContextIndex, sha256 } from "../src/indexer.js";
import { createResumePacket } from "../src/resume.js";
import { validateRepository } from "../src/validator.js";
import { inventoryReference, parseWorktreeStatus, writeWorktreeInventory } from "../src/worktree-inventory.js";

const exec = promisify(execFile), roots: string[] = [];
const taskId = "T-REVIEW", task = `.agent-context/tasks/${taskId}`;
const git = async (cwd: string, args: string[]) => (await exec("git", ["--no-optional-locks", ...args], { cwd, windowsHide: true })).stdout;
const md = (id: string, evidence: string[] = []) => `---\n${stringify({ topic_id: id, stand: "2026-09-27", status: "current", truth_level: "draft", verification: { state: "unverified", evidence }, read_if_task_touches: [], primary_systems: [], safe_to_edit: ["Synthetic fixture"], do_not_use_instead: [] })}---\n# Review fixture\n`;
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }); });

async function snapshot(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  async function walk(relative = "") {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      if (!relative && entry.name === ".git") continue;
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(child);
      else files[child] = sha256(await readFile(path.join(root, child)));
    }
  }
  await walk(); return files;
}

async function fixture(nested = false) {
  const workspace = await mkdtemp(path.join(tmpdir(), "ct-review-fixes-")); roots.push(workspace);
  const gitRoot = path.join(workspace, "repo"), root = nested ? path.join(gitRoot, "app ü space") : gitRoot;
  await mkdir(path.join(root, task), { recursive: true });
  await mkdir(path.join(root, "src"));
  await cp(path.resolve("schemas"), path.join(root, "schemas"), { recursive: true });
  await writeFile(path.join(root, ".agent-context/config.yaml"), stringify({ version: 1, index_path: ".agent-context/context-index.json", schema_path: "schemas", governed_paths: ["."], exclude_paths: [".git"], require_frontmatter_for_all_markdown: true, require_topic_id_for_canonical: true, allow_missing_references: [] }));
  await writeFile(path.join(root, "AGENTS.md"), md("agent"));
  await writeFile(path.join(root, task, "state.yaml"), stringify({ task_id: taskId, status: "in-progress", objective: "Verify compact handoff review fixes", acceptance_criteria: [{ id: "AC", statement: "Preserve evidence", verification: "synthetic tests", status: "pending" }], dependencies: [], required_context_sources: ["src/feature.ts"], file_intents: ["src/optional.ts"], checks: [] }));
  await writeFile(path.join(root, "src/feature.ts"), "export const feature = true;\n");
  await writeFile(path.join(root, "src/optional.ts"), "export const optional = true;\n");
  await git(gitRoot, ["init", "-q"]);
  await git(gitRoot, ["config", "core.autocrlf", "false"]);
  await generateContextIndex(root);
  const compile = () => compileContext({ root, taskId, totalTokens: 16000, reservedOutputTokens: 2000, apply: true });
  await compile();
  await git(gitRoot, ["add", "."]);
  await git(gitRoot, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "synthetic baseline"]);
  const options = { root, taskId, sourceSessionId: "review-source", createdAt: "2026-09-27T07:00:00Z", nextSafeAction: "Inspect the exact selected source files before implementing the next bounded change." };
  return { workspace, root, gitRoot, options, compile };
}

async function cli(root: string, args: string[]) {
  try {
    const result = await exec(process.execPath, ["--import", "tsx", path.resolve("src/cli.ts"), ...args], { cwd: root, windowsHide: true });
    return { ...result, code: 0 };
  } catch (error) {
    const result = error as { stdout: string; stderr: string; code: number };
    return { stdout: result.stdout, stderr: result.stderr, code: result.code };
  }
}

describe("review F1: explicit Git-root boundary", () => {
  it.each([["handoff", false], ["handoff", true], ["checkpoint", false], ["checkpoint", true]] as const)("rejects nested %s apply=%s before any write", async (kind, apply) => {
    const f = await fixture(true);
    await writeFile(path.join(f.root, "src/feature.ts"), "export const feature = false;\n");
    await mkdir(path.join(f.gitRoot, "other")); await writeFile(path.join(f.gitRoot, "other/peer.txt"), "foreign change\n");
    await f.compile();
    const before = await snapshot(f.gitRoot), indexBefore = await readFile(path.join(f.gitRoot, ".git/index"));
    // Use the real CLI from the implementation checkout so tsx resolves there.
    const result = await cli(process.cwd(), [kind, "create", f.root, "--task", taskId, "--session", "nested", "--next-action", f.options.nextSafeAction,
      ...(kind === "checkpoint" ? ["--trigger", "pause"] : []), ...(apply ? ["--apply"] : [])]);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/project root must be the Git worktree root/i);
    expect(result.stderr).toContain("nested");
    expect(await snapshot(f.gitRoot)).toEqual(before);
    expect(await readFile(path.join(f.gitRoot, ".git/index"))).toEqual(indexBefore);
  });

  it("accepts the root of a linked Git worktree, not just a .git directory", async () => {
    const f = await fixture(), linked = path.join(f.workspace, "linked");
    await git(f.gitRoot, ["worktree", "add", "--detach", linked]);
    await writeFile(path.join(linked, "src/feature.ts"), "export const feature = false;\n");
    await compileContext({ root: linked, taskId, totalTokens: 16000, reservedOutputTokens: 2000, apply: true });
    const result = await createHandoff({ ...f.options, root: linked });
    expect(result.handoff.files.map(file => file.path)).toContain("src/feature.ts");
  });
});

describe("review F3: repair guidance follows reference semantics", () => {
  it("allows reviewed optional-source removal to be fixed by recompiling the active lock", async () => {
    const f = await fixture(); await unlink(path.join(f.root, "src/optional.ts"));
    const report = await validateRepository(f.root);
    const missing = report.diagnostics.find(item => item.code === "LOCK003")!;
    expect(report.ok).toBe(false);
    expect(missing.detail).toContain("Active context source");
    expect(missing.detail).toContain("recompile");
    expect(missing.detail).not.toContain("recompilation cannot restore");
    await f.compile();
    expect((await validateRepository(f.root)).ok).toBe(true);
  });

  it("does not advise dropping a missing required source merely to refresh a lock", async () => {
    const f = await fixture(), before = await readFile(path.join(f.root, task, "context.lock.json"));
    await unlink(path.join(f.root, "src/feature.ts"));
    const missing = (await validateRepository(f.root)).diagnostics.find(item => item.code === "LOCK003")!;
    expect(missing.detail).toContain("required sources");
    await expect(f.compile()).rejects.toThrow();
    expect(await readFile(path.join(f.root, task, "context.lock.json"))).toEqual(before);
  });

  it("distinguishes a missing current handoff source without suggesting a replacement bypass", async () => {
    const f = await fixture(), handoff = await createHandoff({ ...f.options, apply: true });
    const original = await readFile(path.join(f.root, task, "handoff.yaml"));
    await unlink(path.join(f.root, "src/optional.ts"));
    const finding = (await validateRepository(f.root, { checkIndex: false, checkContextLocks: false })).diagnostics.find(item => item.code === "HANDOFF004")!;
    expect(finding.detail).toContain("Handoff resume source");
    expect(finding.detail).toContain("replacement");
    expect(finding.detail).not.toContain("recompilation cannot restore");
    const indexPath = path.join(f.root, ".agent-context/context-index.json"), before = await readFile(indexPath);
    const index = await cli(process.cwd(), ["index", f.root]);
    expect(index.code).toBe(1);
    expect(index.stderr).not.toContain("A context-lock refresh does not repair missing evidence");
    expect(await readFile(indexPath)).toEqual(before);
    await f.compile();
    await expect(createHandoff({ ...f.options, apply: true, replace: true })).rejects.toThrow(/missing resume source/);
    expect(await readFile(path.join(f.root, task, "handoff.yaml"))).toEqual(original);
    await writeFile(path.join(f.root, "src/optional.ts"), "export const optional = true;\n");
    await f.compile();
    const replaced = await createHandoff({ ...f.options, handoffId: "H-REPLACEMENT", apply: true, replace: true });
    expect(await readFile(path.join(f.root, replaced.previous_handoff_archive_path!))).toEqual(original);
    expect(handoff.handoff.worktree_inventory).toBeDefined();
  });

  it("keeps missing evidence blocking and names the resolved project-relative target", async () => {
    const f = await fixture();
    await mkdir(path.join(f.root, "docs"));
    await writeFile(path.join(f.root, "docs/report.md"), md("evidence", ["docs/sub/../missing.png"]));
    const finding = (await validateRepository(f.root, { checkIndex: false, checkContextLocks: false })).diagnostics.find(item => item.code === "REF001")!;
    expect(finding.detail).toContain('document/artifact "docs/report.md"');
    expect(finding.detail).toContain('Missing target: "docs/missing.png"');
    expect(finding.detail).toContain("recompilation cannot restore");
    const index = path.join(f.root, ".agent-context/context-index.json"), before = await readFile(index);
    expect((await cli(process.cwd(), ["index", f.root])).code).toBe(1);
    expect(await readFile(index)).toEqual(before);
  });
});

describe("review F2: raw-byte Git transport", () => {
  it.each([false, true])("fresh autocrlf clone with reviewed byte-preservation=%s", async protectedBytes => {
    const f = await fixture();
    // Other selected sources retain bytes in both cases; only control artifacts
    // differ, reproducing the new handoff's own raw-byte transport requirement.
    await writeFile(path.join(f.root, ".gitattributes"), `*.md -text\nsrc/** -text\n${protectedBytes ? ".agent-context/** -text\n" : ""}`);
    const handoff = await createHandoff({ ...f.options, apply: true });
    await git(f.root, ["add", "."]);
    await git(f.root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "synthetic handoff"]);
    const clone = path.join(f.workspace, "clone");
    // Persist the intended transport policy in this synthetic clone, rather
    // than borrowing the host's Git defaults after a one-command override.
    await git(f.workspace, ["clone", "--no-local", "--config", "core.autocrlf=true", "--config", "core.safecrlf=false", f.root, clone]);
    expect((await git(clone, ["config", "--local", "--get", "core.autocrlf"])).trim()).toBe("true");
    const inventory = handoff.handoff.worktree_inventory!, original = await readFile(path.join(f.root, inventory.path)), received = await readFile(path.join(clone, inventory.path));
    expect((await git(clone, ["status", "--porcelain=v1"])).trim()).toBe("");
    const loaded = parse(await readFile(path.join(clone, task, "handoff.yaml"), "utf8")) as Record<string, unknown>;
    const before = await snapshot(clone);
    if (protectedBytes) {
      expect(received).toEqual(original);
      await expect(verifyHandoffForTask(clone, taskId, loaded)).resolves.toBeUndefined();
      expect((await validateRepository(clone)).ok).toBe(true);
      const receiving = await createResumePacket({ root: clone, taskId, receivingSessionId: "clone-receiver", totalTokens: 16000, reservedOutputTokens: 2000 });
      expect(receiving.context_lock.sources.some(source => source.path === inventory.path)).toBe(false);
    } else {
      expect(received).not.toEqual(original);
      expect(received.toString("utf8")).toContain("\r\n");
      await expect(verifyHandoffForTask(clone, taskId, loaded)).rejects.toThrow(/line-ending/);
      const report = await validateRepository(clone, { checkIndex: false, checkContextLocks: false });
      expect(report.diagnostics.find(item => item.code === "HANDOFF008")?.detail).toContain(".gitattributes");
    }
    expect(await snapshot(clone)).toEqual(before);
  });
});

describe("precommit review: exact bytes on immutable collisions", () => {
  it("rejects decoded-equal invalid UTF-8 before writing a handoff or source archive", async () => {
    const f = await fixture();
    await writeFile(path.join(f.root, "name-\uFFFD.txt"), "valid Unicode filename\n");
    // Keep creation of the synthetic collision from changing the observed
    // status list between preview and apply.
    await writeFile(path.join(f.root, ".git/info/exclude"), `${task}/evidence/\n`);
    const inventory = { version: 1 as const, task_id: taskId, created_at: f.options.createdAt,
      entries: parseWorktreeStatus(await git(f.root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])) };
    const text = JSON.stringify(inventory, null, 2) + "\n", ref = inventoryReference(inventory, text);
    const dry = await createHandoff(f.options);
    expect(dry.handoff.worktree_inventory).toEqual(ref);
    const expected = Buffer.from(text), marker = expected.indexOf(Buffer.from("\uFFFD"));
    expect(marker).toBeGreaterThanOrEqual(0);
    const corrupt = Buffer.concat([expected.subarray(0, marker), Buffer.from([0xff]), expected.subarray(marker + 3)]);
    expect(corrupt.toString("utf8")).toBe(text);
    expect(sha256(corrupt)).not.toBe(ref.content_hash);
    const file = path.join(f.root, ref.path);
    await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, corrupt);
    const before = await snapshot(f.root), index = await readFile(path.join(f.root, ".git/index"));
    await expect(createHandoff({ ...f.options, apply: true })).rejects.toThrow(/different content/);
    expect(await snapshot(f.root)).toEqual(before);
    expect(await readFile(path.join(f.root, ".git/index"))).toEqual(index);
    expect(await readFile(file)).toEqual(corrupt);
  });

  it("retains idempotence for exact valid UTF-8 inventories containing a replacement character", async () => {
    const f = await fixture();
    const inventory = { version: 1 as const, task_id: taskId, created_at: f.options.createdAt,
      entries: [{ code: "??", path: "name-\uFFFD.txt" }] };
    const text = JSON.stringify(inventory, null, 2) + "\n", ref = inventoryReference(inventory, text);
    await writeWorktreeInventory(f.root, ref, text);
    const before = await snapshot(f.root);
    await expect(writeWorktreeInventory(f.root, ref, text)).resolves.toBeUndefined();
    expect(await snapshot(f.root)).toEqual(before);
    expect(await readFile(path.join(f.root, ref.path))).toEqual(Buffer.from(text));
  });
});
