import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { computeContextLockHash, type ContextLock } from "../src/context.js";
import { computeHandoffHash, serializeHandoff, type Handoff } from "../src/handoff.js";
import { generateContextIndex, sha256 } from "../src/indexer.js";
import { validateRepository } from "../src/validator.js";

const exec = promisify(execFile);
const roots: string[] = [];
const taskId = "T-MEMORY-HISTORY", task = `.agent-context/tasks/${taskId}`;
const date = "2026-10-09T12:00:00Z";
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "ct-history-memory-")); roots.push(root);
  await cp(path.resolve("schemas"), path.join(root, "schemas"), { recursive: true });
  await mkdir(path.join(root, task, "evidence/handoffs"), { recursive: true });
  await mkdir(path.join(root, task, "evidence/context-locks"), { recursive: true });
  await writeFile(path.join(root, ".agent-context/config.yaml"), stringify({
    version: 1, index_path: ".agent-context/context-index.json", schema_path: "schemas",
    governed_paths: ["."], exclude_paths: [".git"],
    require_frontmatter_for_all_markdown: true, require_topic_id_for_canonical: true, allow_missing_references: [],
  }));
  await writeFile(path.join(root, "AGENTS.md"), `---\n${stringify({
    topic_id: "synthetic-memory-fixture", stand: "2026-10-09", status: "current",
    truth_level: "draft", verification: { state: "unverified", evidence: [] },
    read_if_task_touches: [], primary_systems: [], safe_to_edit: ["Synthetic fixture only."], do_not_use_instead: [],
  })}---\n# Synthetic history\n`);
  await writeFile(path.join(root, task, "state.yaml"), stringify({
    task_id: taskId, status: "in-progress", objective: "Audit synthetic retained history",
    acceptance_criteria: [{ id: "AC", statement: "Retained history preserves provenance.", verification: "Synthetic tests.", status: "pending" }],
    dependencies: [], file_intents: [], checks: [],
  }));
  const payload: Omit<ContextLock, "lock_hash"> = {
    task_id: taskId, agent_run_id: "historical-source", created_at: date,
    context_index_hash: `sha256:${"0".repeat(64)}`,
    budget: { total_tokens: 1000, reserved_output_tokens: 100, estimated_input_tokens: 0 },
    sources: [], omissions: [], raw_transcripts_included: false,
  };
  const lock = { ...payload, lock_hash: computeContextLockHash(payload) };
  const lockPath = `${task}/evidence/context-locks/${lock.lock_hash.slice(7)}.json`;
  await writeFile(path.join(root, lockPath), JSON.stringify(lock, null, 2) + "\n");
  await generateContextIndex(root);
  function handoff(sequence: number, fileCount = 0): Handoff {
    const payload: Omit<Handoff, "handoff_hash"> = {
      handoff_id: `history-${sequence}`, task_id: taskId, created_at: date,
      source_session_id: "historical-source", source_context_lock_path: lockPath,
      source_context_lock_hash: lock.lock_hash, objective: "Retain exact synthetic history",
      completed: [], decisions: [],
      files: Array.from({ length: fileCount }, (_, i) => ({
        path: `src/historical-${sequence}-${i}.ts`, state: "inspected" as const,
        summary: `Synthetic observation ${sequence}/${i}: ${"x".repeat(128)}`,
      })),
      checks: [], blockers: [], open_questions: [],
      next_safe_action: "Inspect this retained evidence without treating it as current-source approval.",
      do_not_repeat: [], resume_sources: ["AGENTS.md", "src/no-longer-exists.ts"],
      worktree_dirty: fileCount > 0, uncommitted_summary: fileCount > 0 ? "Synthetic historical dirty state." : null,
    };
    return { ...payload, handoff_hash: computeHandoffHash(payload) };
  }
  async function put(h: Handoff) {
    const relative = `${task}/evidence/handoffs/${h.handoff_hash.slice(7)}.yaml`;
    await writeFile(path.join(root, relative), serializeHandoff(h));
    return relative;
  }
  return { root, lockPath, handoff, put };
}

async function constrained(root: string) {
  const code = `import { validateRepository } from "./dist/validator.js";
    const report = await validateRepository(process.argv[1]);
    process.stdout.write(JSON.stringify({ report, peakRSSKiB: process.resourceUsage().maxRSS }));
  `;
  const result = await exec(process.execPath, ["--max-old-space-size=128", "--input-type=module", "--eval", code, root], {
    cwd: path.resolve("."), windowsHide: true, maxBuffer: 4 * 1024 * 1024, timeout: 90000,
  });
  expect(result.stderr).toBe("");
  return JSON.parse(result.stdout) as { report: Awaited<ReturnType<typeof validateRepository>>; peakRSSKiB: number };
}

