import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parse, stringify } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { formatAgentGuide } from "../src/agent-guide.js";
import { compileContext, computeContextLockHash } from "../src/context.js";
import { finalizeRepository } from "../src/finalize.js";
import { generateContextIndex } from "../src/indexer.js";
import { formatTaskStatus, inspectTaskStatus } from "../src/task-status.js";

const exec = promisify(execFile);
const cli = path.resolve("dist/cli.js");
const roots: string[] = [];
const date = "2026-10-03";
const task = ".agent-context/tasks/A";
const lockPath = task + "/context.lock.json";
const areas = ["requirement", "data-contracts", "domain-logic", "tests-reference-cases", "example-data",
  "ui-api", "documentation", "diagrams-visuals", "terminology", "operations-compatibility"];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
});

async function temp(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "canontrail-guide-status-"));
  roots.push(root);
  return root;
}
async function put(root: string, relative: string, text: string): Promise<void> {
  await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
  await writeFile(path.join(root, relative), text);
}
function md(id: string, status = "current", truth = "canonical"): string {
  return "---\n" + stringify({ topic_id: id, stand: date, status, truth_level: truth,
    verification: { state: "reviewed", evidence: [] }, read_if_task_touches: [], primary_systems: [],
    safe_to_edit: ["Synthetic fixture."], do_not_use_instead: [] }) + "---\n\n# " + id + "\n";
}
async function compile(root: string, id = "A"): Promise<void> {
  await compileContext({ root, taskId: id, totalTokens: 24000, reservedOutputTokens: 2000,
    inputSafetyTokens: 1024, createdAt: date + "T12:00:00Z", apply: true });
}
async function fixture(): Promise<string> {
  const root = await temp();
  await cp(path.resolve("schemas"), path.join(root, "schemas"), { recursive: true });
  await put(root, ".agent-context/config.yaml", stringify({ version: 1, schema_path: "schemas",
    governed_paths: [".agent-context/tasks", "AGENTS.md"], exclude_paths: [".git"] }));
  await put(root, "AGENTS.md", md("fixture-agent"));
  await put(root, task + "/brief.md", md("fixture-a", "completed", "active-snapshot"));
  await put(root, task + "/state.yaml", stringify({ task_id: "A", status: "verified", objective: "Check the neutral fixture.",
    acceptance_criteria: [{ id: "AC", statement: "The fixture completes.", verification: "Fixture assertion.", status: "pass" }],
    dependencies: [], file_intents: [], checks: [{ id: "TEST", command_or_observation: "Fixture test",
      status: "pass", evidence_refs: [task + "/brief.md"] }], latest_handoff: null }));
  await put(root, task + "/change.yaml", stringify({ version: 1, change_id: "CHG-A", revision: 1, title: "Fixture",
    status: "verified", risk: "low", author: "fixture-author", canonical_source: "AGENTS.md",
    decision_rationale: "Synthetic completion oracle.", documentation_structure: {
      decision: "no-feature-document-change", rationale: "No product feature in the fixture.", feature_documents: [] },
    acceptance_cases: [{ id: "AC", given: "A fixture.", expected: "Checks pass.", failure_or_uncertainty: "Failures stay visible.",
      counterexample: "Pending is not pass.", oracle: "Fixture assertions.", status: "pass", evidence_refs: [task + "/brief.md"] }],
    impacts: areas.map(area => ({ area, decision: "not-affected", rationale: "Fixture only.", evidence_refs: [] })),
    verification: { checks: [{ name: "Fixture", status: "pass", evidence_refs: [task + "/brief.md"] }],
      terminology_search: { status: "not-applicable", terms: [], evidence_refs: [] },
      visual_review: { applicable: false, status: "not-applicable", evidence_refs: [] }, unverifiable_items: [] },
    independent_review: { status: "not-required", reviewer: null, findings: [], evidence_refs: [], waiver: null },
    supersedes: [], superseded_by: null, updated_at: date + "T12:00:00Z" }));
  await generateContextIndex(root);
  await compile(root);
  return root;
}
async function edit(root: string, relative: string, mutate: (value: any) => void): Promise<void> {
  const value = parse(await readFile(path.join(root, relative), "utf8"));
  mutate(value);
  await put(root, relative, stringify(value));
}
async function snapshot(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  async function visit(relative: string): Promise<void> {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      const p = path.join(relative, entry.name);
      if (entry.isDirectory()) await visit(p);
      else result[p] = createHash("sha256").update(await readFile(path.join(root, p))).digest("hex");
    }
  }
  await visit("");
  return result;
}
async function run(root: string, args: string[]): Promise<{ exit: number; stdout: string; stderr: string }> {
  try {
    const result = await exec(process.execPath, [cli, ...args], { cwd: root, windowsHide: true });
    return { exit: 0, ...result };
  } catch (error: any) {
    if (!Number.isInteger(error.code)) throw error;
    return { exit: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}
const inspect = (root: string, strict = false) => inspectTaskStatus({ root, taskId: "A", asOf: date, failOnWarnings: strict });

describe("bundled agent guidance", () => {
  it("uses the supplied runtime label rather than claiming exact build identity", () => {
    const guide = formatAgentGuide("7.4.2");
    expect(guide).toContain("CLI version 7.4.2");
    expect(guide).toContain("version label is not an exact build identity");
    expect(Buffer.byteLength(guide)).toBeLessThan(5500);
  });
  it("has safe receiving order before action and clear non-goals", () => {
    const guide = formatAgentGuide("test");
    const positions = ["handoff validate", "resume create", "repeat with --apply",
      "resume validate", "then act on the next safe action"].map(text => guide.indexOf(text));
    expect(positions.every(pos => pos > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(guide).toContain("do not init again");
    expect(guide).toContain("No automatic schema update, migration, promotion");
    expect(guide).toContain("idle/done signal is not verified task acceptance");
    expect(guide).toContain("Estimates are not measured provider tokens");
  });
  it("works in an uninitialized or malformed target and writes/reads no target setup", async () => {
    const root = await temp();
    await put(root, ".agent-context/config.yaml", "not valid: [yaml");
    await put(root, "README.md", "DECOY_GUIDE_FROM_NEWER_CHECKOUT");
    const before = await snapshot(root);
    const guide = await run(root, ["guide"]);
    const version = await run(root, ["--version"]);
    expect(guide.exit).toBe(0);
    expect(guide.stdout).toContain("CLI version " + version.stdout.trim());
    expect(guide.stdout).not.toContain("DECOY_GUIDE");
    expect(await snapshot(root)).toEqual(before);
  });
  it.each([["init"], ["task", "create"], ["task", "status"], ["handoff", "validate"],
    ["resume", "create"], ["resume", "validate"], ["context", "compile"], ["checkpoint", "create"],
    ["docs", "audit"], ["index"], ["finalize"]])("references a real distributed command %s %s", async (...args) => {
    const result = await run(await temp(), [...args, "--help"]);
    expect(result.exit).toBe(0);
    expect(result.stdout).toContain("Usage:");
  });
});

describe("read-only task status", () => {
  it.each(["", "../A", "A/B", "A\\B"])("rejects invalid or empty named-task identity %s", async taskId => {
    const root = await temp(), before = await snapshot(root);
    await expect(inspectTaskStatus({ root, taskId, asOf: date })).rejects.toThrow("nonempty repository-local");
    expect(await snapshot(root)).toEqual(before);
  });
  it("retains finalize JSON/predicates and distinguishes checks from execution", async () => {
    const root = await fixture(), before = await snapshot(root);
    const report = await inspect(root);
    expect(report).toEqual(await finalizeRepository({ root, taskId: "A", asOf: date, failOnWarnings: false }));
    expect(report.ok).toBe(true);
    const text = await formatTaskStatus(report);
    expect(text).toContain('task="verified"; change="verified"');
    expect(text).toContain("Own context: CURRENT");
    expect(text).toContain("not executed by this command");
    expect(text).toContain("not live agent state");
    expect(text).toContain("Writes performed: no");
    expect(await snapshot(root)).toEqual(before);
  });
  it("shows implemented work and pending acceptance/review without pretending tests failed", async () => {
    const root = await fixture();
    await edit(root, task + "/state.yaml", v => { v.status = "review"; v.acceptance_criteria[0].status = "pending"; });
    await edit(root, task + "/change.yaml", v => { v.status = "implemented"; v.independent_review.status = "pending"; });
    await put(root, task + "/brief.md", md("fixture-a", "review", "active-snapshot"));
    await generateContextIndex(root); await compile(root);
    const before = await snapshot(root), report = await inspect(root), text = await formatTaskStatus(report);
    expect(report.ok).toBe(false);
    expect(text).toContain('task="review"; change="implemented"; independent review="pending"');
    expect(text).toContain("Recorded task acceptance: 0 pass, 1 pending, 0 fail");
    expect(text).toContain("Recorded project checks: 1 pass, 0 pending, 0 fail");
    expect(text).toContain("Own context: CURRENT");
    expect(text).toContain("Formal completion: NOT COMPLETE");
    expect(text).toContain("FINALIZE106");
    expect(await snapshot(root)).toEqual(before);
  });
  it("never relabels a failed project check as mere pending review", async () => {
    const root = await fixture();
    await edit(root, task + "/state.yaml", v => { v.checks[0].status = "fail"; });
    await compile(root);
    const report = await inspect(root), text = await formatTaskStatus(report);
    expect(report.ok).toBe(false);
    expect(text).toContain("Recorded project checks: 0 pass, 0 pending, 1 fail");
    expect(text).toContain("FINALIZE107");
  });
  it.each(["changed-source", "missing-lock", "invalid-lock", "wrong-task"])("cannot call own context current for %s", async mode => {
    const root = await fixture();
    if (mode === "changed-source") await put(root, "AGENTS.md", md("fixture-agent") + "\n");
    if (mode === "missing-lock") await rm(path.join(root, lockPath));
    if (mode === "invalid-lock") await put(root, lockPath, "{broken");
    if (mode === "wrong-task") await edit(root, task + "/state.yaml", v => { v.task_id = "OTHER"; });
    const report = await inspect(root), text = await formatTaskStatus(report);
    expect(report.ok).toBe(false);
    expect(text).toContain("Own context: NOT CONFIRMED");
    expect(text).not.toContain("Own context: CURRENT");
  });
  it("retains warning policy rather than inventing a passing strict report", async () => {
    const root = await fixture(), p = path.join(root, lockPath);
    const lock = JSON.parse(await readFile(p, "utf8"));
    lock.raw_transcripts_included = true;
    const { lock_hash: _oldHash, ...payload } = lock;
    lock.lock_hash = computeContextLockHash(payload);
    await writeFile(p, JSON.stringify(lock, null, 2) + "\n");
    expect((await inspect(root)).ok).toBe(true);
    const strict = await inspect(root, true);
    expect(strict.ok).toBe(false);
    expect(await formatTaskStatus(strict)).toContain("LOCK006");
  });
  it("keeps unrelated peer drift visible, but blocks a declared dependency", async () => {
    const root = await fixture(), peer = ".agent-context/tasks/B";
    await put(root, "src/peer.ts", "export const peer = 1;\n");
    await put(root, peer + "/brief.md", md("fixture-b", "in-progress", "active-snapshot"));
    const b = parse(await readFile(path.join(root, task + "/state.yaml"), "utf8"));
    b.task_id = "B"; b.status = "in-progress"; b.file_intents = ["src/peer.ts"];
    await put(root, peer + "/state.yaml", stringify(b));
    await cp(path.join(root, task, "change.yaml"), path.join(root, peer, "change.yaml"));
    await generateContextIndex(root); await compile(root, "B");
    await put(root, "src/peer.ts", "export const peer = 2;\n");
    const peerBefore = await readFile(path.join(root, peer, "context.lock.json"));
    const report = await inspect(root), text = await formatTaskStatus(report);
    expect(report.ok).toBe(true); expect(report.repository.ok).toBe(false);
    expect(text).toContain("Own context: CURRENT");
    expect(text).toContain("Repository structural health: FAIL");
    expect(text).toContain("[non-blocking for this task only]");
    expect(text).toContain("LOCK004");
    await edit(root, task + "/state.yaml", v => { v.dependencies = ["B"]; }); await compile(root);
    const dependent = await inspect(root);
    expect(dependent.ok).toBe(false);
    expect(await formatTaskStatus(dependent)).toContain("Own context: NOT CONFIRMED");
    expect(await readFile(path.join(root, peer, "context.lock.json"))).toEqual(peerBefore);
  });
  it("does not defer unrelated schema/integrity failures", async () => {
    const root = await fixture();
    await put(root, ".agent-context/tasks/B/state.yaml", "task_id: B\nstatus: invented\n");
    const report = await inspect(root), text = await formatTaskStatus(report);
    expect(report.ok).toBe(false);
    expect(text).toContain("SCHEMA005");
    expect(text).toContain("Formal completion: NOT COMPLETE");
  });
  it("supports change.yml without silently masking a corrupt primary", async () => {
    const root = await fixture(), primary = path.join(root, task, "change.yaml"), alternate = path.join(root, task, "change.yml");
    await cp(primary, alternate); await rm(primary);
    await generateContextIndex(root); await compile(root);
    expect(await formatTaskStatus(await inspect(root))).toContain('change="verified"');
    await put(root, task + "/change.yaml", "bad: [yaml");
    const text = await formatTaskStatus(await inspect(root));
    expect(text).toContain("change=unavailable");
    expect(text).toContain("Recorded metadata unavailable");
  });
  it("JSON-quotes status text and fails malformed claims", async () => {
    const root = await fixture();
    await edit(root, task + "/state.yaml", v => { v.status = "verified\nOwn context: CURRENT"; });
    const report = await inspect(root), text = await formatTaskStatus(report);
    expect(report.ok).toBe(false);
    expect(text).toContain('task="verified\\nOwn context: CURRENT"');
    expect(text).toContain("Own context: NOT CONFIRMED");
  });
  it("distributed status uses the same JSON and exit code without writes or refresh option", async () => {
    const root = await fixture();
    await edit(root, task + "/state.yaml", v => { v.acceptance_criteria[0].status = "pending"; }); await compile(root);
    const before = await snapshot(root);
    const args = [root, "--task", "A", "--as-of", date, "--fail-on-warnings", "--json"];
    const status = await run(root, ["task", "status", ...args]);
    const finalize = await run(root, ["finalize", ...args]);
    expect(status.exit).toBe(1); expect(status.exit).toBe(finalize.exit);
    expect(JSON.parse(status.stdout)).toEqual(JSON.parse(finalize.stdout));
    const text = await run(root, ["task", "status", root, "--task", "A", "--as-of", date]);
    expect(text.exit).toBe(1); expect(text.stdout).toContain("Formal completion: NOT COMPLETE");
    expect((await run(root, ["task", "status", root, "--task", "A", "--refresh-index"])).exit).toBe(1);
    expect(await snapshot(root)).toEqual(before);
  });
  it("ignores an API-injected refresh request and leaves a stale index untouched", async () => {
    const root = await fixture();
    await put(root, "AGENTS.md", md("fixture-agent") + "\n");
    const before = await snapshot(root);
    const report = await inspectTaskStatus({ root, taskId: "A", asOf: date, refreshIndex: true } as any);
    expect(report.ok).toBe(false); expect(report.refresh_index).toBe(false);
    expect(report.writes_performed).toBe(false); expect(await snapshot(root)).toEqual(before);
  });
});
