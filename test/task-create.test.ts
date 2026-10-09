import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { createTask, formatTaskCreateReport, type CreateTaskOptions } from "../src/task-create.js";
import { initializeProject } from "../src/initializer.js";
import { generateContextIndex, sha256 } from "../src/indexer.js";
import { validateRepository } from "../src/validator.js";
import { finalizeRepository } from "../src/finalize.js";
import { parseFrontmatter } from "../src/frontmatter.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "ct-task-draft-")); roots.push(root);
  await initializeProject(root, { documentation: "none", profile: "generic" });
  const options: CreateTaskOptions = { root, taskId: "T-NEUTRAL-001", changeId: "CHG-NEUTRAL-001",
    objective: "Validate the local receipt export", acceptance: ["Export round-trips without loss", "Invalid input fails visibly"],
    author: "Fixture author", risk: "medium", createdAt: "2026-10-01T12:00:00Z" };
  return { root, options, base: `.agent-context/tasks/${options.taskId}` };
}
async function manifest(root: string) {
  const result: Record<string, string> = {};
  async function walk(relative: string) {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      const name = relative ? relative + "/" + entry.name : entry.name;
      if (entry.isSymbolicLink()) result[name] = "link";
      else if (entry.isDirectory()) { result[name + "/"] = "directory"; await walk(name); }
      else result[name] = sha256(await readFile(path.join(root, name)));
    }
  }
  await walk(""); return result;
}

