import { execFile } from "node:child_process";
import { cp, link, mkdir, mkdtemp, readFile, readdir, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { compileContext } from "../src/context.js";
import { createHandoff, computeHandoffHash, serializeHandoff, verifyHandoffForTask } from "../src/handoff.js";
import { generateContextIndex, sha256 } from "../src/indexer.js";
import { createResumePacket, formatResumeCreateReport } from "../src/resume.js";
import { validateRepository } from "../src/validator.js";
import { decodeContinuityText, preflightImmutable, resolveContinuityFile, writeImmutableContinuity, writeMutableContinuity } from "../src/continuity-files.js";
import { parseGitStatusCapture, parseWorktreeInventoryBytes } from "../src/worktree-inventory.js";

const exec = promisify(execFile), roots: string[] = [];
const taskId = "T-HARDENING", task = `.agent-context/tasks/${taskId}`;
const git = async (cwd: string, args: string[]) => exec("git", ["--no-optional-locks", ...args], { cwd, windowsHide: true });
const md = `---\n${stringify({ topic_id: "agent", stand: "2026-09-27", status: "current", truth_level: "draft", verification: { state: "unverified", evidence: [] }, read_if_task_touches: [], primary_systems: [], safe_to_edit: ["Synthetic fixture"], do_not_use_instead: [] })}---\n# Fixture\n`;
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }); });

async function snapshot(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  async function walk(relative = "") {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      if (!relative && entry.name === ".git") continue;
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) { files[child] = "link"; continue; }
      if (entry.isDirectory()) await walk(child);
      else files[child] = sha256(await readFile(path.join(root, child)));
    }
  }
  await walk(); return files;
}

