import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterEach, describe, expect, it } from "vitest";
import { generateContextIndex } from "../src/indexer.js";
import {
  computeMigrationPlanHash, DEPRECATED_MIGRATION_ADAPTER, DEPRECATED_MIGRATION_SOURCE_FORMAT,
  executeMigrationTransaction, normalizeMigrationAdapter, planMigration,
  prepareMigrationTransformation, rollbackMigrationTransaction,
  type MigrationAdapter, type MigrationDecisionSet, type MigrationPlan,
} from "../src/migration.js";
import { validateRepository } from "../src/validator.js";

const roots: string[] = [];
const SOURCE = "# Guide\r\n\r\n**Stand:** 2026-09-13\r\n**Status:** current\r\n**Truth level:** source-of-truth\r\n**Verification:** Exact earlier **manual** observation.\r\n**Read if task touches:** inventory\r\n**Primary systems:** InventoryService\r\n**Safe to edit:** Keep semantics.\r\n**Do not use instead:** None\r\n\r\n## Contract\r\nPreserve this body.\r\n";
const options = { migrationId: "MIG-NAMING-001", documentationRoots: ["docs"], createdAt: "2026-09-13T12:00:00.000Z" };
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })));
});
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "canontrail-naming-")); roots.push(root);
  await mkdir(path.join(root, "docs"));
  await writeFile(path.join(root, "docs/guide.md"), SOURCE);
  await cp(path.resolve("schemas"), path.join(root, "schemas"), { recursive: true });
  await mkdir(path.join(root, ".agent-context"));
  await writeFile(path.join(root, ".agent-context/config.yaml"), "version: 1\nschema_path: schemas\nindex_path: .agent-context/context-index.json\ngoverned_paths: [.agent-context/migrations]\nexclude_paths: [.git, node_modules, dist]\nrequire_frontmatter_for_all_markdown: true\nrequire_topic_id_for_canonical: true\nallow_missing_references: []\n");
  await generateContextIndex(root);
  return root;
}
function rehash(plan: MigrationPlan): MigrationPlan {
  const { plan_hash: _hash, ...payload } = plan;
  return { ...payload, plan_hash: computeMigrationPlanHash(payload) };
}
function historical(plan: MigrationPlan): MigrationPlan {
  const old = structuredClone(plan);
  old.adapter = DEPRECATED_MIGRATION_ADAPTER;
  old.summary.source_formats[DEPRECATED_MIGRATION_SOURCE_FORMAT] = old.summary.source_formats["legacy-header-v1"];
  delete old.summary.source_formats["legacy-header-v1"];
  for (const doc of old.documents) if (doc.source_format === "legacy-header-v1") doc.source_format = DEPRECATED_MIGRATION_SOURCE_FORMAT;
  return rehash(old);
}
async function save(root: string, plan: MigrationPlan) {
  const location = path.join(root, `.agent-context/migrations/${plan.migration_id}/migration.plan.json`);
  await mkdir(path.dirname(location), { recursive: true });
  await writeFile(location, JSON.stringify(plan, null, 2) + "\n"); return location;
}

