import { execFile } from "node:child_process";
import { cp, link, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parse, stringify } from "yaml";
import { applyContextPreview, compileContext } from "../src/context.js";
import { auditDocumentation } from "../src/docs.js";
import { finalizeRepository } from "../src/finalize.js";
import { createHandoff } from "../src/handoff.js";
import { initializeProject } from "../src/initializer.js";
import { buildContextIndex, generateContextIndex, sha256 } from "../src/indexer.js";
import { formatMetadataIndex, rebuildMetadataIndex } from "../src/metadata-index.js";
import { createResumePacket } from "../src/resume.js";
import { validateRepository } from "../src/validator.js";
import { createTaskWorkingIndex } from "../src/working-index.js";

const spy = vi.hoisted(() => ({ forbidden: new Set<string>(), reads: new Map<string, number>(),
  onRead: undefined as undefined | ((name: string, count: number) => Promise<void>) }));
vi.mock("node:fs/promises", async importOriginal => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return { ...original, readFile: async (...args: unknown[]) => {
    const name = String(args[0]);
    const count = (spy.reads.get(name) ?? 0) + 1; spy.reads.set(name, count);
    if (spy.forbidden.has(name)) throw new Error("TEST sentinel: archive payload must not be opened");
    await spy.onRead?.(name, count);
    return Reflect.apply(original.readFile, undefined, args);
  } };
});

const exec = promisify(execFile), roots: string[] = [];
const taskId = "T-INDEX-TEST", task = `.agent-context/tasks/${taskId}`;
const date = "2026-10-10T12:00:00Z";
afterEach(async () => {
  spy.forbidden.clear(); spy.reads.clear(); spy.onRead = undefined;
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
});
function md(topic = "synthetic-index", patch: Record<string, unknown> = {}) {
  return `---\n${stringify({ topic_id: topic, stand: "2026-10-10", status: "current", truth_level: "draft",
    verification: { state: "unverified", evidence: [] }, read_if_task_touches: [], primary_systems: [],
    safe_to_edit: ["Synthetic fixture only."], do_not_use_instead: [], ...patch })}---\n# Synthetic metadata\n`;
}
async function put(root: string, relative: string, bytes: string | Buffer) {
  await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
  await writeFile(path.join(root, relative), bytes);
}
async function config(root: string, patch: Record<string, unknown> = {}) {
  await put(root, ".agent-context/config.yaml", stringify({ version: 1, schema_path: "schemas",
    index_path: ".agent-context/context-index.json", governed_paths: ["."], exclude_paths: [".git"],
    require_frontmatter_for_all_markdown: true, require_topic_id_for_canonical: true, allow_missing_references: [], ...patch }));
}
async function temporaryRoot(prefix: string) {
  // Runtime reads use canonical identities. tmpdir() can spell the same root
  // through /var -> /private/var or Windows case/short-name aliases.
  const root = await realpath(await mkdtemp(path.join(tmpdir(), prefix)));
  roots.push(root);
  return root;
}
async function fixture() {
  const root = await temporaryRoot("ct-index-upgrade-");
  await cp(path.resolve("schemas"), path.join(root, "schemas"), { recursive: true });
  await config(root);
  await put(root, "AGENTS.md", md());
  await put(root, task + "/brief.md", md("task-index"));
  await put(root, task + "/state.yaml", stringify({ task_id: taskId, status: "in-progress",
    objective: "Inspect explicit metadata index boundaries", dependencies: [], file_intents: [], checks: [],
    acceptance_criteria: [{ id: "AC", statement: "Metadata is not integrity approval.", verification: "Synthetic probes.", status: "pending" }] }));
  await generateContextIndex(root);
  return root;
}
async function unchangedFailure(root: string, assertInjected?: () => void) {
  const indexPath = path.join(root, ".agent-context/context-index.json"), before = await readFile(indexPath);
  const report = await rebuildMetadataIndex(root);
  assertInjected?.();
  expect(report.ok, JSON.stringify(report.diagnostics)).toBe(false);
  expect(report.index_written).toBe(false); expect(report.completion_approval).toBe(false);
  expect(await readFile(indexPath)).toEqual(before);
  return report;
}
async function cli(root: string, args: string[], heap?: number) {
  try {
    const result = await exec(process.execPath, [...(heap ? [`--max-old-space-size=${heap}`] : []), path.resolve("dist/cli.js"), ...args, root],
      { windowsHide: true, maxBuffer: 4 * 1024 * 1024, timeout: 60000 });
    return { ...result, code: 0 };
  } catch (error) {
    const result = error as { code: number; stdout: string; stderr: string };
    return { ...result, code: result.code };
  }
}

