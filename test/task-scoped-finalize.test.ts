import { mkdtemp, mkdir, readFile, writeFile, rm, stat, symlink, link, rename } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initializeProject } from "../src/initializer.js";
import { compileContext, computeContextLockHash, type ContextLock } from "../src/context.js";
import { generateContextIndex } from "../src/indexer.js";
import { validateRepository } from "../src/validator.js";
import { finalizeRepository, formatFinalizeReport } from "../src/finalize.js";
import { partitionCompletionDiagnostics, resolveCompletionScope, type CompletionScope } from "../src/finalize-scope.js";
import type { Diagnostic } from "../src/types.js";
import { Ajv2020 } from "ajv/dist/2020.js";

const roots: string[] = [];
// These fixtures intentionally have no Git repository. Exercise that supported
// compiler mode without hundreds of irrelevant git subprocesses. Native Git
// continuity behavior remains covered by context/handoff/resume suites; native
// filesystem alias operations below are not mocked.
beforeAll(() => { vi.stubEnv("PATH", ""); });
afterAll(() => { vi.unstubAllEnvs(); });
const asOf = "2026-09-06";
const areas = ["requirement", "data-contracts", "domain-logic", "tests-reference-cases", "example-data", "ui-api", "documentation", "diagrams-visuals", "terminology", "operations-compatibility"];
const task = (id: string, file: string) => ".agent-context/tasks/" + id + "/" + file;
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const json = async (root: string, file: string) => JSON.parse(await readFile(path.join(root, file), "utf8"));
const put = async (root: string, file: string, value: unknown) => writeFile(path.join(root, file), JSON.stringify(value, null, 2) + "\n");

function header(topic: string, status = "in-progress", truth = "active-snapshot") {
  return "---\ntopic_id: " + topic + "\nstand: \"2026-09-06\"\nstatus: " + status + "\ntruth_level: " + truth + "\nverification:\n  state: internally-reviewed\n  evidence: []\nread_if_task_touches: []\nprimary_systems: []\nsafe_to_edit: []\ndo_not_use_instead: []\n---\n\n# " + topic + "\n";
}
async function addTask(root: string, id: string, complete: boolean, dependencies: string[] = []) {
  const directory = path.join(root, task(id, ""));
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(root, id + ".ts"), "// original " + id + "\n");
  await writeFile(path.join(directory, "brief.md"), header("fixture-" + id, complete ? "completed" : "in-progress"));
  await writeFile(path.join(directory, "result.txt"), "Synthetic passing fixture observation\n");
  const evidence = [task(id, "result.txt")];
  await put(root, task(id, "state.yaml"), {
    task_id: id, status: complete ? "verified" : "in-progress", objective: id === "B" ? "Boreal quartz" : "Amber metal " + id,
    source_system: "canontrail", source_ref: task(id, "brief.md"), dependencies, file_intents: [id + ".ts"],
    acceptance_criteria: [{ id: "AC-1", statement: "Local fixture", verification: "Counterexample suite", status: complete ? "pass" : "pending" }],
    checks: [{ id: "CHECK-1", command_or_observation: "Synthetic project check", status: complete ? "pass" : "pending", evidence_refs: evidence }],
    latest_handoff: null, updated_at: "2026-09-06T12:00:00Z",
  });
  await put(root, task(id, "change.yaml"), {
    version: 1, change_id: "CHG-" + id, revision: 1, title: "Fixture " + id, status: complete ? "verified" : "implemented", risk: "low", author: "fixture",
    canonical_source: "AGENTS.md", decision_rationale: "Synthetic completion counterexample.",
    documentation_structure: { decision: "no-feature-document-change", rationale: "No product documentation change.", feature_documents: [] },
    acceptance_cases: [{ id: "AC-1", given: "Fixture", expected: "Classified scope", oracle: "Counterexample suite", failure_or_uncertainty: "Fail closed", counterexample: "Corruption is not freshness", status: complete ? "pass" : "pending", evidence_refs: evidence }],
    impacts: areas.map(area => ({ area, decision: "not-affected", rationale: "Synthetic fixture only.", evidence_refs: [] })),
    verification: { checks: [{ name: "Fixture", status: complete ? "pass" : "pending", evidence_refs: evidence }], terminology_search: { status: "not-applicable", terms: [], evidence_refs: [] }, visual_review: { applicable: false, status: "not-applicable", evidence_refs: [] }, unverifiable_items: [] },
    independent_review: { status: "not-required", reviewer: null, findings: [], evidence_refs: [], waiver: null }, external_evidence: [], supersedes: [], superseded_by: null, updated_at: "2026-09-06T12:00:00Z",
  });
}
async function compile(root: string, id: string) {
  return compileContext({ root, taskId: id, totalTokens: 96000, reservedOutputTokens: 8000, createdAt: "2026-09-06T12:00:00Z", apply: true });
}
async function fixture(dependencies: string[] = []) {
  const root = await mkdtemp(path.join(tmpdir(), "ct-task-scope-")); roots.push(root);
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-06T12:00:00Z"));
  try { await initializeProject(root); } finally { vi.useRealTimers(); }
  await addTask(root, "A", true, dependencies); await addTask(root, "B", false); await addTask(root, "C", false);
  await generateContextIndex(root);
  for (const id of ["A", "B", "C"]) await compile(root, id);
  expect((await validateRepository(root)).ok).toBe(true);
  return root;
}
async function drift(root: string, id = "B") { await writeFile(path.join(root, id + ".ts"), "// changed " + id + "\n"); }
async function finalize(root: string, taskId?: string) { return finalizeRepository({ root, ...(taskId ? { taskId } : {}), asOf, failOnWarnings: true }); }
async function editLock(root: string, id: string, edit: (lock: ContextLock) => void, rehash = true) {
  const lock = await json(root, task(id, "context.lock.json")) as ContextLock; edit(lock);
  if (rehash) { const { lock_hash: _hash, ...payload } = lock; lock.lock_hash = computeContextLockHash(payload); }
  await put(root, task(id, "context.lock.json"), lock);
}