async function fixture() {
  const workspace = await mkdtemp(path.join(tmpdir(), "ct-write-")); roots.push(workspace);
  const root = path.join(workspace, "repo");
  await mkdir(path.join(root, task), { recursive: true });
  await mkdir(path.join(root, "src"));
  await cp(path.resolve("schemas"), path.join(root, "schemas"), { recursive: true });
  await writeFile(path.join(root, ".agent-context/config.yaml"), stringify({ version: 1, index_path: ".agent-context/context-index.json", schema_path: "schemas", governed_paths: ["."], exclude_paths: [".git"], require_frontmatter_for_all_markdown: true, require_topic_id_for_canonical: true, allow_missing_references: [] }));
  await writeFile(path.join(root, "AGENTS.md"), md);
  await writeFile(path.join(root, task, "state.yaml"), stringify({ task_id: taskId, status: "in-progress", objective: "Verify byte-exact continuity writes", acceptance_criteria: [{ id: "AC", statement: "Preserve provenance", verification: "tests", status: "pending" }], dependencies: [], required_context_sources: ["src/valid-\uFFFD.ts"], file_intents: [], checks: [] }));
  await writeFile(path.join(root, "src/valid-\uFFFD.ts"), "export const feature = true;\n");
  await git(root, ["init", "-q"]);
  await git(root, ["config", "core.autocrlf", "false"]);
  // Immutable-output fixtures must not change the preview's Git inventory.
  await writeFile(path.join(root, ".git/info/exclude"), `${task}/evidence/\n`);
  await generateContextIndex(root);
  const compile = () => compileContext({ root, taskId, totalTokens: 24000, reservedOutputTokens: 2000, apply: true });
  await compile();
  await git(root, ["add", "."]);
  await git(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"]);
  const options = { root, taskId, sourceSessionId: "source", createdAt: "2026-09-27T12:00:00Z", nextSafeAction: "Inspect selected sources and the verified checkpoint before continuing the bounded task." };
  const receiving = { root, taskId, receivingSessionId: "receiver", createdAt: "2026-09-27T13:00:00Z", totalTokens: 24000, reservedOutputTokens: 2000 };
  return { workspace, root, options, receiving, compile };
}

function malformed(bytes: Buffer): Buffer {
  const marker = bytes.indexOf(Buffer.from("\uFFFD")); expect(marker).toBeGreaterThanOrEqual(0);
  const corrupt = Buffer.concat([bytes.subarray(0, marker), Buffer.from([0xff]), bytes.subarray(marker + 3)]);
  expect(corrupt.toString("utf8")).toBe(bytes.toString("utf8"));
  expect(corrupt.equals(bytes)).toBe(false); return corrupt;
}

async function put(root: string, relative: string, bytes: Buffer | string) {
  await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
  await writeFile(path.join(root, relative), bytes);
}

async function cli(args: string[]) {
  try { return { ...(await exec(process.execPath, ["--import", "tsx", path.resolve("src/cli.ts"), ...args], { windowsHide: true })), code: 0 }; }
  catch (error) { return error as unknown as { stdout: string; stderr: string; code: number }; }
}

describe("continuity raw bytes and complete preflight", () => {
  it("retains exact BOM and CRLF bytes when atomically replacing an owned mutable artifact", async () => {
    const f = await fixture(), relative = `${task}/mutable.txt`;
    const before = Buffer.from("old\r\n"), after = Buffer.from("\uFEFFnew \uFFFD\r\n");
    await put(f.root, relative, before);
    expect(await writeMutableContinuity(f.root, relative, after, before)).toBe(true);
    expect(await readFile(path.join(f.root, relative))).toEqual(after);
    expect(await writeMutableContinuity(f.root, relative, after, after)).toBe(false);
    await expect(writeMutableContinuity(f.root, relative, before, before)).rejects.toThrow(/changed since preflight/);
    expect(await readFile(path.join(f.root, relative))).toEqual(after);
  });
  it("accepts exact Unicode bytes idempotently without silently dropping a BOM in general control text", async () => {
    const f = await fixture(), relative = `${task}/evidence/valid.json`, bytes = Buffer.from('{"unicode":"\uFFFD"}\n');
    expect(await writeImmutableContinuity(f.root, relative, bytes)).toBe(true);
    const before = await snapshot(f.root);
    expect(await preflightImmutable(f.root, relative, bytes)).toBe("identical");
    expect(await writeImmutableContinuity(f.root, relative, bytes)).toBe(false);
    expect(await snapshot(f.root)).toEqual(before);
    expect(decodeContinuityText(Buffer.from("\uFEFFvalid text"), "fixture")).toBe("\uFEFFvalid text");
  });
  it("rejects a decoded-equal source archive collision before any inventory or handoff write", async () => {
    const f = await fixture(), dry = await createHandoff(f.options);
    await put(f.root, dry.source_context_archive_path, malformed(await readFile(path.join(f.root, task, "context.lock.json"))));
    const before = await snapshot(f.root);
    await expect(createHandoff({ ...f.options, apply: true })).rejects.toThrow(/different content/);
    expect(await snapshot(f.root)).toEqual(before);
  });

  it("rejects malformed archived UTF-8 through direct validation repository and resume", async () => {
    const f = await fixture(), made = await createHandoff({ ...f.options, apply: true });
    const archive = path.join(f.root, made.source_context_archive_path);
    await writeFile(archive, malformed(await readFile(archive)));
    const before = await snapshot(f.root);
    await expect(verifyHandoffForTask(f.root, taskId, made.handoff as unknown as Record<string, unknown>)).rejects.toThrow(/UTF-8/);
    expect((await validateRepository(f.root, { checkIndex: false, checkContextLocks: false })).diagnostics.some(d => d.code === "HANDOFF006")).toBe(true);
    await expect(createResumePacket(f.receiving)).rejects.toThrow(/UTF-8/);
    expect(await snapshot(f.root)).toEqual(before);
  });

  it("preflights the previous handoff archive before creating any other output", async () => {
    const f = await fixture(), first = await createHandoff({ ...f.options, apply: true });
    const target = `${task}/evidence/handoffs/${first.handoff.handoff_hash.slice(7)}.yaml`;
    await put(f.root, target, "do not overwrite this collision\n");
    await f.compile();
    const before = await snapshot(f.root);
    await expect(createHandoff({ ...f.options, createdAt: "2026-09-27T12:01:00Z", replace: true, apply: true })).rejects.toThrow(/different content/);
    expect(await snapshot(f.root)).toEqual(before);
  });

  it("preflights a malformed receiving archive collision before active context or packet changes", async () => {
    const f = await fixture(); await createHandoff({ ...f.options, apply: true });
    const dry = await createResumePacket(f.receiving);
    await put(f.root, dry.receiving_context_archive_path, malformed(Buffer.from(JSON.stringify(dry.context_lock, null, 2) + "\n")));
    const before = await snapshot(f.root);
    await expect(createResumePacket({ ...f.receiving, apply: true })).rejects.toThrow(/different content/);
    expect(await snapshot(f.root)).toEqual(before);
  });

  it("preflights the final packet collision before any receiving archive or active change", async () => {
    const f = await fixture(); await createHandoff({ ...f.options, apply: true });
    const dry = await createResumePacket(f.receiving);
    await put(f.root, dry.packet_path, malformed(Buffer.from(JSON.stringify(dry.packet, null, 2) + "\n")));
    const before = await snapshot(f.root);
    await expect(createResumePacket({ ...f.receiving, apply: true })).rejects.toThrow(/different content/);
    expect(await snapshot(f.root)).toEqual(before);
  });

  it.each(["bom", "duplicate"])("rejects self-consistently rehashed %s inventory through every reader", async kind => {
    const f = await fixture(), made = await createHandoff({ ...f.options, apply: true });
    const old = await readFile(path.join(f.root, made.handoff.worktree_inventory!.path));
    const bytes = kind === "bom" ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), old])
      : Buffer.from(old.toString("utf8").replace('"version": 1,', '"version": 1, "version": 1,'));
    const ref = { ...made.handoff.worktree_inventory!, content_hash: sha256(bytes), path: `${task}/evidence/worktree-inventories/${sha256(bytes).slice(7)}.worktree-inventory.json` };
    await put(f.root, ref.path, bytes);
    const { handoff_hash: _ignored, ...payload } = made.handoff;
    const updated = { ...payload, worktree_inventory: ref };
    const handoff = { ...updated, handoff_hash: computeHandoffHash(updated) };
    await put(f.root, `${task}/handoff.yaml`, stringify(handoff));
    const before = await snapshot(f.root);
    await expect(verifyHandoffForTask(f.root, taskId, handoff as unknown as Record<string, unknown>)).rejects.toThrow(/canonical|BOM/);
    expect((await validateRepository(f.root, { checkIndex: false, checkContextLocks: false })).ok).toBe(false);
    await expect(createResumePacket(f.receiving)).rejects.toThrow(/canonical|BOM/);
    expect(await snapshot(f.root)).toEqual(before);
  });
});

