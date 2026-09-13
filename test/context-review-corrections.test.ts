import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { compileContext, applyContextPreview, computeContextLockHash, serializeContextLock, formatContextCompileReport, type ContextLock } from "../src/context.js";
import { selectContextSection } from "../src/context-sections.js";
import { generateContextIndex, sha256 } from "../src/indexer.js";
import { validateRepository, validateResumePacketAt } from "../src/validator.js";
import { inspectTaskContext, formatContextInspection } from "../src/context-inspection.js";
import { createHandoff } from "../src/handoff.js";
import { createResumePacket, computeResumePacketHash, serializeResumePacket } from "../src/resume.js";

const roots: string[] = [], taskId = "T-REVIEW-CORRECTIONS", createdAt = "2026-09-08T20:00:00Z";
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 5 }); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "ct-review-corrections-")); roots.push(root);
  await cp(path.resolve("schemas"), path.join(root, "schemas"), { recursive: true });
  const base = `.agent-context/tasks/${taskId}`, dir = path.join(root, base);
  await mkdir(dir, { recursive: true }); await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, ".agent-context/config.yaml"), stringify({ version: 1, index_path: ".agent-context/context-index.json", schema_path: "schemas", governed_paths: ["."], exclude_paths: [".git"], require_frontmatter_for_all_markdown: true, require_topic_id_for_canonical: true, allow_missing_references: [] }));
  const header = { topic_id: "rules", stand: "2026-09-08", status: "current", truth_level: "canonical", verification: { state: "reviewed", evidence: [] }, read_if_task_touches: [], primary_systems: [], safe_to_edit: ["Fixture only"], do_not_use_instead: [] };
  await writeFile(path.join(root, "AGENTS.md"), `---\n${stringify(header)}---\n\n# Rules\n`);
  const bytes = Buffer.from("// introduction\r\nexport const minimum = 1;\r\nexport const maximum = 7;\n// outside selection\n");
  await writeFile(path.join(root, "src/Bounds.ts"), bytes);
  await writeFile(path.join(root, "src/Required.ts"), "// Whole contract\nexport const required = true;\n// Never omit this condition\n");
  const state = { task_id: taskId, status: "in-progress", objective: "Check bounded parser", acceptance_criteria: [{ id: "AC", statement: "Exact range and complete required contract", verification: "fixture", status: "pending" }], dependencies: [] as string[], file_intents: ["src/Bounds.ts", "src/Required.ts"], required_context_sources: ["src/Required.ts"], context_sections: [{ path: "src/Bounds.ts", from: 2, to: 3, content_hash: sha256(bytes) }], checks: [] };
  const statePath = path.join(dir, "state.yaml"), output = path.join(dir, "context.lock.json");
  const save = async () => { await writeFile(statePath, stringify(state)); await generateContextIndex(root); }; await save();
  const compile = (extra = {}) => compileContext({ root, taskId, createdAt, totalTokens: 30000, reservedOutputTokens: 0, inputSafetyTokens: 0, ...extra });
  return { root, base, dir, bytes, state, statePath, output, save, compile };
}
async function receivingFixture(prepare?: (f: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
  const f = await fixture();
  if (prepare) await prepare(f);
  await promisify(execFile)("git", ["init", "-q"], { cwd: f.root, windowsHide: true });
  await f.compile({ apply: true });
  await writeFile(path.join(f.dir, "input.json"), JSON.stringify({ next_safe_action: "Read the exact bounds section and the whole required contract before changing any source.", uncommitted_summary: "Only synthetic fixture files are uncommitted." }));
  const handoff = await createHandoff({ root: f.root, taskId, sourceSessionId: "source", inputPath: `${f.base}/input.json`, createdAt, apply: true });
  const resume = () => createResumePacket({ root: f.root, taskId, receivingSessionId: "receiver", createdAt, totalTokens: 30000, reservedOutputTokens: 0, inputSafetyTokens: 0, apply: true });
  const r = await resume(); expect((await validateResumePacketAt(f.root, r.packet_path)).ok).toBe(true);
  return { ...f, handoff, r, resume };
}
function rehash(lock: ContextLock) {
  lock.budget.estimated_input_tokens = lock.sources.reduce((sum, source) => sum + source.estimated_tokens, 0);
  const { lock_hash: _, ...payload } = lock; lock.lock_hash = computeContextLockHash(payload);
}

describe("context review correction regressions", () => {
  it.each(["shift", "strip", "required", "missing-required"])("rejects rehashed receiving %s without relying on the active lock", async mode => {
    const f = await receivingFixture(), before = await readFile(f.output), lock = structuredClone(f.r.context_lock), packet = structuredClone(f.r.packet);
    const source = lock.sources.find(s => s.path === (mode.includes("required") ? "src/Required.ts" : "src/Bounds.ts"))!;
    if (mode === "missing-required") lock.sources = lock.sources.filter(s => s !== source);
    else if (mode === "strip") { delete source.line_ranges; delete source.selection_hash; source.estimated_tokens = Math.ceil(f.bytes.length / 4); }
    else {
      const full = await readFile(path.join(f.root, source.path)), selected = selectContextSection(full, 1, 1);
      source.line_ranges = [[1, 1]]; source.selection_hash = sha256(selected); source.estimated_tokens = Math.ceil(selected.length / 4);
    }
    rehash(lock);
    packet.receiving_context_lock_path = `${f.base}/evidence/context-locks/${lock.lock_hash.slice(7)}.json`;
    packet.receiving_context_lock_hash = lock.lock_hash; packet.read_order = lock.sources.map(s => s.path);
    const { packet_hash: _, ...payload } = packet; packet.packet_hash = computeResumePacketHash(payload);
    const packetPath = `${f.base}/evidence/resume-packets/${packet.packet_hash.slice(7)}.resume.packet.json`;
    await writeFile(path.join(f.root, packet.receiving_context_lock_path), serializeContextLock(lock));
    await writeFile(path.join(f.root, packetPath), serializeResumePacket(packet));
    const targeted = await validateResumePacketAt(f.root, packetPath), global = await validateRepository(f.root);
    expect(targeted.ok).toBe(false);
    expect(targeted.diagnostics.some(d => d.code === "RESUME010" && d.path === packetPath)).toBe(true);
    // A historical receipt is not current-use authorization, even if self-consistent.
    expect(global.diagnostics.some(d => d.code === "RESUME010" && d.path === packetPath)).toBe(false);
    expect(await readFile(f.output)).toEqual(before);
  });
  it("accepts a valid archive after an unrelated active-lock recompile", async () => {
    const f = await receivingFixture(); await f.compile({ agentRunId: "later", createdAt: "2026-09-08T21:00:00Z", apply: true });
    expect((await validateResumePacketAt(f.root, f.r.packet_path)).ok).toBe(true);
  });
  it.each(["check", "change"])("enforces directly cited %s evidence independently of receiving selectors", async kind => {
    const f = await receivingFixture(async f => {
      await mkdir(path.join(f.dir, "evidence"));
      const evidence = `${f.base}/evidence/required.txt`; await writeFile(path.join(f.root, evidence), "Required verification oracle\n");
      if (kind === "check") {
        const raw = JSON.parse(JSON.stringify(f.state));
        raw.checks = [{ id: "CHECK", command_or_observation: "Inspect required oracle", status: "pending", evidence_refs: [evidence] }];
        await writeFile(f.statePath, stringify(raw));
      } else {
        // A valid legacy idea record is sufficient to cite evidence; no lifecycle claim is invented.
        const template = { change_id: "CHG-REVIEW-EVIDENCE", revision: 1, title: "Synthetic evidence citation", status: "idea", risk: "low", author: "fixture", canonical_source: "AGENTS.md", decision_rationale: "Evidence input only", acceptance_cases: [], impacts: [], verification: {
          checks: [{ name: "oracle", status: "pending", evidence_refs: [evidence] }],
          terminology_search: { status: "not-applicable", terms: [], evidence_refs: [] },
          visual_review: { applicable: false, status: "not-applicable", evidence_refs: [] }, unverifiable_items: [] },
          independent_review: { status: "not-required", reviewer: null, findings: [], evidence_refs: [], waiver: null },
          supersedes: [], superseded_by: null, updated_at: createdAt };
        await writeFile(path.join(f.dir, "change.yaml"), stringify(template));
      }
      await generateContextIndex(f.root);
    });
    const lock = structuredClone(f.r.context_lock), packet = structuredClone(f.r.packet), before = await readFile(f.output);
    expect(lock.sources.some(s => s.path.endsWith("evidence/required.txt"))).toBe(true);
    lock.sources = lock.sources.filter(s => !s.path.endsWith("evidence/required.txt")); rehash(lock);
    packet.receiving_context_lock_path = `${f.base}/evidence/context-locks/${lock.lock_hash.slice(7)}.json`;
    packet.receiving_context_lock_hash = lock.lock_hash; packet.read_order = lock.sources.map(s => s.path);
    const { packet_hash: _, ...payload } = packet; packet.packet_hash = computeResumePacketHash(payload);
    const packetPath = `${f.base}/evidence/resume-packets/${packet.packet_hash.slice(7)}.resume.packet.json`;
    await writeFile(path.join(f.root, packet.receiving_context_lock_path), serializeContextLock(lock));
    await writeFile(path.join(f.root, packetPath), serializeResumePacket(packet));
    for (const report of [await validateResumePacketAt(f.root, packetPath)]) {
      expect(report.diagnostics.some(d => d.code === "RESUME010" && d.detail?.includes("evidence/required.txt"))).toBe(true);
    }
    expect(await readFile(f.output)).toEqual(before);
  });
  it("returns structured failure for invalid metadata without throwing even when no packet exists", async () => {
    const f = await fixture(); await writeFile(path.join(f.root, "AGENTS.md"), "no frontmatter\n");
    const report = await validateRepository(f.root);
    expect(report.ok).toBe(false); expect(report.diagnostics.some(d => d.code === "DOC002")).toBe(true);
  });
  it("does not approve a receiving packet when the current routing inventory is invalid", async () => {
    const f = await receivingFixture(); await writeFile(path.join(f.root, "unknown.md"), "no frontmatter\n");
    const report = await validateResumePacketAt(f.root, f.r.packet_path);
    expect(report.ok).toBe(false); expect(report.diagnostics.some(d => d.code === "RESUME010")).toBe(true);
  });
  it("keeps the historical whole-file worked example structurally valid but not operationally resumable", async () => {
    const f = await fixture();
    await cp(path.resolve("examples/feature-save-schema"), path.join(f.root, "examples/feature-save-schema"), { recursive: true });
    // The illustration references these external placeholders in the host config.
    // Materialize fixture placeholders instead of treating missing references as a product fault.
    await writeFile(path.join(f.root, "SaveManager.cs"), "// Example placeholder\n");
    await writeFile(path.join(f.root, "SaveSystemTests.cs"), "// Example placeholder\n");
    const header = await readFile(path.join(f.root, "AGENTS.md"), "utf8");
    await writeFile(path.join(f.root, "ARTIFACT_PROTOCOL.md"), header.replace("topic_id: rules", "topic_id: example-protocol"));
    await generateContextIndex(f.root);
    const report = await validateRepository(f.root);
    expect(report.diagnostics.filter(d => d.severity === "error"), JSON.stringify(report.diagnostics)).toEqual([]);
    const targeted = await validateResumePacketAt(f.root, "examples/feature-save-schema/tasks/T-SAVE-001/resume.packet.json");
    expect(targeted.ok).toBe(false); expect(targeted.diagnostics.some(d => d.code === "RESUME000")).toBe(true);
  });
  it("cannot bypass operational policy by relocating a partial packet outside tasks", async () => {
    const f = await receivingFixture(); await mkdir(path.join(f.root, "examples"));
    const relative = "examples/relocated.resume.packet.json";
    await writeFile(path.join(f.root, relative), serializeResumePacket(f.r.packet));
    expect((await validateResumePacketAt(f.root, relative)).ok).toBe(false);
    expect((await validateRepository(f.root)).diagnostics.some(d => d.path === relative && d.code === "RESUME010")).toBe(true);
  });
  it("requires operational owner identity for the legacy packet basename", async () => {
    const f = await receivingFixture(), packet = structuredClone(f.r.packet);
    packet.task_id = "T-DIFFERENT";
    const { packet_hash: _, ...payload } = packet; packet.packet_hash = computeResumePacketHash(payload);
    const relative = `${f.base}/resume.packet.json`; await writeFile(path.join(f.root, relative), serializeResumePacket(packet));
    const result = await validateResumePacketAt(f.root, relative);
    expect(result.ok).toBe(false); expect(result.diagnostics.some(d => d.code === "RESUME005")).toBe(true);
  });
  it("preserves opaque task IDs containing Unicode and internal spaces", async () => {
    const f = await fixture(), id = "T-Grün Regeln", base = `.agent-context/tasks/${id}`, dir = path.join(f.root, base);
    await rename(f.dir, dir); f.state.task_id = id;
    await writeFile(path.join(dir, "state.yaml"), stringify(f.state)); await generateContextIndex(f.root);
    await promisify(execFile)("git", ["init", "-q"], { cwd: f.root, windowsHide: true });
    const options = { root: f.root, taskId: id, createdAt, totalTokens: 30000, reservedOutputTokens: 0, inputSafetyTokens: 0, apply: true };
    await compileContext(options);
    await writeFile(path.join(dir, "input.json"), JSON.stringify({ next_safe_action: "Read the exact selected bounds before editing any fixture source.", uncommitted_summary: "Synthetic fixture files only." }));
    await createHandoff({ ...options, sourceSessionId: "source", inputPath: `${base}/input.json` });
    const r = await createResumePacket({ ...options, receivingSessionId: "receiver" });
    expect((await validateResumePacketAt(f.root, r.packet_path)).ok).toBe(true);
  });
  it("rejects a requested packet excluded from the governed artifact scan", async () => {
    const f = await receivingFixture(), configPath = path.join(f.root, ".agent-context/config.yaml");
    const config = parse(await readFile(configPath, "utf8")); config.exclude_paths.push(f.r.packet_path);
    await writeFile(configPath, stringify(config));
    const r = await validateResumePacketAt(f.root, f.r.packet_path);
    expect(r.ok).toBe(false); expect(r.diagnostics.some(d => d.code === "RESUME000")).toBe(true);
  });
  it("does not approve an unscanned operational-looking junction packet", async context => {
    const f = await fixture(), outside = path.join(f.root, "examples/proxy"), alias = path.join(f.root, ".agent-context/tasks/T-PROXY");
    await mkdir(outside, { recursive: true }); await writeFile(path.join(outside, "resume.packet.json"), "{}\n");
    try { await symlink(outside, alias, process.platform === "win32" ? "junction" : "dir"); }
    catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP", "EOPNOTSUPP", "ENOSYS"].includes((error as NodeJS.ErrnoException).code ?? "")) { context.skip(true, "Filesystem directory-link capability unavailable"); return; }
      throw error;
    }
    const r = await validateResumePacketAt(f.root, ".agent-context/tasks/T-PROXY/resume.packet.json");
    expect(r.ok).toBe(false); expect(r.diagnostics.some(d => d.code === "RESUME000")).toBe(true);
  });
  it("does not operationally approve a moved and fully rehashed whole packet", async () => {
    const f = await receivingFixture(), lock = structuredClone(f.r.context_lock), packet = structuredClone(f.r.packet);
    const source = lock.sources.find(s => s.line_ranges)!;
    delete source.line_ranges; delete source.selection_hash; source.estimated_tokens = Math.ceil(f.bytes.length / 4); rehash(lock);
    packet.receiving_context_lock_path = `${f.base}/evidence/context-locks/${lock.lock_hash.slice(7)}.json`;
    packet.receiving_context_lock_hash = lock.lock_hash;
    const { packet_hash: _, ...payload } = packet; packet.packet_hash = computeResumePacketHash(payload);
    await writeFile(path.join(f.root, packet.receiving_context_lock_path), serializeContextLock(lock));
    await mkdir(path.join(f.root, "examples")); const relative = "examples/moved-whole.resume.packet.json";
    await writeFile(path.join(f.root, relative), serializeResumePacket(packet));
    const result = await validateResumePacketAt(f.root, relative);
    expect(result.ok).toBe(false); expect(result.diagnostics.some(d => d.code === "RESUME000")).toBe(true);
  });
  it.each(["compile", "preview", "resume"])("preflights line_ranges and preserves all outputs during %s", async mode => {
    const f = mode === "resume" ? await receivingFixture() : await fixture();
    const report = await f.compile({ apply: true }), before = await readFile(f.output);
    const preview = path.join(f.root, "preview.json"); await writeFile(preview, JSON.stringify({ ...report, mode: "dry-run", output_modified: false }));
    const schemaPath = path.join(f.root, "schemas/context-lock.schema.json"), schema = JSON.parse(await readFile(schemaPath, "utf8"));
    delete schema.properties.sources.items.properties.line_ranges;
    const schemaText = JSON.stringify(schema); await writeFile(schemaPath, schemaText);
    const beforeFiles = await readdir(f.dir, { recursive: true });
    const run = mode === "compile" ? () => f.compile({ apply: true }) : mode === "preview" ? () => applyContextPreview({ root: f.root, previewPath: preview }) : () => (f as Awaited<ReturnType<typeof receivingFixture>>).resume();
    await expect(run()).rejects.toThrow(/schema/i);
    expect(await readFile(f.output)).toEqual(before); expect(await readdir(f.dir, { recursive: true })).toEqual(beforeFiles);
    expect(await readFile(schemaPath, "utf8")).toBe(schemaText);
  });
  it.each(["context-lock", "task-state"])("validates prospective artifact against incompatible %s field types", async name => {
    const f = await fixture(), schemaPath = path.join(f.root, "schemas", `${name}.schema.json`), schema = JSON.parse(await readFile(schemaPath, "utf8"));
    if (name === "context-lock") schema.properties.sources.items.properties.line_ranges = { type: "string" };
    else schema.properties.context_sections = { type: "string" };
    await writeFile(schemaPath, JSON.stringify(schema));
    await expect(f.compile({ apply: true })).rejects.toThrow(/schema/i);
    await expect(readFile(f.output)).rejects.toThrow();
  });
  it.each(["schemas/", "./schemas", "./schemas/"])("preserves supported schema_path spelling %s", async spelling => {
    const f = await fixture(), configPath = path.join(f.root, ".agent-context/config.yaml");
    const config = parse(await readFile(configPath, "utf8")); config.schema_path = spelling;
    await writeFile(configPath, stringify(config));
    expect((await f.compile({ apply: true })).lock.sources.some(source => source.line_ranges)).toBe(true);
    expect((await validateRepository(f.root)).diagnostics.filter(d => d.severity === "error")).toEqual([]);
  });
  it.each(["section", "required", "intent", "parent"])("does not accept wrong-case %s paths", async mode => {
    const f = await fixture();
    if (mode === "section") f.state.context_sections[0]!.path = "src/bounds.ts";
    if (mode === "required") f.state.required_context_sources = ["src/required.ts"];
    if (mode === "intent") f.state.file_intents.push("src/bounds.ts");
    if (mode === "parent") f.state.context_sections[0]!.path = "SRC/Bounds.ts";
    await f.save();
    // Optional genuinely missing file_intents may remain omissions on a case-sensitive FS.
    if (mode === "intent") {
      try { const r = await f.compile(); expect(r.lock.sources.some(s => s.path === "src/bounds.ts")).toBe(false); }
      catch (error) { expect(String(error)).toMatch(/exact|spelling|aliased/i); }
    } else await expect(f.compile({ apply: true })).rejects.toThrow();
    await expect(readFile(f.output)).rejects.toThrow();
  });
  it("rejects active wrong-case physical identity but does not rewrite historical sources", async () => {
    const f = await fixture(); const report = await f.compile({ apply: true });
    report.lock.sources.find(s => s.path === "src/Required.ts")!.path = "src/required.ts"; rehash(report.lock);
    await writeFile(f.output, serializeContextLock(report.lock));
    expect((await validateRepository(f.root)).diagnostics.some(d => d.severity === "error")).toBe(true);
    f.state.status = "superseded"; await f.save(); const before = await readFile(f.output);
    expect((await validateRepository(f.root)).diagnostics.filter(d => d.severity === "error")).toEqual([]);
    expect(await readFile(f.output)).toEqual(before);
  });
  it("keeps distinct exact-case filenames distinct where the filesystem supports them", async context => {
    const f = await fixture(); await writeFile(path.join(f.root, "src/bounds.ts"), "export const different = true;\n");
    const names = await readdir(path.join(f.root, "src"));
    if (!names.includes("Bounds.ts") || !names.includes("bounds.ts")) { context.skip(true, "Filesystem cannot represent distinct case-only names"); return; }
    f.state.required_context_sources.push("src/bounds.ts"); await f.save(); const r = await f.compile({ apply: true });
    expect(r.lock.sources.filter(s => /src\/[Bb]ounds.ts/.test(s.path))).toHaveLength(2);
    expect((await validateRepository(f.root)).diagnostics.filter(d => d.severity === "error")).toEqual([]);
  });
  it("renders exact section boundaries and selected tokens in both human reports", async () => {
    const f = await fixture(), r = await f.compile({ apply: true });
    for (const text of [formatContextCompileReport(r), formatContextInspection(await inspectTaskContext({ root: f.root, taskId }))]) {
      expect(text).toContain('"src/Bounds.ts"'); expect(text).toContain("2..3");
      expect(text).toContain("remainder not selected"); expect(text).toContain(`${Math.ceil(selectContextSection(f.bytes, 2, 3).length / 4)}`);
    }
  });
});