describe("task-scoped completion safety boundary", () => {
  it("validates the report-only scope contract and its worked example", async () => {
    const ajv = new Ajv2020({ strict: true });
    const schema = JSON.parse(await readFile(new URL("../schemas/finalize-scope.schema.json", import.meta.url), "utf8"));
    const validate = ajv.compile(schema);
    const example = JSON.parse(await readFile(new URL("../examples/parallel-context/task-completion-scope.json", import.meta.url), "utf8"));
    expect(validate(example), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ ...example, mode: "repository" })).toBe(false);
    const root = await fixture(); await drift(root);
    expect(validate((await finalize(root, "A")).completion_scope), JSON.stringify(validate.errors)).toBe(true);
  });
  it("refreshes only the explicitly requested index and leaves every context lock unchanged", async () => {
    const root = await fixture(); await drift(root);
    await writeFile(path.join(root, "docs/canontrail/neutral.md"), header("neutral-topic"));
    const before = await Promise.all(["A", "B", "C"].map(id => readFile(path.join(root, task(id, "context.lock.json")))));
    const report = await finalizeRepository({ root, taskId: "A", asOf, failOnWarnings: true, refreshIndex: true });
    expect(report.ok, JSON.stringify(report)).toBe(true); expect(report.writes_performed).toBe(true);
    expect(await Promise.all(["A", "B", "C"].map(id => readFile(path.join(root, task(id, "context.lock.json")))))).toEqual(before);
  });
  it("passes a clean completed task with no extra health gate", async () => {
    const root = await fixture(); const report = await finalize(root, "A");
    expect(report.ok, JSON.stringify(report)).toBe(true);
    expect(report.completion_scope).toMatchObject({ mode: "task", relevant_task_ids: ["A"], deferred_findings: [] });
    expect(report.gates.some(g => g.id === "project-health")).toBe(false);
  });
  it("separates unrelated drift while preserving raw failure and exact locks", async () => {
    const root = await fixture(); await drift(root);
    const before = await Promise.all(["A", "B", "C"].map(id => readFile(path.join(root, task(id, "context.lock.json")))));
    const report = await finalize(root, "A");
    expect(report.ok, JSON.stringify(report)).toBe(true); expect(report.repository.ok).toBe(false);
    expect(report.repository.stats.errors).toBe(1);
    expect(report.completion_scope.deferred_findings.map(d => d.code)).toEqual(["LOCK004"]);
    expect(report.gates.find(g => g.id === "project-health")).toMatchObject({ status: "fail", blocking: false });
    expect(formatFinalizeReport(report)).toContain("not a repository/CI/release PASS");
    expect((await finalize(root)).ok).toBe(false); expect((await validateRepository(root)).ok).toBe(false);
    expect(await Promise.all(["A", "B", "C"].map(id => readFile(path.join(root, task(id, "context.lock.json")))))).toEqual(before);
    expect(report.writes_performed).toBe(false);
  });
  it("retains strict own source identity even when terminal", async () => {
    const root = await fixture(); await drift(root, "A");
    expect((await finalize(root, "A")).ok).toBe(false);
    expect((await validateRepository(root)).ok).toBe(true); // historical unless explicitly finalized
  });
  it("keeps direct dependencies blocking", async () => {
    const root = await fixture(["B"]); await drift(root);
    const report = await finalize(root, "A"); expect(report.ok).toBe(false);
    expect(report.completion_scope.relevant_task_ids).toEqual(["A", "B"]);
    expect(report.completion_scope.deferred_findings).toEqual([]);
  });
  it("keeps transitive dependencies blocking", async () => {
    const root = await fixture(["B"]); const b = await json(root, task("B", "state.yaml")); b.dependencies = ["C"];
    await put(root, task("B", "state.yaml"), b); await compile(root, "B"); await drift(root, "C");
    const report = await finalize(root, "A"); expect(report.ok).toBe(false);
    expect(report.completion_scope.relevant_task_ids).toEqual(["A", "B", "C"]);
  });
  it("keeps selected peer artifacts relevant without an explicit dependency", async () => {
    const root = await fixture(); const a = await json(root, task("A", "state.yaml")); a.required_context_sources = [task("B", "state.yaml")];
    await put(root, task("A", "state.yaml"), a); await compile(root, "A"); await drift(root);
    const report = await finalize(root, "A"); expect(report.ok).toBe(false); expect(report.completion_scope.relevant_task_ids).toContain("B");
  });
  it("resolves normalized references conservatively", async () => {
    const root = await fixture(); const a = await json(root, task("A", "state.yaml")); a.file_intents.push("unused/../.agent-context/tasks/B/state.yaml");
    await put(root, task("A", "state.yaml"), a);
    expect((await resolveCompletionScope(root, "A")).relevant_task_ids).toContain("B");
  });
  it("keeps a peer in the declared documentation change surface relevant", async () => {
    const root = await fixture(); const a = await json(root, task("A", "state.yaml"));
    a.documentation_impact = [task("B", "brief.md")];
    await put(root, task("A", "state.yaml"), a); await compile(root, "A"); await drift(root);
    const report = await finalize(root, "A"); expect(report.ok).toBe(false);
    expect(report.completion_scope.relevant_task_ids).toEqual(["A", "B"]);
    expect(report.completion_scope.deferred_findings).toEqual([]);
  });
  it("fails closed for an existing case alias without lowercasing distinct paths", async (context) => {
    const root = await fixture();
    const alias = ".AGENT-CONTEXT/tasks/B/state.yaml";
    const original = await stat(path.join(root, task("B", "state.yaml")));
    let actual;
    try { actual = await stat(path.join(root, alias)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") { context.skip(true, "Filesystem has no matching case alias"); return; } throw error; }
    if (actual.dev !== original.dev || actual.ino !== original.ino) { context.skip(true, "Case spelling is a distinct filesystem identity"); return; }
    const a = await json(root, task("A", "state.yaml")); a.required_context_sources = [alias];
    await put(root, task("A", "state.yaml"), a);
    await expect(compile(root, "A")).rejects.toThrow(/exact directory entry/);
    await drift(root);
    const before = await readFile(path.join(root, task("B", "context.lock.json")));
    const report = await finalize(root, "A");
    expect(report.ok).toBe(false);
    expect(report.completion_scope).toMatchObject({ mode: "repository", deferred_findings: [] });
    expect(report.completion_scope.fallback_reason).toContain("Aliased documentary reference");
    expect(await readFile(path.join(root, task("B", "context.lock.json")))).toEqual(before);
  });
  it.for(["directory", "file", "hard-link"] as const)("fails closed for a selected peer %s alias", async (kind, context) => {
    const root = await fixture();
    const alias = kind === "directory" ? "peer-alias/state.yaml" : "peer-state.yaml";
    try {
      if (kind === "directory") await symlink(path.join(root, task("B", "")), path.join(root, "peer-alias"), process.platform === "win32" ? "junction" : "dir");
      else if (kind === "file") await symlink(path.join(root, task("B", "state.yaml")), path.join(root, alias), "file");
      else await link(path.join(root, task("B", "state.yaml")), path.join(root, alias));
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP", "EOPNOTSUPP", "ENOSYS"].includes((error as NodeJS.ErrnoException).code ?? "")) { context.skip(true, "Native link capability unavailable: " + kind); return; }
      throw error;
    }
    const a = await json(root, task("A", "state.yaml")); a.required_context_sources = [alias];
    await put(root, task("A", "state.yaml"), a); await compile(root, "A"); await drift(root);
    const before = await readFile(path.join(root, task("B", "context.lock.json")));
    const report = await finalize(root, "A");
    expect(report.ok, JSON.stringify(report)).toBe(false);
    expect(report.completion_scope).toMatchObject({ mode: "repository", deferred_findings: [] });
    expect(report.completion_scope.fallback_reason).toContain("Aliased documentary reference");
    expect(await readFile(path.join(root, task("B", "context.lock.json")))).toEqual(before);
  });
  it.each([false, true])("keeps transitive change.yml evidence relevant with both spellings=%s", async (both) => {
    const root = await fixture(["C"]);
    const change = await json(root, task("C", "change.yaml"));
    change.acceptance_cases[0].evidence_refs.push(task("B", "result.txt"));
    if (!both) await rename(path.join(root, task("C", "change.yaml")), path.join(root, task("C", "change.yml")));
    await put(root, task("C", "change.yml"), change);
    await compile(root, "C"); await compile(root, "A"); await drift(root);
    const report = await finalize(root, "A");
    expect(report.ok).toBe(false);
    expect(report.completion_scope.relevant_task_ids).toEqual(["A", "B", "C"]);
    expect(report.completion_scope.deferred_findings).toEqual([]);
  });
  it("does not reinterpret distinct case-sensitive directory names as task ownership", async (context) => {
    const root = await fixture();
    try { await stat(path.join(root, ".AGENT-CONTEXT")); context.skip(true, "Case alias exists on this filesystem"); return; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await mkdir(path.join(root, ".AGENT-CONTEXT/tasks/B"), { recursive: true });
    await writeFile(path.join(root, ".AGENT-CONTEXT/tasks/B/note.txt"), "Distinct non-task directory\n");
    const a = await json(root, task("A", "state.yaml")); a.file_intents.push(".AGENT-CONTEXT/tasks/B/note.txt");
    await put(root, task("A", "state.yaml"), a);
    expect(await resolveCompletionScope(root, "A")).toMatchObject({ mode: "task", relevant_task_ids: ["A"], fallback_reason: null });
  });
  it("falls back to original global strictness for unresolved dependencies", async () => {
    const root = await fixture(["external:missing"]); await drift(root);
    const report = await finalize(root, "A"); expect(report.ok).toBe(false);
    expect(report.completion_scope).toMatchObject({ mode: "repository", deferred_findings: [] });
    expect(report.completion_scope.fallback_reason).toBeTruthy();
  });
  it.each(["worktree", "objective", "command", "selection"])("does not turn %s metadata into a file dependency", async (kind) => {
    const root = await fixture();
    const a = await json(root, task("A", "state.yaml"));
    if (kind === "worktree") a.worktree = { path: root, branch: "fixture", base_revision: "fixture", dirty: false };
    if (kind === "objective") a.objective = "/api/users: document the response contract.";
    if (kind === "command") a.checks[0].command_or_observation = "/api/users returns the independently tested fixture response.";
    await put(root, task("A", "state.yaml"), a); await compile(root, "A");
    if (kind === "selection") await editLock(root, "A", lock => { lock.sources[0]!.selection_reason = "/api/users context selected for the task"; });
    await drift(root);
    const report = await finalize(root, "A");
    expect(report.ok, JSON.stringify(report)).toBe(true);
    expect(report.completion_scope).toMatchObject({ mode: "task", relevant_task_ids: ["A"], fallback_reason: null });
    expect(report.completion_scope.deferred_findings).toHaveLength(1);
  });
  it.for(["state", "change", "canonical"] as const)("fails closed for a fragment-bearing hardlink in %s evidence", async (kind, context) => {
    const root = await fixture();
    try { await link(path.join(root, task("B", "result.txt")), path.join(root, "alias.txt")); }
    catch (error) { if (["EPERM", "EACCES", "ENOTSUP", "EOPNOTSUPP", "ENOSYS"].includes((error as NodeJS.ErrnoException).code ?? "")) { context.skip(true, "Hardlinks unavailable"); return; } throw error; }
    const file = task("A", kind === "state" ? "state.yaml" : "change.yaml");
    const value = await json(root, file);
    if (kind === "canonical") value.canonical_source = "./alias.txt#L1";
    else (kind === "state" ? value.checks[0] : value.acceptance_cases[0]).evidence_refs.push("./alias.txt#L1");
    await put(root, file, value); await compile(root, "A"); await drift(root);
    const report = await finalize(root, "A");
    expect(report.ok).toBe(false);
    expect(report.completion_scope).toMatchObject({ mode: "repository", deferred_findings: [] });
    expect(report.completion_scope.fallback_reason).toContain("Aliased documentary reference");
  });
  it("keeps documentary fragment references to ordinary peer files relevant", async () => {
    const root = await fixture(); const change = await json(root, task("A", "change.yaml"));
    change.acceptance_cases[0].evidence_refs.push(task("B", "result.txt") + "#L1");
    await put(root, task("A", "change.yaml"), change); await compile(root, "A"); await drift(root);
    const report = await finalize(root, "A");
    expect(report.ok).toBe(false); expect(report.completion_scope.relevant_task_ids).toEqual(["A", "B"]);
  });
  it("does not invent a filesystem dependency from a pure fragment", async () => {
    const root = await fixture(); const change = await json(root, task("A", "change.yaml"));
    change.acceptance_cases[0].evidence_refs.push("#L1");
    await put(root, task("A", "change.yaml"), change); await compile(root, "A"); await drift(root);
    const report = await finalize(root, "A"); expect(report.ok).toBe(true); expect(report.completion_scope.mode).toBe("task");
  });
  it("preserves literal hashes in selected filenames when checking aliases", async (context) => {
    const root = await fixture(); const alias = "peer#part.txt";
    try { await link(path.join(root, task("B", "result.txt")), path.join(root, alias)); }
    catch (error) { if (["EPERM", "EACCES", "ENOTSUP", "EOPNOTSUPP", "ENOSYS"].includes((error as NodeJS.ErrnoException).code ?? "")) { context.skip(true, "Hardlinks unavailable"); return; } throw error; }
    const a = await json(root, task("A", "state.yaml")); a.required_context_sources = [alias];
    await put(root, task("A", "state.yaml"), a); await compile(root, "A"); await drift(root);
    const report = await finalize(root, "A"); expect(report.ok).toBe(false);
    expect(report.completion_scope).toMatchObject({ mode: "repository", deferred_findings: [] });
  });
  it("does not use a missing requested task to hide unrelated failures", async () => {
    const root = await fixture(); await drift(root);
    const report = await finalize(root, "MISSING"); expect(report.ok).toBe(false); expect(report.completion_scope.mode).toBe("repository");
  });
  it.each(["budget", "self-hash", "duplicate", "required-omission", "transcripts", "schema"])("keeps foreign %s faults blocking", async (kind) => {
    const root = await fixture(); await drift(root);
    await editLock(root, "B", lock => {
      if (kind === "budget") lock.budget.total_tokens = 1;
      if (kind === "self-hash") lock.lock_hash = "sha256:" + "0".repeat(64);
      if (kind === "duplicate") lock.sources.push(lock.sources[0]!);
      if (kind === "required-omission") lock.omissions.push({ candidate: "unknown.ts", reason: "Required but omitted", required: true });
      if (kind === "transcripts") lock.raw_transcripts_included = true;
      if (kind === "schema") (lock as unknown as Record<string, unknown>).unexpected = true;
    }, kind !== "self-hash");
    const report = await finalize(root, "A"); expect(report.ok, JSON.stringify(report)).toBe(false);
    expect(report.gates.find(g => g.id === "repository")?.status).toBe("fail");
  });
  it("keeps missing foreign selected sources blocking", async () => {
    const root = await fixture(); await rm(path.join(root, "B.ts"));
    const report = await finalize(root, "A"); expect(report.ok).toBe(false);
    expect(report.completion_scope.deferred_findings).toEqual([]);
  });
  it("does not hide a stale global index as peer-only drift", async () => {
    const root = await fixture(); await writeFile(path.join(root, "docs/canontrail/new.md"), header("new-note"));
    const report = await finalize(root, "A"); expect(report.ok).toBe(false);
    expect(report.repository.diagnostics.some(d => d.code.startsWith("INDEX"))).toBe(true);
  });
  it("separates real peer requirements drift only after validating a fresh index", async () => {
    const root = await fixture(); await writeFile(path.join(root, "docs/canontrail/quartz.md"), header("quartz", "current", "canonical").replace("read_if_task_touches: []", "read_if_task_touches: [Boreal quartz]"));
    await generateContextIndex(root);
    const report = await finalize(root, "A"); expect(report.ok, JSON.stringify(report)).toBe(true);
    expect(report.completion_scope.deferred_findings.some(d => d.code === "LOCK008" && d.context_drift?.task_id === "B")).toBe(true);
    expect((await finalize(root)).ok).toBe(false);
  });
  it("keeps actual own newly required canonical context blocking", async () => {
    const root = await fixture(); await writeFile(path.join(root, "docs/canontrail/amber.md"), header("amber", "current", "canonical").replace("read_if_task_touches: []", "read_if_task_touches: [Amber metal]"));
    await generateContextIndex(root); expect((await finalize(root, "A")).ok).toBe(false);
  });
  it("does not classify inconsistent peer lock identity as safe drift", async () => {
    const root = await fixture(); await drift(root); await editLock(root, "B", lock => { lock.task_id = "C"; });
    const report = await finalize(root, "A"); expect(report.ok).toBe(false); expect(report.completion_scope.deferred_findings).toEqual([]);
  });
  it("keeps strict documentation warnings blocking", async () => {
    const root = await fixture(); await drift(root);
    const report = await finalizeRepository({ root, taskId: "A", asOf: "2027-09-06", failOnWarnings: true });
    expect(report.ok).toBe(false); expect(report.gates.find(g => g.id === "documentation")?.status).toBe("fail");
  });
  it("does not turn an unfinished target into a completed task by deferring peer drift", async () => {
    const root = await fixture(); await drift(root);
    const a = await json(root, task("A", "state.yaml")); a.checks[0].status = "pending";
    await put(root, task("A", "state.yaml"), a); await compile(root, "A");
    const report = await finalize(root, "A");
    expect(report.completion_scope.deferred_findings).toHaveLength(1);
    expect(report.ok).toBe(false); expect(report.gates.find(g => g.id === "task")?.status).toBe("fail");
  });
  it("does not reactivate a completed dependency's historical lock", async () => {
    const root = await fixture(["B"]); await addTask(root, "B", true); await generateContextIndex(root);
    await compile(root, "B"); await compile(root, "A"); await drift(root);
    const before = await readFile(path.join(root, task("B", "context.lock.json")));
    const report = await finalize(root, "A");
    expect(report.completion_scope.relevant_task_ids).toEqual(["A", "B"]);
    expect(report.ok, JSON.stringify(report)).toBe(true);
    expect((await finalize(root, "B")).ok).toBe(false);
    expect(await readFile(path.join(root, task("B", "context.lock.json")))).toEqual(before);
  });
  it("retains historical peers and strict requested historical tasks", async () => {
    const root = await fixture(); await addTask(root, "B", true); await generateContextIndex(root); await compile(root, "B"); await drift(root);
    expect((await finalize(root, "A")).ok).toBe(true); expect((await finalize(root, "B")).ok).toBe(false);
  });
  it("does not downgrade unknown, unclassified or mismatched diagnostics", () => {
    const scope: CompletionScope = { mode: "task", relevant_task_ids: ["A"], fallback_reason: null, deferred_findings: [] };
    const inputs: Diagnostic[] = [
      { code: "LOCK004", severity: "error", message: "unclassified", path: task("B", "context.lock.json") },
      { code: "LOCK007", severity: "error", message: "wrong code", path: task("B", "context.lock.json"), context_drift: { task_id: "B", kind: "source-content" } },
      { code: "LOCK004", severity: "error", message: "wrong owner", path: task("A", "context.lock.json"), context_drift: { task_id: "B", kind: "source-content" } },
      { code: "NEW001", severity: "error", message: "future validator" },
    ];
    expect(partitionCompletionDiagnostics(scope, inputs)).toEqual(inputs); expect(scope.deferred_findings).toEqual([]);
  });
});
