import { execFile } from "node:child_process";
import { link, mkdir, readFile, rename, rm, symlink, truncate, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { captureDocumentSnapshot, computeDocumentSnapshotHash, formatDocumentSnapshotRead, readDocumentSnapshot, type CaptureDocumentSnapshotOptions, type DocumentSnapshotRecord } from "../src/document-snapshot.js";
import { generateContextIndex, sha256 } from "../src/indexer.js";
import { validateRepository } from "../src/validator.js";
import { documentFixture, documentManifest } from "./document-fixture.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const f = await documentFixture(roots), sourcePath = "raw/source.md";
  await mkdir(path.join(f.root, "raw"));
  const bytes = Buffer.from("\uFEFF# Existing source\r\n\r\nUnapproved historical notes. Ä 草 🌱\r\nVerification: a narrative, not a passing check.\r\n", "utf8");
  await writeFile(path.join(f.root, sourcePath), bytes);
  const options: CaptureDocumentSnapshotOptions = { root: f.root, taskId: f.taskId, sourcePath,
    purpose: "Retain the exact before-state for a documentation comparison", createdAt: "2026-10-08T12:00:00Z" };
  return { ...f, options, bytes };
}
async function replaceRecord(root: string, relative: string, mutate: (record: DocumentSnapshotRecord) => void) {
  const record: DocumentSnapshotRecord = JSON.parse(await readFile(path.join(root, relative), "utf8"));
  mutate(record); record.record_hash = computeDocumentSnapshotHash(record);
  const target = `.agent-context/tasks/T-DOCUMENT-001/evidence/document-snapshots/${record.record_hash.slice(7)}.document-snapshot.json`;
  await rm(path.join(root, relative));
  await writeFile(path.join(root, target), JSON.stringify(record, null, 2) + "\n");
  return target;
}

