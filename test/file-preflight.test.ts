import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parse, stringify } from "yaml";
import { checkFile, formatFilePreflight } from "../src/file-preflight.js";
import { createDocument } from "../src/document-authoring.js";
import { compileContext } from "../src/context.js";
import { auditDocumentation } from "../src/docs.js";
import { formatAgentGuide } from "../src/agent-guide.js";
import { generateContextIndex, sha256 } from "../src/indexer.js";
import * as validator from "../src/validator.js";
import { documentFixture, documentManifest } from "./document-fixture.js";

const roots: string[] = [];
const ledger = vi.hoisted(() => ({ enabled: false, opened: [] as string[], repositoryCalls: 0 }));
vi.mock("node:fs/promises", async importOriginal => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return { ...original,
    open: (...args: unknown[]) => { if (ledger.enabled) ledger.opened.push(String(args[0])); return Reflect.apply(original.open, undefined, args); },
    readFile: (...args: unknown[]) => {
      if (ledger.enabled) ledger.opened.push(args[0] instanceof URL ? fileURLToPath(args[0]) : String(args[0]));
      return Reflect.apply(original.readFile, undefined, args);
    },
  };
});
vi.mock("../src/validator.js", async importOriginal => {
  const original = await importOriginal<typeof import("../src/validator.js")>();
  return { ...original, validateRepository: (...args: unknown[]) => {
    if (ledger.enabled) { ledger.repositoryCalls++; throw new Error("TEST: single-file check called the repository validator"); }
    return Reflect.apply(original.validateRepository, undefined, args);
  } };
});
const execute = promisify(execFile);
const cli = path.resolve("dist/cli.js");
afterEach(async () => { ledger.enabled = false; ledger.opened = []; ledger.repositoryCalls = 0; vi.restoreAllMocks(); for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });

async function fixture() {
  const f = await documentFixture(roots);
  const relative = "docs/canontrail/check-me.md";
  await createDocument({ root: f.root, path: relative, topicId: "check-me", title: "Preflight input", purpose: "Inspect structure only", routing: ["file preflight"], apply: true });
  return { ...f, relative, absolute: path.join(f.root, relative) };
}
async function replaceHeader(root: string, relative: string, change: (header: Record<string, unknown>) => void) {
  const absolute = path.join(root, relative), raw = await fs.readFile(absolute, "utf8");
  const end = raw.indexOf("\n---", 4), header = parse(raw.slice(4, end));
  change(header); await fs.writeFile(absolute, "---\n" + stringify(header) + "---\n# Subject\n");
}
async function reportSchema() { return new Ajv2020({ strict: true, allErrors: true }).compile(JSON.parse(await fs.readFile("schemas/file-preflight.schema.json", "utf8"))); }

