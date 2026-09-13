import { cp, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { compileContext, computeContextLockHash, serializeContextLock, type ContextLock } from "../src/context.js";
import { createHandoff } from "../src/handoff.js";
import { generateContextIndex, sha256 } from "../src/indexer.js";
import { createResumePacket, computeResumePacketHash, serializeResumePacket, type ResumePacket } from "../src/resume.js";
import { validateRepository, validateResumePacketAt } from "../src/validator.js";

const roots: string[] = [], taskId = "T-HISTORY", base = `.agent-context/tasks/${taskId}`;
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "ct-resume-history-")); roots.push(root);
  await cp(path.resolve("schemas"), path.join(root, "schemas"), { recursive: true });
  await mkdir(path.join(root, base), { recursive: true }); await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, ".agent-context/config.yaml"), stringify({ version: 1, schema_path: "schemas", index_path: ".agent-context/context-index.json", governed_paths: ["."], exclude_paths: [".git"], require_frontmatter_for_all_markdown: true, require_topic_id_for_canonical: true, allow_missing_references: [] }));
  const header = { topic_id: "history-rules", stand: "2026-09-09", status: "current", truth_level: "canonical", verification: { state: "reviewed", evidence: [] }, read_if_task_touches: [], primary_systems: [], safe_to_edit: ["Fixture"], do_not_use_instead: [] };
  await writeFile(path.join(root, "AGENTS.md"), `---\n${stringify(header)}---\n# Synthetic rules\n`);
  const original = Buffer.from("// first\r\nexport const value = 1;\r\n// last\n");
  await writeFile(path.join(root, "src/Section.ts"), original);
  await writeFile(path.join(root, "src/Required.ts"), "// Required full contract\nexport const required = true;\n");
  const state = { task_id: taskId, objective: "Maintain explicit historical receipts", status: "in-progress", acceptance_criteria: [{ id: "AC", statement: "Keep history and current usage distinct", verification: "byte assertions", status: "pending" }], dependencies: [], required_context_sources: ["src/Required.ts"], file_intents: ["src/Section.ts"], context_sections: [{ path: "src/Section.ts", from: 2, to: 2, content_hash: sha256(original) }], checks: [] };
  const save = async () => { await writeFile(path.join(root, base, "state.yaml"), stringify(state)); await generateContextIndex(root); };
  await save(); await promisify(execFile)("git", ["init", "-q"], { cwd: root, windowsHide: true });
  const common = { root, taskId, totalTokens: 128000, reservedOutputTokens: 12000, inputSafetyTokens: 4096 };
  const compile = (agent = "source") => compileContext({ ...common, agentRunId: agent, apply: true });
  await compile();
  const handoff = await createHandoff({ root, taskId, sourceSessionId: "different-source-label", nextSafeAction: "Inspect the selected range and the full required contract before editing fixture data.", apply: true });
  const resume = (session = "A") => createResumePacket({ ...common, receivingSessionId: session, apply: true });
  const a = await resume();
  expect((await validateResumePacketAt(root, a.packet_path)).ok).toBe(true);
  const audit = () => validateRepository(root, { checkIndex: false, checkContextLocks: false });
  return { root, state, save, compile, handoff, resume, a, audit };
}
function rehash(lock: ContextLock): void {
  const { lock_hash: _, ...payload } = lock; lock.lock_hash = computeContextLockHash(payload);
}
async function alteredReceiving(f: Awaited<ReturnType<typeof fixture>>, alter: (lock: ContextLock, packet: ResumePacket) => void) {
  const lock = structuredClone(f.a.context_lock), packet = structuredClone(f.a.packet);
  alter(lock, packet); rehash(lock);
  packet.receiving_context_lock_hash = lock.lock_hash;
  packet.receiving_context_lock_path = `${base}/evidence/context-locks/${lock.lock_hash.slice(7)}.json`;
  packet.read_order = lock.sources.map(source => source.path); packet.omissions = lock.omissions;
  const { packet_hash: _, ...payload } = packet; packet.packet_hash = computeResumePacketHash(payload);
  const packetPath = `${base}/evidence/resume-packets/${packet.packet_hash.slice(7)}.resume.packet.json`;
  await writeFile(path.join(f.root, packet.receiving_context_lock_path), serializeContextLock(lock));
  await writeFile(path.join(f.root, packetPath), serializeResumePacket(packet));
  return packetPath;
}

