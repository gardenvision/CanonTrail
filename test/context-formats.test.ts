import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { applyContextPreview, compileContext, computeContextLockHash, isSupportedText } from "../src/context.js";
import { excerptContextSource } from "../src/context-inspection.js";
import { createHandoff } from "../src/handoff.js";
import { createResumePacket } from "../src/resume.js";
import { initializeProject } from "../src/initializer.js";
import { createTask } from "../src/task-create.js";
import { generateContextIndex, sha256 } from "../src/indexer.js";

const roots: string[] = [];
const extensions = [".mjs", ".cjs", ".shader", ".hlsl", ".compute", ".cginc", ".glsl"];
const sourceText = "\ufeff// Ä shader/module fixture\r\nconst_value = 1;\r\n// unchanged tail\r\n";
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture(extension = ".hlsl", section = false) {
  const root = await mkdtemp(path.join(tmpdir(), "ct-code-context-")); roots.push(root);
  await initializeProject(root, { documentation: "none", profile: "generic" });
  await createTask({ root, taskId: "T-CODE", changeId: "CHG-CODE", objective: "Review the explicit code source",
    acceptance: ["Keep exact source identity"], author: "Fixture author", risk: "medium", createdAt: "2026-10-01T12:00:00Z", apply: true });
  const base = ".agent-context/tasks/T-CODE", source = "src/neutral" + extension;
  await mkdir(path.join(root, "src")); await writeFile(path.join(root, source), sourceText);
  const statePath = path.join(root, base, "state.yaml");
  const state = parse(await readFile(statePath, "utf8"));
  state.file_intents = [source];
  if (section) state.context_sections = [{ path: source, from: 2, to: 2, content_hash: sha256(sourceText) }];
  else state.required_context_sources = [source];
  await writeFile(statePath, stringify(state));
  await generateContextIndex(root);
  const options = { root, taskId: "T-CODE", totalTokens: 48000, reservedOutputTokens: 8000, inputSafetyTokens: 2048,
    createdAt: "2026-10-01T12:01:00Z" };
  return { root, source, base, state, statePath, options, lockPath: path.join(root, base, "context.lock.json") };
}

