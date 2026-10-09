import { execFile } from "node:child_process";
import { link, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { Ajv2020 } from "ajv/dist/2020.js";
import { afterEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { applyContextPreview, compileContext, computeContextLockHash } from "../src/context.js";
import { createHandoff } from "../src/handoff.js";
import { generateContextIndex } from "../src/indexer.js";
import { createResumePacket, computeResumePacketHash } from "../src/resume.js";
import { createTask } from "../src/task-create.js";
import { validateRepository, validateResumePacketAt } from "../src/validator.js";
import { createTaskWorkingIndex, formatTaskWorkingIndex } from "../src/working-index.js";
import { documentFixture, documentManifest } from "./document-fixture.js";

const roots: string[] = [], run = promisify(execFile);
const stamp = "2026-10-08T12:00:00Z";
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, {
  recursive: true, force: true, maxRetries: process.platform === "win32" ? 8 : 0, retryDelay: 100,
}); });

function md(topic: string, overrides: Record<string, unknown> = {}) {
  return "---\n" + stringify({ topic_id: topic, stand: "2026-10-08", status: "draft", truth_level: "draft",
    verification: { state: "unverified", evidence: [] }, read_if_task_touches: ["source revision"],
    primary_systems: ["source revision"], safe_to_edit: ["Keep the boundary explicit"], do_not_use_instead: [], ...overrides })
    + "---\n\n# A bounded note\n";
}
async function write(root: string, relative: string, content: string) {
  const absolute = path.join(root, ...relative.split("/"));
  await mkdir(path.dirname(absolute), { recursive: true }); await writeFile(absolute, content);
}
async function state(root: string, id: string, fields: Record<string, unknown>) {
  const relative = `.agent-context/tasks/${id}/state.yaml`;
  const value = parse(await readFile(path.join(root, relative), "utf8"));
  await write(root, relative, stringify({ ...value, ...fields }));
}
async function peer(root: string, id = "T-PEER-001") {
  await createTask({ root, taskId: id, changeId: `CHG-${id}`, objective: "Inspect the peer source revision",
    acceptance: ["Keep peer sources unchanged"], author: "Fixture author", risk: "medium", createdAt: stamp, apply: true });
  return `.agent-context/tasks/${id}/evidence/note.md`;
}
async function fixture() {
  const f = await documentFixture(roots), peerPath = await peer(f.root);
  await write(f.root, peerPath, md("peer-note")); await generateContextIndex(f.root);
  return { ...f, peerPath };
}
function compile(f: { root: string; taskId: string }) {
  return { ...f, createdAt: stamp, agentRunId: "source-session", totalTokens: 48000, reservedOutputTokens: 8000 };
}
const bad = { verification: { state: "not-run", evidence: [] } };

async function receivingFixture() {
  const f = await fixture();
  await run("git", ["init"], { cwd: f.root, windowsHide: true });
  await run("git", ["config", "user.name", "Fixture author"], { cwd: f.root, windowsHide: true });
  await run("git", ["config", "user.email", "fixture@example.invalid"], { cwd: f.root, windowsHide: true });
  await run("git", ["add", "."], { cwd: f.root, windowsHide: true });
  await run("git", ["commit", "-m", "fixture"], { cwd: f.root, windowsHide: true });
  await compileContext({ ...compile(f), workingIndex: true, apply: true });
  const handoff = await createHandoff({ root: f.root, taskId: f.taskId, sourceSessionId: "source-session", createdAt: stamp,
    nextSafeAction: "Read this bounded source and prove current receiving capability before continuing.", apply: true });
  await state(f.root, f.taskId, { latest_handoff: handoff.output_path });
  const receiving = await createResumePacket({ root: f.root, taskId: f.taskId, receivingSessionId: "fresh-session",
    createdAt: stamp, totalTokens: 48000, reservedOutputTokens: 8000, apply: true });
  return { ...f, handoff, receiving };
}

async function oldPermissiveSchema(root: string) {
  const schemaPath = path.join(root, ".agent-context/schemas/context-lock.schema.json");
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  delete schema.properties.context_index_scope; schema.additionalProperties = true;
  await writeFile(schemaPath, JSON.stringify(schema));
}

