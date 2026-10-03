import { execFile } from "node:child_process";
import { cp, link, mkdir, mkdtemp, readFile, readdir, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { compileContext } from "../src/context.js";
import { computeHandoffHash, createHandoff, serializeHandoff, verifyHandoffForTask, type Handoff } from "../src/handoff.js";
import { generateContextIndex, sha256 } from "../src/indexer.js";
import { createResumePacket } from "../src/resume.js";
import { validateRepository, validateResumePacketAt } from "../src/validator.js";
import { inventoryReference, parseWorktreeInventoryBytes, parseWorktreeStatus, validateWorktreeInventoryShape, verifyWorktreeInventory, type WorktreeInventory } from "../src/worktree-inventory.js";

const roots: string[] = [], taskId = "T-COMPACT", base = `.agent-context/tasks/${taskId}`;
const createdAt = "2026-09-26T12:00:00Z";
const git = async (root: string, args: string[]) => (await promisify(execFile)("git", args, { cwd: root, windowsHide: true })).stdout;
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }); });
function md(topic: string, evidence: string[] = []) {
  return `---\n${stringify({ topic_id: topic, stand: "2026-09-26", status: "current", truth_level: "draft", verification: { state: "unverified", evidence }, read_if_task_touches: [], primary_systems: [], safe_to_edit: ["Synthetic fixture"], do_not_use_instead: [] })}---\n# Fixture\n`;
}
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "ct-compact-")); roots.push(root);
  await cp(path.resolve("schemas"), path.join(root, "schemas"), { recursive: true });
  await mkdir(path.join(root, base), { recursive: true }); await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, ".agent-context/config.yaml"), stringify({ version: 1, schema_path: "schemas", index_path: ".agent-context/context-index.json", governed_paths: ["."], exclude_paths: [".git"], require_frontmatter_for_all_markdown: true, require_topic_id_for_canonical: true, allow_missing_references: [] }));
  await writeFile(path.join(root, "AGENTS.md"), md("agent"));
  await writeFile(path.join(root, base, "state.yaml"), stringify({ task_id: taskId, status: "in-progress", objective: "Change one bounded synthetic feature", acceptance_criteria: [{ id: "AC", statement: "Preserve unrelated changes", verification: "hash and inventory assertions", status: "pending" }], dependencies: [], required_context_sources: ["src/feature.ts"], file_intents: ["src/new.ts"], checks: [] }));
  await writeFile(path.join(root, "src/feature.ts"), "export const feature = true;\n");
  await generateContextIndex(root); await git(root, ["init", "-q"]);
  await compileContext({ root, taskId, totalTokens: 16000, reservedOutputTokens: 2000, apply: true });
  await git(root, ["add", "."]);
  await git(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "synthetic baseline"]);
  const options = { root, taskId, sourceSessionId: "source", createdAt, nextSafeAction: "Read the selected feature source and add its focused regression test before further edits." };
  const resume = (session = "receiver", apply = true) => createResumePacket({ root, taskId, receivingSessionId: session, totalTokens: 16000, reservedOutputTokens: 2000, apply });
  return { root, options, resume };
}
const audit = (root: string) => validateRepository(root, { checkIndex: false, checkContextLocks: false });
function rehash(handoff: Handoff) { const { handoff_hash: _, ...payload } = handoff; handoff.handoff_hash = computeHandoffHash(payload); }