describe("no linked continuity destinations", () => {
  it.each(["../escape.json", ".agent-context/tasks/../escape.json", ".agent-context/tasks/CON/state.yaml", ".agent-context/tasks/T./state.yaml", ".agent-context/tasks/T /state.yaml", ".agent-context/tasks/T:stream/state.yaml"])("rejects nonportable or traversal control path %s", async relative => {
    await expect(resolveContinuityFile(process.cwd(), relative)).rejects.toThrow(/exact portable/);
  });
  it.each(["context-locks", "handoffs"])("rejects a deep %s junction/symlink before writes", async folder => {
    const f = await fixture();
    if (folder === "handoffs") { await createHandoff({ ...f.options, apply: true }); await f.compile(); }
    const outside = path.join(f.workspace, "outside"); await mkdir(outside);
    await mkdir(path.join(f.root, task, "evidence"), { recursive: true });
    await symlink(outside, path.join(f.root, task, "evidence", folder), process.platform === "win32" ? "junction" : "dir");
    const before = await snapshot(f.workspace);
    await expect(createHandoff({ ...f.options, replace: true, apply: true })).rejects.toThrow(/link|alias/);
    expect(await snapshot(f.workspace)).toEqual(before);
  });

  it("rejects a linked resume packet directory before receiving archive or active context writes", async () => {
    const f = await fixture(); await createHandoff({ ...f.options, apply: true });
    const outside = path.join(f.workspace, "outside"); await mkdir(outside);
    await symlink(outside, path.join(f.root, task, "evidence/resume-packets"), process.platform === "win32" ? "junction" : "dir");
    const before = await snapshot(f.workspace);
    await expect(createResumePacket({ ...f.receiving, apply: true })).rejects.toThrow(/link|alias/);
    expect(await snapshot(f.workspace)).toEqual(before);
  });

  it("rejects an active context hardlink without altering its other name", async () => {
    const f = await fixture(); await createHandoff({ ...f.options, apply: true });
    await link(path.join(f.root, task, "context.lock.json"), path.join(f.workspace, "other-active.json"));
    const before = await snapshot(f.workspace);
    await expect(createResumePacket({ ...f.receiving, apply: true })).rejects.toThrow(/unlinked|hardlink/);
    expect(await snapshot(f.workspace)).toEqual(before);
  });

  it.skipIf(process.platform !== "win32")("rejects a case-folded archive directory alias before outputs", async () => {
    const f = await fixture(); await mkdir(path.join(f.root, task, "evidence/Context-Locks"), { recursive: true });
    const before = await snapshot(f.root);
    await expect(createHandoff({ ...f.options, apply: true })).rejects.toThrow(/alias/);
    expect(await snapshot(f.root)).toEqual(before);
  });

  it("does not hide an archive directory junction from repository integrity", async () => {
    const f = await fixture(); await createHandoff({ ...f.options, apply: true });
    const outside = path.join(f.workspace, "outside"); await mkdir(outside);
    await symlink(outside, path.join(f.root, task, "evidence/handoffs"), process.platform === "win32" ? "junction" : "dir");
    const report = await validateRepository(f.root, { checkIndex: false, checkContextLocks: false });
    expect(report.diagnostics.some(d => d.code === "HANDOFF008" && d.detail?.includes("link"))).toBe(true);
  });
});