describe("bounded retained continuity validation", () => {
  it("counts and validates every unbound archive without requiring current historical resume sources", async () => {
    const f = await fixture();
    for (let i = 0; i < 8; i++) await f.put(f.handoff(i, 2));
    const report = await validateRepository(f.root);
    expect(report.diagnostics).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.stats.structuredArtifacts).toBe(9); // state + eight handoffs; source archive is bound provenance.
    expect(report.diagnostics).toEqual([]);
  });

  it("keeps malformed/schema-invalid archives in coverage and detects a bad self-hash", async () => {
    const f = await fixture(), h = f.handoff(1);
    const p = await f.put(h);
    await writeFile(path.join(f.root, p), serializeHandoff({ ...h, completed: ["tampered"] }));
    await writeFile(path.join(f.root, task, "evidence/handoffs", `${"f".repeat(64)}.yaml`), "invalid: [");
    await writeFile(path.join(f.root, task, "evidence/handoffs", `${"e".repeat(64)}.yaml`), "null\n");
    const report = await validateRepository(f.root);
    expect(report.ok).toBe(false);
    expect(report.stats.structuredArtifacts).toBe(3); // state, tampered parseable, null parseable; malformed not counted.
    expect(report.diagnostics.some(d => d.path === p && d.code === "HANDOFF005")).toBe(true);
    expect(report.diagnostics.some(d => d.code === "DOC004")).toBe(true);
    expect(report.diagnostics.some(d => d.code === "SCHEMA005")).toBe(true);
  });

  it("preserves source-context provenance checks for archives not named by a resume packet", async () => {
    const f = await fixture(), p = await f.put(f.handoff(1));
    await writeFile(path.join(f.root, f.lockPath), "{}\n");
    const report = await validateRepository(f.root);
    expect(report.diagnostics.some(d => d.path === p && d.code === "HANDOFF006")).toBe(true);
  });

  it("counts inventory sidecars and independently checks their raw owner/filename bindings", async () => {
    const f = await fixture();
    const inventory = { version: 1, task_id: taskId, created_at: date, entries: [] };
    // Use the actual declared field vocabulary rather than a handoff-only hash.
    const bytes = Buffer.from(JSON.stringify(inventory, null, 2) + "\n");
    const relative = `${task}/evidence/worktree-inventories/${"0".repeat(64)}.worktree-inventory.json`;
    await mkdir(path.dirname(path.join(f.root, relative)), { recursive: true });
    await writeFile(path.join(f.root, relative), bytes);
    const report = await validateRepository(f.root);
    expect(report.stats.structuredArtifacts).toBe(2);
    // Valid inventory bytes with a wrong filename are checked, not silently skipped.
    expect(report.diagnostics.some(d => d.path === relative && d.code === "WORKTREE001")).toBe(true);
  });

  it("checks a valid sidecar and rejects a rehashed handoff pointing at a nonstandard inventory name", async () => {
    const f = await fixture();
    const inventory = { version: 1, task_id: taskId, created_at: date, entries: [] };
    const bytes = Buffer.from(JSON.stringify(inventory, null, 2) + "\n");
    const relative = `${task}/evidence/worktree-inventories/${sha256(bytes).slice(7)}.worktree-inventory.json`;
    await mkdir(path.dirname(path.join(f.root, relative)), { recursive: true });
    await writeFile(path.join(f.root, relative), bytes);
    const { handoff_hash: _ignored, ...base } = f.handoff(1);
    const payload = { ...base, worktree_inventory: { path: relative, content_hash: sha256(bytes), entry_count: 0 } };
    const good = await f.put({ ...payload, handoff_hash: computeHandoffHash(payload) });
    expect((await validateRepository(f.root)).diagnostics).toEqual([]);
    const badPayload = { ...payload, handoff_id: "bad-inventory-name", worktree_inventory: {
      ...payload.worktree_inventory, path: `${task}/evidence/custom-inventory.json`,
    } };
    await writeFile(path.join(f.root, badPayload.worktree_inventory.path), bytes);
    const bad = await f.put({ ...badPayload, handoff_hash: computeHandoffHash(badPayload) });
    const report = await validateRepository(f.root);
    expect(report.stats.structuredArtifacts).toBe(4);
    expect(report.diagnostics.some(d => d.path === bad && d.code === "HANDOFF008")).toBe(true);
    expect(report.diagnostics.some(d => d.path === good)).toBe(false);
  });

  it("still checks current handoff resume sources and missing installed handoff schemas", async () => {
    const f = await fixture();
    await writeFile(path.join(f.root, task, "handoff.yaml"), serializeHandoff(f.handoff(1)));
    await rm(path.join(f.root, "schemas/handoff.schema.json"));
    const report = await validateRepository(f.root);
    expect(report.stats.structuredArtifacts).toBe(2);
    expect(report.diagnostics.some(d => d.code === "HANDOFF004")).toBe(true);
    expect(report.diagnostics.some(d => d.code === "SCHEMA004" && d.path === `${task}/handoff.yaml`)).toBe(true);
  });

  it("finishes a large history at 128 MiB heap and still detects corruption in its lexically last archive", async () => {
    const f = await fixture(), paths: string[] = [];
    for (let i = 0; i < 96; i++) paths.push(await f.put(f.handoff(i, 3072)));
    const good = await constrained(f.root);
    expect(good.report.diagnostics).toEqual([]);
    expect(good.report.ok).toBe(true);
    expect(good.report.stats.structuredArtifacts).toBe(97);
    expect(good.peakRSSKiB).toBeGreaterThan(0); // RSS includes native memory; it is not the 128-MiB JS-heap limit.
    const last = paths.sort().at(-1)!;
    const original = await readFile(path.join(f.root, last), "utf8");
    await writeFile(path.join(f.root, last), original.replace('objective: Retain exact synthetic history', 'objective: Changed without rehash'));
    const bad = await constrained(f.root);
    expect(bad.report.stats.structuredArtifacts).toBe(97);
    expect(bad.report.ok).toBe(false);
    expect(bad.report.diagnostics.some(d => d.path === last && d.code === "HANDOFF005")).toBe(true);
  }, 180000);
});
