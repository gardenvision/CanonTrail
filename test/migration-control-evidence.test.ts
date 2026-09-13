import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { initializeProject } from "../src/initializer.js";
import { finalizeRepository } from "../src/finalize.js";
import { generateContextIndex } from "../src/indexer.js";
import {
  executeMigrationTransaction, rollbackMigrationTransaction, planMigration,
  prepareMigrationTransformation, type MigrationTargetHeader,
} from "../src/migration.js";
import { validateRepository } from "../src/validator.js";

const roots: string[] = [];
const DATE = "2026-09-05T18:00:00.000Z";
const LEGACY = "# Plants\n\n**Stand:** 2026-09-03\n**Status:** current\n**Truth level:** source-of-truth\n**Verification:** manually observed\n**Read if task touches:** plants\n**Primary systems:** plants\n**Safe to edit:** Preserve text\n**Do not use instead:** none\n\n## Contract\n\nOriginal bytes.\n";
const HEADER: MigrationTargetHeader = {
  topic_id: "control-fixture", stand: "2026-09-05", status: "current", truth_level: "draft",
  verification: { state: "unverified", evidence: [] }, read_if_task_touches: ["plants"],
  primary_systems: ["plants"], safe_to_edit: ["Preserve text"], do_not_use_instead: [],
};
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })));
});
async function temporaryRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "ct-control-"));
  roots.push(root);
  return root;
}
async function fixture() {
  const root = await temporaryRoot();
  await mkdir(path.join(root, "docs"));
  await writeFile(path.join(root, "docs/plants.md"), LEGACY);
  await cp(path.resolve("schemas"), path.join(root, "schemas"), { recursive: true });
  await mkdir(path.join(root, ".agent-context"));
  await writeFile(path.join(root, ".agent-context/config.yaml"), stringify({
    version: 1, governed_paths: [".agent-context/migrations"], require_frontmatter_for_all_markdown: false,
  }));
  const plan = await planMigration({ root, migrationId: "MIG-CONTROL", documentationRoots: ["docs"], createdAt: DATE });
  const proposal = await prepareMigrationTransformation({
    root, migrationId: "MIG-CONTROL", transactionId: "MTX-CONTROL",
    documentationRoots: ["docs"], createdAt: DATE, apply: true,
    decisions: {
      version: 1, migration_id: plan.plan.migration_id, plan_hash: plan.plan.plan_hash,
      reviewed_by: "test-fixture-only", reviewed_at: DATE,
      decisions: [{ path: "docs/plants.md", target_path: "docs/plants.md", decision: "execute",
        action: "normalize-header", reason: "Fixture normalization", target_header: HEADER }],
    },
  });
  await generateContextIndex(root);
  const execution = path.join(root, path.dirname(proposal.output_path), "execution");
  const apply = () => executeMigrationTransaction(root, proposal.output_path, proposal.transaction.transaction_hash, DATE);
  const rollback = () => rollbackMigrationTransaction(root, proposal.output_path, proposal.transaction.transaction_hash, DATE);
  return { root, proposal, execution, apply, rollback };
}
async function linkDirectory(target: string, link: string) {
  await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
}
async function replaceWithLink(directory: string) {
  const outside = path.join(await temporaryRoot(), "moved");
  await rename(directory, outside);
  await linkDirectory(outside, directory);
  return outside;
}
async function assertRejectedGates(root: string) {
  const report = await validateRepository(root);
  expect(report.ok).toBe(false);
  expect(report.diagnostics.some((d) => d.code === "CFG002")).toBe(true);
  expect((await finalizeRepository({ root, failOnWarnings: true })).ok).toBe(false);
}