describe("compact worktree provenance", () => {
  it("keeps the worked example's raw-byte inventory contract reproducible", async () => {
    const bytes = await readFile("examples/compact-handoff/inventory.fixture.json", "utf8"), value: unknown = JSON.parse(bytes);
    validateWorktreeInventoryShape(value);
    expect(parseWorktreeInventoryBytes(Buffer.from(bytes))).toEqual(value);
    const ref = inventoryReference(value, bytes);
    expect(ref).toEqual({ path: `.agent-context/tasks/T-EXAMPLE/evidence/worktree-inventories/${sha256(Buffer.from(bytes)).slice(7)}.worktree-inventory.json`, content_hash: sha256(Buffer.from(bytes)), entry_count: 2 });
  });
  it("keeps 900 unrelated entries completely inspectable but out of the receiving context", async () => {
    const f = await fixture(); await mkdir(path.join(f.root, "peer"));
    const names = Array.from({ length: 900 }, (_, i) => `peer/other-task-long-artifact-name-${String(i).padStart(4, "0")}.txt`);
    await Promise.all(names.map(name => writeFile(path.join(f.root, name), "unchanged peer data\n")));
    await writeFile(path.join(f.root, "src/feature.ts"), "export const feature = false;\n");
    await writeFile(path.join(f.root, "src/new.ts"), "export const addition = true;\n");
    await compileContext({ root: f.root, taskId, totalTokens: 16000, reservedOutputTokens: 2000, apply: true });
    const before = await git(f.root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
    const dry = await createHandoff(f.options);
    expect((await readdir(path.join(f.root, base))).includes("evidence")).toBe(false);
    expect(await git(f.root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])).toBe(before);
    const applied = await createHandoff({ ...f.options, apply: true });
    expect(applied.handoff).toEqual(dry.handoff);
    const ref = applied.handoff.worktree_inventory!, raw = await readFile(path.join(f.root, ref.path));
    const inventory = JSON.parse(raw.toString()) as WorktreeInventory;
    expect(sha256(raw)).toBe(ref.content_hash); expect(ref.entry_count).toBe(903); // Includes refreshed active context.
    const observed = before.split("\0").filter(Boolean).map(item => ({ code: item.slice(0, 2), path: item.slice(3) })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    expect(inventory.entries).toEqual(observed);
    expect(applied.handoff.files.map(file => file.path)).toEqual(["src/feature.ts", "src/new.ts"]);
    expect(applied.handoff.uncommitted_summary).not.toContain(names[0]);
    const compactBytes = Buffer.byteLength(serializeHandoff(applied.handoff));
    const legacyShape = { ...applied.handoff, files: inventory.entries.map(entry => ({ path: entry.path, state: "modified", summary: `Git status ${entry.code} before handoff.` })), uncommitted_summary: inventory.entries.map(entry => `${entry.code} ${entry.path}`).join("; ") } as Handoff;
    delete legacyShape.worktree_inventory;
    expect(Buffer.byteLength(serializeHandoff(legacyShape))).toBeGreaterThan(compactBytes * 20);
    const packet = await f.resume();
    expect(packet.context_lock.sources.some(source => source.path === ref.path)).toBe(false);
    expect(packet.context_lock.sources.find(source => source.path === `${base}/handoff.yaml`)!.estimated_tokens).toBe(Math.ceil(compactBytes / 4));
    expect((await validateResumePacketAt(f.root, packet.packet_path)).ok).toBe(true);
    expect(await readFile(path.join(f.root, names[100]!), "utf8")).toBe("unchanged peer data\n");
    console.info(JSON.stringify({ fixture: "900-unrelated-dirty-entries", inventory_entries: ref.entry_count, inventory_bytes: raw.byteLength,
      compact_handoff_bytes: compactBytes, legacy_shaped_handoff_bytes: Buffer.byteLength(serializeHandoff(legacyShape)),
      receiving_estimated_input_tokens: packet.context_lock.budget.estimated_input_tokens, provider_tokens_measured: false }));
  });

  it("preserves exact rename/copy paths, staged states and non-ASCII names without dereferencing them", () => {
    const entries = parseWorktreeStatus("R  src/new name.ts\0src/old name.ts\0?? peer/Änderung\n\\literal.txt\0 D gone.ts\0C  copy.ts\0original.ts\0");
    expect(entries).toContainEqual({ code: "R ", path: "src/new name.ts", original_path: "src/old name.ts" });
    expect(entries).toContainEqual({ code: "C ", path: "copy.ts", original_path: "original.ts" });
    expect(entries).toContainEqual({ code: "??", path: "peer/Änderung\n\\literal.txt" });
    validateWorktreeInventoryShape({ version: 1, task_id: taskId, created_at: createdAt, entries });
  });

  it.each(["R  target\0", "?? x", "?? x\0?? x\0", "  x\0", "?? \0"])("rejects incomplete/ambiguous Git output %j", input => {
    expect(() => parseWorktreeStatus(input)).toThrow();
  });

  it("keeps explicit semantic notes and records a real staged rename from a selected old path", async () => {
    const f = await fixture(); await git(f.root, ["mv", "src/feature.ts", "src/renamed.ts"]);
    const statePath = path.join(f.root, base, "state.yaml"), state = parse(await readFile(statePath, "utf8"));
    state.required_context_sources = ["src/renamed.ts"];
    state.file_intents.push("src/feature.ts"); // Preserve the reviewed old-path intent across the rename.
    await writeFile(statePath, stringify(state));
    await compileContext({ root: f.root, taskId, totalTokens: 16000, reservedOutputTokens: 2000, apply: true });
    const input = `${base}/input.yaml`, note = "Explicit relevant semantic detail. ".repeat(100);
    await writeFile(path.join(f.root, input), stringify({ files: [{ path: "peer/explained.ts", state: "inspected", summary: note }], uncommitted_summary: note }));
    const result = await createHandoff({ ...f.options, inputPath: input, apply: true });
    expect(result.handoff.files.find(file => file.path === "src/renamed.ts")!.summary).toContain("src/feature.ts");
    expect(result.handoff.files.find(file => file.path === "peer/explained.ts")!.summary).toBe(note);
    expect(result.handoff.uncommitted_summary).toBe(note);
    expect(await verifyWorktreeInventory(f.root, result.handoff as unknown as Record<string, unknown>)).toBeDefined();
  });

  it.each(["missing", "tampered", "wrong-count", "wrong-owner", "wrong-path", "missing-schema"])("rejects %s provenance on every active consumption path without replacing output", async mode => {
    const f = await fixture(); const h = await createHandoff({ ...f.options, apply: true }); const packet = await f.resume();
    const handoff = h.handoff, ref = handoff.worktree_inventory!, hp = path.join(f.root, base, "handoff.yaml");
    const activeBefore = await readFile(path.join(f.root, base, "context.lock.json"));
    if (mode === "missing") await unlink(path.join(f.root, ref.path));
    if (mode === "tampered") await writeFile(path.join(f.root, ref.path), "{}\n");
    if (mode === "wrong-count") ref.entry_count++;
    if (mode === "wrong-owner") ref.path = ref.path.replace(taskId, "T-OTHER");
    if (mode === "wrong-path") ref.path = ref.path.replace("/evidence/", "/evidence/../evidence/");
    if (mode === "missing-schema") await unlink(path.join(f.root, "schemas/worktree-inventory.schema.json"));
    rehash(handoff); await writeFile(hp, serializeHandoff(handoff));
    const handoffBefore = await readFile(hp);
    expect((await audit(f.root)).ok).toBe(false);
    expect((await validateResumePacketAt(f.root, packet.packet_path)).ok).toBe(false);
    await expect(f.resume("rejected")).rejects.toThrow();
    await expect(createHandoff({ ...f.options, replace: true, apply: true })).rejects.toThrow();
    expect(await readFile(hp)).toEqual(handoffBefore);
    expect(await readFile(path.join(f.root, base, "context.lock.json"))).toEqual(activeBefore);
  });

  it.each(["handoff", "worktree-inventory"])("requires compatible installed %s schema before creating any archives", async name => {
    const f = await fixture();
    if (name === "handoff") {
      const p = path.join(f.root, "schemas/handoff.schema.json"), schema = JSON.parse(await readFile(p, "utf8"));
      delete schema.properties.worktree_inventory; schema.additionalProperties = true; await writeFile(p, JSON.stringify(schema));
    } else await unlink(path.join(f.root, "schemas/worktree-inventory.schema.json"));
    const before = await readFile(path.join(f.root, base, "context.lock.json"));
    await expect(createHandoff({ ...f.options, apply: true })).rejects.toThrow(/schema/);
    expect((await readdir(path.join(f.root, base))).sort()).toEqual(["context.lock.json", "state.yaml"]);
    expect(await readFile(path.join(f.root, base, "context.lock.json"))).toEqual(before);
  });

  it("validates legacy inline handoffs without needing a new inventory schema or rewriting them", async () => {
    const f = await fixture(), result = await createHandoff({ ...f.options, apply: true });
    const handoff = result.handoff; delete handoff.worktree_inventory; rehash(handoff);
    await writeFile(path.join(f.root, base, "handoff.yaml"), serializeHandoff(handoff));
    await rm(path.join(f.root, base, "evidence/worktree-inventories"), { recursive: true });
    await unlink(path.join(f.root, "schemas/worktree-inventory.schema.json"));
    const before = await readFile(path.join(f.root, base, "handoff.yaml"));
    await verifyHandoffForTask(f.root, taskId, handoff as unknown as Record<string, unknown>);
    expect((await audit(f.root)).ok).toBe(true);
    const packet = await f.resume(); expect((await validateResumePacketAt(f.root, packet.packet_path)).ok).toBe(true);
    expect(await readFile(path.join(f.root, base, "handoff.yaml"))).toEqual(before);
  });

  it("retains old inventory through handoff replacement and rejects loss even without latest pointing to it", async () => {
    const f = await fixture(), first = await createHandoff({ ...f.options, apply: true }), a = await f.resume("A");
    const before = await readFile(path.join(f.root, first.handoff.worktree_inventory!.path));
    await createHandoff({ ...f.options, sourceSessionId: "next", createdAt: "2026-09-26T13:00:00Z", replace: true, apply: true });
    expect((await audit(f.root)).ok).toBe(true);
    expect(await readFile(path.join(f.root, first.handoff.worktree_inventory!.path))).toEqual(before);
    await unlink(path.join(f.root, first.handoff.worktree_inventory!.path));
    const findings = (await audit(f.root)).diagnostics;
    expect(findings.some(finding => finding.path === a.packet_path && finding.code === "RESUME006")).toBe(true);
  });

  it.each(["task", "timestamp", "dirty", "unsorted", "duplicate", "unknown-field"])("rejects consistently rehashed inventory %s divergence", async mode => {
    const f = await fixture(), result = await createHandoff({ ...f.options, apply: true });
    const handoff = result.handoff, original = handoff.worktree_inventory!;
    const value = JSON.parse(await readFile(path.join(f.root, original.path), "utf8")) as WorktreeInventory;
    if (mode === "task") value.task_id = "T-OTHER";
    if (mode === "timestamp") value.created_at = "2026-09-26T14:00:00Z";
    if (mode === "dirty") value.entries = [{ code: "??", path: "new.txt" }];
    if (mode === "unsorted") value.entries = [{ code: "??", path: "z.txt" }, { code: "??", path: "a.txt" }];
    if (mode === "duplicate") value.entries = [{ code: "??", path: "a.txt" }, { code: " M", path: "a.txt" }];
    if (mode === "unknown-field") (value as unknown as Record<string, unknown>).hidden_override = true;
    // Keep serialization valid so this tests the intended semantic binding,
    // not an earlier rejection by the stricter byte-format reader.
    const bytes = JSON.stringify(value, null, 2) + "\n", hash = sha256(Buffer.from(bytes));
    handoff.worktree_inventory = { path: `${base}/evidence/worktree-inventories/${hash.slice(7)}.worktree-inventory.json`, content_hash: hash, entry_count: value.entries.length };
    await writeFile(path.join(f.root, handoff.worktree_inventory.path), bytes); rehash(handoff);
    await writeFile(path.join(f.root, base, "handoff.yaml"), serializeHandoff(handoff));
    await expect(verifyHandoffForTask(f.root, taskId, handoff as unknown as Record<string, unknown>)).rejects.toThrow();
    expect((await audit(f.root)).diagnostics.some(d => d.code === "HANDOFF008")).toBe(true);
  });

  it("does not hide missing provenance behind scanner exclusions", async () => {
    const f = await fixture(), h = await createHandoff({ ...f.options, apply: true }), packet = await f.resume();
    const configPath = path.join(f.root, ".agent-context/config.yaml"), config = parse(await readFile(configPath, "utf8"));
    config.exclude_paths.push(`${base}/evidence/worktree-inventories`); await writeFile(configPath, stringify(config));
    await unlink(path.join(f.root, h.handoff.worktree_inventory!.path));
    expect((await audit(f.root)).diagnostics.some(d => d.code === "HANDOFF008")).toBe(true);
    expect((await validateResumePacketAt(f.root, packet.packet_path)).ok).toBe(false);
  });

  it("rejects a hard-linked sidecar even when its bytes match", async () => {
    const f = await fixture(), h = await createHandoff({ ...f.options, apply: true });
    await link(path.join(f.root, h.handoff.worktree_inventory!.path), path.join(f.root, "inventory-alias.json"));
    await expect(verifyHandoffForTask(f.root, taskId, h.handoff as unknown as Record<string, unknown>)).rejects.toThrow(/unlinked regular/);
  });

  it("refuses a linked inventory directory before writing outside its owner", async () => {
    const f = await fixture(), outside = await mkdtemp(path.join(tmpdir(), "ct-inventory-outside-")); roots.push(outside);
    await mkdir(path.join(f.root, base, "evidence"));
    await symlink(outside, path.join(f.root, base, "evidence/worktree-inventories"), process.platform === "win32" ? "junction" : "dir");
    await expect(createHandoff({ ...f.options, apply: true })).rejects.toThrow(/link/);
    expect(await readdir(outside)).toEqual([]);
  });

  it("does not overwrite a hash-named sidecar collision", async () => {
    const f = await fixture(), dry = await createHandoff(f.options), ref = dry.handoff.worktree_inventory!;
    // Keep Git inventory unchanged when adding the controlled collision.
    await writeFile(path.join(f.root, ".git/info/exclude"), `${base}/evidence/\n`);
    await mkdir(path.dirname(path.join(f.root, ref.path)), { recursive: true });
    await writeFile(path.join(f.root, ref.path), "collision\n");
    await expect(createHandoff({ ...f.options, apply: true })).rejects.toThrow(/different content/);
    expect(await readFile(path.join(f.root, ref.path), "utf8")).toBe("collision\n");
    expect((await readdir(path.join(f.root, base))).includes("handoff.yaml")).toBe(false);
  });
});

describe("actionable missing references", () => {
  it("names owner and target and leaves the index unchanged on the real CLI preflight", async () => {
    const f = await fixture(), target = `${base}/evidence/old-render/image.png`;
    await writeFile(path.join(f.root, base, "report.md"), md("missing-evidence", [target]));
    const indexPath = path.join(f.root, ".agent-context/context-index.json"), before = await readFile(indexPath);
    const findings = (await audit(f.root)).diagnostics.filter(finding => finding.code === "REF001");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.path).toBe(`${base}/report.md`);
    expect(findings[0]!.detail).toContain(`task "${taskId}"`);
    expect(findings[0]!.detail).toContain(target);
    expect(findings[0]!.detail).toContain("recompilation cannot restore");
    const cli = await promisify(execFile)(process.execPath, ["--import", "tsx", path.resolve("src/cli.ts"), "index", f.root], { cwd: process.cwd(), windowsHide: true }).catch(error => error as { code: number; stderr: string });
    expect((cli as { code?: number }).code).toBe(1);
    expect(cli.stderr).toContain("Index not written: resolve the missing references");
    expect(await readFile(indexPath)).toEqual(before);
  });
});
