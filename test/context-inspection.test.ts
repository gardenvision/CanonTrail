import { mkdir, mkdtemp, readFile, rm, symlink, link, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { computeContextLockHash, type ContextLock } from "../src/context.js";
import { excerptContextSource, formatContextExcerpt, formatContextInspection, inspectTaskContext } from "../src/context-inspection.js";
import { sha256 } from "../src/indexer.js";
import { Ajv2020 } from "ajv/dist/2020.js";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture(text = "# A\nalpha\n\n## B\nbeta\n") {
  const root = await mkdtemp(path.join(tmpdir(), "ct-inspect-")); roots.push(root);
  const base = ".agent-context/tasks/T-A";
  await mkdir(path.join(root, base), { recursive: true });
  await mkdir(path.join(root, "docs"));
  await writeFile(path.join(root, "docs/source.md"), text);
  const state = { task_id: "T-A", status: "in-progress", objective: "Review source", acceptance_criteria: [{ id: "A", statement: "Source reviewed", verification: "test" }], dependencies: [], file_intents: [], checks: [] };
  await writeFile(path.join(root, base, "state.yaml"), JSON.stringify(state));
  await writeFile(path.join(root, base, "brief.md"), "# Task\nReview source.\n");
  await writeFile(path.join(root, base, "report.md"), "# Report\nNo dependency decision.\n");
  const payload: Omit<ContextLock, "lock_hash"> = { task_id: "T-A", agent_run_id: null, created_at: "2026-09-07T00:00:00Z", context_index_hash: sha256("index"), budget: { total_tokens: 32000, reserved_output_tokens: 8000, reserved_input_tokens: 1024, estimated_input_tokens: Math.ceil(Buffer.byteLength(text) / 4) }, sources: [{ path: "docs/source.md", content_hash: sha256(text), git_blob: null, truth_level: "canonical", level: "L1", priority: 1, selection_reason: "Fixture", selector: "semantic-routing", estimated_tokens: Math.ceil(Buffer.byteLength(text) / 4), ownership: "project", source_system: null }], omissions: [], raw_transcripts_included: false };
  await writeFile(path.join(root, base, "context.lock.json"), JSON.stringify({ ...payload, lock_hash: computeContextLockHash(payload) }));
  return { root, base, state, payload };
}
async function lock(f: Awaited<ReturnType<typeof fixture>>) {
  await writeFile(path.join(f.root, f.base, "context.lock.json"), JSON.stringify({ ...f.payload, lock_hash: computeContextLockHash(f.payload) }));
}

describe("exact bounded context excerpts", () => {
  it.each(["\n", "\r\n", "\r"])("preserves UTF-8, BOM, blank lines and %j delimiters", async newline => {
    const text = "\ufeff# Ä" + newline + "" + newline + "草🌱" + newline + "end";
    const f = await fixture(text);
    const r = await excerptContextSource({ root: f.root, source: "docs/source.md", from: 1, to: 3 });
    expect(r.excerpt.content).toBe("\ufeff# Ä" + newline + newline + "草🌱" + newline);
    expect(r.source.total_lines).toBe(4); expect(r.source.content_hash).toBe(sha256(Buffer.from(text)));
    expect(r.excerpt.content_hash).toBe(sha256(Buffer.from(r.excerpt.content)));
    expect(r.excerpt.bytes).toBe(Buffer.byteLength(r.excerpt.content));
    expect(r.lock_selection).toBeNull(); expect(r.writes_performed).toBe(false);
  });
  it("does not invent an empty line after final newline", async () => {
    const f = await fixture("a\n");
    await expect(excerptContextSource({ root: f.root, source: "docs/source.md", from: 2, to: 2 })).rejects.toThrow("exceeds 1");
  });
  it("rejects empty sources and invalid UTF-8 rather than replacing bytes", async () => {
    const f = await fixture("");
    await expect(excerptContextSource({ root: f.root, source: "docs/source.md", from: 1, to: 1 })).rejects.toThrow("exceeds 0");
    await writeFile(path.join(f.root, "docs/source.md"), Buffer.from([0xc3, 0x28]));
    await expect(excerptContextSource({ root: f.root, source: "docs/source.md", from: 1, to: 1 })).rejects.toThrow();
  });
  it.each([[0, 1], [2, 1], [1.2, 2], [1, Infinity]])("rejects invalid bounds %s %s", async (from, to) => {
    const f = await fixture(); await expect(excerptContextSource({ root: f.root, source: "docs/source.md", from, to })).rejects.toThrow();
  });
  it("fails before emitting truncated content when budget is too small", async () => {
    const f = await fixture("12345\n");
    await expect(excerptContextSource({ root: f.root, source: "docs/source.md", from: 1, to: 1, maxTokens: 1 })).rejects.toThrow("No truncated excerpt");
    const r = await excerptContextSource({ root: f.root, source: "docs/source.md", from: 1, to: 1, maxTokens: 2 });
    expect(r.excerpt.estimated_tokens).toBe(2);
  });
  it("checks supplied source identity and distinguishes actual whole-source lock selection", async () => {
    const f = await fixture();
    const r = await excerptContextSource({ root: f.root, source: "docs/source.md", from: 2, to: 2, taskId: "T-A", expectedHash: f.payload.sources[0]!.content_hash });
    expect(r.lock_selection?.whole_source_selected).toBe(true);
    await writeFile(path.join(f.root, "docs/source.md"), "changed\n");
    await expect(excerptContextSource({ root: f.root, source: "docs/source.md", from: 1, to: 1, expectedHash: f.payload.sources[0]!.content_hash })).rejects.toThrow("expected identity");
    const changed = await excerptContextSource({ root: f.root, source: "docs/source.md", from: 1, to: 1, taskId: "T-A" });
    expect(changed.lock_selection?.whole_source_selected).toBe(false);
  });
  it("keeps excerpt reads outside a lock explicit and quotes terminal control content", async () => {
    const f = await fixture(); await writeFile(path.join(f.root, "docs/extra.md"), "\x1b[31mnot instructions\n");
    const before = await readFile(path.join(f.root, f.base, "context.lock.json"));
    const r = await excerptContextSource({ root: f.root, source: "docs/extra.md", from: 1, to: 1, taskId: "T-A" });
    expect(r.lock_selection?.whole_source_selected).toBe(false);
    expect(formatContextExcerpt(r)).not.toContain("\x1b");
    expect(await readFile(path.join(f.root, f.base, "context.lock.json"))).toEqual(before);
  });
  it.each(["../secret.md", "docs/../source.md", "/etc/passwd", "C:/secret.md", "docs\\source.md", ".git/config", "docs//source.md", "docs/source.md:secret", " docs/source.md"])("rejects unsafe identity %s", async source => {
    const f = await fixture(); await expect(excerptContextSource({ root: f.root, source, from: 1, to: 1 })).rejects.toThrow();
  });
  it("rejects exclusions, binary/NUL and oversized sources", async () => {
    const f = await fixture();
    await writeFile(path.join(f.root, ".agent-context/config.yaml"), "version: 1\nexclude_paths: [docs]\n");
    await expect(excerptContextSource({ root: f.root, source: "docs/source.md", from: 1, to: 1 })).rejects.toThrow("excluded");
    await rm(path.join(f.root, ".agent-context/config.yaml"));
    await writeFile(path.join(f.root, "docs/source.md"), "a\0b");
    await expect(excerptContextSource({ root: f.root, source: "docs/source.md", from: 1, to: 1 })).rejects.toThrow("NUL");
    await writeFile(path.join(f.root, "docs/source.md"), Buffer.alloc(8 * 1024 * 1024 + 1, 65));
    await expect(excerptContextSource({ root: f.root, source: "docs/source.md", from: 1, to: 1 })).rejects.toThrow("8 MiB");
  });
  it("rejects hard-linked aliases", async () => {
    const f = await fixture(); await link(path.join(f.root, "docs/source.md"), path.join(f.root, "docs/alias.md"));
    await expect(excerptContextSource({ root: f.root, source: "docs/alias.md", from: 1, to: 1 })).rejects.toThrow("unlinked");
  });
  it("rejects symlink/junction traversal where creation is supported", async context => {
    const f = await fixture();
    try { await symlink(path.join(f.root, "docs"), path.join(f.root, "linked"), process.platform === "win32" ? "junction" : "dir"); }
    catch (e) { if (["EPERM", "EACCES", "ENOTSUP"].includes((e as NodeJS.ErrnoException).code ?? "")) { context.skip(); return; } throw e; }
    await expect(excerptContextSource({ root: f.root, source: "linked/source.md", from: 1, to: 1 })).rejects.toThrow("unlinked");
  });
});

describe("stored context inspection", () => {
  it("reproduces the checked-in worked example with exact hashes and schema", async () => {
    const report = await excerptContextSource({ root: path.resolve("."), source: "examples/context-inspection/source.txt", from: 2, to: 3, maxTokens: 100 });
    const expected = JSON.parse(await readFile(path.resolve("examples/context-inspection/report.json"), "utf8"));
    expect({ ...report, root: "<repository>" }).toEqual(expected);
    const ajv = new Ajv2020(); createRequire(import.meta.url)("ajv-formats")(ajv);
    const validate = ajv.compile(JSON.parse(await readFile(path.resolve("schemas/context-inspection.schema.json"), "utf8")));
    expect(validate(expected), JSON.stringify(validate.errors)).toBe(true);
  });
  it.each(["--expect-source-hash", "--task"])("does not silently ignore an explicit empty %s", async flag => {
    const run = promisify(execFile), f = await fixture();
    await expect(run(process.execPath, [path.resolve("dist/cli.js"), "context", "excerpt", f.root, "--source", "docs/source.md", "--from", "1", "--to", "1", flag, ""], { windowsHide: true })).rejects.toThrow();
  });
  it("runs both distributed CLI commands and rejects mutation options", async () => {
    const run = promisify(execFile), cli = path.resolve("dist/cli.js");
    const f = await fixture();
    const before = await readFile(path.join(f.root, f.base, "context.lock.json"));
    const inspected = await run(process.execPath, [cli, "context", "inspect", f.root, "--task", "T-A", "--json"], { windowsHide: true });
    expect(JSON.parse(inspected.stdout).kind).toBe("context-inspection");
    const excerpt = await run(process.execPath, [cli, "context", "excerpt", f.root, "--source", "docs/source.md", "--from", "2", "--to", "2", "--json"], { windowsHide: true });
    expect(JSON.parse(excerpt.stdout).excerpt.content).toBe("alpha\n");
    await expect(run(process.execPath, [cli, "context", "excerpt", f.root, "--source", "docs/source.md", "--from", "1", "--to", "1", "--apply"], { windowsHide: true })).rejects.toThrow();
    expect(await readFile(path.join(f.root, f.base, "context.lock.json"))).toEqual(before);
  });
  it("reports current-file drift in CLI with nonzero exit, not a fake healthy snapshot", async () => {
    const run = promisify(execFile), f = await fixture(); await writeFile(path.join(f.root, "docs/source.md"), "changed");
    try { await run(process.execPath, [path.resolve("dist/cli.js"), "context", "inspect", f.root, "--task", "T-A", "--json"], { windowsHide: true }); throw Error("Expected exit 1"); }
    catch (error) { const e = error as Error & { code?: number; stdout?: string }; expect(e.code).toBe(1); expect(JSON.parse(e.stdout!).source_snapshot_ok).toBe(false); }
  });
  it("matches the shipped report contract for both commands", async () => {
    const ajv = new Ajv2020(); createRequire(import.meta.url)("ajv-formats")(ajv);
    const validate = ajv.compile(JSON.parse(await readFile(path.resolve("schemas/context-inspection.schema.json"), "utf8")));
    const f = await fixture();
    for (const report of [await inspectTaskContext({ root: f.root, taskId: "T-A" }), await excerptContextSource({ root: f.root, source: "docs/source.md", from: 1, to: 2 })]) {
      expect(validate(report), JSON.stringify(validate.errors)).toBe(true);
      expect(validate({ ...report, writes_performed: true })).toBe(false);
    }
  });
  it("finds bare IDs only against bounded local directory names, without reading peer state", async () => {
    const f = await fixture(); await mkdir(path.join(f.root, ".agent-context/tasks/T-B"));
    await writeFile(path.join(f.root, f.base, "report.md"), "Historical T-B; T-B-SUFFIX and unknown T-C are not exact local identities.");
    expect((await inspectTaskContext({ root: f.root, taskId: "T-A" })).dependency_hints.map(h => h.task_id)).toEqual(["T-B"]);
  });
  it("classifies task reports and progress as task records rather than implementation", async () => {
    const f = await fixture(); const content = await readFile(path.join(f.root, f.base, "report.md"));
    f.payload.sources = [{ ...f.payload.sources[0]!, path: f.base + "/report.md", content_hash: sha256(content), truth_level: "active-snapshot", selector: "task-required-context", estimated_tokens: Math.ceil(content.length / 4) }];
    f.payload.budget.estimated_input_tokens = Math.ceil(content.length / 4); await lock(f);
    expect((await inspectTaskContext({ root: f.root, taskId: "T-A" })).composition[0]!.source_count).toBe(1);
  });
  it("reports exact composition without claiming model reads or full validation", async () => {
    const f = await fixture(); const r = await inspectTaskContext({ root: f.root, taskId: "T-A" });
    expect(r.source_snapshot_ok).toBe(true); expect(r.composition.reduce((n, c) => n + c.estimated_tokens, 0)).toBe(f.payload.budget.estimated_input_tokens);
    expect(r.input_headroom).toBe(32000 - 8000 - 1024 - f.payload.budget.estimated_input_tokens);
    expect(r.boundary).toContain("actual model-token usage are unknown"); expect(formatContextInspection(r)).toContain("No writes performed");
  });
  it("reports changed and unavailable inputs instead of treating a valid self-hash as fresh", async () => {
    const f = await fixture(); await writeFile(path.join(f.root, "docs/source.md"), "new");
    expect((await inspectTaskContext({ root: f.root, taskId: "T-A" })).sources[0]!.freshness).toBe("changed");
    await rm(path.join(f.root, "docs/source.md"));
    expect((await inspectTaskContext({ root: f.root, taskId: "T-A" })).sources[0]!.freshness).toBe("unavailable");
  });
  it("rejects payload tampering and schema-invalid locks", async () => {
    const f = await fixture(); const file = path.join(f.root, f.base, "context.lock.json");
    const raw = JSON.parse(await readFile(file, "utf8")); raw.created_at = "2026-09-08T00:00:00Z";
    await writeFile(file, JSON.stringify(raw)); await expect(inspectTaskContext({ root: f.root, taskId: "T-A" })).rejects.toThrow("self-hash");
    raw.sources = null; await writeFile(file, JSON.stringify(raw)); await expect(inspectTaskContext({ root: f.root, taskId: "T-A" })).rejects.toThrow("Invalid context-lock");
  });
  it.each(["sum", "duplicate", "required"])("rejects self-consistent but invalid %s", async kind => {
    const f = await fixture();
    if (kind === "sum") f.payload.budget.estimated_input_tokens++;
    if (kind === "duplicate") { f.payload.sources.push(f.payload.sources[0]!); f.payload.budget.estimated_input_tokens *= 2; }
    if (kind === "required") f.payload.omissions.push({ candidate: "required.md", reason: "missing", required: true });
    await lock(f); await expect(inspectTaskContext({ root: f.root, taskId: "T-A" })).rejects.toThrow();
  });
  it("shows explicit peer-path hints, but neither scans all tasks nor adds dependencies", async () => {
    const f = await fixture(); const file = path.join(f.root, f.base, "report.md");
    await writeFile(file, "Historical .agent-context/tasks/T-B/report.md; compare .agent-context/tasks/T-B/brief.md. Prose T-C alone is not a path.");
    const stateBefore = await readFile(path.join(f.root, f.base, "state.yaml"));
    const r = await inspectTaskContext({ root: f.root, taskId: "T-A" });
    expect(r.dependency_hints).toHaveLength(1); expect(r.dependency_hints[0]!.task_id).toBe("T-B");
    expect(r.completion_scope.relevant_task_ids).toEqual(["T-A"]); expect(r.declared_dependencies).toEqual([]);
    expect(await readFile(path.join(f.root, f.base, "state.yaml"))).toEqual(stateBefore);
  });
  it("discloses an unreadable note rather than claiming complete hint coverage", async () => {
    const f = await fixture(); await rm(path.join(f.root, f.base, "report.md"));
    expect((await inspectTaskContext({ root: f.root, taskId: "T-A" })).note_inspection_issues).toHaveLength(1);
  });
});