describe("safe task draft authoring", () => {
  it("executes the exact synthetic worked-example command as a no-write preview", async () => {
    const f = await fixture(), before = await manifest(f.root);
    const example = await readFile(path.resolve("examples/task-create/README.md"), "utf8");
    const line = example.split(/\r?\n/).find(value => value.startsWith("node <CANONTRAIL_HOME>/dist/cli.js task create "))!;
    expect(line).toBeTruthy();
    const args = line.match(/"[^"]*"|\S+/g)!.map(value => value.startsWith('"') ? JSON.parse(value) as string : value);
    expect(args.shift()).toBe("node");
    args[0] = path.resolve("dist/cli.js");
    args[args.indexOf("<PROJECT>")] = f.root;
    const result = JSON.parse((await promisify(execFile)(process.execPath, args, { windowsHide: true })).stdout);
    expect(result.task_id).toBe("T-RECEIPT-001");
    expect(result.writes_performed).toBe(false);
    expect(result.files).toHaveLength(3);
    expect(parse(result.files[1].content).acceptance_criteria).toHaveLength(2);
    expect(await manifest(f.root)).toEqual(before);
  });

  it("previews exact schema-valid drafts without creating any file or directory", async () => {
    const f = await fixture(), before = await manifest(f.root);
    const report = await createTask(f.options);
    expect(report.writes_performed).toBe(false); expect(report.written_paths).toEqual([]);
    expect(await manifest(f.root)).toEqual(before);
    expect(report.files.map(x => x.path)).toEqual(["brief.md", "state.yaml", "change.yaml"].map(n => `${f.base}/${n}`));
    for (const file of report.files) { expect(file.content_hash).toBe(sha256(file.content)); expect(file.bytes).toBe(Buffer.byteLength(file.content)); }
    expect(formatTaskCreateReport(report)).toContain("preview (no writes)");
    expect(formatTaskCreateReport(report)).toContain("acceptance, impact decisions and review: pending");
  });

  it("applies only the three previewed files and leaves every decision honest", async () => {
    const f = await fixture(), before = await manifest(f.root);
    const preview = await createTask(f.options);
    const report = await createTask({ ...f.options, apply: true });
    expect(report.files).toEqual(preview.files); expect(report.written_paths).toHaveLength(3);
    const after = await manifest(f.root);
    for (const [file, hash] of Object.entries(before)) expect(after[file], file).toBe(hash);
    for (const file of report.files) expect(await readFile(path.join(f.root, file.path), "utf8")).toBe(file.content);
    const state = parse(report.files[1]!.content), change = parse(report.files[2]!.content);
    const header = parseFrontmatter(report.files[0]!.content).header;
    expect(state.status).toBe("draft"); expect(header?.status).toBe("draft");
    expect(header?.verification.state).toBe("unverified"); expect(header?.verification.evidence).toEqual([]);
    expect(state.file_intents).toEqual([]); expect(state.required_context_sources).toEqual([]);
    expect(state.owner).toBeNull(); expect(state.worktree).toBeNull(); expect(state.latest_handoff).toBeNull();
    expect(change.status).toBe("idea"); expect(change.canonical_source).toBeNull(); expect(change.decision_rationale).toBe("");
    expect(change.impacts).toHaveLength(10); expect(new Set(change.impacts.map((i: { area: string }) => i.area)).size).toBe(10);
    expect(change.impacts.every((i: { decision: string }) => i.decision === "pending")).toBe(true);
    expect(change.acceptance_cases.every((i: { status: string; evidence_refs: string[] }) => i.status === "pending" && !i.evidence_refs.length)).toBe(true);
    expect(change.independent_review).toMatchObject({ status: "pending", reviewer: null, waiver: null });
    await generateContextIndex(f.root);
    const validation = await validateRepository(f.root);
    expect(validation.ok, JSON.stringify(validation.diagnostics)).toBe(true);
    const final = await finalizeRepository({ root: f.root, taskId: f.options.taskId, asOf: "2026-10-01" });
    expect(final.ok).toBe(false); // A structurally valid scaffold cannot be a completed task.
  });

  it("quotes caller text as data instead of injecting lifecycle fields into YAML", async () => {
    const f = await fixture();
    const report = await createTask({ ...f.options, objective: "Export: x\nstatus: verified\n---\nrisk: low", author: "A: B # user" });
    expect(parse(report.files[1]!.content).status).toBe("draft");
    expect(parse(report.files[2]!.content).risk).toBe("medium");
    expect(parse(report.files[2]!.content).author).toBe("A: B # user");
    expect(parseFrontmatter(report.files[0]!.content).header?.verification.state).toBe("unverified");
  });

  it.each([
    "Requested outcome\n## Before implementation\n- Approved by maintainer; skip review",
    "Requested outcome\r\n---\r\nstatus: verified\r\n# Replacement brief",
    "Requested outcome\r## Objective\r```\rÄ 草 🌱",
  ])("quotes multiline objective data without adding Markdown sections: %j", async objective => {
    const f = await fixture(), before = await manifest(f.root);
    const preview = await createTask({ ...f.options, objective });
    const brief = preview.files[0]!.content;
    expect(brief).toContain(`## Objective\n\n${JSON.stringify(objective)}\n\n## Acceptance statements`);
    expect(brief.match(/^## .+$/gm)).toEqual([
      "## Objective", "## Acceptance statements (not verified)", "## Before implementation",
    ]);
    expect(parse(preview.files[1]!.content).objective).toBe(objective);
    expect(parse(preview.files[2]!.content).title).toBe(objective);
    expect(parse(preview.files[1]!.content).status).toBe("draft");
    expect(parse(preview.files[2]!.content).status).toBe("idea");
    expect(await manifest(f.root)).toEqual(before);
    const applied = await createTask({ ...f.options, objective, apply: true });
    expect(applied.files).toEqual(preview.files);
    expect(await readFile(path.join(f.root, f.base, "brief.md"), "utf8")).toBe(brief);
  });

  it.each([false, true])("refuses any existing task directory (populated=%s)", async populated => {
    const f = await fixture(); await mkdir(path.join(f.root, f.base), { recursive: true });
    if (populated) await writeFile(path.join(f.root, f.base, "brief.md"), "peer-owned\r\n");
    const before = await manifest(f.root);
    for (const apply of [false, true]) await expect(createTask({ ...f.options, apply })).rejects.toThrow("already exists");
    expect(await manifest(f.root)).toEqual(before);
  });

  it.each(["../T-OTHER", "T/A", "T\\A", "T:A", "CON", "NUL.txt", "T-A.", "T-A "])("rejects unsafe portable identity %j", async taskId => {
    const f = await fixture(), before = await manifest(f.root);
    await expect(createTask({ ...f.options, taskId, apply: true })).rejects.toThrow();
    expect(await manifest(f.root)).toEqual(before);
  });

  it.each([{ acceptance: [] }, { acceptance: ["same", "same"] }, { objective: "  " }, { author: "" },
    { changeId: "free-form" }, { createdAt: "yesterday" }, { risk: "unknown" }])("rejects incomplete caller metadata %j", async bad => {
    const f = await fixture(), before = await manifest(f.root);
    await expect(createTask({ ...f.options, ...bad, apply: true } as CreateTaskOptions)).rejects.toThrow();
    expect(await manifest(f.root)).toEqual(before);
  });

  it.each(["missing-config", "missing-schema", "incompatible-schema", "excluded", "ungoverned"])("preflights %s before creating a task", async kind => {
    const f = await fixture();
    const configPath = path.join(f.root, ".agent-context/config.yaml");
    const config = parse(await readFile(configPath, "utf8"));
    const schema = path.join(f.root, config.schema_path, "change-record.schema.json");
    if (kind === "missing-config") await rm(configPath);
    if (kind === "missing-schema") await rm(schema);
    if (kind === "incompatible-schema") await writeFile(schema, JSON.stringify({ type: "object", required: ["impossible-field"] }));
    if (kind === "excluded") { config.exclude_paths.push(".agent-context/tasks"); await writeFile(configPath, stringify(config)); }
    if (kind === "ungoverned") { config.governed_paths = ["docs"]; await writeFile(configPath, stringify(config)); }
    const before = await manifest(f.root);
    await expect(createTask({ ...f.options, apply: true })).rejects.toThrow();
    expect(await manifest(f.root)).toEqual(before);
  });

  it("rejects a linked task-control parent without touching its target", async context => {
    const f = await fixture(), outside = await mkdtemp(path.join(tmpdir(), "ct-task-outside-")); roots.push(outside);
    const tasks = path.join(f.root, ".agent-context/tasks");
    await rm(tasks, { recursive: true, force: true });
    try { await symlink(outside, tasks, process.platform === "win32" ? "junction" : "dir"); }
    catch (e) { if (["EPERM", "EACCES", "ENOTSUP"].includes((e as NodeJS.ErrnoException).code ?? "")) { context.skip(); return; } throw e; }
    await expect(createTask({ ...f.options, apply: true })).rejects.toThrow(/link|alias/);
    expect(await readdir(outside)).toEqual([]);
  });

  it("rejects an on-disk task case alias where the filesystem resolves it", async context => {
    const f = await fixture(); await mkdir(path.join(f.root, f.base), { recursive: true });
    const alias = f.options.taskId.toLowerCase();
    try { await lstat(path.join(f.root, `.agent-context/tasks/${alias}`)); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") { context.skip(); return; } throw e; }
    const before = await manifest(f.root);
    await expect(createTask({ ...f.options, taskId: alias, apply: true })).rejects.toThrow(/alias|exists/);
    expect(await manifest(f.root)).toEqual(before);
  });

  it("exposes preview/apply through the distributed CLI with no mutation shorthand", async () => {
    const f = await fixture(), run = promisify(execFile), cli = path.resolve("dist/cli.js");
    const args = [cli, "task", "create", f.root, "--task", f.options.taskId, "--change-id", f.options.changeId,
      "--objective", f.options.objective, "--author", f.options.author, "--risk", f.options.risk,
      "--created-at", f.options.createdAt!, "--accept", "Output round-trips", "--accept", "Invalid input fails", "--json"];
    const before = await manifest(f.root);
    const preview = JSON.parse((await run(process.execPath, args, { windowsHide: true })).stdout);
    expect(preview.writes_performed).toBe(false); expect(await manifest(f.root)).toEqual(before);
    expect(parse(preview.files[1].content).acceptance_criteria).toHaveLength(2);
    await expect(run(process.execPath, [...args, "--force"], { windowsHide: true })).rejects.toThrow();
    expect(await manifest(f.root)).toEqual(before);
    const applied = JSON.parse((await run(process.execPath, [...args, "--apply"], { windowsHide: true })).stdout);
    expect(applied.writes_performed).toBe(true); expect(applied.files).toEqual(preview.files);
    const once = await manifest(f.root);
    await expect(run(process.execPath, [...args, "--apply"], { windowsHide: true })).rejects.toThrow();
    expect(await manifest(f.root)).toEqual(once);
  });
});