describe("immutable noncanonical document provenance", () => {
  it("previews no writes then archives exact BOM/CRLF/Unicode bytes with deterministic bindings", async () => {
    const f = await fixture(), before = await documentManifest(f.root), preview = await captureDocumentSnapshot(f.options);
    expect(preview.writes_performed).toBe(false); expect(await documentManifest(f.root)).toEqual(before);
    expect(preview.record).toMatchObject({ kind: "document-snapshot", task_id: f.taskId, source_content_hash: sha256(f.bytes), source_bytes: f.bytes.length });
    expect(preview.record).not.toHaveProperty("truth_level"); expect(preview.record).not.toHaveProperty("verification");
    const { record_hash, ...payload } = preview.record;
    expect(record_hash).toBe(sha256(JSON.stringify(payload))); // independent recipe oracle
    const applied = await captureDocumentSnapshot({ ...f.options, apply: true });
    expect(applied.record).toEqual(preview.record); expect(applied.files).toEqual(preview.files); expect(applied.written_paths).toHaveLength(2);
    expect(await readFile(path.join(f.root, applied.record.archive_path))).toEqual(f.bytes);
    const after = await documentManifest(f.root); for (const [file, hash] of Object.entries(before)) expect(after[file], file).toBe(hash);
    expect((await captureDocumentSnapshot({ ...f.options, apply: true })).written_paths).toEqual([]);
    const readBefore = await documentManifest(f.root);
    const result = await readDocumentSnapshot({ root: f.root, recordPath: applied.record_path });
    expect(Buffer.from(result.content, "utf8")).toEqual(f.bytes); expect(result.writes_performed).toBe(false);
    expect(formatDocumentSnapshotRead(result)).toContain(JSON.stringify(result.content));
    expect(await documentManifest(f.root)).toEqual(readBefore);
  });

  it("does not turn a source copy into an indexed truth location", async () => {
    const f = await fixture(), baselineCount = (await validateRepository(f.root, { checkIndex: false })).stats.structuredArtifacts;
    await captureDocumentSnapshot({ ...f.options, apply: true });
    const { index } = await generateContextIndex(f.root);
    expect(index.documents.some(document => document.path.includes("document-snapshots"))).toBe(false);
    const validation = await validateRepository(f.root);
    expect(validation.ok, JSON.stringify(validation.diagnostics)).toBe(true);
    expect(validation.stats.structuredArtifacts).toBe(baselineCount + 1); // exactly one new record, not a copied Markdown document
  });

  it.each(["changed", "removed", "renamed"])("retains valid provenance when the current source is %s", async kind => {
    const f = await fixture(), report = await captureDocumentSnapshot({ ...f.options, apply: true });
    const source = path.join(f.root, f.options.sourcePath);
    if (kind === "changed") await writeFile(source, "Different current notes\n");
    if (kind === "removed") await rm(source);
    if (kind === "renamed") await rename(source, path.join(f.root, "raw/renamed.md"));
    expect(Buffer.from((await readDocumentSnapshot({ root: f.root, recordPath: report.record_path })).content)).toEqual(f.bytes);
    await generateContextIndex(f.root);
    expect((await validateRepository(f.root)).ok).toBe(true);
  });

  it.each(["wrong-hash", "missing-schema", "old-schema", "invalid-task", "nul", "utf8", "oversize"])("rejects %s capture before writes", async kind => {
    const f = await fixture(), options = { ...f.options };
    const schema = path.join(f.root, ".agent-context/schemas/document-snapshot.schema.json");
    if (kind === "wrong-hash") options.expectedHash = "sha256:" + "0".repeat(64);
    if (kind === "missing-schema") await rm(schema);
    if (kind === "old-schema") await writeFile(schema, JSON.stringify({ type: "object", required: ["unsupported-required-field"] }));
    if (kind === "invalid-task") options.taskId = "T-DOES-NOT-EXIST";
    if (kind === "nul") await writeFile(path.join(f.root, options.sourcePath), "raw\0text");
    if (kind === "utf8") await writeFile(path.join(f.root, options.sourcePath), Buffer.from([0xc3, 0x28]));
    if (kind === "oversize") await truncate(path.join(f.root, options.sourcePath), 8 * 1024 * 1024 + 1);
    const before = await documentManifest(f.root);
    await expect(captureDocumentSnapshot({ ...options, apply: true })).rejects.toThrow();
    expect(await documentManifest(f.root)).toEqual(before);
  });

  it.each(["../source.md", "raw\\source.md", ".git/private.md", ".planning/phase.md", "raw/NUL.md", "raw/source.md.", "raw/source.json"])("rejects unsafe source %j", async sourcePath => {
    const f = await fixture(), before = await documentManifest(f.root);
    await expect(captureDocumentSnapshot({ ...f.options, sourcePath, apply: true })).rejects.toThrow();
    expect(await documentManifest(f.root)).toEqual(before);
  });

  it.each(["archive", "record"])("refuses conflicting existing %s bytes before any new output", async which => {
    const f = await fixture(), preview = await captureDocumentSnapshot(f.options);
    const relative = which === "archive" ? preview.record.archive_path : preview.record_path;
    await mkdir(path.dirname(path.join(f.root, relative)), { recursive: true }); await writeFile(path.join(f.root, relative), "conflicting\r\n");
    const before = await documentManifest(f.root);
    await expect(captureDocumentSnapshot({ ...f.options, apply: true })).rejects.toThrow("different content");
    expect(await documentManifest(f.root)).toEqual(before);
  });

  it.each(["tamper", "missing", "hardlink"])("validation and read-back reject %s preimages", async kind => {
    const f = await fixture(), report = await captureDocumentSnapshot({ ...f.options, apply: true });
    const archive = path.join(f.root, report.record.archive_path);
    if (kind === "tamper") await writeFile(archive, "Changed bytes\n");
    if (kind === "missing") await rm(archive);
    if (kind === "hardlink") await link(archive, path.join(f.root, "raw/linked-preimage.md"));
    await generateContextIndex(f.root);
    const before = await documentManifest(f.root);
    await expect(readDocumentSnapshot({ root: f.root, recordPath: report.record_path })).rejects.toThrow();
    const validation = await validateRepository(f.root);
    expect(validation.ok).toBe(false); expect(validation.diagnostics.some(d => d.code === "SNAP001")).toBe(true);
    // Direct read and validation never repair or rewrite broken evidence.
    const after = await documentManifest(f.root); for (const [file, hash] of Object.entries(before)) expect(after[file], file).toBe(hash);
  });

  it.each(["foreign-owner", "foreign-archive", "wrong-source-size", "nonportable-source", "extra-authority"])("rejects a consistently rehashed %s record", async kind => {
    const f = await fixture(), report = await captureDocumentSnapshot({ ...f.options, apply: true });
    const recordPath = await replaceRecord(f.root, report.record_path, record => {
      if (kind === "foreign-owner") record.task_id = "T-OTHER";
      if (kind === "foreign-archive") record.archive_path = "raw/source.md";
      if (kind === "wrong-source-size") record.source_bytes += 1;
      if (kind === "nonportable-source") record.source_path = "../outside.md";
      if (kind === "extra-authority") (record as unknown as Record<string, unknown>).truth_level = "canonical";
    });
    await expect(readDocumentSnapshot({ root: f.root, recordPath })).rejects.toThrow();
    await generateContextIndex(f.root);
    expect((await validateRepository(f.root)).ok).toBe(false);
  });

  it.each(["whitespace", "duplicate-key", "utf8", "bom"])("rejects noncanonical %s record bytes", async kind => {
    const f = await fixture(), report = await captureDocumentSnapshot({ ...f.options, apply: true });
    const file = path.join(f.root, report.record_path), raw = await readFile(file);
    if (kind === "whitespace") await writeFile(file, JSON.stringify(report.record));
    if (kind === "duplicate-key") await writeFile(file, raw.toString().replace('"version": 1,', '"version": 1,\n  "version": 1,'));
    if (kind === "utf8") await writeFile(file, Buffer.concat([raw, Buffer.from([0xff])]));
    if (kind === "bom") await writeFile(file, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), raw]));
    await expect(readDocumentSnapshot({ root: f.root, recordPath: report.record_path })).rejects.toThrow();
    await generateContextIndex(f.root); expect((await validateRepository(f.root)).ok).toBe(false);
  });

  it.each(["root-excluded", "child-excluded", "ungoverned"])("cannot hide archive coverage via %s configuration", async kind => {
    const f = await fixture(), report = await captureDocumentSnapshot({ ...f.options, apply: true });
    const file = path.join(f.root, ".agent-context/config.yaml"), config = parse(await readFile(file, "utf8")), base = path.posix.dirname(report.record_path);
    if (kind === "root-excluded") config.exclude_paths.push(base);
    if (kind === "child-excluded") config.exclude_paths.push(report.record.archive_path);
    if (kind === "ungoverned") config.governed_paths = ["AGENTS.md", "docs/canontrail"];
    await writeFile(file, stringify(config)); await generateContextIndex(f.root);
    const validation = await validateRepository(f.root);
    expect(validation.ok).toBe(false); expect(validation.diagnostics.some(d => d.code === "SNAP004")).toBe(true);
  });

  it("detects a linked reserved archive without following it", async () => {
    const f = await fixture(), report = await captureDocumentSnapshot({ ...f.options, apply: true });
    const base = path.join(f.root, path.posix.dirname(report.record_path)), outside = path.join(f.root, "archive-preserved");
    await rename(base, outside); await symlink(outside, base, process.platform === "win32" ? "junction" : "dir");
    await generateContextIndex(f.root);
    const before = await documentManifest(f.root);
    const result = await validateRepository(f.root);
    expect(result.ok).toBe(false); expect(result.diagnostics.some(d => d.code === "SNAP004")).toBe(true);
    const after = await documentManifest(f.root); for (const [file, hash] of Object.entries(before)) expect(after[file], file).toBe(hash);
  });

  it("reports partial unreferenced preimages instead of deleting them or treating them as current truth", async () => {
    const f = await fixture(), report = await captureDocumentSnapshot({ ...f.options, apply: true });
    await rm(path.join(f.root, report.record_path)); await generateContextIndex(f.root);
    const before = await documentManifest(f.root), validation = await validateRepository(f.root);
    expect(validation.diagnostics.some(d => d.code === "SNAP005" && d.severity === "warning")).toBe(true);
    expect(await documentManifest(f.root)).toEqual(before);
  });

  it("fails read budgets without silent truncation and never accepts arbitrary files as records", async () => {
    const f = await fixture(), report = await captureDocumentSnapshot({ ...f.options, apply: true }), before = await documentManifest(f.root);
    await expect(readDocumentSnapshot({ root: f.root, recordPath: report.record_path, maxTokens: 1 })).rejects.toThrow("nothing was truncated");
    await expect(readDocumentSnapshot({ root: f.root, recordPath: f.options.sourcePath })).rejects.toThrow("hash-named");
    expect(await documentManifest(f.root)).toEqual(before);
  });

  it("executes preview/capture/read through the actual CLI without source or task mutation", async () => {
    const f = await fixture(), run = promisify(execFile), cli = path.resolve("dist/cli.js");
    const args = [cli, "document", "snapshot", f.root, "--task", f.taskId, "--source", f.options.sourcePath,
      "--purpose", f.options.purpose, "--created-at", f.options.createdAt!, "--json"];
    const before = await documentManifest(f.root), preview = JSON.parse((await run(process.execPath, args, { windowsHide: true })).stdout);
    expect(preview.writes_performed).toBe(false); expect(preview).not.toHaveProperty("content"); expect(await documentManifest(f.root)).toEqual(before);
    const applied = JSON.parse((await run(process.execPath, [...args, "--apply"], { windowsHide: true })).stdout);
    const captured = await documentManifest(f.root), read = JSON.parse((await run(process.execPath, [cli, "document", "snapshot-read", f.root,
      "--record", applied.record_path, "--json"], { windowsHide: true })).stdout);
    expect(Buffer.from(read.content)).toEqual(f.bytes); expect(read.record).toEqual(preview.record);
    expect(await documentManifest(f.root)).toEqual(captured);
  });

  it("blocks global CLI indexing on a missing preimage while retaining the existing index and broken evidence", async () => {
    const f = await fixture(), report = await captureDocumentSnapshot({ ...f.options, apply: true });
    await generateContextIndex(f.root); await rm(path.join(f.root, report.record.archive_path));
    const before = await documentManifest(f.root), run = promisify(execFile);
    await expect(run(process.execPath, [path.resolve("dist/cli.js"), "index", f.root], { windowsHide: true }))
      .rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("SNAP001") });
    expect(await documentManifest(f.root)).toEqual(before);
  });

  it("still audits an out-of-role record when the task inventory directory is absent", async () => {
    const f = await fixture(), report = await captureDocumentSnapshot({ ...f.options, apply: true });
    await mkdir(path.join(f.root, "docs/canontrail"), { recursive: true });
    await writeFile(path.join(f.root, "docs/canontrail/stray.document-snapshot.json"), await readFile(path.join(f.root, report.record_path)));
    await rm(path.join(f.root, ".agent-context/tasks"), { recursive: true }); await generateContextIndex(f.root);
    const before = await documentManifest(f.root), validation = await validateRepository(f.root);
    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.some(d => d.code === "SNAP001" && d.path === "docs/canontrail/stray.document-snapshot.json")).toBe(true);
    expect(await documentManifest(f.root)).toEqual(before);
  });

  it("rejects hardlinked source bytes before producing snapshot evidence", async () => {
    const f = await fixture(); await link(path.join(f.root, f.options.sourcePath), path.join(f.root, "raw/source-alias.md"));
    const before = await documentManifest(f.root);
    await expect(captureDocumentSnapshot({ ...f.options, apply: true })).rejects.toThrow(/unlinked regular/);
    expect(await documentManifest(f.root)).toEqual(before);
  });
});
