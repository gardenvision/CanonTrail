import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { initializeProject } from "../src/initializer.js";
import { finalizeRepository } from "../src/finalize.js";
import { generateContextIndex } from "../src/indexer.js";
import {
  computeMigrationDecisionSetHash, computeMigrationPlanHash, computeMigrationTransactionHash,
  executeMigrationTransaction, rollbackMigrationTransaction,
  migrationDocumentResolutionErrors, migrationDocumentationRootErrors,
  migrationTransactionBindingErrors, planMigration, prepareMigrationTransformation,
  type MigrationTransaction, type MigrationTargetHeader,
} from "../src/migration.js";
import { validateRepository } from "../src/validator.js";

const roots: string[] = [];
const DATE = "2026-09-05T12:00:00.000Z";
const LEGACY = "# Plants\n\n**Stand:** 2026-09-03\n**Status:** current\n**Truth level:** source-of-truth\n**Verification:** observed, not independently verified\n**Read if task touches:** plants\n**Primary systems:** plants\n**Safe to edit:** Preserve text\n**Do not use instead:** none\n\n## Contract\n\nStable original bytes.\n";
const HEADER: MigrationTargetHeader = {
  topic_id: "plants", stand: "2026-09-05", status: "current", truth_level: "draft",
  verification: { state: "unverified", evidence: [] }, read_if_task_touches: ["plants"],
  primary_systems: ["plants"], safe_to_edit: ["Preserve text"], do_not_use_instead: [],
};
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })));
});
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ct-review-"));
  roots.push(root);
  return root;
}
async function fixture() {
  const root = await temporaryRoot();
  await mkdir(path.join(root, "docs"), { recursive: true });
  await writeFile(path.join(root, "docs/plants.md"), LEGACY);
  await cp(path.resolve("schemas"), path.join(root, "schemas"), { recursive: true });
  await mkdir(path.join(root, ".agent-context"));
  await writeFile(path.join(root, ".agent-context/config.yaml"), stringify({
    version: 1, governed_paths: [".agent-context/migrations"], require_frontmatter_for_all_markdown: false,
  }));
  return root;
}
async function proposal(root: string, doc = "docs/plants.md", documentationRoots = ["docs"]) {
  const plan = await planMigration({ root, migrationId: "MIG-REVIEW-001", documentationRoots, createdAt: DATE });
  return prepareMigrationTransformation({
    root, migrationId: "MIG-REVIEW-001", transactionId: "MTX-REVIEW-001", documentationRoots, createdAt: DATE, apply: true,
    decisions: {
      version: 1, migration_id: plan.plan.migration_id, plan_hash: plan.plan.plan_hash,
      reviewed_by: "fixture-reviewer", reviewed_at: DATE,
      decisions: [{ path: doc, decision: "execute", action: "normalize-header", target_path: doc, reason: "Fixture-only approved normalization", target_header: HEADER }],
    },
  });
}
function rehash(transaction: MigrationTransaction): MigrationTransaction {
  transaction.decision_hash = computeMigrationDecisionSetHash({
    version: 1, migration_id: transaction.migration_id, plan_hash: transaction.plan_hash,
    reviewed_by: transaction.reviewed_by!, reviewed_at: transaction.reviewed_at!, decisions: transaction.decisions,
  });
  const { transaction_hash: _old, ...payload } = transaction;
  return { ...payload, transaction_hash: computeMigrationTransactionHash(payload) };
}
async function configure(root: string, patch: Record<string, unknown>) {
  const configPath = path.join(root, ".agent-context/config.yaml");
  const config = parse(await readFile(configPath, "utf8"));
  await writeFile(configPath, stringify({ ...config, ...patch }));
  return readFile(configPath);
}
async function schema(name: string) {
  const value = JSON.parse(await readFile(path.resolve("schemas", name + ".schema.json"), "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  return { value, validate: ajv.compile(value) };
}

describe("Sonnet review regression boundaries", () => {
  it.each(["migration.plan.json", "transactions/MTX-BAD/transaction.json", "transactions/MTX-BAD/execution/intent.json"])(
    "fresh init validates malformed migration artifact %s", async (artifact) => {
      const root = await temporaryRoot();
      expect((await initializeProject(root)).ok).toBe(true);
      const configBytes = await readFile(path.join(root, ".agent-context/config.yaml"));
      expect(parse(configBytes.toString()).governed_paths).toContain(".agent-context/migrations");
      const relative = ".agent-context/migrations/MIG-BAD/" + artifact;
      await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
      await writeFile(path.join(root, relative), "{}\n");
      const result = await validateRepository(root, { checkIndex: false });
      expect(result.ok).toBe(false);
      expect(result.diagnostics.some((item) => item.path === relative && item.code === "SCHEMA005")).toBe(true);
      expect((await finalizeRepository({ root, failOnWarnings: true })).ok).toBe(false);
      expect(await readFile(path.join(root, ".agent-context/config.yaml"))).toEqual(configBytes);
    },
  );
  it("keeps old narrow configurations valid without migrations, then fails visibly when the tree appears", async () => {
    const root = await temporaryRoot();
    await initializeProject(root);
    const config = await configure(root, { governed_paths: ["docs/canontrail", ".agent-context/tasks", ".agent-context/compatibility.yaml"] });
    await writeFile(path.join(root, "unrelated.md"), "# This is not governed\n");
    await generateContextIndex(root);
    expect((await validateRepository(root)).ok).toBe(true);
    await mkdir(path.join(root, ".agent-context/migrations"), { recursive: true });
    const report = await validateRepository(root);
    expect(report.diagnostics.filter((item) => item.code === "CFG002")).toHaveLength(1);
    const final = await finalizeRepository({ root, failOnWarnings: true });
    expect(final.ok).toBe(false);
    expect(final.gates.find((gate) => gate.id === "repository")?.status).toBe("fail");
    expect(await readFile(path.join(root, ".agent-context/config.yaml"))).toEqual(config);
    expect(report.diagnostics.some((item) => item.path === "unrelated.md")).toBe(false);
  });
  it.each([".agent-context", ".agent-context/migrations", ".agent-context/migrations/MIG-ONE", "./.agent-context/migrations/", "."])(
    "fails visible coverage when exclude_paths contains %s", async (excluded) => {
      const root = await temporaryRoot();
      await initializeProject(root);
      await mkdir(path.join(root, ".agent-context/migrations"), { recursive: true });
      const config = await configure(root, { exclude_paths: [excluded] });
      const report = await validateRepository(root, { checkIndex: false });
      expect(report.diagnostics.some((item) => item.code === "CFG002")).toBe(true);
      expect((await finalizeRepository({ root })).ok).toBe(false);
      expect(await readFile(path.join(root, ".agent-context/config.yaml"))).toEqual(config);
    },
  );
  it("allows an unrelated exclusion with fully governed migration artifacts", async () => {
    const root = await temporaryRoot();
    await initializeProject(root);
    await mkdir(path.join(root, ".agent-context/migrations"), { recursive: true });
    await configure(root, { exclude_paths: [".agent-context/generated"] });
    expect((await validateRepository(root, { checkIndex: false })).ok).toBe(true);
  });
  it("requires coverage of the whole tree, not just one known transaction", async () => {
    const root = await fixture();
    await proposal(root);
    await configure(root, { governed_paths: [".agent-context/migrations/MIG-REVIEW-001"] });
    expect((await validateRepository(root, { checkIndex: false })).diagnostics.some((item) => item.code === "CFG002")).toBe(true);
  });
  it("fails visibly instead of following a symbolic-link migration control root", async () => {
    const root = await temporaryRoot();
    const external = await temporaryRoot();
    await initializeProject(root);
    await symlink(external, path.join(root, ".agent-context/migrations"), process.platform === "win32" ? "junction" : "dir");
    expect((await validateRepository(root, { checkIndex: false })).diagnostics.some((item) => item.code === "CFG002")).toBe(true);
  });
  it.each(["docs/", "docs//nested", "./docs"])("rejects noncanonical stored documentation root %s", (root) => {
    expect(migrationDocumentationRootErrors([root]).length).toBeGreaterThan(0);
  });
  it("normalizes trailing CLI root separators and supports dot as a reviewed root, but not as a document path", async () => {
    const root = await fixture();
    const normal = await planMigration({ root, migrationId: "MIG-PATH-001", documentationRoots: ["docs/"], createdAt: DATE });
    expect(normal.plan.documentation_roots).toEqual(["docs"]);
    const broad = await planMigration({ root, migrationId: "MIG-PATH-001", documentationRoots: ["."], createdAt: DATE });
    expect((await schema("migration-plan")).validate(broad.plan)).toBe(true);
    const report = await proposal(root, "docs/plants.md", ["."]);
    expect(report.transaction.blockers).toEqual([]);
    expect((await schema("migration-transaction")).validate(report.transaction)).toBe(true);
    await executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash);
    await rollbackMigrationTransaction(root, report.output_path, report.transaction.transaction_hash);
    expect(await readFile(path.join(root, "docs/plants.md"), "utf8")).toBe(LEGACY);
  });
  it.each(["docs/plants.md/", "docs//plants.md", "docs/./plants.md"])("rejects malformed document spelling %s in every migration schema and binding", async (invalid) => {
    const root = await fixture();
    const report = await proposal(root);
    const modified = structuredClone(report.transaction);
    modified.operations[0]!.source_path = invalid;
    modified.operations[0]!.target_path = invalid;
    modified.decisions[0]!.path = invalid;
    modified.decisions[0]!.target_path = invalid;
    expect(migrationTransactionBindingErrors(modified).length).toBeGreaterThan(0);
    expect((await schema("migration-transaction")).validate(modified)).toBe(false);
    const plan = await planMigration({ root, migrationId: "MIG-PATH-001", documentationRoots: ["docs"], createdAt: DATE });
    plan.plan.documents[0]!.path = invalid;
    expect((await schema("migration-plan")).validate(plan.plan)).toBe(false);
    const executionSchema = await schema("migration-execution");
    const validatePath = new Ajv2020({ strict: true }).compile(executionSchema.value.$defs.path);
    expect(validatePath(invalid)).toBe(false);
  });
  it("allows an exact ordinary tilde-containing document name", async () => {
    const root = await fixture();
    await rm(path.join(root, "docs/plants.md"));
    await writeFile(path.join(root, "docs/plants~notes.md"), LEGACY);
    const report = await proposal(root, "docs/plants~notes.md");
    expect(report.transaction.blockers).toEqual([]);
    expect(await migrationDocumentResolutionErrors(root, ["docs"], ["docs/plants~notes.md"])).toEqual([]);
    await executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash);
    await rollbackMigrationTransaction(root, report.output_path, report.transaction.transaction_hash);
    expect(await readFile(path.join(root, "docs/plants~notes.md"), "utf8")).toBe(LEGACY);
  });
  it("preserves missing historical paths without inventing a file-drift error", async () => {
    const root = await fixture();
    expect(await migrationDocumentResolutionErrors(root, ["docs"], ["docs/missing/old.md"])).toEqual([]);
  });
  it("reports pre-intent staging failure honestly and preserves partial evidence", async () => {
    const root = await fixture();
    const report = await proposal(root);
    await expect(executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash, DATE, {
      beforeIntentWrite: async () => { throw new Error("injected pre-intent failure"); },
    })).rejects.toThrow(/rollback is unavailable/);
    expect(await readFile(path.join(root, "docs/plants.md"), "utf8")).toBe(LEGACY);
    const evidence = path.join(root, path.dirname(report.output_path), "execution");
    expect(await readFile(path.join(evidence, "OP-0001.before.bin"), "utf8")).toBe(LEGACY);
    await expect(readFile(path.join(evidence, "intent.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(path.join(evidence, "apply.record.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(rollbackMigrationTransaction(root, report.output_path, report.transaction.transaction_hash)).rejects.toThrow(/valid recovery intent is required/);
    await expect(executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash)).rejects.toThrow(/inspect and preserve/);
  });
  it("advises rollback only when valid staged images and intent are durable", async () => {
    const root = await fixture();
    const report = await proposal(root);
    await expect(executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash, DATE, {
      beforeImmediateWriteCheck: async () => { throw new Error("injected post-intent failure"); },
    })).rejects.toThrow(/Run rollback with the same transaction hash/);
    await rollbackMigrationTransaction(root, report.output_path, report.transaction.transaction_hash);
    expect(await readFile(path.join(root, "docs/plants.md"), "utf8")).toBe(LEGACY);
  });
  it("does not recommend rollback if durable intent exists but its staged preimage has become incomplete", async () => {
    const root = await fixture();
    const report = await proposal(root);
    await expect(executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash, DATE, {
      beforeImmediateWriteCheck: async () => {
        await rm(path.join(root, path.dirname(report.output_path), "execution/OP-0001.before.bin"));
        throw new Error("injected damaged staging");
      },
    })).rejects.toThrow(/rollback is unavailable/);
    expect(await readFile(path.join(root, "docs/plants.md"), "utf8")).toBe(LEGACY);
  });
  it.skipIf(process.platform !== "win32")("rejects ordinary short-name aliases without banning legitimate tilde names", async (context) => {
    const root = await fixture();
    await mkdir(path.join(root, "docs/LongDocumentation"));
    await writeFile(path.join(root, "docs/LongDocumentation/notes.md"), LEGACY);
    const shortPath = execFileSync(process.env.ComSpec ?? "cmd.exe",
      ["/d", "/c", "for %I in (docs\\LongDocumentation) do @echo %~sI"],
      { cwd: root, windowsHide: true, encoding: "utf8" }).trim();
    const alias = path.basename(shortPath);
    if (!alias || alias.toLowerCase() === "longdocumentation") { context.skip(); return; }
    expect(await realpath(path.join(root, "docs", alias))).toBe(await realpath(path.join(root, "docs/LongDocumentation")));
    expect(await migrationDocumentResolutionErrors(root, ["docs"], ["docs/" + alias + "/notes.md"]))
      .toEqual([expect.stringContaining("filesystem alias")]);
    expect(await migrationDocumentResolutionErrors(root, ["docs"], ["docs/" + alias + "/missing/notes.md"]))
      .toEqual([expect.stringContaining("filesystem alias")]);
    expect(await migrationDocumentResolutionErrors(root, ["docs"], ["docs/LongDocumentation/notes.md"])).toEqual([]);
  });

  it.skipIf(process.platform !== "win32")("rejects a real Windows short-name control-tree alias before execute, rollback, or validation can trust it", async (context) => {
    const root = await fixture();
    const report = await proposal(root);
    const shortPath = execFileSync(process.env.ComSpec ?? "cmd.exe",
      ["/d", "/c", "for %I in (.agent-context) do @echo %~sI"],
      { cwd: root, windowsHide: true, encoding: "utf8" }).trim();
    const alias = path.basename(shortPath);
    if (!alias || alias.toLowerCase() === ".agent-context") {
      context.skip();
      return;
    }
    expect(await realpath(path.join(root, alias))).toBe(await realpath(path.join(root, ".agent-context")));
    await writeFile(path.join(root, ".agent-context/evil.md"), LEGACY);
    const aliasPath = alias + "/evil.md";
    const modified = structuredClone(report.transaction);
    modified.documentation_roots = [alias];
    modified.operations[0]!.source_path = aliasPath;
    modified.operations[0]!.target_path = aliasPath;
    modified.decisions[0]!.path = aliasPath;
    modified.decisions[0]!.target_path = aliasPath;
    const forged = rehash(modified);
    expect(migrationTransactionBindingErrors(forged)).toEqual([]);
    expect((await schema("migration-transaction")).validate(forged)).toBe(true);
    await writeFile(path.join(root, report.output_path), JSON.stringify(forged));
    const plan = await planMigration({ root, migrationId: "MIG-REVIEW-001", documentationRoots: ["docs"], createdAt: DATE });
    plan.plan.documentation_roots = [alias];
    plan.plan.documents[0]!.path = aliasPath;
    plan.plan.documents[0]!.target_path = aliasPath;
    const { plan_hash: _old, ...planPayload } = plan.plan;
    await writeFile(path.join(root, ".agent-context/migrations/MIG-REVIEW-001/migration.plan.json"),
      JSON.stringify({ ...planPayload, plan_hash: computeMigrationPlanHash(planPayload) }));
    const validation = await validateRepository(root, { checkIndex: false });
    expect(validation.diagnostics.some((item) => item.code === "MIGRATION107" && item.message.includes("reserved control tree"))).toBe(true);
    expect(validation.diagnostics.some((item) => item.code === "MIGRATION007" && item.message.includes("reserved control tree"))).toBe(true);
    await expect(executeMigrationTransaction(root, report.output_path, forged.transaction_hash)).rejects.toThrow(/reserved control tree/);
    await expect(rollbackMigrationTransaction(root, report.output_path, forged.transaction_hash)).rejects.toThrow(/reserved control tree/);
    expect(await readFile(path.join(root, ".agent-context/evil.md"), "utf8")).toBe(LEGACY);
    await expect(readFile(path.join(root, path.dirname(report.output_path), "execution/intent.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