describe("explicit metadata-only index boundary", () => {
  it("never opens retained payloads and clearly reports non-approval", async () => {
    const root = await fixture(), archive = task + `/evidence/handoffs/${"a".repeat(64)}.yaml`;
    await put(root, archive, "invalid: ["); spy.reads.clear(); spy.forbidden.add(path.join(root, archive));
    const report = await rebuildMetadataIndex(root);
    expect(report.ok, JSON.stringify(report.diagnostics)).toBe(true);
    expect(report).toMatchObject({ purpose: "metadata-index-rebuild", validation_scope: "index-inputs",
      repository_validation_performed: false, completion_approval: false, continuity_validation: "not-performed",
      stats: { structured_payloads_validated: 0 }, index: { version: 2, document_order: "utf16-code-unit" } });
    expect(spy.reads.get(path.join(root, archive))).toBeUndefined();
    expect(formatMetadataIndex(report)).toContain("NOT approved");
    spy.forbidden.clear(); expect(await readFile(path.join(root, archive), "utf8")).toBe("invalid: [");
  });

  it("keeps corrupt-history validation, audit, finalize and default-index preflight strict", async () => {
    const root = await fixture(), archive = task + `/evidence/handoffs/${"a".repeat(64)}.yaml`;
    await put(root, archive, "invalid: [");
    expect((await rebuildMetadataIndex(root)).ok).toBe(true);
    const validation = await validateRepository(root);
    expect(validation.ok).toBe(false); expect(validation.diagnostics.some(d => d.path === archive && d.code === "DOC004")).toBe(true);
    const audit = await auditDocumentation(root, { asOf: "2026-10-10" });
    expect(audit.findings.some(d => d.path === archive && d.code === "DOC004")).toBe(true);
    const before = await readFile(path.join(root, ".agent-context/context-index.json"));
    const final = await finalizeRepository({ root, refreshIndex: true, asOf: "2026-10-10" });
    expect(final.ok).toBe(false);
    const normal = await cli(root, ["index"]);
    expect(normal.code).toBe(1); expect(normal.stderr).toContain("DOC004");
    expect(await readFile(path.join(root, ".agent-context/context-index.json"))).toEqual(before);
  });

  it("current-use resume still rejects a corrupted latest handoff after a metadata rebuild", async () => {
    const root = await fixture(); await put(root, task + "/handoff.yaml", "invalid: [");
    expect((await rebuildMetadataIndex(root)).ok).toBe(true);
    await expect(createResumePacket({ root, taskId, receivingSessionId: "receiver", totalTokens: 20000 })).rejects.toThrow();
    expect(await readFile(path.join(root, task + "/handoff.yaml"), "utf8")).toBe("invalid: [");
  });

  it("has a complete CLI report and forbids combining metadata-only and task-working modes", async () => {
    const root = await fixture(), output = await cli(root, ["index", "--metadata-only", "--json"]);
    expect(output.code).toBe(0); expect(output.stderr).toBe("");
    expect(JSON.parse(output.stdout)).toMatchObject({ ok: true, completion_approval: false, repository_validation_performed: false });
    const before = await readFile(path.join(root, ".agent-context/context-index.json"));
    const invalid = await cli(root, ["index", "--metadata-only", "--task", taskId]);
    expect(invalid.code).toBe(1); expect(invalid.stderr).toContain("cannot be combined");
    expect(await readFile(path.join(root, ".agent-context/context-index.json"))).toEqual(before);
  });

  it("ignores 32 MiB of archive payloads under a 64-MiB heap without hiding strict coverage", async () => {
    const root = await fixture();
    for (let i = 0; i < 32; i++) await put(root, task + `/evidence/handoffs/${i.toString(16).padStart(64, "0")}.yaml`, "invalid: [" + "x".repeat(1024 * 1024));
    const report = await cli(root, ["index", "--metadata-only", "--json"], 64);
    expect(report.code, report.stderr).toBe(0);
    expect(JSON.parse(report.stdout).stats.structured_payloads_validated).toBe(0);
  });

  it.each(["missing-header", "invalid-header", "missing-reference", "duplicate-topic", "duplicate-artifact", "invalid-schema", "missing-index-schema", "invalid-config"])("fails closed for %s", async kind => {
    const root = await fixture();
    if (kind === "missing-header") await put(root, "bad.md", "# No header\n");
    if (kind === "invalid-header") await put(root, "bad.md", md("bad", { truth_level: "not-a-truth-level" }));
    if (kind === "missing-reference") await put(root, "bad.md", md("bad", { verification: { state: "unverified", evidence: ["lost.json"] } }));
    if (kind === "duplicate-topic") for (const name of ["a", "b"]) await put(root, name + ".md", md("duplicate", { truth_level: "canonical", verification: { state: "reviewed", evidence: [] } }));
    if (kind === "duplicate-artifact") for (const name of ["a", "b"]) await put(root, name + ".md", md(name, { artifact_id: "same-id" }));
    if (kind === "invalid-schema") await put(root, "schemas/extra.schema.json", "not-json");
    if (kind === "missing-index-schema") await rm(path.join(root, "schemas/context-index.schema.json"));
    if (kind === "invalid-config") await config(root, { version: 9 });
    await unchangedFailure(root);
  });

  it.each(["invalid-utf8", "nul", "oversized"])("rejects %s metadata bytes without replacing the index", async kind => {
    const root = await fixture();
    const bytes = kind === "invalid-utf8" ? Buffer.from([0xff]) : kind === "nul" ? Buffer.from(md() + "\0") : Buffer.alloc(8 * 1024 * 1024 + 1, 120);
    await put(root, "bad.md", bytes);
    expect((await unchangedFailure(root)).diagnostics.some(d => d.code === "INDEX005")).toBe(true);
  });

  it.each(["../outside.json", ".git/index.json", ".agent-context/tasks/T-OTHER/index.json", ".agent-context/migrations/index.json", "schemas/index.json", ".planning/index.json", "docs/superpowers/index.json", "CON.json"])("rejects unsafe or protected output %s", async output => {
    const root = await fixture(); await config(root, { index_path: output }); await unchangedFailure(root);
  });

  it.each([".agent-context/TASKS/cache.json", ".agent-context/MIGRATIONS/cache.json", ".PLANNING/cache.json", ".GSD/cache.json", "docs/SUPERPOWERS/cache.json"])("rejects absent case-variant protected output %s on every platform", async output => {
    const root = await fixture(); await rm(path.join(root, ".agent-context/tasks"), { recursive: true });
    await config(root, { governed_paths: ["AGENTS.md"], index_path: output });
    const report = await unchangedFailure(root);
    expect(report.diagnostics.some(d => d.detail?.includes("portable role names"))).toBe(true);
    await expect(readFile(path.join(root, output))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(generateContextIndex(root)).rejects.toThrow(/portable role names/);
    await expect(readFile(path.join(root, output))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves a genuine fresh-init adoption manifest even if configured as the index output", async () => {
    const root = await temporaryRoot("ct-index-provenance-");
    await initializeProject(root);
    const manifestPath = path.join(root, ".agent-context/adoption-manifest.json"), before = await readFile(manifestPath);
    expect(JSON.parse(before.toString()).version).toBe(1);
    const configPath = path.join(root, ".agent-context/config.yaml"), current = parse(await readFile(configPath, "utf8"));
    await writeFile(configPath, stringify({ ...current, index_path: ".agent-context/adoption-manifest.json" }));
    await unchangedFailure(root);
    await expect(generateContextIndex(root)).rejects.toThrow(/adoption\/provenance/);
    expect(await readFile(manifestPath)).toEqual(before);
  });

  it.each(["version1", "versionless", "mixed-purpose"])("preserves unrelated %s JSON records for both writers", async kind => {
    const root = await fixture(), output = "cache/custom.json";
    const index = JSON.parse(await readFile(path.join(root, ".agent-context/context-index.json"), "utf8"));
    const record = kind === "mixed-purpose" ? { ...index, version: 1, provenance: ["original-owner"] }
      : { ...(kind === "version1" ? { version: 1 } : {}), provenance: ["original-owner"] };
    const before = Buffer.from(JSON.stringify(record)); await put(root, output, before);
    await config(root, { index_path: output });
    const report = await unchangedFailure(root);
    expect(report.diagnostics.some(d => d.detail?.includes("not a recognizable context-index cache"))).toBe(true);
    expect(await readFile(path.join(root, output))).toEqual(before);
    await expect(generateContextIndex(root)).rejects.toThrow(/not a recognizable context-index cache/);
    expect(await readFile(path.join(root, output))).toEqual(before);
  });

  it("rejects linked parents, linked references and multiply linked metadata", async () => {
    const root = await fixture(), other = await temporaryRoot("ct-index-outside-");
    await symlink(other, path.join(root, "alias"), process.platform === "win32" ? "junction" : "dir");
    await config(root, { governed_paths: ["AGENTS.md", task], index_path: "alias/index.json" }); await unchangedFailure(root);
    await config(root, { governed_paths: ["AGENTS.md", task] });
    await put(other, "source.txt", "Outside bytes");
    await put(root, "AGENTS.md", md("synthetic-index", { verification: { state: "unverified", evidence: ["alias/source.txt"] } }));
    await unchangedFailure(root);
    await put(root, "AGENTS.md", md()); await link(path.join(root, "AGENTS.md"), path.join(root, "second.md"));
    await config(root); await unchangedFailure(root);
  });

  it.each(["case-root", "backslash-root", "git-root", "git-schemas", "case-reference", "allowed-missing-unsafe"])("rejects %s identity instead of claiming complete coverage", async kind => {
    const root = await fixture();
    if (kind === "case-root") await config(root, { governed_paths: ["agents.md"] });
    if (kind === "backslash-root") await config(root, { governed_paths: [".agent-context\\tasks"] });
    if (kind === "git-root") await config(root, { governed_paths: [".git"] });
    if (kind === "git-schemas") await config(root, { schema_path: ".git/schemas" });
    if (kind === "case-reference") await put(root, "AGENTS.md", md("synthetic-index", { verification: { state: "unverified", evidence: ["Agents.md"] } }));
    if (kind === "allowed-missing-unsafe") {
      await config(root, { allow_missing_references: ["../lost.json"] });
      await put(root, "AGENTS.md", md("synthetic-index", { verification: { state: "unverified", evidence: ["../lost.json"] } }));
    }
    await unchangedFailure(root);
  });

  it.each(["baseline", "none"] as const)("rebuilds fresh init with %s documentation and explicitly reports its safely absent planned scopes", async documentation => {
    const root = await temporaryRoot("ct-index-init-");
    await initializeProject(root, { documentation });
    const report = await rebuildMetadataIndex(root);
    expect(report.ok, JSON.stringify(report.diagnostics)).toBe(true);
    expect(report.missing_configured_paths).toContain(".agent-context/tasks");
    expect(report.missing_configured_paths).toContain(".agent-context/migrations");
    if (documentation === "none") expect(report.missing_configured_paths).toContain("docs/canontrail");
    expect(report.diagnostics.filter(d => d.code === "INDEX006").map(d => d.path).sort()).toEqual(report.missing_configured_paths);
    expect(report.completion_approval).toBe(false);
    expect(formatMetadataIndex(report)).toContain("NOT indexed");
  });

  it("does not treat a missing root appearing after preflight as a stable empty scope", async () => {
    const root = await fixture(); await config(root, { governed_paths: ["AGENTS.md", task, "future-docs"] }); spy.reads.clear();
    let injections = 0;
    spy.onRead = async (name, count) => { if (name === path.join(root, "AGENTS.md") && count === 2) { injections++; await mkdir(path.join(root, "future-docs")); } };
    const report = await unchangedFailure(root, () => expect(injections, "scope mutation must actually execute").toBe(1));
    expect(report.missing_configured_paths).toEqual(["future-docs"]);
    expect(report.diagnostics.some(d => d.code === "INDEX005" && d.detail?.includes("inventory changed after preflight"))).toBe(true);
  });

  it("rechecks captured bytes before use and preserves the previous index if an input changes", async () => {
    const root = await fixture(); spy.reads.clear();
    let injections = 0;
    spy.onRead = async (name, count) => { if (name === path.join(root, "AGENTS.md") && count === 2) { injections++; await put(root, "AGENTS.md", md() + "changed\n"); } };
    const report = await unchangedFailure(root, () => expect(injections, "input mutation must actually execute").toBe(1));
    expect(report.diagnostics.some(d => d.detail?.includes("changed after preflight"))).toBe(true);
  });

  it.each(["input", "scope"])("observes %s mutation through a repository-root alias", async kind => {
    const root = await fixture(), parent = await temporaryRoot("ct-index-root-alias-"), alias = path.join(parent, "repository");
    await symlink(root, alias, process.platform === "win32" ? "junction" : "dir");
    if (kind === "scope") await config(root, { governed_paths: ["AGENTS.md", task, "future-docs"] });
    spy.reads.clear(); let injections = 0;
    spy.onRead = async (name, count) => {
      if (name === path.join(root, "AGENTS.md") && count === 2) {
        injections++;
        if (kind === "input") await put(root, "AGENTS.md", md() + "changed through alias\n");
        else await mkdir(path.join(root, "future-docs"));
      }
    };
    const report = await unchangedFailure(alias, () => expect(injections, "canonical read must trigger the alias-root control").toBe(1));
    expect(report.diagnostics.some(d => d.code === "INDEX005" && d.detail?.includes("changed after preflight"))).toBe(true);
  });
});

describe("versioned deterministic index semantics", () => {
  it.each(["versionless", "malformed"])("explicitly repairs a separate %s cache while preserving replacement boundaries", async kind => {
    const root = await fixture(), p = path.join(root, ".agent-context/context-index.json");
    const current = JSON.parse(await readFile(p, "utf8")), { version: _version, document_order: _order, ...versionless } = current;
    await writeFile(p, kind === "malformed" ? "{ broken cache" : JSON.stringify(versionless));
    const report = await rebuildMetadataIndex(root);
    expect(report.ok, JSON.stringify(report.diagnostics)).toBe(true);
    expect(report.index).toEqual(current);
  });

  it("uses stable code-unit order and a document-only root hash without volatile producer data", async () => {
    const root = await fixture();
    for (const name of ["Zebra", "apple", "éclair", "Ωmega"]) await put(root, name + ".md", md(name));
    const first = await rebuildMetadataIndex(root), second = await rebuildMetadataIndex(root);
    expect(first.ok).toBe(true); expect(second.index_written).toBe(false); expect(second.index).toEqual(first.index);
    expect(first.index!.documents.map(d => d.path)).toEqual(first.index!.documents.map(d => d.path).sort());
    expect(first.index!.root_hash).toBe(sha256(JSON.stringify(first.index!.documents)));
    expect(Object.keys(first.index!)).toEqual(["version", "document_order", "hash_algorithm", "root_hash", "documents"]);
    expect(buildContextIndex([])).toEqual({ version: 2, document_order: "utf16-code-unit", hash_algorithm: "sha256", root_hash: sha256("[]"), documents: [] });
  });

  it("rejects legacy current use even when root_hash already matches and only explicit rebuild upgrades it", async () => {
    const root = await fixture(), p = path.join(root, ".agent-context/context-index.json");
    const current = JSON.parse(await readFile(p, "utf8")), { document_order: _order, ...legacy } = current;
    await writeFile(p, JSON.stringify({ ...legacy, version: 1 }, null, 2) + "\n");
    const bytes = await readFile(p);
    const validation = await validateRepository(root);
    expect(validation.diagnostics.some(d => d.code === "INDEX004" && (d.message + d.detail).includes("pinned current CLI"))).toBe(true);
    await expect(compileContext({ root, taskId, totalTokens: 20000 })).rejects.toThrow(/legacy context index/);
    expect(await readFile(p)).toEqual(bytes);
    expect((await rebuildMetadataIndex(root)).ok).toBe(true);
    expect((await compileContext({ root, taskId, totalTokens: 20000 })).selected_sources).toBeGreaterThan(0);
  });

  it.each([{ version: 3 }, { document_order: "locale" }, { hash_algorithm: "other" }])("does not overwrite unsupported format %j", async patch => {
    const root = await fixture(), p = path.join(root, ".agent-context/context-index.json");
    await writeFile(p, JSON.stringify({ ...JSON.parse(await readFile(p, "utf8")), ...patch }));
    const before = await readFile(p); await unchangedFailure(root);
    await expect(generateContextIndex(root)).rejects.toThrow(/unsupported context index/);
    expect(await readFile(p)).toEqual(before);
    await expect(compileContext({ root, taskId, totalTokens: 20000 })).rejects.toThrow(/unsupported context index/);
  });

  it("does not apply a saved preview through a legacy index and leaves the active lock untouched", async () => {
    const root = await fixture();
    await compileContext({ root, taskId, totalTokens: 20000, apply: true });
    const preview = await compileContext({ root, taskId, totalTokens: 20000 });
    const active = path.join(root, task + "/context.lock.json"), before = await readFile(active);
    await put(root, "preview.json", JSON.stringify(preview));
    const p = path.join(root, ".agent-context/context-index.json"), index = JSON.parse(await readFile(p, "utf8"));
    await writeFile(p, JSON.stringify({ ...index, version: 1 }));
    await expect(applyContextPreview({ root, previewPath: "preview.json" })).rejects.toThrow(/legacy context index/);
    expect(await readFile(active)).toEqual(before);
  });

  it("rejects a legacy receiving index while preserving valid handoff and source receipt bytes", async () => {
    const root = await fixture(); await exec("git", ["init"], { cwd: root, windowsHide: true });
    await compileContext({ root, taskId, totalTokens: 20000, apply: true });
    const handoff = await createHandoff({ root, taskId, sourceSessionId: "source", createdAt: date,
      nextSafeAction: "Inspect the required sources and review the index before continuing this synthetic task.", apply: true });
    const handoffPath = path.join(root, handoff.output_path), h = await readFile(handoffPath);
    const archivePath = path.join(root, handoff.source_context_archive_path), a = await readFile(archivePath);
    const p = path.join(root, ".agent-context/context-index.json"), index = JSON.parse(await readFile(p, "utf8"));
    await writeFile(p, JSON.stringify({ ...index, version: 1 }));
    await expect(createResumePacket({ root, taskId, receivingSessionId: "receiver", totalTokens: 20000 })).rejects.toThrow(/legacy context index/);
    expect(await readFile(handoffPath)).toEqual(h); expect(await readFile(archivePath)).toEqual(a);
  });

  it("keeps the task-working hash domain separate while its nested index declares format 2", async () => {
    const root = await fixture(), global = (await generateContextIndex(root)).index;
    const scoped = await createTaskWorkingIndex(root, taskId);
    expect(scoped.ok).toBe(true); expect(scoped.index).toMatchObject({ version: 2, document_order: "utf16-code-unit" });
    expect(scoped.index!.root_hash).not.toBe(global.root_hash);
    expect(scoped.completion_approval).toBe(false);
  });
});