describe("neutral legacy header vocabulary", () => {
  it("normalizes the deprecated selector without accepting unknown or near-match selectors", () => {
    expect(normalizeMigrationAdapter(DEPRECATED_MIGRATION_ADAPTER)).toBe("legacy-header-v1");
    for (const bad of ["legacy-header", "legacy-header-v2", "LEGACY-HEADER-V1", "legacy-header-v1 ", ""])
      expect(() => normalizeMigrationAdapter(bad)).toThrow(/unsupported migration adapter/);
  });

  it("produces identical neutral plans for preferred and deprecated explicit selectors", async () => {
    const root = await fixture();
    const current = await planMigration({ root, ...options, adapter: "legacy-header-v1" });
    const alias = await planMigration({ root, ...options, adapter: DEPRECATED_MIGRATION_ADAPTER });
    expect(alias.plan).toEqual(current.plan);
    expect(JSON.stringify(current.plan)).not.toMatch(/gaertnerei/i);
    expect(current.plan.documents[0]?.source_format).toBe("legacy-header-v1");
    expect(current.plan.summary.source_formats).toEqual({ "canontrail-frontmatter": 0, "legacy-header-v1": 1, "plain-markdown": 0 });
    expect((await planMigration({ root, ...options })).plan.documents).toEqual(current.plan.documents);
    await expect(readFile(path.join(root, current.output_path))).rejects.toThrow();
    expect(await readFile(path.join(root, "docs/guide.md"), "utf8")).toBe(SOURCE);
  });

  it.each([false, true])("validates a populated plan without changing bytes (historical=%s)", async old => {
    const root = await fixture();
    const plan = (await planMigration({ root, ...options })).plan;
    const location = await save(root, old ? historical(plan) : plan);
    const before = await readFile(location);
    const result = await validateRepository(root);
    expect(result.diagnostics).toEqual([]);
    expect(result.ok).toBe(true);
    expect(await readFile(location)).toEqual(before);
  });

  it.each(["old-doc-new-counts", "new-doc-old-counts", "both-count-keys", "wrong-count"])("rejects a correctly rehashed contradictory plan: %s", async kind => {
    const root = await fixture();
    const plan = (await planMigration({ root, ...options })).plan;
    if (kind === "old-doc-new-counts") plan.documents[0]!.source_format = DEPRECATED_MIGRATION_SOURCE_FORMAT;
    if (kind === "new-doc-old-counts") {
      plan.summary.source_formats[DEPRECATED_MIGRATION_SOURCE_FORMAT] = 0;
      delete plan.summary.source_formats["legacy-header-v1"];
    }
    if (kind === "both-count-keys") plan.summary.source_formats[DEPRECATED_MIGRATION_SOURCE_FORMAT] = 0;
    if (kind === "wrong-count") plan.summary.source_formats["legacy-header-v1"] = 0;
    const location = await save(root, rehash(plan));
    const bytes = await readFile(location);
    const result = await validateRepository(root);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some(d => d.code === "MIGRATION004")).toBe(true);
    expect(await readFile(location)).toEqual(bytes);
  });

  it("keeps the original teaching plan valid and requires exactly one count vocabulary", async () => {
    const raw = await readFile(path.resolve("examples/migration-plan/plan.json"));
    const old: MigrationPlan = JSON.parse(raw.toString("utf8"));
    expect(rehash(old)).toEqual(old);
    const schema = JSON.parse(await readFile(path.resolve("schemas/migration-plan.schema.json"), "utf8"));
    const ajv = new Ajv2020({ allErrors: true, strict: true }); addFormats(ajv);
    const check = ajv.compile(schema);
    expect(check(old), JSON.stringify(check.errors)).toBe(true);
    const ambiguous = structuredClone(old); ambiguous.summary.source_formats["legacy-header-v1"] = 0;
    expect(check(ambiguous)).toBe(false);
    delete ambiguous.summary.source_formats[DEPRECATED_MIGRATION_SOURCE_FORMAT];
    expect(check(ambiguous), JSON.stringify(check.errors)).toBe(true);
    delete ambiguous.summary.source_formats["legacy-header-v1"];
    expect(check(ambiguous)).toBe(false);
    expect(await readFile(path.resolve("examples/migration-plan/plan.json"))).toEqual(raw);
    const neutral: MigrationPlan = JSON.parse(await readFile(path.resolve("examples/migration-plan/neutral-plan.json"), "utf8"));
    expect(check(neutral), JSON.stringify(check.errors)).toBe(true);
    expect(rehash(neutral)).toEqual(neutral);
    expect(JSON.stringify(neutral)).not.toMatch(/gaertnerei/i);
  });

  it("does not transfer an old plan's reviewed decision hash to a newly named preview", async () => {
    const root = await fixture();
    const current = (await planMigration({ root, ...options })).plan;
    const old = historical(current);
    expect(old.plan_hash).not.toBe(current.plan_hash);
    const decisions: MigrationDecisionSet = {
      version: 1, migration_id: old.migration_id, plan_hash: old.plan_hash,
      reviewed_by: "synthetic historical reviewer", reviewed_at: options.createdAt, decisions: [],
    };
    await expect(prepareMigrationTransformation({ root, ...options, transactionId: "MTX-OLD-DECISION-001", decisions, apply: true }))
      .rejects.toThrow(/does not match the migration plan identity/);
    await expect(readFile(path.join(root, ".agent-context/migrations/MIG-NAMING-001/transactions/MTX-OLD-DECISION-001/transaction.json"))).rejects.toThrow();
    expect(await readFile(path.join(root, "docs/guide.md"), "utf8")).toBe(SOURCE);
  });

  it.each<MigrationAdapter>(["legacy-header-v1", DEPRECATED_MIGRATION_ADAPTER])("preserves execute/rollback bytes through selector %s", async adapter => {
    const root = await fixture();
    const plan = (await planMigration({ root, ...options, adapter })).plan;
    const decisions: MigrationDecisionSet = {
      version: 1, migration_id: plan.migration_id, plan_hash: plan.plan_hash,
      reviewed_by: "synthetic fixture reviewer", reviewed_at: options.createdAt,
      decisions: [{ path: "docs/guide.md", decision: "execute", action: "normalize-header", target_path: "docs/guide.md", reason: "Synthetic exact header replacement.", target_header: {
        stand: "2026-09-13", status: "draft", truth_level: "draft", verification: { state: "unverified", evidence: [] },
        read_if_task_touches: ["inventory"], primary_systems: ["InventoryService"], safe_to_edit: ["Keep semantics."], do_not_use_instead: [],
      } }],
    };
    const prepared = await prepareMigrationTransformation({ root, ...options, adapter, transactionId: "MTX-NAMING-001", decisions, apply: true });
    expect(prepared.transaction.blockers).toEqual([]);
    expect(prepared.transaction.operations).toHaveLength(1);
    const transactionPath = prepared.output_path;
    await executeMigrationTransaction(root, transactionPath, prepared.transaction.transaction_hash);
    const post = await readFile(path.join(root, "docs/guide.md"), "utf8");
    expect(post).toContain("Exact earlier **manual** observation.");
    expect(post).toContain("## Contract\r\nPreserve this body.\r\n");
    await rollbackMigrationTransaction(root, transactionPath, prepared.transaction.transaction_hash);
    expect(await readFile(path.join(root, "docs/guide.md"), "utf8")).toBe(SOURCE);
  });
});