describe("retained resume integrity versus explicit current use", () => {
  it("retains A through expansion, B creation and completion without blocking index or rewriting history", async () => {
    const f = await fixture(), packetBytes = await readFile(path.join(f.root, f.a.packet_path)), archiveBytes = await readFile(path.join(f.root, f.a.receiving_context_archive_path));
    await writeFile(path.join(f.root, "src/Required.ts"), "export const required = 'changed';\n");
    f.state.context_sections[0]!.from = 1; await f.save();
    expect((await f.audit()).diagnostics.filter(d => d.code.startsWith("RESUME"))).toEqual([]);
    const rejectedA = await validateResumePacketAt(f.root, f.a.packet_path);
    expect(rejectedA.ok).toBe(false); expect(rejectedA.validation_scope).toBe("current-use");
    expect(rejectedA.diagnostics.some(d => d.code === "RESUME008")).toBe(true);
    expect(rejectedA.diagnostics.some(d => d.code === "RESUME010")).toBe(true);
    const b = await f.resume("B"); expect((await validateResumePacketAt(f.root, b.packet_path)).ok).toBe(true);
    f.state.status = "done"; f.state.acceptance_criteria[0]!.status = "pass"; await f.save(); await f.compile("completed");
    expect((await validateRepository(f.root)).diagnostics.filter(d => d.severity === "error")).toEqual([]);
    expect((await validateResumePacketAt(f.root, b.packet_path)).ok).toBe(false);
    expect(await readFile(path.join(f.root, f.a.packet_path))).toEqual(packetBytes);
    expect(await readFile(path.join(f.root, f.a.receiving_context_archive_path))).toEqual(archiveBytes);
  });
  it("still reports actual active-lock source drift in repository validation", async () => {
    const f = await fixture(); await writeFile(path.join(f.root, "src/Required.ts"), "changed\n");
    const result = await validateRepository(f.root);
    expect(result.ok).toBe(false); expect(result.diagnostics.some(d => d.code === "LOCK004")).toBe(true);
    expect(result.diagnostics.filter(d => d.path === f.a.packet_path)).toEqual([]);
  });
  it("permits deletion of a historical source but never its current consumption", async () => {
    const f = await fixture(); await unlink(path.join(f.root, "src/Required.ts"));
    // Missing current task references may still fail globally; only retained packet integrity is unaffected.
    expect((await f.audit()).diagnostics.filter(d => d.path === f.a.packet_path)).toEqual([]);
    const result = await validateResumePacketAt(f.root, f.a.packet_path);
    expect(result.ok).toBe(false); expect(result.diagnostics.some(d => d.code === "RESUME008")).toBe(true);
  });
  it.each(["in-progress", "review", "done", "verified", "superseded"])("does not infer consumption approval from task status %s", async status => {
    const f = await fixture(); f.state.status = status; f.state.objective += " after legitimate continuation"; await f.save();
    expect((await f.audit()).diagnostics.filter(d => d.code.startsWith("RESUME"))).toEqual([]);
    expect((await validateResumePacketAt(f.root, f.a.packet_path)).ok).toBe(false);
  });
  it("uses the exact retained handoff after replacement, not as current-use permission", async () => {
    const f = await fixture(), before = await readFile(path.join(f.root, f.a.packet_path));
    await f.compile("next-source");
    await createHandoff({ root: f.root, taskId, sourceSessionId: "next-source", nextSafeAction: "Inspect the complete required source before continuing the next fixture step.", replace: true, apply: true });
    expect((await f.audit()).ok).toBe(true);
    expect((await validateResumePacketAt(f.root, f.a.packet_path)).diagnostics.some(d => d.code === "RESUME006")).toBe(true);
    const b = await f.resume("B"); expect((await validateResumePacketAt(f.root, b.packet_path)).ok).toBe(true);
    expect(await readFile(path.join(f.root, f.a.packet_path))).toEqual(before);
    await unlink(path.join(f.root, base, "handoff.yaml"));
    // B has no archived handoff yet, but A's exact receipt remains auditable.
    expect((await f.audit()).diagnostics.filter(d => d.path === f.a.packet_path)).toEqual([]);
    expect((await validateResumePacketAt(f.root, f.a.packet_path)).ok).toBe(false);
  });
  it.each(["missing", "semantic", "bytes"])("rejects %s historical handoff evidence", async mode => {
    const f = await fixture(); await f.compile();
    await createHandoff({ root: f.root, taskId, sourceSessionId: "next", nextSafeAction: "Read all selected fixture inputs before implementing another change.", replace: true, apply: true });
    const archived = path.join(f.root, base, "evidence/handoffs", f.a.packet.handoff_hash.slice(7) + ".yaml");
    if (mode === "missing") await unlink(archived);
    else {
      const old = await readFile(archived, "utf8");
      await writeFile(archived, mode === "bytes" ? old + "\n" : old.replace("Inspect the selected range", "Tamper with the selected range"));
    }
    expect((await f.audit()).diagnostics.some(d => d.path === f.a.packet_path && ["RESUME006", "RESUME007"].includes(d.code))).toBe(true);
  });
  it.each(["total", "sum", "duplicate", "omission", "range", "schema", "session", "owner", "projection"])("rejects rehashed receiving %s corruption during history audit", async mode => {
    const f = await fixture();
    const p = await alteredReceiving(f, (lock, packet) => {
      if (mode === "total") lock.budget.total_tokens = 1;
      if (mode === "sum") lock.budget.estimated_input_tokens += 1;
      if (mode === "duplicate") { lock.sources.push({ ...lock.sources[0]! }); lock.budget.estimated_input_tokens += lock.sources[0]!.estimated_tokens; }
      if (mode === "omission") lock.omissions.push({ candidate: "src/Required.ts", reason: "forged omission", required: true });
      if (mode === "range") lock.sources.find(s => s.line_ranges)!.line_ranges = [[3, 1]];
      if (mode === "schema") (lock as unknown as Record<string, unknown>).budget = {};
      if (mode === "session") lock.agent_run_id = "forged";
      if (mode === "owner") lock.task_id = "T-OTHER";
      if (mode === "projection") packet.do_not_repeat.push("An instruction absent from the handoff");
    });
    expect((await f.audit()).diagnostics.some(d => d.path === p && ["RESUME006", "RESUME007", "RESUME011"].includes(d.code))).toBe(true);
    expect((await validateResumePacketAt(f.root, p)).ok).toBe(false);
  });
  it.each(["context-lock", "handoff", "task-state", "resume-packet"])("attributes missing %s schema to the targeted packet", async name => {
    const f = await fixture(); await unlink(path.join(f.root, "schemas", name + ".schema.json"));
    const result = await validateResumePacketAt(f.root, f.a.packet_path);
    expect(result.ok).toBe(false); expect(result.diagnostics.some(d => d.path === f.a.packet_path && d.severity === "error")).toBe(true);
  });
  it("rejects a packet-authored historical flag instead of letting data select validation purpose", async () => {
    const f = await fixture(), packet = { ...f.a.packet, validation_scope: "retained-integrity" };
    const { packet_hash: _, ...payload } = packet; packet.packet_hash = computeResumePacketHash(payload);
    const p = `${base}/resume.packet.json`; await writeFile(path.join(f.root, p), JSON.stringify(packet));
    expect((await validateResumePacketAt(f.root, p)).ok).toBe(false);
  });
  it("rejects a source archive with a recomputed but unbound hash", async () => {
    const f = await fixture(), p = path.join(f.root, f.a.packet.source_context_lock_path);
    const lock = JSON.parse(await readFile(p, "utf8")) as ContextLock; lock.task_id = "T-OTHER"; rehash(lock); await writeFile(p, serializeContextLock(lock));
    expect((await f.audit()).diagnostics.some(d => d.path === f.a.packet_path && d.code === "RESUME006")).toBe(true);
  });
});
