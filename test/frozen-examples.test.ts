import { cp, link, mkdir, mkdtemp, readFile, readdir, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { auditDocumentation, formatDocumentationAudit, loadMaintenancePolicy } from "../src/docs.js";
import { assessFrozenExamples, parseFrozenExamples } from "../src/frozen-examples.js";
import { generateContextIndex, sha256, discoverMarkdown } from "../src/indexer.js";
import { loadConfig } from "../src/config.js";
import { validateRepository } from "../src/validator.js";
import { finalizeRepository } from "../src/finalize.js";

const roots: string[] = [];
const asOf = "2026-09-12";
const fixturePath = "examples/frozen/task.md";
const header = (topic: string, truth = "active-snapshot", stand = "2026-01-01", evidence: string[] = []) => `---\ntopic_id: ${topic}\nstand: "${stand}"\nstatus: current\ntruth_level: ${truth}\nverification:\n  state: unverified\n  evidence: ${JSON.stringify(evidence)}\nread_if_task_touches: [example testing]\nprimary_systems: [example]\nsafe_to_edit: [Preserve fixture.]\ndo_not_use_instead: []\n---\n\n# Synthetic input\n`;
afterEach(async () => { for (const root of roots.splice(0)) { if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith("ct-frozen-")) throw Error("Unsafe fixture cleanup"); await rm(root, { recursive: true, force: true }); } });

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "ct-frozen-")); roots.push(root);
  await cp(path.resolve("schemas"), path.join(root, "schemas"), { recursive: true });
  await mkdir(path.join(root, ".agent-context")); await mkdir(path.join(root, "examples/frozen"), { recursive: true });
  await writeFile(path.join(root, ".agent-context/config.yaml"), "version: 1\nschema_path: schemas\ngoverned_paths: ['.']\nexclude_paths: [.git, node_modules, dist]\n");
  await writeFile(path.join(root, "README.md"), header("overview", "canonical", asOf));
  await writeFile(path.join(root, fixturePath), header("frozen-example"));
  const policy: Record<string, unknown> = { version: 1, created: asOf, cadence: "weekly", mode: "report-first", remote_required: false, checks: ["freshness"], mutation_policy: "Never mutate without review." };
  const savePolicy = async () => writeFile(path.join(root, ".agent-context/maintenance.yaml"), stringify(policy));
  const binding = async (p = fixturePath) => ({ path: p, content_hash: sha256(await readFile(path.join(root, p))), rationale: "Immutable synthetic teaching input; not an operational task." });
  await savePolicy(); await generateContextIndex(root);
  return { root, policy, savePolicy, binding };
}
async function snapshot(root: string) {
  const files: Record<string, string> = {};
  const visit = async (dir: string) => { for (const e of await readdir(dir, { withFileTypes: true })) { const abs = path.join(dir, e.name); if (e.isDirectory()) await visit(abs); else if (e.isFile()) files[path.relative(root, abs)] = sha256(await readFile(abs)); } };
  await visit(root); return files;
}
const has = (report: { diagnostics: { code: string }[] }, code: string) => report.diagnostics.some(d => d.code === code);

