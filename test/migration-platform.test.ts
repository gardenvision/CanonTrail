import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { loadConfig } from "../src/config.js";
import { walkFiles, sha256 } from "../src/indexer.js";
import {
  executeMigrationTransaction, migrationDocumentResolutionErrors, planMigration,
  prepareMigrationTransformation, rollbackMigrationTransaction,
  type MigrationTargetHeader,
} from "../src/migration.js";
import { validateRepository } from "../src/validator.js";

const roots: string[] = [];
const DATE = "2026-09-05T10:00:00.000Z";
const LEGACY = "# Plants\n\n**Stand:** 2026-09-03\n**Status:** current\n**Truth level:** source-of-truth\n**Verification:** manual observation: ä, é, e\u0301 and 日本語\n**Read if task touches:** plants\n**Primary systems:** plants\n**Safe to edit:** Preserve text\n**Do not use instead:** none\n\n## Contract\n\nOriginal body  \n";
const HEADER: MigrationTargetHeader = {
  topic_id: "platform-fixture", stand: "2026-09-05", status: "current", truth_level: "draft",
  verification: { state: "unverified", evidence: [] }, read_if_task_touches: ["plants"],
  primary_systems: ["plants"], safe_to_edit: ["Preserve text"], do_not_use_instead: [],
};
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })));
});
async function temporaryRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "ct-platform-"));
  roots.push(root);
  return root;
}
async function fixture() {
  const root = await temporaryRoot();
  await mkdir(path.join(root, "docs"));
  return root;
}
async function proposal(root: string) {
  const plan = await planMigration({ root, migrationId: "MIG-PLATFORM-001", documentationRoots: ["docs"], createdAt: DATE });
  return prepareMigrationTransformation({
    root, migrationId: "MIG-PLATFORM-001", transactionId: "MTX-PLATFORM-001",
    documentationRoots: ["docs"], createdAt: DATE, apply: true,
    decisions: {
      version: 1, migration_id: plan.plan.migration_id, plan_hash: plan.plan.plan_hash,
      reviewed_by: "disposable-fixture-only", reviewed_at: DATE,
      decisions: plan.plan.documents.map((doc, i) => ({
        path: doc.path, target_path: doc.path, decision: "execute" as const,
        action: "normalize-header" as const, reason: "Explicit test fixture, not project approval",
        target_header: { ...HEADER, topic_id: "platform-fixture-" + i },
      })),
    },
  });
}
async function roundTrip(root: string) {
  const report = await proposal(root);
  expect(report.transaction.blockers).toEqual([]);
  const before = new Map<string, Buffer>();
  for (const operation of report.transaction.operations) {
    before.set(operation.source_path, await readFile(path.join(root, operation.source_path)));
  }
  await executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash, DATE);
  for (const operation of report.transaction.operations) {
    expect(sha256(await readFile(path.join(root, operation.target_path)))).toBe(operation.output_hash);
  }
  await rollbackMigrationTransaction(root, report.output_path, report.transaction.transaction_hash, DATE);
  for (const [name, bytes] of before) expect(await readFile(path.join(root, name))).toEqual(bytes);
  return report;
}
describe("native migration portability", () => {
  it.each([
    ["LF", LEGACY], ["CRLF", LEGACY.replace(/\n/g, "\r\n")],
    ["BOM-LF", "\uFEFF" + LEGACY], ["BOM-CRLF", "\uFEFF" + LEGACY.replace(/\n/g, "\r\n")],
  ])("round-trips exact Unicode and spaced names with %s bytes", async (_name, source) => {
    const root = await fixture();
    await mkdir(path.join(root, "docs", "Grüne Notizen"));
    await writeFile(path.join(root, "docs", "Grüne Notizen", "café 日本語~v1.md"), source!);
    const report = await roundTrip(root);
    expect(report.transaction.operations).toHaveLength(1);
    expect(report.transaction.operations[0]!.source_path).toContain("~v1.md");
  });
  it("preserves distinct case names where supported and rejects a case alias where not", async () => {
    const root = await fixture();
    const upper = path.join(root, "docs", "Plants.md");
    const lower = path.join(root, "docs", "plants.md");
    await writeFile(upper, LEGACY);
    let aliases = false;
    try { aliases = (await stat(upper)).ino === (await stat(lower)).ino; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (aliases) {
      expect(await migrationDocumentResolutionErrors(root, ["docs"], ["docs/plants.md"]))
        .toEqual([expect.stringContaining("filesystem alias")]);
    } else {
      await writeFile(lower, LEGACY.replace("Original body", "Second independent body"), { flag: "wx" });
    }
    const report = await roundTrip(root);
    expect(report.transaction.operations).toHaveLength(aliases ? 1 : 2);
  });
  it("uses native stored Unicode names without collapsing distinct NFC/NFD files", async () => {
    const root = await fixture();
    await writeFile(path.join(root, "docs", "café.md"), LEGACY);
    let distinct = true;
    try { await writeFile(path.join(root, "docs", "cafe\u0301.md"), LEGACY + "\nSecond source\n", { flag: "wx" }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; distinct = false; }
    const names = (await readdir(path.join(root, "docs"))).sort();
    const report = await roundTrip(root);
    expect(report.transaction.operations.map((op) => op.source_path).sort()).toEqual(names.map((name) => "docs/" + name));
    expect(report.transaction.operations).toHaveLength(distinct ? 2 : 1);
  });
  it("does not follow a linked documentation directory or use it for execution", async () => {
    const root = await fixture();
    const outside = await temporaryRoot();
    await writeFile(path.join(root, "docs", "plants.md"), LEGACY);
    await writeFile(path.join(outside, "external.md"), LEGACY);
    await symlink(outside, path.join(root, "docs", "linked"), process.platform === "win32" ? "junction" : "dir");
    const plan = await planMigration({ root, migrationId: "MIG-LINK-001", documentationRoots: ["docs"], createdAt: DATE });
    expect(plan.plan.documents.map((doc) => doc.path)).toEqual(["docs/plants.md"]);
    expect(plan.plan.unprocessed).toContainEqual({ path: "docs/linked", reason: "symbolic link not followed" });
    expect(await migrationDocumentResolutionErrors(root, ["docs"], ["docs/linked/external.md"]))
      .toEqual([expect.stringContaining("symbolic link")]);
    await roundTrip(root);
    expect(await readFile(path.join(outside, "external.md"), "utf8")).toBe(LEGACY);
  });
  it("rejects a native file symlink when the fixture volume permits one", async (context) => {
    const root = await fixture();
    const outside = await temporaryRoot();
    await writeFile(path.join(outside, "external.md"), LEGACY);
    try { await symlink(path.join(outside, "external.md"), path.join(root, "docs", "linked.md"), "file"); }
    catch (error) {
      if (!["EPERM", "EACCES", "ENOTSUP"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
      context.skip("Native file symlinks are unavailable under this runner's privileges; directory-link checks still run.");
      return;
    }
    expect(await migrationDocumentResolutionErrors(root, ["docs"], ["docs/linked.md"]))
      .toEqual([expect.stringContaining("symbolic link")]);
    expect(await readFile(path.join(outside, "external.md"), "utf8")).toBe(LEGACY);
  });
  it("rejects a directory link introduced immediately before rollback", async () => {
    const root = await fixture();
    const outside = await temporaryRoot();
    await writeFile(path.join(root, "docs", "plants.md"), LEGACY);
    const report = await proposal(root);
    await executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash, DATE);
    const postimage = await readFile(path.join(root, "docs", "plants.md"));
    await writeFile(path.join(outside, "plants.md"), postimage);
    await expect(rollbackMigrationTransaction(root, report.output_path, report.transaction.transaction_hash, DATE, {
      beforeImmediateRollbackCheck: async () => {
        await rename(path.join(root, "docs"), path.join(root, "saved-docs"));
        await symlink(outside, path.join(root, "docs"), process.platform === "win32" ? "junction" : "dir");
      },
    })).rejects.toThrow(/symbolic link/);
    expect(await readFile(path.join(outside, "plants.md"))).toEqual(postimage);
    expect(await readFile(path.join(root, "saved-docs", "plants.md"))).toEqual(postimage);
    await expect(readFile(path.join(root, path.dirname(report.output_path), "execution", "rollback.record.json")))
      .rejects.toMatchObject({ code: "ENOENT" });
  });
  it("keeps post-transaction edits instead of silently overwriting them on rollback", async () => {
    const root = await fixture();
    await writeFile(path.join(root, "docs", "plants.md"), LEGACY);
    const report = await proposal(root);
    await executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash, DATE);
    await writeFile(path.join(root, "docs", "plants.md"), "A later user edit\n");
    await expect(rollbackMigrationTransaction(root, report.output_path, report.transaction.transaction_hash, DATE))
      .rejects.toThrow(/drift blocks rollback/);
    expect(await readFile(path.join(root, "docs", "plants.md"), "utf8")).toBe("A later user edit\n");
  });
  it.each([".AGENT-CONTEXT", ".agent-context/MIGRATIONS", ".agent-context/migrations-archive"])(
    "does not falsely report a migration coverage gap for non-matching exclusion %s", async (excluded) => {
      const root = await fixture();
      await cp(path.resolve("schemas"), path.join(root, "schemas"), { recursive: true });
      const artifact = ".agent-context/migrations/MIG-BAD/migration.plan.json";
      await mkdir(path.dirname(path.join(root, artifact)), { recursive: true });
      await writeFile(path.join(root, artifact), "{}");
      const configPath = path.join(root, ".agent-context", "config.yaml");
      await writeFile(configPath, stringify({
        version: 1, governed_paths: [".agent-context/migrations"], exclude_paths: [excluded],
        require_frontmatter_for_all_markdown: false,
      }));
      const before = await readFile(configPath);
      expect(await walkFiles(root, await loadConfig(root))).toContain(artifact);
      const result = await validateRepository(root, { checkIndex: false });
      expect(result.diagnostics.some((item) => item.code === "CFG002")).toBe(false);
      expect(result.diagnostics.some((item) => item.path === artifact && item.code === "SCHEMA005")).toBe(true);
      expect(await readFile(configPath)).toEqual(before);
    },
  );
  it.skipIf(process.platform === "win32")("preserves POSIX permission bits across atomic apply and rollback", async () => {
    const root = await fixture();
    const name = path.join(root, "docs", "private.md");
    await writeFile(name, LEGACY);
    await chmod(name, 0o640);
    const report = await proposal(root);
    await executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash, DATE);
    expect((await stat(name)).mode & 0o777).toBe(0o640);
    await rollbackMigrationTransaction(root, report.output_path, report.transaction.transaction_hash, DATE);
    expect((await stat(name)).mode & 0o777).toBe(0o640);
    expect(await readFile(name, "utf8")).toBe(LEGACY);
  });
});