describe("retained history and current entry", () => {
  it("audits an unbound middle archived handoff without checking old source freshness", async () => {
    const f = await fixture();
    await createHandoff({ ...f.options, apply: true });
    const middle = await createHandoff({ ...f.options, createdAt: "2026-09-27T12:01:00Z", replace: true, apply: true });
    await writeFile(path.join(f.root, "src/valid-\uFFFD.ts"), "export const feature = false;\n"); await f.compile();
    await createHandoff({ ...f.options, createdAt: "2026-09-27T12:02:00Z", replace: true, apply: true });
    await f.compile(); // The latest handoff was selected by the previous lock.
    const clean = await validateRepository(f.root, { checkIndex: false });
    expect(clean.diagnostics).toEqual([]);
    await unlink(path.join(f.root, middle.handoff.worktree_inventory!.path));
    const report = await validateRepository(f.root, { checkIndex: false });
    expect(report.diagnostics.some(d => d.code === "HANDOFF008" && d.path?.endsWith(`${middle.handoff.handoff_hash.slice(7)}.yaml`))).toBe(true);
  });

  it("does not silently omit retained handoffs through an archive scan exclusion", async () => {
    const f = await fixture(); await createHandoff({ ...f.options, apply: true });
    await createHandoff({ ...f.options, createdAt: "2026-09-27T12:01:00Z", replace: true, apply: true });
    const configPath = path.join(f.root, ".agent-context/config.yaml"), config = parse(await readFile(configPath, "utf8"));
    config.exclude_paths.push(`${task}/evidence/handoffs`); await writeFile(configPath, stringify(config));
    expect((await validateRepository(f.root, { checkIndex: false, checkContextLocks: false })).diagnostics.some(d => d.code === "HANDOFF009")).toBe(true);
  });

  it.each([false, true])("rejects stale selected context before dry-run/apply=%s", async apply => {
    const f = await fixture(); await writeFile(path.join(f.root, "src/valid-\uFFFD.ts"), "changed after compile\n");
    const before = await snapshot(f.root);
    await expect(createHandoff({ ...f.options, apply })).rejects.toThrow(/context source changed|stale/);
    expect(await snapshot(f.root)).toEqual(before);
    await f.compile(); await expect(createHandoff(f.options)).resolves.toBeDefined();
  });

  it("rejects a missing explicit resume source before outputs", async () => {
    const f = await fixture(), input = `${task}/checkpoint-input.yaml`;
    await put(f.root, input, stringify({ resume_sources: ["src/missing.ts"] }));
    const before = await snapshot(f.root);
    await expect(createHandoff({ ...f.options, inputPath: input, apply: true })).rejects.toThrow(/resume source/);
    expect(await snapshot(f.root)).toEqual(before);
  });

  it("prints actionable handoff and audit diagnostic detail outside JSON", async () => {
    const f = await fixture(), made = await createHandoff({ ...f.options, apply: true });
    const resumed = await createResumePacket({ ...f.receiving, apply: true });
    expect(formatResumeCreateReport(resumed)).toContain(made.handoff.worktree_inventory!.path);
    await unlink(path.join(f.root, made.handoff.worktree_inventory!.path));
    for (const args of [["handoff", "validate", f.root, "--task", taskId], ["docs", "audit", f.root], ["resume", "validate", f.root, "--packet", resumed.packet_path]]) {
      const result = await cli(args); expect(result.code).not.toBe(0);
      expect(result.stdout).toContain(made.handoff.worktree_inventory!.path);
    }
  });

  it("quotes new timestamps for YAML 1.1 readers and orders inline names by UTF-16 code units", async () => {
    const f = await fixture(), input = `${task}/input.yaml`;
    const names = ["z.ts", "ä.ts", "\u{10000}.ts", "\uE000.ts", "a.ts"];
    await put(f.root, input, stringify({ files: names.map(name => ({ path: `src/${name}`, state: "inspected", summary: "explicit observation" })) }));
    const made = await createHandoff({ ...f.options, inputPath: input });
    expect(made.handoff.files.map(f => f.path)).toEqual(names.map(n => `src/${n}`).sort());
    expect(serializeHandoff(made.handoff)).toContain(`created_at: "${f.options.createdAt}"`);
    const inventory = { version: 1, task_id: taskId, created_at: f.options.createdAt, entries: names.map(name => ({ code: "??", path: name })).sort((a, b) => a.path < b.path ? -1 : 1) };
    expect(parseWorktreeInventoryBytes(Buffer.from(JSON.stringify(inventory, null, 2) + "\n"))).toEqual(inventory);
  });

  it("refuses successful Git stdout accompanied by a diagnostic on every platform", () => {
    expect(() => parseGitStatusCapture(Buffer.from("?? visible.txt\0"), Buffer.from("warning: permission denied for hidden directory\n"))).toThrow(/completeness/);
    expect(() => parseGitStatusCapture(Buffer.from([0xff, 0]), Buffer.alloc(0))).toThrow(/UTF-8/);
    expect(parseGitStatusCapture(Buffer.from("?? visible.txt\0"), Buffer.alloc(0))).toEqual([{ code: "??", path: "visible.txt" }]);
  });

  it.skipIf(process.platform !== "win32")("rejects warned long-path traversal or proves complete warning-free capture", async () => {
    const f = await fixture(); await git(f.root, ["config", "core.longpaths", "false"]);
    const deep = path.join(f.root, ...Array.from({ length: 6 }, (_, i) => `long-${i}-${"x".repeat(48)}`));
    await mkdir(deep, { recursive: true }); await writeFile(path.join(deep, "hidden.txt"), "must not silently omit\n");
    const status = await git(f.root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
    const before = await snapshot(f.root);
    if (status.stderr.trim()) {
      expect(status.stderr).toMatch(/warning|too long/i);
      await expect(createHandoff({ ...f.options, apply: true })).rejects.toThrow(/Git.*warning|Git.*diagnostic|status.*incomplete/i);
      expect(await snapshot(f.root)).toEqual(before);
      console.info(JSON.stringify({ fixture: "windows-long-path-capture", behavior: "warned-traversal-refused" }));
    } else {
      // Some Git/Windows combinations traverse long paths even with this local
      // setting disabled. No warning is not enough: prove the file was captured.
      const hidden = path.relative(f.root, path.join(deep, "hidden.txt")).split(path.sep).join("/");
      const expected = parseGitStatusCapture(Buffer.from(status.stdout), Buffer.from(status.stderr));
      expect(expected).toContainEqual({ code: "??", path: hidden });
      const made = await createHandoff({ ...f.options, apply: true });
      const inventory = parseWorktreeInventoryBytes(await readFile(path.join(f.root, made.handoff.worktree_inventory!.path)));
      expect(inventory.entries).toEqual(expected);
      const after = await snapshot(f.root);
      for (const [name, hash] of Object.entries(before)) expect(after[name]).toBe(hash);
      console.info(JSON.stringify({ fixture: "windows-long-path-capture", behavior: "complete-warning-free-traversal", entries: inventory.entries.length }));
    }
  });
});