describe("hash-bound synthetic example age policy", () => {
  it("has no implicit exemption by folder or a missing/empty policy field", async () => {
    const f = await fixture();
    for (const value of [undefined, []]) {
      if (value === undefined) delete f.policy.frozen_examples; else f.policy.frozen_examples = value;
      await f.savePolicy();
      const audit = await auditDocumentation(f.root, { asOf });
      expect(audit.findings.some(d => d.code === "DOCS101" && d.path === fixturePath)).toBe(true);
      expect(audit.documents.frozen_examples).toEqual([]);
      expect((await finalizeRepository({ root: f.root, asOf, failOnWarnings: true })).ok).toBe(false);
    }
  });
  it("exempts only exact unchanged bytes and exposes the reason without writes or truth promotion", async () => {
    const f = await fixture(), entry = await f.binding(); f.policy.frozen_examples = [entry]; await f.savePolicy();
    const before = await snapshot(f.root);
    const validation = await validateRepository(f.root); expect(validation.ok, JSON.stringify(validation.diagnostics)).toBe(true);
    const audit = await auditDocumentation(f.root, { asOf });
    expect(audit.health).toBe("healthy"); expect(audit.documents.frozen_examples).toEqual([entry]);
    expect(audit.documents.by_truth_level["active-snapshot"]).toBe(1);
    expect(formatDocumentationAudit(audit)).toContain(`FROZEN [age-only] ${fixturePath} ${entry.content_hash}`);
    expect((await finalizeRepository({ root: f.root, asOf, failOnWarnings: true })).ok).toBe(true);
    expect(await snapshot(f.root)).toEqual(before);
  });
  it.each(["append", "crlf", "missing"])("fails closed on source %s instead of hiding drift", async mode => {
    const f = await fixture(); f.policy.frozen_examples = [await f.binding()]; await f.savePolicy();
    const p = path.join(f.root, fixturePath), bytes = await readFile(p, "utf8");
    if (mode === "missing") await unlink(p); else await writeFile(p, mode === "crlf" ? bytes.replaceAll("\n", "\r\n") : bytes + "Changed\n");
    await generateContextIndex(f.root);
    expect(has(await validateRepository(f.root), "MAINT002")).toBe(true);
    const audit = await auditDocumentation(f.root, { asOf }); expect(audit.documents.frozen_examples).toEqual([]);
    expect(audit.findings.some(d => d.code === "MAINT002")).toBe(true);
    expect((await finalizeRepository({ root: f.root, asOf, failOnWarnings: true })).ok).toBe(false);
  });
  it.each(["canonical", "design-target"])("never exempts %s truth even with a new correct hash", async truth => {
    const f = await fixture(); await writeFile(path.join(f.root, fixturePath), header("real-truth", truth));
    f.policy.frozen_examples = [await f.binding()]; await f.savePolicy(); await generateContextIndex(f.root);
    expect(has(await validateRepository(f.root), "MAINT002")).toBe(true);
    expect((await auditDocumentation(f.root, { asOf })).findings.some(d => d.code === "DOCS101")).toBe(true);
  });
  it("retains future-date checks even for a bound synthetic source", async () => {
    const f = await fixture(); await writeFile(path.join(f.root, fixturePath), header("future-example", "draft", "2027-01-01"));
    f.policy.frozen_examples = [await f.binding()]; await f.savePolicy(); await generateContextIndex(f.root);
    const audit = await auditDocumentation(f.root, { asOf });
    expect(audit.findings.some(d => d.code === "DOCS102")).toBe(true); expect(audit.documents.frozen_examples).toEqual([]);
  });
  it("keeps broken references blocking", async () => {
    const f = await fixture();
    await writeFile(path.join(f.root, fixturePath), header("broken-example", "active-snapshot", "2026-01-01", ["missing.md"]));
    f.policy.frozen_examples = [await f.binding()]; await f.savePolicy(); await generateContextIndex(f.root);
    const validation = await validateRepository(f.root); expect(validation.ok).toBe(false);
    expect(validation.diagnostics.some(d => d.message.includes("missing.md"))).toBe(true);
    expect((await finalizeRepository({ root: f.root, asOf, failOnWarnings: true })).ok).toBe(false);
  });
  it("cannot bless stale teaching-lock bytes by rehashing a maintenance declaration", async () => {
    const f = await fixture();
    await cp(path.resolve("examples/feature-save-schema"), path.join(f.root, "examples/feature-save-schema"), { recursive: true });
    await writeFile(path.join(f.root, ".agent-context/config.yaml"), "version: 1\nschema_path: schemas\nallow_missing_references: [SaveManager.cs, SaveSystemTests.cs, docs/save-system/README.md]\n");
    await writeFile(path.join(f.root, "ARTIFACT_PROTOCOL.md"), header("protocol", "canonical", asOf));
    const p = "examples/feature-save-schema/task-brief.md";
    f.policy.frozen_examples = [await f.binding(p)]; await f.savePolicy(); await generateContextIndex(f.root);
    expect(has(await validateRepository(f.root), "LOCK004")).toBe(false);
    await writeFile(path.join(f.root, p), await readFile(path.join(f.root, p), "utf8") + "\nChanged teaching input.\n");
    f.policy.frozen_examples = [await f.binding(p)]; await f.savePolicy(); await generateContextIndex(f.root);
    const validation = await validateRepository(f.root);
    expect(has(validation, "MAINT002")).toBe(false); expect(has(validation, "LOCK004")).toBe(true);
    expect((await auditDocumentation(f.root, { asOf })).findings.some(d => d.code === "LOCK004")).toBe(true);
    expect((await finalizeRepository({ root: f.root, asOf, failOnWarnings: true })).ok).toBe(false);
  });
  it("does not suppress header schema errors under a correct content hash", async () => {
    const f = await fixture();
    await writeFile(path.join(f.root, fixturePath), header("invalid-header").replace("state: unverified", "state: made-up"));
    f.policy.frozen_examples = [await f.binding()]; await f.savePolicy(); await generateContextIndex(f.root);
    const validation = await validateRepository(f.root);
    expect(validation.ok).toBe(false); expect(validation.diagnostics.some(d => d.code.startsWith("SCHEMA") && d.path === fixturePath)).toBe(true);
    expect((await finalizeRepository({ root: f.root, asOf, failOnWarnings: true })).ok).toBe(false);
  });
  it.each([".agent-context/tasks/T/brief.md", "examples/../.agent-context/tasks/T/brief.md", "examples/.agent-context/brief.md", "examples/.GIT/note.md", "examples//task.md", "examples\\task.md", "/examples/task.md", "examples/*.md", "examples/task.md:ads", "examples/task.md/", "examples/space /task.md"])("rejects unsafe or operational declaration %s", async p => {
    const f = await fixture(); f.policy.frozen_examples = [{ ...await f.binding(), path: p }]; await f.savePolicy();
    await expect(loadMaintenancePolicy(f.root)).rejects.toThrow("frozen_examples");
    expect(has(await validateRepository(f.root), "MAINT001")).toBe(true);
    expect((await finalizeRepository({ root: f.root, asOf, failOnWarnings: true })).ok).toBe(false);
  });
  it.each([null, {}, [null], [{ path: fixturePath }], [{ path: fixturePath, content_hash: "sha256:" + "0".repeat(64), rationale: " " }]])("rejects malformed declaration %#", async value => {
    const f = await fixture(); f.policy.frozen_examples = value; await f.savePolicy();
    expect(has(await validateRepository(f.root), "MAINT001")).toBe(true);
    await expect(loadMaintenancePolicy(f.root)).rejects.toThrow("frozen_examples");
  });
  it("rejects duplicate declarations and unexpected fields", async () => {
    const f = await fixture(), entry = await f.binding();
    expect(() => parseFrozenExamples([entry, entry])).toThrow("duplicate");
    expect(() => parseFrozenExamples([{ ...entry, skip_validation: true }])).toThrow("requires only");
  });
  it("does not let artifact-scan exclusion hide an invalid declaration", async () => {
    const f = await fixture(); f.policy.frozen_examples = [{ ...await f.binding(), content_hash: "sha256:" + "0".repeat(64) }]; await f.savePolicy();
    await writeFile(path.join(f.root, ".agent-context/config.yaml"), "version: 1\nschema_path: schemas\nexclude_paths: [.git, .agent-context/maintenance.yaml]\n");
    await generateContextIndex(f.root);
    expect(has(await validateRepository(f.root), "MAINT002")).toBe(true);
    expect((await finalizeRepository({ root: f.root, asOf, failOnWarnings: true })).ok).toBe(false);
  });
  it("does not let document-scan exclusion make a policy effective", async () => {
    const f = await fixture(); f.policy.frozen_examples = [await f.binding()]; await f.savePolicy();
    await writeFile(path.join(f.root, ".agent-context/config.yaml"), `version: 1\nschema_path: schemas\nexclude_paths: [.git, ${fixturePath}]\n`);
    await generateContextIndex(f.root); expect(has(await validateRepository(f.root), "MAINT002")).toBe(true);
  });
  it("keeps a separate real task old while exempting the example", async () => {
    const f = await fixture(); await mkdir(path.join(f.root, ".agent-context/tasks/T-REAL"), { recursive: true });
    await writeFile(path.join(f.root, ".agent-context/tasks/T-REAL/brief.md"), header("real-task"));
    f.policy.frozen_examples = [await f.binding()]; await f.savePolicy(); await generateContextIndex(f.root);
    const audit = await auditDocumentation(f.root, { asOf });
    expect(audit.documents.frozen_examples.map(d => d.path)).toEqual([fixturePath]);
    expect(audit.findings.some(d => d.code === "DOCS101" && d.path === ".agent-context/tasks/T-REAL/brief.md")).toBe(true);
  });
  it("rejects wrong case without conflating distinct names on case-sensitive hosts", async () => {
    const f = await fixture(); f.policy.frozen_examples = [{ ...await f.binding(), path: "examples/frozen/TASK.md" }]; await f.savePolicy();
    expect(has(await validateRepository(f.root), "MAINT002")).toBe(true);
  });
  it("rejects a hard-linked example even if its bytes and header match", async context => {
    const f = await fixture();
    try { await link(path.join(f.root, fixturePath), path.join(f.root, "shared-copy.md")); } catch (error) { if (["EPERM", "EACCES", "ENOTSUP"].includes((error as NodeJS.ErrnoException).code ?? "")) { context.skip(); return; } throw error; }
    f.policy.frozen_examples = [await f.binding()]; await f.savePolicy(); await generateContextIndex(f.root);
    expect(has(await validateRepository(f.root), "MAINT002")).toBe(true);
  });
  it("rejects a linked ancestor even with a supplied discovery record", async context => {
    const f = await fixture(); const docs = await discoverMarkdown(f.root, await loadConfig(f.root)); const target = docs.find(d => d.path === fixturePath)!;
    try { await symlink(path.join(f.root, "examples/frozen"), path.join(f.root, "examples/alias"), "junction"); } catch (error) { if (["EPERM", "EACCES", "ENOTSUP"].includes((error as NodeJS.ErrnoException).code ?? "")) { context.skip(); return; } throw error; }
    const entry = { ...await f.binding(), path: "examples/alias/task.md" };
    const result = await assessFrozenExamples(f.root, [entry], [{ ...target, path: entry.path }]);
    expect(result.examples).toEqual([]); expect(result.diagnostics.some(d => d.message.includes("linked example"))).toBe(true);
  });
  it("makes the policy all-or-nothing when one binding is invalid", async () => {
    const f = await fixture(), entry = await f.binding();
    await writeFile(path.join(f.root, "examples/frozen/other.md"), header("other"));
    f.policy.frozen_examples = [entry, { ...await f.binding("examples/frozen/other.md"), content_hash: "sha256:" + "0".repeat(64) }]; await f.savePolicy(); await generateContextIndex(f.root);
    const audit = await auditDocumentation(f.root, { asOf }); expect(audit.documents.frozen_examples).toEqual([]);
    expect(audit.findings.filter(d => d.code === "DOCS101")).toHaveLength(2);
  });
});