describe("explicit task working indexes", () => {
  it.each(["draft", "active-snapshot", "historical"])("isolates only positively %s unrelated header errors with a complete raw report", async truth => {
    const f = await fixture(); await write(f.root, f.peerPath, md("peer-note", { truth_level: truth, ...bad }));
    const before = await documentManifest(f.root), report = await createTaskWorkingIndex(f.root, f.taskId);
    expect(report.ok, formatTaskWorkingIndex(report)).toBe(true);
    expect(report.repository_preflight.ok).toBe(false);
    expect(report.isolated_findings).toContainEqual(expect.objectContaining({ code: "SCHEMA005", path: f.peerPath }));
    expect(report.repository_preflight.diagnostics).toContainEqual(report.isolated_findings[0]);
    expect(report.relevant_task_ids).toEqual([f.taskId]); expect(report.blocking_findings).toEqual([]);
    expect(report.index?.documents.some(d => d.path === f.peerPath)).toBe(false);
    expect(report).toMatchObject({ index_written: false, completion_approval: false });
    expect(formatTaskWorkingIndex(report)).toContain("NOT completion/CI approval");
    expect(await documentManifest(f.root)).toEqual(before);
    const schema = JSON.parse(await readFile(path.resolve("schemas/task-working-index.schema.json"), "utf8"));
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
    expect(validate(report), JSON.stringify(validate.errors)).toBe(true);
  });

  it("isolates missing local peer-note evidence but preserves the exact REF001 diagnostic", async () => {
    const f = await fixture();
    await write(f.root, f.peerPath, md("peer-note", { verification: { state: "unverified", evidence: ["evidence/missing-proof.txt"] } }));
    const report = await createTaskWorkingIndex(f.root, f.taskId);
    expect(report.ok, formatTaskWorkingIndex(report)).toBe(true);
    expect(report.isolated_findings).toContainEqual(expect.objectContaining({ code: "REF001", path: f.peerPath,
      detail: expect.stringContaining("Missing target:") }));
    expect((await validateRepository(f.root)).ok).toBe(false);
  });

  it("isolates a positively noncanonical incomplete header without a validator crash", async () => {
    const f = await fixture(); await write(f.root, f.peerPath, "---\ntruth_level: draft\n---\n# Incomplete note\n");
    const report = await createTaskWorkingIndex(f.root, f.taskId);
    expect(report.ok, formatTaskWorkingIndex(report)).toBe(true);
    expect(report.isolated_findings.some(d => d.code === "SCHEMA005")).toBe(true);
  });

  it.each(["missing/escape\u001b.md", "C:missing.md", "missing/stream.md:secret", ".git/missing.md",
    "missing/trailing./proof.md", "missing/NUL/proof.md"])("never isolates an ambiguous missing reference %j", async reference => {
    const f = await fixture();
    await write(f.root, f.peerPath, md("peer-note", { verification: { state: "unverified", evidence: [reference] } }));
    const before = await documentManifest(f.root), report = await createTaskWorkingIndex(f.root, f.taskId);
    expect(report.ok).toBe(false); expect(report.isolated_findings).toEqual([]);
    expect(report.blocking_findings.some(d => d.code === "WIDX001")).toBe(true);
    expect(await documentManifest(f.root)).toEqual(before);
  });

  it("checks safe directory and fragment references without requiring fictitious probe files", async () => {
    const f = await fixture();
    await write(f.root, f.peerPath, md("peer-note", { verification: { state: "unverified",
      evidence: ["./.agent-context/tasks/T-PEER-001/evidence/", "#local-proof", "evidence/missing-proof.txt#claim"] } }));
    const before = await documentManifest(f.root), report = await createTaskWorkingIndex(f.root, f.taskId);
    expect(report.ok, formatTaskWorkingIndex(report)).toBe(true);
    expect(report.isolated_findings.filter(d => d.code === "REF001")).toHaveLength(1);
    expect(await documentManifest(f.root)).toEqual(before);
  });

  it("requires a real schema-valid owner before excluding a draft note", async () => {
    const f = await fixture();
    await rm(path.join(f.root, ".agent-context/tasks/T-PEER-001/state.yaml"));
    await write(f.root, f.peerPath, md("peer-note", bad));
    const before = await documentManifest(f.root), report = await createTaskWorkingIndex(f.root, f.taskId);
    expect(report.ok).toBe(false); expect(report.excluded_documents).toEqual([]);
    expect(report.blocking_findings.some(d => d.code === "WIDX001")).toBe(true);
    expect(await documentManifest(f.root)).toEqual(before);
  });

  it.each(["canonical", "design-target"])("establishes the owner of retained %s peer truth before compile/apply", async truth => {
    const f = await fixture(); await write(f.root, f.peerPath, md("peer-note", { truth_level: truth }));
    const report = await compileContext({ ...compile(f), workingIndex: true });
    expect(report.working_index?.relevant_task_ids).toEqual([f.taskId, "T-PEER-001"]);
    // Strongly routed canonical truth is selected now, not a dependency added
    // retroactively at preview apply. Its owner brief must already be retained.
    if (truth === "canonical") expect(report.lock.sources.some(source => source.path === f.peerPath)).toBe(true);
    await write(f.root, "preview.json", JSON.stringify(report));
    expect((await applyContextPreview({ root: f.root, previewPath: "preview.json" })).lock).toEqual(report.lock);
    expect((await validateRepository(f.root, { checkIndex: false })).diagnostics.some(d => d.code === "LOCK008")).toBe(false);
  });

  it("blocks an erroneous note of a retained canonical peer before any prospective lock write", async () => {
    const f = await fixture(); await write(f.root, f.peerPath, md("peer-note", { truth_level: "canonical" }));
    const broken = ".agent-context/tasks/T-PEER-001/evidence/broken.md";
    await write(f.root, broken, md("broken-peer", bad));
    const before = await documentManifest(f.root), report = await createTaskWorkingIndex(f.root, f.taskId);
    expect(report.ok).toBe(false); expect(report.relevant_task_ids).toContain("T-PEER-001");
    expect(report.isolated_findings.some(d => d.path === broken)).toBe(false);
    for (const apply of [false, true]) await expect(compileContext({ ...compile(f), workingIndex: true, apply })).rejects.toThrow();
    expect(await documentManifest(f.root)).toEqual(before);
  });

  it.each(["canonical", "design-target", "unknown"])("does not isolate a peer %s authority claim", async truth => {
    const f = await fixture(); await write(f.root, f.peerPath, md("peer-note", { truth_level: truth, ...bad }));
    const before = await documentManifest(f.root), report = await createTaskWorkingIndex(f.root, f.taskId);
    expect(report.ok).toBe(false); expect(report.blocking_findings.some(d => d.path === f.peerPath)).toBe(true);
    expect(report.excluded_documents.some(d => d.path === f.peerPath)).toBe(false);
    expect(await documentManifest(f.root)).toEqual(before);
  });

  it.each(["own", "shared"])("does not isolate %s document errors", async owner => {
    const f = await fixture(), relative = owner === "own" ? `.agent-context/tasks/${f.taskId}/evidence/own.md` : "docs/canontrail/shared.md";
    await write(f.root, relative, md("blocking-note", bad));
    const report = await createTaskWorkingIndex(f.root, f.taskId);
    expect(report.ok).toBe(false); expect(report.blocking_findings.some(d => d.path === relative)).toBe(true);
  });

  it.each(["# No header\n", "---\ntruth_level: [draft\n---\n# Broken YAML\n"])("keeps unparsed/unknown peer headers blocking: %j", async content => {
    const f = await fixture(); await write(f.root, f.peerPath, content);
    const report = await createTaskWorkingIndex(f.root, f.taskId);
    expect(report.ok).toBe(false); expect(report.blocking_findings.some(d => d.code === "DOC002")).toBe(true);
  });

  it.each(["dependencies", "file_intents", "required_context_sources", "check-evidence", "metadata"])("retains a peer reached via %s", async route => {
    const f = await fixture(); await write(f.root, f.peerPath, md("peer-note", bad));
    if (route === "dependencies") await state(f.root, f.taskId, { dependencies: ["T-PEER-001"] });
    if (route === "file_intents" || route === "required_context_sources") await state(f.root, f.taskId, { [route]: [f.peerPath] });
    if (route === "check-evidence") await state(f.root, f.taskId, { checks: [{ id: "CHECK-PEER", command_or_observation: "Inspect peer evidence", status: "pending", evidence_refs: [f.peerPath] }] });
    if (route === "metadata") await write(f.root, "docs/canontrail/shared.md", md("shared-rules", { truth_level: "canonical", verification: { state: "unverified", evidence: [f.peerPath + "#proof"] } }));
    const report = await createTaskWorkingIndex(f.root, f.taskId);
    expect(report.ok).toBe(false); expect(report.relevant_task_ids).toContain("T-PEER-001");
    expect(report.isolated_findings.some(d => d.path === f.peerPath)).toBe(false);
  });

  it("closes transitive document dependencies but ignores task identifiers in prose", async () => {
    const f = await fixture(), third = await peer(f.root, "T-THIRD-001");
    await write(f.root, third, md("third-note", bad));
    await write(f.root, f.peerPath, md("peer-note", { verification: { state: "unverified", evidence: [third] } }));
    await state(f.root, f.taskId, { dependencies: ["T-PEER-001"] });
    const linked = await createTaskWorkingIndex(f.root, f.taskId);
    expect(linked.ok).toBe(false); expect(linked.relevant_task_ids).toContain("T-THIRD-001");
    await state(f.root, f.taskId, { dependencies: [], objective: "Inspect this source; T-PEER-001 is only narrative context" });
    const unrelated = await createTaskWorkingIndex(f.root, f.taskId);
    expect(unrelated.ok, formatTaskWorkingIndex(unrelated)).toBe(true);
    expect(unrelated.relevant_task_ids).toEqual([f.taskId]);
  });

  it.each(["unsafe-reference", "structured-corruption", "global-identity"])("retains %s findings even when peer note headers are isolatable", async kind => {
    const f = await fixture(); await write(f.root, f.peerPath, md("peer-note", bad));
    if (kind === "unsafe-reference") await write(f.root, f.peerPath, md("peer-note", { verification: { state: "unverified", evidence: ["../../outside.txt"] } }));
    if (kind === "structured-corruption") await state(f.root, "T-PEER-001", { status: "not-a-task-status" });
    if (kind === "global-identity") {
      await write(f.root, f.peerPath, md("peer-note", { artifact_id: "duplicate-identity", ...bad }));
      await write(f.root, `.agent-context/tasks/T-PEER-001/evidence/duplicate.md`, md("second-note", { artifact_id: "duplicate-identity" }));
    }
    const report = await createTaskWorkingIndex(f.root, f.taskId);
    expect(report.ok).toBe(false); expect(report.blocking_findings.length).toBeGreaterThan(0);
  });

  it("rejects uncertain physical scope and never writes through links or hardlinks", async () => {
    const f = await fixture(), alias = path.join(f.root, "linked-docs");
    await symlink(path.join(f.root, "docs"), alias, process.platform === "win32" ? "junction" : "dir");
    let before = await documentManifest(f.root), report = await createTaskWorkingIndex(f.root, f.taskId);
    expect(report.ok).toBe(false); expect(report.blocking_findings.some(d => d.code === "WIDX001")).toBe(true);
    expect(await documentManifest(f.root)).toEqual(before); await rm(alias);
    const linked = path.join(f.root, ".agent-context/tasks/T-PEER-001/evidence/second.md");
    await link(path.join(f.root, f.peerPath), linked); before = await documentManifest(f.root);
    report = await createTaskWorkingIndex(f.root, f.taskId); expect(report.ok).toBe(false);
    expect(report.fallback_reason).toContain("multiply linked"); expect(await documentManifest(f.root)).toEqual(before);
  });

  it("rejects undecodable governed bytes instead of hashing lossy text", async () => {
    const f = await fixture(); await writeFile(path.join(f.root, f.peerPath), Buffer.from([0xff, 0xfe, 0x41]));
    const report = await createTaskWorkingIndex(f.root, f.taskId);
    expect(report.ok).toBe(false); expect(report.blocking_findings.some(d => d.code === "WIDX001")).toBe(true);
  });

  it("uses actual opt-in CLI flags without modifying the global index and preserves strict commands", async () => {
    const f = await fixture(), cli = path.resolve("dist/cli.js");
    await write(f.root, f.peerPath, md("peer-note", bad)); const before = await documentManifest(f.root);
    const view = JSON.parse((await run(process.execPath, [cli, "index", f.root, "--task", f.taskId, "--json"], { windowsHide: true })).stdout);
    expect(view.ok).toBe(true); expect(view.index_written).toBe(false);
    const context = JSON.parse((await run(process.execPath, [cli, "context", "compile", f.root, "--task", f.taskId, "--working-index", "--total-tokens", "48000", "--reserve-output", "8000", "--json"], { windowsHide: true })).stdout);
    expect(context.lock.context_index_scope).toBe("task-working"); expect(context.working_index.repository_preflight.ok).toBe(false);
    for (const args of [["index", f.root], ["validate", f.root], ["finalize", f.root]]) {
      await expect(run(process.execPath, [cli, ...args], { windowsHide: true })).rejects.toMatchObject({ code: 1 });
    }
    expect(await documentManifest(f.root)).toEqual(before);
  }, 30000);

  it("executes both checked-in working-view example commands as read-only proposals", async () => {
    const f = await fixture(), cli = path.resolve("dist/cli.js");
    await write(f.root, f.peerPath, md("peer-note", bad));
    const example = await readFile(path.resolve("examples/task-working-index/README.md"), "utf8");
    const commands = example.split("\n").filter(line => line.startsWith("node <CANONTRAIL_HOME>/dist/cli.js "));
    expect(commands).toHaveLength(2); const before = await documentManifest(f.root);
    for (const command of commands) {
      const args = command.trim().split(/\s+/).slice(1).map(token => token === "<CANONTRAIL_HOME>/dist/cli.js" ? cli
        : token === "<PROJECT>" ? f.root : token === "T-DOCUMENT-001" ? f.taskId : token);
      const report = JSON.parse((await run(process.execPath, args, { windowsHide: true })).stdout);
      if (report.validation_scope) expect(report.ok).toBe(true);
      else expect(report.lock.context_index_scope).toBe("task-working");
    }
    expect(await documentManifest(f.root)).toEqual(before);
  });

  it("binds working exclusions and returns a scoped hash distinct from global/default locks", async () => {
    const f = await fixture(), ordinary = await compileContext(compile(f));
    expect(ordinary.lock.context_index_scope).toBeUndefined(); expect(ordinary.working_index).toBeUndefined();
    const scoped = await compileContext({ ...compile(f), workingIndex: true });
    expect(scoped.lock.context_index_scope).toBe("task-working"); expect(scoped.lock.context_index_hash).not.toBe(ordinary.lock.context_index_hash);
    expect(scoped.lock.sources.some(s => s.path === f.peerPath)).toBe(false);
    await write(f.root, f.peerPath, md("peer-note") + "\nA peer-only change.\n");
    const changed = await compileContext({ ...compile(f), workingIndex: true });
    expect(changed.lock.context_index_hash).not.toBe(scoped.lock.context_index_hash);
    await rm(path.join(f.root, ".agent-context/context-index.json"));
    expect((await compileContext({ ...compile(f), workingIndex: true })).lock.context_index_scope).toBe("task-working");
    await expect(compileContext(compile(f))).rejects.toThrow();
  });

  it.each(["absent", "permissive-absent", "wrong-constant"])("requires explicit compatible installed schema support: %s", async kind => {
    const f = await fixture(), schemaPath = path.join(f.root, ".agent-context/schemas/context-lock.schema.json");
    const schema = JSON.parse(await readFile(schemaPath, "utf8"));
    if (kind === "wrong-constant") schema.properties.context_index_scope = { const: "wrong-mode" };
    else delete schema.properties.context_index_scope;
    if (kind === "permissive-absent") schema.additionalProperties = true;
    await writeFile(schemaPath, JSON.stringify(schema)); const before = await documentManifest(f.root);
    for (const apply of [false, true]) await expect(compileContext({ ...compile(f), workingIndex: true, apply })).rejects.toThrow(/schema/i);
    expect(await documentManifest(f.root)).toEqual(before);
  });

  it("revalidates saved previews and rejects rehashed mode removal or a newly real peer dependency before writes", async () => {
    const f = await fixture(); await write(f.root, f.peerPath, md("peer-note", bad));
    const report = await compileContext({ ...compile(f), workingIndex: true });
    await write(f.root, "preview.json", JSON.stringify(report));
    const applied = await applyContextPreview({ root: f.root, previewPath: "preview.json" });
    expect(applied.lock).toEqual(report.lock);
    const forged = structuredClone(report); delete forged.lock.context_index_scope;
    const { lock_hash: _hash, ...payload } = forged.lock; forged.lock.lock_hash = computeContextLockHash(payload);
    await write(f.root, "forged.json", JSON.stringify(forged)); let before = await documentManifest(f.root);
    await expect(applyContextPreview({ root: f.root, previewPath: "forged.json" })).rejects.toThrow(/index/);
    expect(await documentManifest(f.root)).toEqual(before);
    await state(f.root, f.taskId, { dependencies: ["T-PEER-001"] }); before = await documentManifest(f.root);
    await expect(applyContextPreview({ root: f.root, previewPath: "preview.json" })).rejects.toThrow();
    expect(await documentManifest(f.root)).toEqual(before);
  });

  it("rejects a saved preview when excluded peer bytes changed, without relabeling them required", async () => {
    const f = await fixture(), report = await compileContext({ ...compile(f), workingIndex: true });
    await write(f.root, "preview.json", JSON.stringify(report));
    await write(f.root, f.peerPath, "\uFEFF" + md("peer-note").replace(/\n/g, "\r\n"));
    const before = await documentManifest(f.root);
    await expect(applyContextPreview({ root: f.root, previewPath: "preview.json" })).rejects.toThrow("stale context index");
    const fresh = await compileContext({ ...compile(f), workingIndex: true });
    expect(fresh.working_index?.relevant_task_ids).toEqual([f.taskId]);
    expect(await documentManifest(f.root)).toEqual(before);
  });

  it("keeps current scoped-source drift and raw peer schema errors visible to strict validation", async () => {
    const f = await fixture(); await write(f.root, f.peerPath, md("peer-note", bad));
    await compileContext({ ...compile(f), workingIndex: true, apply: true });
    let report = await validateRepository(f.root, { checkIndex: false });
    expect(report.diagnostics.some(d => d.code === "LOCK008")).toBe(false);
    expect(report.diagnostics.some(d => d.code === "SCHEMA005" && d.path === f.peerPath)).toBe(true);
    await state(f.root, f.taskId, { objective: "Inspect changed source revision safely" });
    report = await validateRepository(f.root, { checkIndex: false });
    expect(report.diagnostics.some(d => d.code === "LOCK004" && d.path?.includes(f.taskId))).toBe(true);
  });

  it.each([
    ["unknown-mode", "LOCK010"], ["self-hash", "LOCK007"], ["budget-overflow", "LOCK001"],
    ["duplicates", "LOCK002"], ["required-omission", "LOCK005"], ["wrong-owner", "LOCK008"],
  ])("retains static peer-lock integrity for %s in working orientation", async (kind, code) => {
    const f = await fixture(), initial = await compileContext(compile(f));
    const lock = structuredClone(initial.lock) as unknown as Record<string, unknown>;
    lock.task_id = "T-PEER-001"; lock.sources = []; lock.omissions = [];
    lock.budget = { ...initial.lock.budget, estimated_input_tokens: 0 };
    if (kind === "unknown-mode") { await oldPermissiveSchema(f.root); lock.context_index_scope = "unsupported-mode"; }
    if (kind === "budget-overflow") lock.budget = { ...lock.budget as object, total_tokens: 1000 };
    if (kind === "duplicates") {
      const source = initial.lock.sources[0]!; lock.sources = [source, source];
      lock.budget = { ...lock.budget as object, estimated_input_tokens: source.estimated_tokens * 2 };
    }
    if (kind === "required-omission") lock.omissions = [{ candidate: "required.md", reason: "Synthetic omitted requirement", required: true }];
    if (kind === "wrong-owner") lock.task_id = "T-OTHER-001";
    const { lock_hash: _ignored, ...payload } = lock;
    lock.lock_hash = kind === "self-hash" ? "sha256:" + "0".repeat(64) : computeContextLockHash(payload as never);
    const lockPath = ".agent-context/tasks/T-PEER-001/context.lock.json";
    await write(f.root, lockPath, JSON.stringify(lock));
    await write(f.root, f.peerPath, md("peer-note", bad));
    const before = await documentManifest(f.root), report = await createTaskWorkingIndex(f.root, f.taskId);
    expect(report.ok).toBe(false);
    expect(report.repository_preflight.diagnostics.some(d => d.code === code && d.path === lockPath)).toBe(true);
    expect(report.blocking_findings.some(d => d.code === code && d.path === lockPath)).toBe(true);
    expect(await documentManifest(f.root)).toEqual(before);
  });

  it.each(["missing/unsafe\\source.md", "C:missing.md", "missing/escape\u001b.md", "../outside.md",
    "/absolute.md", "missing//source.md", "missing/./source.md"])(
    "retains exact active source-path grammar before freshness skip for %j", async sourcePath => {
      const f = await fixture(), lockPath = ".agent-context/tasks/T-PEER-001/context.lock.json";
      await write(f.root, "src/extra.ts", "export const extra = true;\n");
      const initial = await compileContext({ ...compile({ root: f.root, taskId: "T-PEER-001" }),
        includePaths: ["src/extra.ts"], apply: true });
      expect((await validateRepository(f.root, { checkIndex: false })).diagnostics.filter(d => d.severity === "error")).toEqual([]);
      const lock = structuredClone(initial.lock), source = lock.sources.find(entry => entry.path === "src/extra.ts")!;
      source.path = sourcePath;
      const { lock_hash: _ignored, ...payload } = lock; lock.lock_hash = computeContextLockHash(payload);
      await write(f.root, lockPath, JSON.stringify(lock));
      const before = await documentManifest(f.root), view = await createTaskWorkingIndex(f.root, f.taskId);
      const code = sourcePath.includes("\\") ? "REF002" : "LOCK003";
      expect(view.ok).toBe(false);
      expect(view.repository_preflight.diagnostics).toContainEqual(expect.objectContaining({ code, path: lockPath }));
      expect(view.blocking_findings).toContainEqual(expect.objectContaining({ code, path: lockPath }));
      expect(view.isolated_findings).toEqual([]);
      expect((await validateRepository(f.root, { checkIndex: false })).diagnostics)
        .toContainEqual(expect.objectContaining({ code, path: lockPath }));
      expect(await documentManifest(f.root)).toEqual(before);
    });

  it("skips only missing-file freshness for a grammatically valid active source", async () => {
    const f = await fixture(), lockPath = ".agent-context/tasks/T-PEER-001/context.lock.json";
    await write(f.root, "src/extra.ts", "export const extra = true;\n");
    const initial = await compileContext({ ...compile({ root: f.root, taskId: "T-PEER-001" }),
      includePaths: ["src/extra.ts"], apply: true });
    const lock = structuredClone(initial.lock); lock.sources.find(entry => entry.path === "src/extra.ts")!.path = "src/missing.ts";
    const { lock_hash: _ignored, ...payload } = lock; lock.lock_hash = computeContextLockHash(payload);
    await write(f.root, lockPath, JSON.stringify(lock));
    const before = await documentManifest(f.root), view = await createTaskWorkingIndex(f.root, f.taskId);
    expect(view.ok, formatTaskWorkingIndex(view)).toBe(true);
    expect(view.repository_preflight.diagnostics).toEqual([]);
    expect((await validateRepository(f.root, { checkIndex: false })).diagnostics)
      .toContainEqual(expect.objectContaining({ code: "LOCK003", path: lockPath }));
    expect(await documentManifest(f.root)).toEqual(before);
  });

  it("skips current source freshness, not integrity, while preserving strict stale-source failures", async () => {
    const f = await fixture(); await compileContext({ ...compile(f), workingIndex: true, apply: true });
    await state(f.root, f.taskId, { objective: "Inspect a changed bounded source revision" });
    const before = await documentManifest(f.root), view = await createTaskWorkingIndex(f.root, f.taskId);
    expect(view.ok, formatTaskWorkingIndex(view)).toBe(true);
    expect(view.repository_preflight.diagnostics.some(d => d.code === "LOCK004")).toBe(false);
    expect((await validateRepository(f.root, { checkIndex: false })).diagnostics.some(d => d.code === "LOCK004")).toBe(true);
    const fresh = await compileContext({ ...compile(f), workingIndex: true });
    const previous = JSON.parse(await readFile(path.join(f.root, `.agent-context/tasks/${f.taskId}/context.lock.json`), "utf8"));
    expect(fresh.lock.sources.find(source => source.path.endsWith("/state.yaml"))?.content_hash)
      .not.toBe(previous.sources.find((source: {path: string}) => source.path.endsWith("/state.yaml")).content_hash);
    expect(await documentManifest(f.root)).toEqual(before);
  });

  it("hands off scoped context and reconstructs a fresh receiving mode without hiding current-use failures", async () => {
    const f = await fixture(); await write(f.root, f.peerPath, md("peer-note", bad));
    await run("git", ["init"], { cwd: f.root, windowsHide: true });
    await run("git", ["config", "user.name", "Fixture author"], { cwd: f.root, windowsHide: true });
    await run("git", ["config", "user.email", "fixture@example.invalid"], { cwd: f.root, windowsHide: true });
    await run("git", ["add", "."], { cwd: f.root, windowsHide: true });
    await run("git", ["commit", "-m", "fixture"], { cwd: f.root, windowsHide: true });
    await compileContext({ ...compile(f), workingIndex: true, apply: true });
    const handoff = await createHandoff({ root: f.root, taskId: f.taskId, sourceSessionId: "source-session", createdAt: stamp,
      nextSafeAction: "Read the bounded task note, keep peer defects visible and perform its focused check.", apply: true });
    const preserved = await readFile(path.join(f.root, handoff.source_context_archive_path));
    await state(f.root, f.taskId, { latest_handoff: handoff.output_path });
    const before = await documentManifest(f.root);
    const options = { root: f.root, taskId: f.taskId, receivingSessionId: "fresh-session", createdAt: stamp, totalTokens: 48000, reservedOutputTokens: 8000 };
    const preview = await createResumePacket(options);
    expect(preview.context_lock.context_index_scope).toBe("task-working"); expect(await documentManifest(f.root)).toEqual(before);
    const receiving = await createResumePacket({ ...options, apply: true });
    expect((await validateResumePacketAt(f.root, receiving.packet_path)).ok).toBe(true);
    expect((await validateRepository(f.root)).ok).toBe(false);
    expect(await readFile(path.join(f.root, handoff.source_context_archive_path))).toEqual(preserved);
    await state(f.root, f.taskId, { dependencies: ["T-PEER-001"] });
    expect((await validateResumePacketAt(f.root, receiving.packet_path)).ok).toBe(false);
  }, 30000);

  it("keeps known scoped receipts as history but refuses current use without explicit installed capability", async () => {
    const f = await receivingFixture();
    expect((await validateResumePacketAt(f.root, f.receiving.packet_path)).ok).toBe(true);
    await oldPermissiveSchema(f.root); const before = await documentManifest(f.root);
    const retained = await validateRepository(f.root, { checkIndex: false, checkContextLocks: false });
    expect(retained.diagnostics.some(d => d.path === f.receiving.packet_path && d.code.startsWith("RESUME"))).toBe(false);
    const current = await validateResumePacketAt(f.root, f.receiving.packet_path);
    expect(current.ok).toBe(false);
    expect(current.diagnostics.some(d => d.code === "RESUME010" && d.detail?.includes("does not support task working indexes"))).toBe(true);
    const active = await validateRepository(f.root, { checkIndex: false });
    expect(active.diagnostics.some(d => d.code === "LOCK008" && d.detail?.includes("does not support task working indexes"))).toBe(true);
    const orientation = await createTaskWorkingIndex(f.root, f.taskId);
    expect(orientation.ok).toBe(false);
    expect(orientation.blocking_findings.some(d => d.code === "LOCK008" && d.detail?.includes("does not support task working indexes"))).toBe(true);
    expect(await documentManifest(f.root)).toEqual(before);
  }, 30000);

  it("rejects fully rehashed unknown receiving modes through an older permissive schema", async () => {
    const f = await receivingFixture(); await oldPermissiveSchema(f.root);
    const lock = structuredClone(f.receiving.context_lock) as unknown as Record<string, unknown>;
    lock.context_index_scope = "unsupported-mode";
    const { lock_hash: _lockHash, ...payload } = lock; lock.lock_hash = computeContextLockHash(payload as never);
    const archivePath = `.agent-context/tasks/${f.taskId}/evidence/context-locks/${String(lock.lock_hash).slice(7)}.json`;
    await write(f.root, archivePath, JSON.stringify(lock));
    const packet = { ...f.receiving.packet, receiving_context_lock_path: archivePath, receiving_context_lock_hash: String(lock.lock_hash) };
    const { packet_hash: _packetHash, ...packetPayload } = packet;
    packet.packet_hash = computeResumePacketHash(packetPayload);
    const packetPath = `.agent-context/tasks/${f.taskId}/evidence/resume-packets/${packet.packet_hash.slice(7)}.resume.packet.json`;
    await write(f.root, packetPath, JSON.stringify(packet));
    const activePath = `.agent-context/tasks/${f.taskId}/context.lock.json`;
    await write(f.root, activePath, JSON.stringify(lock)); const before = await documentManifest(f.root);
    const current = await validateResumePacketAt(f.root, packetPath);
    expect(current.ok).toBe(false); expect(current.diagnostics.some(d => d.code === "RESUME007" && d.detail?.includes("Unsupported context_index_scope"))).toBe(true);
    const retained = await validateRepository(f.root, { checkIndex: false });
    expect(retained.diagnostics.some(d => d.code === "RESUME007" && d.path === packetPath)).toBe(true);
    expect(retained.diagnostics.some(d => d.code === "LOCK010" && d.path === activePath)).toBe(true);
    await expect(createHandoff({ root: f.root, taskId: f.taskId, sourceSessionId: "unknown-mode",
      nextSafeAction: "Reject unknown source-context mode before any new handoff write.", apply: true, replace: true })).rejects.toThrow("Unsupported context_index_scope");
    expect(await documentManifest(f.root)).toEqual(before);
  }, 30000);
});