describe("explicit shader and module text context", () => {
  it.each(extensions)("selects whole %s bytes without granting documentary authority", async extension => {
    const f = await fixture(extension);
    expect(isSupportedText(f.source)).toBe(true);
    const r = await compileContext({ ...f.options, apply: true });
    const selected = r.lock.sources.find(s => s.path === f.source)!;
    expect(selected.content_hash).toBe(sha256(Buffer.from(sourceText)));
    expect(selected.estimated_tokens).toBe(Math.ceil(Buffer.byteLength(sourceText) / 4));
    expect(selected.truth_level).toBe("unclassified"); expect(selected.selector).toContain("task-required-context");
    expect(r.lock.sources.filter(s => s.path === f.source)).toHaveLength(1);
    const excerpt = await excerptContextSource({ root: f.root, source: f.source, from: 1, to: 2, taskId: "T-CODE" });
    expect(excerpt.excerpt.content).toBe("\ufeff// Ä shader/module fixture\r\nconst_value = 1;\r\n");
    expect(excerpt.lock_selection?.whole_source_selected).toBe(true);
  });

  it.each(extensions)("selects and resumes exact %s ranges with no source rewrites", async extension => {
    const f = await fixture(extension, true);
    await promisify(execFile)("git", ["init"], { cwd: f.root, windowsHide: true });
    const report = await compileContext({ ...f.options, apply: true });
    const selected = report.lock.sources.find(s => s.path === f.source)!;
    expect(selected.line_ranges).toEqual([[2, 2]]); expect(selected.selection_hash).toBe(sha256("const_value = 1;\r\n"));
    expect(selected.estimated_tokens).toBe(Math.ceil(Buffer.byteLength("const_value = 1;\r\n") / 4));
    await createHandoff({ root: f.root, taskId: "T-CODE", sourceSessionId: "fixture-source", createdAt: "2026-10-01T12:02:00Z",
      nextSafeAction: "Review the selected neutral source line before deciding the bounded follow-up.", apply: true });
    const resume = await createResumePacket({ root: f.root, taskId: "T-CODE", receivingSessionId: "fixture-receiver",
      createdAt: "2026-10-01T12:03:00Z", totalTokens: 48000, reservedOutputTokens: 8000, apply: true });
    expect(resume.context_lock.sources.find(s => s.path === f.source)?.selection_hash).toBe(selected.selection_hash);
    expect(resume.packet.read_order).toContain(f.source);
    expect(await readFile(path.join(f.root, f.source), "utf8")).toBe(sourceText);
  });

  it.each(["invalid-utf8", "nul", "oversized"])("rejects required %s bytes before replacing a working lock", async kind => {
    const f = await fixture(); await compileContext({ ...f.options, apply: true });
    const before = await readFile(f.lockPath);
    const bytes = kind === "invalid-utf8" ? Buffer.from([0xc3, 0x28]) : kind === "nul" ? Buffer.from("code\0data") : Buffer.alloc(8 * 1024 * 1024 + 1, 65);
    await writeFile(path.join(f.root, f.source), bytes);
    await expect(compileContext({ ...f.options, apply: true })).rejects.toThrow(kind === "invalid-utf8" ? "UTF-8" : kind === "nul" ? "NUL" : "8 MiB");
    await expect(excerptContextSource({ root: f.root, source: f.source, from: 1, to: 1 })).rejects.toThrow();
    expect(await readFile(f.lockPath)).toEqual(before);
  });

  it("makes invalid optional code sources a visible omission, not a silent read", async () => {
    const f = await fixture(".compute"); f.state.required_context_sources = [];
    await writeFile(f.statePath, stringify(f.state)); await writeFile(path.join(f.root, f.source), Buffer.from([0xff]));
    const r = await compileContext(f.options);
    expect(r.lock.sources.some(s => s.path === f.source)).toBe(false);
    expect(r.omitted_file_intents).toContain(f.source);
    expect(r.lock.omissions.find(o => o.candidate === f.source)).toMatchObject({ required: false });
    expect(r.lock.omissions.find(o => o.candidate === f.source)?.reason).toContain("UTF-8");
  });

  it.each([".asset", ".prefab", ".unity", ".blend", ".png"])("does not admit binary-capable %s assets by extension", async extension => {
    const f = await fixture(extension);
    expect(isSupportedText(f.source)).toBe(false);
    await expect(compileContext({ ...f.options, apply: true })).rejects.toThrow("not a supported text source");
    await expect(readFile(f.lockPath)).rejects.toThrow();
  });

  it("retains budget, missing-input and exclusion failures without lock replacement", async () => {
    const f = await fixture(); await compileContext({ ...f.options, apply: true });
    const before = await readFile(f.lockPath);
    await writeFile(path.join(f.root, f.source), "// large\n".repeat(30000));
    await expect(compileContext({ ...f.options, totalTokens: 12000, apply: true })).rejects.toThrow("required context needs");
    expect(await readFile(f.lockPath)).toEqual(before);
    await rm(path.join(f.root, f.source));
    await expect(compileContext({ ...f.options, apply: true })).rejects.toThrow(/does not exist/);
    const configPath = path.join(f.root, ".agent-context/config.yaml"), config = parse(await readFile(configPath, "utf8"));
    config.exclude_paths.push("src"); await writeFile(configPath, stringify(config));
    await expect(compileContext({ ...f.options, apply: true })).rejects.toThrow(/excluded/);
    expect(await readFile(f.lockPath)).toEqual(before);
  });

  it("does not allow a rehashed binary preview to bypass new-format validation", async () => {
    const f = await fixture(".mjs"); await compileContext({ ...f.options, apply: true });
    const before = await readFile(f.lockPath), preview = await compileContext(f.options);
    const bytes = Buffer.from([0xff, 0x00]); await writeFile(path.join(f.root, f.source), bytes);
    const source = preview.lock.sources.find(s => s.path === f.source)!;
    const oldTokens = source.estimated_tokens; source.content_hash = sha256(bytes); source.estimated_tokens = 1;
    preview.lock.budget.estimated_input_tokens += 1 - oldTokens;
    const { lock_hash: _old, ...payload } = preview.lock; preview.lock.lock_hash = computeContextLockHash(payload);
    await writeFile(path.join(f.root, "preview.json"), JSON.stringify(preview));
    await expect(applyContextPreview({ root: f.root, previewPath: "preview.json" })).rejects.toThrow("UTF-8");
    expect(await readFile(f.lockPath)).toEqual(before);
  });
});