describe("independent 43e180e control-evidence findings", () => {
  it("retains complete valid apply/rollback idempotence and byte-exact restoration", async () => {
    const f = await fixture();
    const applied = await f.apply();
    expect(await f.apply()).toEqual(applied);
    const rolledBack = await f.rollback();
    expect(await f.rollback()).toEqual(rolledBack);
    expect(await readFile(path.join(f.root, "docs/plants.md"), "utf8")).toBe(LEGACY);
    expect((await validateRepository(f.root)).ok).toBe(true);
  });

  it.each(["execute", "apply-retry", "rollback", "rollback-retry"])("rejects a stable execution-directory link on %s", async (operation) => {
    const f = await fixture();
    if (operation !== "execute") await f.apply();
    else await mkdir(f.execution);
    if (operation === "rollback-retry") await f.rollback();
    const before = await readFile(path.join(f.root, "docs/plants.md"));
    const outside = await replaceWithLink(f.execution);
    const namesBefore = (await readdir(outside)).sort();
    await expect(operation.startsWith("rollback") ? f.rollback() : f.apply()).rejects.toThrow(/symbolic link|control path/);
    expect((await readdir(outside)).sort()).toEqual(namesBefore);
    expect(await readFile(path.join(f.root, "docs/plants.md"))).toEqual(before);
    await assertRejectedGates(f.root);
  });

  it("checks execution containment again before writing the apply intent", async () => {
    const f = await fixture();
    let outside = "";
    await expect(executeMigrationTransaction(f.root, f.proposal.output_path, f.proposal.transaction.transaction_hash, DATE, {
      beforeIntentWrite: async () => { outside = await replaceWithLink(f.execution); },
    })).rejects.toThrow(/symbolic link|control path/);
    expect(await readFile(path.join(f.root, "docs/plants.md"), "utf8")).toBe(LEGACY);
    expect((await readdir(outside)).sort()).toEqual(["OP-0001.after.bin", "OP-0001.before.bin"]);
  });

  it("checks execution containment after the immediate document-write test boundary", async () => {
    const f = await fixture();
    let outside = "";
    await expect(executeMigrationTransaction(f.root, f.proposal.output_path, f.proposal.transaction.transaction_hash, DATE, {
      beforeImmediateWriteCheck: async () => { outside = await replaceWithLink(f.execution); },
    })).rejects.toThrow(/symbolic link|control path/);
    expect(await readFile(path.join(f.root, "docs/plants.md"), "utf8")).toBe(LEGACY);
    expect(await readdir(outside)).not.toContain("apply.record.json");
  });

  it("checks execution containment after the immediate rollback test boundary", async () => {
    const f = await fixture();
    await f.apply();
    const before = await readFile(path.join(f.root, "docs/plants.md"));
    let outside = "";
    await expect(rollbackMigrationTransaction(f.root, f.proposal.output_path, f.proposal.transaction.transaction_hash, DATE, {
      beforeImmediateRollbackCheck: async () => { outside = await replaceWithLink(f.execution); },
    })).rejects.toThrow(/symbolic link|control path/);
    expect(await readFile(path.join(f.root, "docs/plants.md"))).toEqual(before);
    expect(await readdir(outside)).not.toContain("rollback.record.json");
  });

  it.for(["intent.json", "apply.record.json", "rollback.record.json", "OP-0001.before.bin", "OP-0001.after.bin"])(
    "rejects a linked evidence file %s without reading through it", async (name, context) => {
      const f = await fixture();
      await f.apply();
      await f.rollback();
      const file = path.join(f.execution, name);
      const bytes = await readFile(file);
      const outside = path.join(await temporaryRoot(), name);
      await rename(file, outside);
      try { await symlink(outside, file, "file"); }
      catch (error) {
        if (!["EPERM", "EACCES", "ENOTSUP"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
        context.skip("Native file symlinks unavailable; directory links remain tested.");
        return;
      }
      await expect(f.rollback()).rejects.toThrow(/symbolic link|control path/);
      expect(await readFile(outside)).toEqual(bytes);
      await assertRejectedGates(f.root);
    },
  );

  it.each(["intent.json", "OP-0001.before.bin", "OP-0001.after.bin"])(
    "rejects repeated rollback with missing %s", async (name) => {
      const f = await fixture();
      await f.apply();
      const record = await f.rollback();
      const before = await readFile(path.join(f.root, "docs/plants.md"));
      const recordBytes = await readFile(path.join(f.execution, "rollback.record.json"));
      await rm(path.join(f.execution, name));
      await expect(f.rollback()).rejects.toThrow(/incomplete|does not exist|required/);
      expect(await readFile(path.join(f.execution, "rollback.record.json"))).toEqual(recordBytes);
      expect(await readFile(path.join(f.root, "docs/plants.md"))).toEqual(before);
      expect(record.kind).toBe("migration-rollback");
      expect((await validateRepository(f.root)).ok).toBe(false);
    },
  );

  it.each(["intent.json", "OP-0001.before.bin", "OP-0001.after.bin"])(
    "rejects repeated rollback with corrupt %s", async (name) => {
      const f = await fixture();
      await f.apply();
      await f.rollback();
      await writeFile(path.join(f.execution, name), "{}");
      await expect(f.rollback()).rejects.toThrow(/schema|invalid|mismatch/);
      expect(await readFile(path.join(f.root, "docs/plants.md"), "utf8")).toBe(LEGACY);
      expect((await validateRepository(f.root)).ok).toBe(false);
    },
  );

  it.each([".agent-context", ".agent-context/migrations"])(
    "does not hide invalid artifacts behind actual control spelling %s", async (relative) => {
      const root = await temporaryRoot();
      await initializeProject(root);
      const bad = ".agent-context/migrations/MIG-BAD/migration.plan.json";
      await mkdir(path.dirname(path.join(root, bad)), { recursive: true });
      await writeFile(path.join(root, bad), "{}");
      expect((await validateRepository(root)).ok).toBe(false);
      const old = path.join(root, relative);
      const upper = path.join(path.dirname(old), path.basename(old).toUpperCase());
      const temporary = old + "-rename";
      const config = await readFile(path.join(root, ".agent-context/config.yaml"));
      await rename(old, temporary);
      await rename(temporary, upper);
      let aliases = false;
      try { aliases = (await lstat(old)).ino === (await lstat(upper)).ino; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      if (aliases) {
        await assertRejectedGates(root);
        expect(await readFile(path.join(root, ".agent-context/config.yaml"))).toEqual(config);
      } else {
        // Different POSIX case names are not the canonical control tree.
        const result = await validateRepository(root);
        expect(result.diagnostics.some((d) => d.code === "CFG002")).toBe(false);
        const configPath = relative === ".agent-context" ? path.join(upper, "config.yaml") : path.join(root, ".agent-context/config.yaml");
        expect(await readFile(configPath)).toEqual(config);
      }
    },
  );

  it.each(["MIG-BAD", "MIG-BAD/transactions", "MIG-BAD/transactions/MTX-BAD"])(
    "does not silently skip a linked descendant %s", async (child) => {
      const root = await temporaryRoot();
      await initializeProject(root);
      const folder = path.join(root, ".agent-context/migrations", child);
      await mkdir(folder, { recursive: true });
      await writeFile(path.join(folder, "migration.plan.json"), "{}");
      const outside = await replaceWithLink(folder);
      const config = await readFile(path.join(root, ".agent-context/config.yaml"));
      await assertRejectedGates(root);
      expect(await readFile(path.join(outside, "migration.plan.json"), "utf8")).toBe("{}");
      expect(await readFile(path.join(root, ".agent-context/config.yaml"))).toEqual(config);
    },
  );


  it.each(["migration-apply", "migration-rollback"] as const)("rechecks the control directory immediately before the %s record", async (kind) => {
    const f = await fixture();
    if (kind === "migration-rollback") await f.apply();
    let outside = "";
    const hook = { beforeEvidenceRecordWrite: async () => { outside = await replaceWithLink(f.execution); } };
    const action = kind === "migration-apply" ? executeMigrationTransaction : rollbackMigrationTransaction;
    await expect(action(f.root, f.proposal.output_path, f.proposal.transaction.transaction_hash, DATE, hook))
      .rejects.toThrow(/symbolic link|control path/);
    expect(await readdir(outside)).not.toContain(kind === "migration-apply" ? "apply.record.json" : "rollback.record.json");
    expect(await readFile(path.join(f.root, "docs/plants.md"), "utf8")).toBe(LEGACY);
  });

  it.each(["plan", "proposal"])("does not write a %s through a linked control root", async (kind) => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, "docs"));
    await writeFile(path.join(root, "docs/plants.md"), LEGACY);
    await mkdir(path.join(root, ".agent-context"));
    const outside = await temporaryRoot();
    await linkDirectory(outside, path.join(root, ".agent-context/migrations"));
    const options = { root, migrationId: "MIG-OUTPUT", documentationRoots: ["docs"], createdAt: DATE, apply: true };
    await expect(kind === "plan" ? planMigration(options) : prepareMigrationTransformation({ ...options, transactionId: "MTX-OUTPUT" }))
      .rejects.toThrow(/symbolic link|control path/);
    expect(await readdir(outside)).toEqual([]);
    expect(await readFile(path.join(root, "docs/plants.md"), "utf8")).toBe(LEGACY);
  });

  it("rejects an execution-directory case alias without changing evidence", async () => {
    const f = await fixture();
    await f.apply();
    const upper = path.join(path.dirname(f.execution), "EXECUTION");
    await rename(f.execution, f.execution + "-rename");
    await rename(f.execution + "-rename", upper);
    const names = (await readdir(upper)).sort();
    await expect(f.rollback()).rejects.toThrow(/filesystem alias|no rollback evidence/);
    expect((await readdir(upper)).sort()).toEqual(names);
  });


  it.each([
    ["migration.plan.json", "migration.plan.json"],
    ["transactions", "transactions/MTX-BAD/transaction.json"],
    ["transactions/MTX-BAD/transaction.json", "transactions/MTX-BAD/transaction.json"],
    ["transactions/MTX-BAD/execution", "transactions/MTX-BAD/execution/intent.json"],
    ["transactions/MTX-BAD/execution/intent.json", "transactions/MTX-BAD/execution/intent.json"],
    ["transactions/MTX-BAD/execution/apply.record.json", "transactions/MTX-BAD/execution/apply.record.json"],
    ["transactions/MTX-BAD/execution/rollback.record.json", "transactions/MTX-BAD/execution/rollback.record.json"],
  ])("does not hide a protocol artifact behind alias spelling %s", async (renamed, artifact) => {
    const root = await temporaryRoot();
    await initializeProject(root);
    const migration = path.join(root, ".agent-context/migrations/MIG-BAD");
    await mkdir(path.dirname(path.join(migration, artifact)), { recursive: true });
    await writeFile(path.join(migration, artifact), "{}");
    expect((await validateRepository(root)).diagnostics.some((d) => d.code === "SCHEMA005")).toBe(true);
    const old = path.join(migration, renamed);
    const upper = path.join(path.dirname(old), path.basename(old).toUpperCase());
    await rename(old, old + "-rename");
    await rename(old + "-rename", upper);
    let aliases = false;
    try { aliases = (await lstat(old)).ino === (await lstat(upper)).ino; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (aliases) await assertRejectedGates(root);
    else expect((await validateRepository(root)).diagnostics.some((d) => d.code === "CFG002")).toBe(false);
  });

  it("does not conflate distinct protocol-like POSIX names and entry types", async () => {
    const root = await temporaryRoot();
    await initializeProject(root);
    const parent = path.join(root, ".agent-context/migrations/MIG-CASE");
    await mkdir(path.join(parent, "transactions"), { recursive: true });
    try { await writeFile(path.join(parent, "TRANSACTIONS"), "independent note", { flag: "wx" }); }
    catch (error) {
      if (!["EEXIST", "EISDIR", "EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
      expect((await lstat(path.join(parent, "TRANSACTIONS"))).isDirectory()).toBe(true);
      return; // This volume aliases the names; alias rejection is tested separately.
    }
    expect((await validateRepository(root)).ok).toBe(true);
    expect(await readFile(path.join(parent, "TRANSACTIONS"), "utf8")).toBe("independent note");
  });

  it("reports a dangling descendant link instead of treating the migration tree as empty", async () => {
    const root = await temporaryRoot();
    await initializeProject(root);
    await mkdir(path.join(root, ".agent-context/migrations"));
    const outside = path.join(await temporaryRoot(), "missing");
    await linkDirectory(outside, path.join(root, ".agent-context/migrations/MIG-MISSING"));
    await assertRejectedGates(root);
  });
});