describe("single-file structural preflight", () => {
  it("checks one complete draft without approval or writes", async () => {
    const f = await fixture(), before = await documentManifest(f.root);
    const report = await checkFile(f.root, f.relative);
    expect(report).toMatchObject({ ok: true, validation_scope: "file-structure", writes_performed: false, repository_validation_performed: false,
      completion_approval: false, continuity_validation: "not-performed", self_hash_validation: "not-performed", schema: { name: "artifact-header", shipped: "pass", installed: "pass" } });
    expect(report.source?.content_hash).toBe(sha256(await fs.readFile(f.absolute)));
    expect((await reportSchema())(report)).toBe(true);
    expect(formatFilePreflight(report)).toContain("NOT approved");
    expect(await documentManifest(f.root)).toEqual(before);
  });

  it.each(["verification", "state", "evidence"])("reports missing %s as a field instead of dereferencing it", async missing => {
    const f = await fixture();
    await replaceHeader(f.root, f.relative, h => { if (missing === "verification") delete h.verification; else delete (h.verification as Record<string, unknown>)[missing]; });
    const report = await checkFile(f.root, f.relative);
    expect(report.ok).toBe(false);
    expect(report.diagnostics).toHaveLength(1);
    expect(report.diagnostics[0]).toMatchObject({ code: "SCHEMA005", path: f.relative });
    expect(report.diagnostics[0]?.detail).toContain(`missing field: "/verification${missing === "verification" ? "" : "/" + missing}"`);
    expect((await reportSchema())(report)).toBe(true);
  });

  it.each([{ value: null }, { value: "not a mapping" }, { value: [] }])("rejects malformed verification %j without a crash", async ({ value }) => {
    const f = await fixture(); await replaceHeader(f.root, f.relative, h => { h.verification = value; });
    expect((await checkFile(f.root, f.relative)).diagnostics.some(d => d.code === "SCHEMA005")).toBe(true);
  });

  it("lists actual field-specific choices, not invented shared status aliases", async () => {
    const f = await fixture();
    await replaceHeader(f.root, f.relative, h => { (h.verification as Record<string, unknown>).state = "not-run"; });
    const headerReport = await checkFile(f.root, f.relative);
    expect(headerReport.diagnostics[0]?.detail).toMatch(/\/verification\/state.*allowed values:.*"unverified".*"reviewed"/);
    const statePath = `.agent-context/tasks/${f.taskId}/state.yaml`, absolute = path.join(f.root, statePath);
    const state = parse(await fs.readFile(absolute, "utf8")); state.status = "active";
    await fs.writeFile(absolute, stringify(state));
    const stateReport = await checkFile(f.root, statePath);
    expect(stateReport.diagnostics[0]?.detail).toMatch(/\/status.*allowed values:.*"draft".*"in-progress"/);
    expect(stateReport.diagnostics[0]?.detail).not.toContain('"active"');
  });

  it.each(["# No frontmatter", "---\nverification: [\n---\n", "---\nstatus: a\nstatus: b\n---\n"])("returns coded YAML/frontmatter failures for %j", async raw => {
    const f = await fixture(); await fs.writeFile(f.absolute, raw);
    expect((await checkFile(f.root, f.relative)).diagnostics[0]?.code).toBe("DOC002");
  });

  it("checks Markdown references but does not resolve narrative usage prose as a filename", async () => {
    const f = await fixture();
    await replaceHeader(f.root, f.relative, h => { h.do_not_use_instead = ["Read `missing.md` only when needed."]; });
    expect((await checkFile(f.root, f.relative)).ok).toBe(true);
    await replaceHeader(f.root, f.relative, h => { h.verification = { state: "unverified", evidence: ["docs/canontrail/missing.md"] }; });
    const report = await checkFile(f.root, f.relative);
    expect(report.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "REF001", path: f.relative })]));
  });

  it("honors configured missing-reference exceptions but never unsafe identities", async () => {
    const f = await fixture(), cp = path.join(f.root, ".agent-context/config.yaml");
    const config = parse(await fs.readFile(cp, "utf8")); config.allow_missing_references = ["docs/missing.md", "../escape.md"];
    await fs.writeFile(cp, stringify(config));
    await replaceHeader(f.root, f.relative, h => { h.verification = { state: "unverified", evidence: ["docs/missing.md"] }; });
    expect((await checkFile(f.root, f.relative)).ok).toBe(true);
    await replaceHeader(f.root, f.relative, h => { h.verification = { state: "unverified", evidence: ["../escape.md"] }; });
    expect((await checkFile(f.root, f.relative)).ok).toBe(false);
  });

  it("accepts directory references and external locators without fetching them", async () => {
    const f = await fixture();
    await replaceHeader(f.root, f.relative, h => { h.verification = { state: "unverified", evidence: ["docs/canontrail/", "https://invalid.example/evidence", "urn:example:claim"] }; });
    expect((await checkFile(f.root, f.relative)).ok).toBe(true);
  });

  it("bounds metadata reference fan-out before probing the targets", async () => {
    const f = await fixture();
    await replaceHeader(f.root, f.relative, h => { h.verification = { state: "unverified", evidence: Array.from({ length: 1025 }, (_, i) => `docs/missing-${i}.md`) }; });
    const report = await checkFile(f.root, f.relative);
    expect(report.ok).toBe(false); expect(report.diagnostics[0]?.detail).toContain("at most 1024");
  });

  it("reports structured JSON/YAML syntax errors without interpreting contents as instructions", async () => {
    const f = await fixture();
    for (const [name, text] of [["context.lock.json", "{not json"], ["state.yaml", "checks: ["]]) {
      const relative = `.agent-context/tasks/${f.taskId}/${name}`;
      await fs.writeFile(path.join(f.root, relative), text);
      const report = await checkFile(f.root, relative);
      expect(report.ok).toBe(false); expect(report.diagnostics[0]?.code).toBe("ART001");
    }
  });

  it("does not open peer payloads, scan the repository or call its validator", async () => {
    const f = await fixture(); await fs.writeFile(path.join(f.root, "docs/canontrail/bad-peer.md"), "broken");
    ledger.enabled = true;
    const report = await checkFile(f.root, f.relative);
    ledger.enabled = false;
    expect(report.ok).toBe(true); expect(ledger.repositoryCalls).toBe(0);
    expect(ledger.opened).toHaveLength(4);
    expect(ledger.opened.some(name => name.includes("bad-peer"))).toBe(false);
    expect(ledger.opened.filter(name => name.endsWith("artifact-header.schema.json"))).toHaveLength(2);
  });

  it("a passing file never hides broken repository metadata", async () => {
    const f = await fixture(); await fs.writeFile(path.join(f.root, "docs/canontrail/bad-peer.md"), "broken");
    expect((await checkFile(f.root, f.relative)).ok).toBe(true);
    const global = await validator.validateRepository(f.root);
    expect(global.ok).toBe(false); expect(global.diagnostics.some(d => d.code === "DOC002" && d.path?.endsWith("bad-peer.md"))).toBe(true);
  });

  it("a shape-valid lock may still fail self-hash integrity", async () => {
    const f = await fixture(); await generateContextIndex(f.root);
    await compileContext({ root: f.root, taskId: f.taskId, totalTokens: 64000, apply: true });
    const relative = `.agent-context/tasks/${f.taskId}/context.lock.json`, absolute = path.join(f.root, relative);
    const lock = JSON.parse(await fs.readFile(absolute, "utf8")); lock.lock_hash = "sha256:" + "0".repeat(64);
    await fs.writeFile(absolute, JSON.stringify(lock));
    const report = await checkFile(f.root, relative);
    expect(report.ok).toBe(true); expect(report.self_hash_validation).toBe("not-performed");
    expect((await validator.validateRepository(f.root)).diagnostics.some(d => /self-hash|lock_hash/.test(d.message))).toBe(true);
  });

  it.each(["../escape.md", "C:/escape.md", "/escape.md", "docs\\bad.md", "docs/./bad.md", ".git/config", "docs/NUL.md", "docs/bad.md."])("rejects unsafe selected identity %j", async relative => {
    const f = await fixture(); expect((await checkFile(f.root, relative)).ok).toBe(false);
  });

  it("rejects wrong case, hard links and linked ancestors", async () => {
    const f = await fixture();
    expect((await checkFile(f.root, f.relative.replace("check-me", "Check-Me"))).ok).toBe(false);
    await fs.link(f.absolute, path.join(f.root, "docs/canontrail/hard.md"));
    expect((await checkFile(f.root, "docs/canontrail/hard.md")).ok).toBe(false);
    await fs.mkdir(path.join(f.root, "docs/alias-parent"));
    await fs.symlink(path.join(f.root, "docs/canontrail"), path.join(f.root, "docs/alias-parent/link"), process.platform === "win32" ? "junction" : "dir");
    expect((await checkFile(f.root, "docs/alias-parent/link/check-me.md")).ok).toBe(false);
  });

  it.each(["oversize", "nul", "invalid-utf8"])("bounds and rejects %s input", async kind => {
    const f = await fixture();
    await fs.writeFile(f.absolute, kind === "oversize" ? Buffer.alloc(8 * 1024 * 1024 + 1, 97) : kind === "nul" ? Buffer.from("bad\0") : Buffer.from([0xc3, 0x28]));
    expect((await checkFile(f.root, f.relative)).ok).toBe(false);
  });

  it("preserves BOM CRLF and Unicode in the reported raw identity", async () => {
    const f = await fixture();
    const raw = Buffer.from("\ufeff" + (await fs.readFile(f.absolute, "utf8")).replace(/\r?\n/g, "\r\n") + "\r\nÄ\r\n");
    await fs.writeFile(f.absolute, raw);
    const report = await checkFile(f.root, f.relative);
    expect(report.ok).toBe(true); expect(report.source).toEqual({ bytes: raw.length, content_hash: sha256(raw) });
  });

  it.each(["missing-config", "bad-schema", "missing-schema", "excluded", "ungoverned", "unsupported", "missing-target"])("reports %s without writes", async kind => {
    const f = await fixture(), cp = path.join(f.root, ".agent-context/config.yaml");
    const config = parse(await fs.readFile(cp, "utf8")), schema = path.join(f.root, config.schema_path, "artifact-header.schema.json");
    if (kind === "missing-config") await fs.rm(cp);
    if (kind === "bad-schema") await fs.writeFile(schema, "not json");
    if (kind === "missing-schema") await fs.rm(schema);
    if (kind === "excluded") { config.exclude_paths.push(f.relative); await fs.writeFile(cp, stringify(config)); }
    if (kind === "ungoverned") { config.governed_paths = ["AGENTS.md"]; await fs.writeFile(cp, stringify(config)); }
    let target = f.relative;
    if (kind === "unsupported") { target = "docs/canontrail/unknown.txt"; await fs.writeFile(path.join(f.root, target), "text"); }
    if (kind === "missing-target") await fs.rm(f.absolute);
    const before = await documentManifest(f.root), report = await checkFile(f.root, target);
    expect(report.ok).toBe(false); expect((await reportSchema())(report)).toBe(true);
    expect(await documentManifest(f.root)).toEqual(before);
  });

  it.each(["markdown", "control-artifact"])("rejects an index destination colliding with %s instead of reassigning its schema", async kind => {
    const f = await fixture(), configPath = path.join(f.root, ".agent-context/config.yaml");
    const target = kind === "markdown" ? f.relative : `.agent-context/tasks/${f.taskId}/state.yaml`;
    const config = parse(await fs.readFile(configPath, "utf8")); config.index_path = target;
    await fs.writeFile(configPath, stringify(config));
    const before = await documentManifest(f.root), report = await checkFile(f.root, target);
    expect(report.ok).toBe(false); expect(report.diagnostics[0]).toMatchObject({ code: "CFG001", path: ".agent-context/config.yaml" });
    expect(report.schema).toBeNull(); expect((await reportSchema())(report)).toBe(true);
    expect(await documentManifest(f.root)).toEqual(before);
  });

  it("recognizes the configured index destination without claiming index freshness", async () => {
    const f = await fixture(), configPath = path.join(f.root, ".agent-context/config.yaml");
    const config = parse(await fs.readFile(configPath, "utf8")); config.governed_paths.push(config.index_path);
    await fs.writeFile(configPath, stringify(config)); await generateContextIndex(f.root);
    const report = await checkFile(f.root, ".agent-context/context-index.json");
    expect(report).toMatchObject({ ok: true, kind: "structured", schema: { name: "context-index", shipped: "pass", installed: "pass" }, repository_validation_performed: false });
  });

  it("uses both shipped and installed schemas without loading unrelated schema payloads", async () => {
    const f = await fixture(), config = parse(await fs.readFile(path.join(f.root, ".agent-context/config.yaml"), "utf8"));
    await fs.writeFile(path.join(f.root, config.schema_path, "change-record.schema.json"), "invalid peer schema");
    expect((await checkFile(f.root, f.relative)).ok).toBe(true);
    await fs.writeFile(path.join(f.root, config.schema_path, "artifact-header.schema.json"), JSON.stringify({ type: "object", required: ["custom-field"] }));
    expect((await checkFile(f.root, f.relative)).schema).toMatchObject({ shipped: "pass", installed: "fail" });
    await fs.writeFile(path.join(f.root, config.schema_path, "artifact-header.schema.json"), JSON.stringify({ type: "object" }));
    await replaceHeader(f.root, f.relative, h => { delete h.verification; });
    expect((await checkFile(f.root, f.relative)).schema).toMatchObject({ shipped: "fail", installed: "pass" });
  });

  it("returns valid JSON and honest human output for both CLI outcomes", async () => {
    const f = await fixture();
    const success = await execute(process.execPath, [cli, "check", f.relative, f.root, "--json"]);
    expect(JSON.parse(success.stdout).ok).toBe(true); expect(success.stderr).toBe("");
    await replaceHeader(f.root, f.relative, h => { delete h.verification; });
    try { await execute(process.execPath, [cli, "check", f.relative, f.root, "--json"]); throw new Error("expected exit 1"); }
    catch (error) { const e = error as Error & { code: number; stdout: string; stderr: string }; expect(e.code).toBe(1); expect(JSON.parse(e.stdout).ok).toBe(false); expect(e.stderr).toBe(""); }
    try { await execute(process.execPath, [cli, "check", f.relative, f.root]); throw new Error("expected exit 1"); }
    catch (error) { const e = error as Error & { code: number; stdout: string }; expect(e.stdout).toContain("File preflight FAIL"); expect(e.stdout).toContain("SCHEMA005"); expect(e.stdout).toContain("NOT approved"); }
  });

  it("retains strict coded rejection when verification is missing", async () => {
    const f = await fixture(); await replaceHeader(f.root, f.relative, h => { delete h.verification; });
    const before = await documentManifest(f.root), report = await validator.validateRepository(f.root);
    expect(report.ok).toBe(false); expect(report.diagnostics.some(d => d.code === "SCHEMA005" && d.detail?.includes("/verification"))).toBe(true);
    const audit = await auditDocumentation(f.root, { asOf: "2026-10-18" });
    expect(audit.health).not.toBe("healthy"); expect(audit.documents.freshness.invalid).toBe(1);
    expect(audit.index.state).toBe("invalid");
    expect(audit.findings.some(finding => finding.code === "SCHEMA005")).toBe(true);
    await expect(generateContextIndex(f.root)).rejects.toThrow("incomplete governed metadata");
    try { await execute(process.execPath, [cli, "index", f.root]); throw new Error("expected exit 1"); }
    catch (error) { const e = error as Error & { code: number; stderr: string }; expect(e.code).toBe(1); expect(e.stderr).toContain("SCHEMA005"); expect(e.stderr).not.toContain("TypeError"); }
    expect(await documentManifest(f.root)).toEqual(before);
  });

  it("does not call the index current when malformed frontmatter prevented comparing it", async () => {
    const f = await fixture(); await fs.writeFile(f.absolute, "---\nverification: [\n---\n");
    const audit = await auditDocumentation(f.root, { asOf: "2026-10-18" });
    expect(audit.health).toBe("invalid"); expect(audit.index.state).toBe("invalid");
    expect(audit.findings.some(finding => finding.code === "DOC002")).toBe(true);
  });

  it("the report schema never accepts approval flags", async () => {
    const f = await fixture(), report = await checkFile(f.root, f.relative), validate = await reportSchema();
    for (const key of ["writes_performed", "repository_validation_performed", "completion_approval"]) expect(validate({ ...report, [key]: true })).toBe(false);
    expect(validate({ ...report, kind: "unknown" })).toBe(false);
    expect(validate({ ...report, source: null })).toBe(false);
    expect(validate({ ...report, schema: null })).toBe(false);
  });

  it("executes the neutral worked example and matches its portable report", async () => {
    const f = await fixture(), configPath = path.join(f.root, ".agent-context/config.yaml");
    const config = parse(await fs.readFile(configPath, "utf8")); config.governed_paths.push("examples/file-preflight");
    await fs.writeFile(configPath, stringify(config));
    await fs.mkdir(path.join(f.root, "examples/file-preflight"), { recursive: true });
    await fs.copyFile("examples/file-preflight/subject.md", path.join(f.root, "examples/file-preflight/subject.md"));
    const expected = JSON.parse(await fs.readFile("examples/file-preflight/report.json", "utf8"));
    const actual = await checkFile(f.root, "examples/file-preflight/subject.md");
    expect({ ...actual, root: "." }).toEqual(expected);
    expect((await reportSchema())(expected)).toBe(true);
    const help = await execute(process.execPath, [cli, "check", "--help"]);
    expect(help.stdout).toContain("--json"); expect(help.stdout).not.toContain("--apply");
  });

  it("the actual bundled guide exposes authoring and preflight without giving approval", async () => {
    const { stdout } = await execute(process.execPath, [cli, "guide"]);
    expect(stdout).toBe(formatAgentGuide("0.1.0"));
    expect(stdout).toContain("document create --help");
    expect(stdout).toContain("document snapshot --help");
    expect(stdout).toContain("check <REPOSITORY-RELATIVE-FILE> <PROJECT> --json");
    expect(stdout).toContain("A file PASS is not repository, self-hash, handoff or task-completion approval");
    expect(stdout).toContain("minimum estimated total budget");
  });
});
