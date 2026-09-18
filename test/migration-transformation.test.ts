import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterEach, describe, expect, it } from "vitest";
import {
  computeMigrationDecisionSetHash,
  computeMigrationApplyIntentHash,
  computeMigrationExecutionRecordHash,
  computeMigrationTransactionHash,
  executeMigrationTransaction,
  migrationTransactionBindingErrors,
  planMigration,
  prepareMigrationTransformation,
  rollbackMigrationTransaction,
  type MigrationDecisionSet,
  type MigrationTargetHeader,
} from "../src/migration.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true,
    maxRetries: process.platform === "win32" ? 8 : 0,
    retryDelay: process.platform === "win32" ? 100 : 0,
  })));
});

const LEGACY = `# Plants

**Stand:** 2026-09-03
**Status:** current
**Truth level:** source-of-truth
**Verification:** reviewed with **runtime** evidence
Verification: second *manual* check
**Verification addendum 2026-09-04:** runtime observation remains visible independently.
**Read if task touches:** plants, locations
**Primary systems:** PlantService
**Safe to edit:** preserve behavior
**Do not use instead:** OldPlants.md

## Contract

Plants remain local.
`;

const HEADER: MigrationTargetHeader = {
  topic_id: "plants",
  stand: "2026-09-03",
  status: "current",
  truth_level: "canonical",
  verification: { state: "unverified", evidence: [] },
  read_if_task_touches: ["plants", "locations"],
  primary_systems: ["PlantService"],
  safe_to_edit: ["Preserve behavior."],
  do_not_use_instead: ["OldPlants.md"],
};

async function fixture(source: string | Buffer = LEGACY): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "canontrail-migration-transform-"));
  roots.push(root);
  await mkdir(path.join(root, "docs"), { recursive: true });
  await writeFile(path.join(root, "docs", "plants.md"), source);
  return root;
}

async function decisionSet(root: string, targetPath = "docs/plants.md"): Promise<MigrationDecisionSet> {
  const plan = await planMigration({
    root,
    migrationId: "MIG-TRANSFORM-001",
    documentationRoots: ["docs"],
    createdAt: "2026-09-03T20:00:00.000Z",
  });
  return {
    version: 1,
    migration_id: plan.plan.migration_id,
    plan_hash: plan.plan.plan_hash,
    reviewed_by: "independent-reviewer",
    reviewed_at: "2026-09-03T20:01:00.000Z",
    decisions: [{
      path: "docs/plants.md",
      decision: "execute",
      action: "normalize-header",
      target_path: targetPath,
      reason: "Reviewed legacy header maps exactly to the supplied governed header.",
      target_header: HEADER,
    }],
  };
}

async function prepare(root: string, targetPath = "docs/plants.md") {
  return prepareMigrationTransformation({
    root,
    migrationId: "MIG-TRANSFORM-001",
    transactionId: "MTX-TRANSFORM-001",
    documentationRoots: ["docs"],
    createdAt: "2026-09-03T20:00:00.000Z",
    decisions: await decisionSet(root, targetPath),
    apply: true,
  });
}

describe("migration transformation and rollback", () => {
  it("keeps the worked transaction example schema-valid, self-hashed, and decision-bound", async () => {
    const example = JSON.parse(await readFile(path.resolve("examples/migration-transaction/transaction.json"), "utf8"));
    const schema = JSON.parse(await readFile(path.resolve("schemas/migration-transaction.schema.json"), "utf8"));
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    expect(ajv.validate(schema, example), JSON.stringify(ajv.errors)).toBe(true);
    const { transaction_hash: supplied, ...payload } = example;
    expect(computeMigrationTransactionHash(payload)).toBe(supplied);
    expect(example.documentation_roots).toEqual(["docs"]);
    expect(computeMigrationDecisionSetHash({
      version: 1,
      migration_id: example.migration_id,
      plan_hash: example.plan_hash,
      reviewed_by: example.reviewed_by,
      reviewed_at: example.reviewed_at,
      decisions: example.decisions,
    })).toBe(example.decision_hash);
    expect(migrationTransactionBindingErrors(example)).toEqual([]);
  });

  it("keeps generated operation identifiers schema-valid beyond 9,999 operations", async () => {
    const transactionSchema = JSON.parse(await readFile(path.resolve("schemas/migration-transaction.schema.json"), "utf8"));
    const example = JSON.parse(await readFile(path.resolve("examples/migration-transaction/transaction.json"), "utf8"));
    const transactionAjv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(transactionAjv);
    transactionAjv.addSchema(transactionSchema);
    const validateOperation = transactionAjv.compile({ $ref: `${transactionSchema.$id}#/$defs/operation` });
    expect(validateOperation({ ...example.operations[0], operation_id: "OP-10000" }), JSON.stringify(validateOperation.errors)).toBe(true);

    const executionSchema = JSON.parse(await readFile(path.resolve("schemas/migration-execution.schema.json"), "utf8"));
    const executionAjv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(executionAjv);
    const intent = {
      version: 1,
      kind: "migration-apply-intent",
      transaction_hash: `sha256:${"1".repeat(64)}`,
      observed_at: "2026-09-05T08:00:00.000Z",
      operations: [{
        operation_id: "OP-10000",
        source_path: "docs/item.md",
        target_path: "docs/item.md",
        source_hash: `sha256:${"2".repeat(64)}`,
        output_hash: `sha256:${"3".repeat(64)}`,
      }],
      record_hash: `sha256:${"4".repeat(64)}`,
    };
    expect(executionAjv.validate(executionSchema, intent), JSON.stringify(executionAjv.errors)).toBe(true);
  });

  it("keeps unreviewed transformation work blocked and performs no preview writes", async () => {
    const root = await fixture();
    const report = await prepareMigrationTransformation({
      root,
      migrationId: "MIG-TRANSFORM-001",
      transactionId: "MTX-TRANSFORM-001",
      documentationRoots: ["docs"],
      createdAt: "2026-09-03T20:00:00.000Z",
    });

    expect(report.written).toBe(false);
    expect(report.transaction.summary).toEqual({ operations: 0, blockers: 1, skipped: 0 });
    expect(report.transaction.blockers[0]).toMatchObject({ path: "docs/plants.md", code: "REVIEW_REQUIRED" });
    expect(await readFile(path.join(root, "docs", "plants.md"), "utf8")).toBe(LEGACY);
    await expect(readFile(path.join(root, ...report.output_path.split("/")))).rejects.toThrow();
  });

  it("applies an exact reviewed transaction and rolls it back byte-for-byte", async () => {
    const root = await fixture();
    const report = await prepare(root);
    expect(await readFile(path.join(root, "docs", "plants.md"), "utf8")).toBe(LEGACY);
    expect(report.transaction.summary).toEqual({ operations: 1, blockers: 0, skipped: 0 });
    const schema = JSON.parse(await readFile(path.resolve("schemas/migration-transaction.schema.json"), "utf8"));
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    expect(ajv.validate(schema, report.transaction), JSON.stringify(ajv.errors)).toBe(true);

    const applied = await executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash, "2026-09-03T20:02:00.000Z");
    const transformed = await readFile(path.join(root, "docs", "plants.md"), "utf8");
    expect(applied.kind).toBe("migration-apply");
    expect(transformed).toContain("topic_id: plants");
    expect(transformed).toContain("# Plants");
    expect(transformed).not.toContain("**Truth level:**");
    expect(transformed).not.toContain("**Verification:** reviewed with **runtime** evidence");
    expect(transformed).not.toContain("Verification: second *manual* check");
    expect(transformed).toContain("verification:\n  state: unverified\n  evidence: []");
    expect(transformed).toContain("## Migrated legacy verification");
    expect(transformed).toContain("CanonTrail has not independently verified or promoted these statements.");
    expect(transformed).toContain("> reviewed with **runtime** evidence");
    expect(transformed).toContain("> second *manual* check");
    expect(transformed).toContain("**Verification addendum 2026-09-04:** runtime observation remains visible independently.");
    expect(transformed.indexOf("**Verification addendum 2026-09-04:**")).toBeLessThan(transformed.indexOf("## Migrated legacy verification"));
    expect(transformed.indexOf("## Migrated legacy verification")).toBeLessThan(transformed.indexOf("## Contract"));

    const rolledBack = await rollbackMigrationTransaction(root, report.output_path, report.transaction.transaction_hash, "2026-09-03T20:03:00.000Z");
    expect(rolledBack.kind).toBe("migration-rollback");
    expect(await readFile(path.join(root, "docs", "plants.md"), "utf8")).toBe(LEGACY);
    expect(await rollbackMigrationTransaction(root, report.output_path, report.transaction.transaction_hash)).toEqual(rolledBack);
  });

  it("parses supported bold-label variants consistently and ignores metadata-looking fenced examples", async () => {
    const source = `# Plants

\`\`\`markdown
Verification: template text that must remain ordinary body content
Stand: 1999-01-01
\`\`\`

**Stand:** 2026-09-03
**Status:** current
**Truth level:** source-of-truth
**Verification**: label-only **bold** value
**Verification: whole-line bold value**
**Read if task touches:** plants, locations
**Primary systems:** PlantService
**Safe to edit:** preserve behavior
**Do not use instead:** OldPlants.md

## Contract

Plants remain local.
`;
    const root = await fixture(source);
    const report = await prepare(root);
    await executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash);
    const transformed = await readFile(path.join(root, "docs", "plants.md"), "utf8");

    expect(transformed).toContain("Verification: template text that must remain ordinary body content");
    expect(transformed).toContain("Stand: 1999-01-01");
    expect(transformed).not.toContain("**Verification**: label-only **bold** value");
    expect(transformed).not.toContain("**Verification: whole-line bold value**");
    expect(transformed).toContain("> label-only **bold** value");
    expect(transformed).toContain("> whole-line bold value");
    expect(transformed).not.toContain("> template text that must remain ordinary body content");
  });

  it("uses singular provenance wording for one migrated verification declaration", async () => {
    const root = await fixture(LEGACY.replace("Verification: second *manual* check\n", ""));
    const report = await prepare(root);
    await executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash);
    const transformed = await readFile(path.join(root, "docs", "plants.md"), "utf8");

    expect(transformed).toContain("from a legacy `Verification:` declaration");
    expect(transformed).toContain("promoted this statement.");
    expect(transformed).not.toContain("promoted these statements.");
  });

  it("keeps pre-section prose outside generated provenance and avoids duplicate headings", async () => {
    const source = `# Plants

**Stand:** 2026-09-03
**Status:** current
**Truth level:** source-of-truth
**Verification:** reviewed in the legacy project
**Read if task touches:** plants
**Primary systems:** PlantService
**Safe to edit:** preserve behavior
**Do not use instead:** OldPlants.md

This introduction belongs to the document, not to generated provenance.

**Verification addendum:** this is body prose and remains outside the generated section.

## Migrated legacy verification

An older, author-owned section with the same heading.
`;
    const root = await fixture(source);
    const report = await prepare(root);
    await executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash);
    const transformed = await readFile(path.join(root, "docs", "plants.md"), "utf8");
    const introIndex = transformed.indexOf("This introduction belongs");
    const addendumIndex = transformed.indexOf("**Verification addendum:**");
    const generatedIndex = transformed.indexOf("## Migrated legacy verification (2)");
    const existingIndex = transformed.indexOf("## Migrated legacy verification\n");

    expect(introIndex).toBeGreaterThan(-1);
    expect(addendumIndex).toBeGreaterThan(introIndex);
    expect(generatedIndex).toBeGreaterThan(addendumIndex);
    expect(existingIndex).toBeGreaterThan(generatedIndex);
    expect(transformed.match(/^## Migrated legacy verification$/gm)).toHaveLength(1);
    expect(transformed.match(/^## Migrated legacy verification \(2\)$/gm)).toHaveLength(1);
  });

  it("preserves BOM, CRLF, body blank-line runs, and exact rollback bytes", async () => {
    const source = `\uFEFF# Plants\r\n\r\n**Stand:** 2026-09-03\r\n**Status:** current\r\n**Truth level:** source-of-truth\r\n**Verification:** reviewed in the legacy project\r\n**Read if task touches:** plants\r\n**Primary systems:** PlantService\r\n**Safe to edit:** preserve behavior\r\n**Do not use instead:** OldPlants.md\r\n\r\nIntro one.\r\n\r\n\r\nIntro two.\r\n\r\n## Contract\r\n\r\nTruth.\r\n`;
    const root = await fixture(source);
    const report = await prepare(root);
    await executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash);
    const transformed = await readFile(path.join(root, "docs", "plants.md"), "utf8");

    expect(transformed.startsWith("\uFEFF---\r\n")).toBe(true);
    expect(transformed).not.toMatch(/(?<!\r)\n/);
    expect(transformed).toContain("Intro one.\r\n\r\n\r\nIntro two.");

    await rollbackMigrationTransaction(root, report.output_path, report.transaction.transaction_hash);
    expect(await readFile(path.join(root, "docs", "plants.md"), "utf8")).toBe(source);
  });

  it("recovers from an interrupted apply after writes using the durable intent and backup", async () => {
    const root = await fixture();
    const report = await prepare(root);
    await executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash);
    const execution = path.join(root, ".agent-context", "migrations", "MIG-TRANSFORM-001", "transactions", "MTX-TRANSFORM-001", "execution");
    await rm(path.join(execution, "apply.record.json"));

    const rolledBack = await rollbackMigrationTransaction(root, report.output_path, report.transaction.transaction_hash);
    expect(rolledBack.kind).toBe("migration-rollback");
    expect(await readFile(path.join(root, "docs", "plants.md"), "utf8")).toBe(LEGACY);
  });

  it("refuses source drift before any execution evidence or source write", async () => {
    const root = await fixture();
    const report = await prepare(root);
    await writeFile(path.join(root, "docs", "plants.md"), `${LEGACY}\nUser edit.\n`);

    await expect(executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash)).rejects.toThrow(/source drift/);
    expect(await readFile(path.join(root, "docs", "plants.md"), "utf8")).toContain("User edit.");
    await expect(readFile(path.join(root, ".agent-context", "migrations", "MIG-TRANSFORM-001", "transactions", "MTX-TRANSFORM-001", "execution", "intent.json"))).rejects.toThrow();
  });

  it("refuses a source that disappears after preview", async () => {
    const root = await fixture();
    const report = await prepare(root);
    await rm(path.join(root, "docs", "plants.md"));

    await expect(executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash)).rejects.toThrow(/does not exist/);
    await expect(readFile(path.join(root, ".agent-context", "migrations", "MIG-TRANSFORM-001", "transactions", "MTX-TRANSFORM-001", "execution", "intent.json"))).rejects.toThrow();
  });

  it("refuses a directory replaced by a symbolic link after preview", async () => {
    const root = await fixture();
    const report = await prepare(root);
    await rename(path.join(root, "docs"), path.join(root, "docs-real"));
    await symlink(path.join(root, "docs-real"), path.join(root, "docs"), process.platform === "win32" ? "junction" : "dir");

    await expect(executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash)).rejects.toThrow(/symbolic link/);
    expect(await readFile(path.join(root, "docs-real", "plants.md"), "utf8")).toBe(LEGACY);
  });

  it("rejects a tampered transaction before execution", async () => {
    const root = await fixture();
    const report = await prepare(root);
    const absolute = path.join(root, ...report.output_path.split("/"));
    const tampered = JSON.parse(await readFile(absolute, "utf8"));
    tampered.operations[0].output_bytes += 1;
    await writeFile(absolute, `${JSON.stringify(tampered, null, 2)}\n`);

    await expect(executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash)).rejects.toThrow(/self-hash/);
    expect(await readFile(path.join(root, "docs", "plants.md"), "utf8")).toBe(LEGACY);
  });

  it("rejects changed review decisions even when the outer transaction hash is recomputed", async () => {
    const root = await fixture();
    const report = await prepare(root);
    const absolute = path.join(root, ...report.output_path.split("/"));
    const tampered = JSON.parse(await readFile(absolute, "utf8"));
    tampered.decisions[0].reason = "Changed after review.";
    const { transaction_hash: _ignored, ...payload } = tampered;
    tampered.transaction_hash = computeMigrationTransactionHash(payload);
    await writeFile(absolute, `${JSON.stringify(tampered, null, 2)}\n`);

    await expect(executeMigrationTransaction(root, report.output_path, tampered.transaction_hash)).rejects.toThrow(/decision-set hash/);
    expect(await readFile(path.join(root, "docs", "plants.md"), "utf8")).toBe(LEGACY);
  });

  it("rejects changed operation metadata even when the decision set and outer hash remain valid", async () => {
    const root = await fixture();
    const report = await prepare(root);
    const absolute = path.join(root, ...report.output_path.split("/"));
    const tampered = JSON.parse(await readFile(absolute, "utf8"));
    tampered.operations[0].target_header.verification.state = "verified";
    tampered.operations[0].target_header.read_if_task_touches.push("EVERYTHING");
    const { transaction_hash: _ignored, ...payload } = tampered;
    tampered.transaction_hash = computeMigrationTransactionHash(payload);
    await writeFile(absolute, `${JSON.stringify(tampered, null, 2)}\n`);

    await expect(executeMigrationTransaction(root, report.output_path, tampered.transaction_hash)).rejects.toThrow(/not bound to reviewed decisions/);
    expect(await readFile(path.join(root, "docs", "plants.md"), "utf8")).toBe(LEGACY);
  });

  it("rejects a self-consistent out-of-root operation before filesystem writes or apply evidence", async () => {
    const root = await fixture();
    await mkdir(path.join(root, "elsewhere"));
    await writeFile(path.join(root, "elsewhere", "other.md"), LEGACY);
    const report = await prepare(root);
    const absolute = path.join(root, ...report.output_path.split("/"));
    const tampered = JSON.parse(await readFile(absolute, "utf8"));
    tampered.decisions[0].path = "elsewhere/other.md";
    tampered.decisions[0].target_path = "elsewhere/other.md";
    tampered.operations[0].source_path = "elsewhere/other.md";
    tampered.operations[0].target_path = "elsewhere/other.md";
    tampered.decision_hash = computeMigrationDecisionSetHash({
      version: 1,
      migration_id: tampered.migration_id,
      plan_hash: tampered.plan_hash,
      reviewed_by: tampered.reviewed_by,
      reviewed_at: tampered.reviewed_at,
      decisions: tampered.decisions,
    });
    const { transaction_hash: _ignored, ...payload } = tampered;
    tampered.transaction_hash = computeMigrationTransactionHash(payload);
    await writeFile(absolute, `${JSON.stringify(tampered, null, 2)}\n`);

    await expect(executeMigrationTransaction(root, report.output_path, tampered.transaction_hash)).rejects.toThrow(/outside the transaction-bound reviewed documentation roots/);
    await expect(rollbackMigrationTransaction(root, report.output_path, tampered.transaction_hash)).rejects.toThrow(/outside the transaction-bound reviewed documentation roots/);
    expect(await readFile(path.join(root, "docs", "plants.md"), "utf8")).toBe(LEGACY);
    expect(await readFile(path.join(root, "elsewhere", "other.md"), "utf8")).toBe(LEGACY);
    await expect(readFile(path.join(root, ".agent-context", "migrations", "MIG-TRANSFORM-001", "transactions", "MTX-TRANSFORM-001", "execution", "intent.json"))).rejects.toThrow();
  });

  it.each([
    ["missing", undefined],
    ["empty", []],
  ])("rejects %s transaction-bound documentation roots before writes", async (_label, documentationRoots) => {
    const root = await fixture();
    const report = await prepare(root);
    const absolute = path.join(root, ...report.output_path.split("/"));
    const tampered = JSON.parse(await readFile(absolute, "utf8"));
    if (documentationRoots === undefined) delete tampered.documentation_roots;
    else tampered.documentation_roots = documentationRoots;
    const { transaction_hash: _ignored, ...payload } = tampered;
    tampered.transaction_hash = computeMigrationTransactionHash(payload);
    await writeFile(absolute, `${JSON.stringify(tampered, null, 2)}\n`);

    await expect(executeMigrationTransaction(root, report.output_path, tampered.transaction_hash)).rejects.toThrow(/documentation_roots must contain at least one reviewed root/);
    expect(await readFile(path.join(root, "docs", "plants.md"), "utf8")).toBe(LEGACY);
  });

  it("rejects a legacy version-1 transaction without roots before writes", async () => {
    const root = await fixture();
    const report = await prepare(root);
    const absolute = path.join(root, ...report.output_path.split("/"));
    const tampered = JSON.parse(await readFile(absolute, "utf8"));
    tampered.version = 1;
    delete tampered.documentation_roots;
    const { transaction_hash: _ignored, ...payload } = tampered;
    tampered.transaction_hash = computeMigrationTransactionHash(payload);
    await writeFile(absolute, `${JSON.stringify(tampered, null, 2)}\n`);

    await expect(executeMigrationTransaction(root, report.output_path, tampered.transaction_hash)).rejects.toThrow(/version 2 with hash-bound documentation_roots is required/);
    expect(await readFile(path.join(root, "docs", "plants.md"), "utf8")).toBe(LEGACY);
  });

  it("rejects schema-invalid transactions during direct execute and rollback", async () => {
    const root = await fixture();
    const report = await prepare(root);
    const absolute = path.join(root, ...report.output_path.split("/"));
    const tampered = JSON.parse(await readFile(absolute, "utf8"));
    tampered.root = "not-dot";
    tampered.mode = "unsupported-mode";
    tampered.created_at = "not-a-date";
    tampered.unexpected_contract = true;
    const { transaction_hash: _ignored, ...payload } = tampered;
    tampered.transaction_hash = computeMigrationTransactionHash(payload);
    await writeFile(absolute, `${JSON.stringify(tampered, null, 2)}\n`);

    await expect(executeMigrationTransaction(root, report.output_path, tampered.transaction_hash)).rejects.toThrow(/does not conform to the shipped version-2 schema/);
    await expect(rollbackMigrationTransaction(root, report.output_path, tampered.transaction_hash)).rejects.toThrow(/does not conform to the shipped version-2 schema/);
    expect(await readFile(path.join(root, "docs", "plants.md"), "utf8")).toBe(LEGACY);
    const execution = path.join(root, ".agent-context", "migrations", "MIG-TRANSFORM-001", "transactions", "MTX-TRANSFORM-001", "execution");
    await expect(readFile(path.join(execution, "intent.json"), "utf8")).rejects.toThrow();
  });

  it.each([
    ["backslash", "docs\\plants.md", /normalized with forward slashes/],
    ["case variant", "DOCS/plants.md", /outside the transaction-bound reviewed documentation roots/],
    ["non-Markdown", "docs/plants.json", /must use a Markdown/],
    ["traversal", "../outside.md", /repository-relative path inside the project/],
    ["NTFS alternate data stream", "docs/plants:stream.md", /Windows-forbidden characters.*alternate-data-stream/],
    ["Windows reserved device", "docs/CON.md", /Windows reserved device name/],
    ["Windows reserved device with space before extension", "docs/COM1 .md", /Windows reserved device name/],
    ["Windows wildcard", "docs/plants?.md", /Windows-forbidden characters/],
    ["trailing-dot segment", "docs/archive./plants.md", /ending in a dot or space/],
    ["trailing-space segment", "docs/archive /plants.md", /ending in a dot or space/],
    ["reserved-tree trailing-dot alias", "docs/.git./config.md", /ending in a dot or space/],
  ])("rejects a %s path variant before filesystem access", async (_label, forgedPath, expected) => {
    const root = await fixture();
    const report = await prepare(root);
    const absolute = path.join(root, ...report.output_path.split("/"));
    const tampered = JSON.parse(await readFile(absolute, "utf8"));
    tampered.decisions[0].path = forgedPath;
    tampered.decisions[0].target_path = forgedPath;
    tampered.operations[0].source_path = forgedPath;
    tampered.operations[0].target_path = forgedPath;
    tampered.decision_hash = computeMigrationDecisionSetHash({
      version: 1,
      migration_id: tampered.migration_id,
      plan_hash: tampered.plan_hash,
      reviewed_by: tampered.reviewed_by,
      reviewed_at: tampered.reviewed_at,
      decisions: tampered.decisions,
    });
    const { transaction_hash: _ignored, ...payload } = tampered;
    tampered.transaction_hash = computeMigrationTransactionHash(payload);
    await writeFile(absolute, `${JSON.stringify(tampered, null, 2)}\n`);

    await expect(executeMigrationTransaction(root, report.output_path, tampered.transaction_hash)).rejects.toThrow(expected);
    await expect(rollbackMigrationTransaction(root, report.output_path, tampered.transaction_hash)).rejects.toThrow(expected);
    expect(await readFile(path.join(root, "docs", "plants.md"), "utf8")).toBe(LEGACY);
    await expect(readFile(path.join(root, ".agent-context", "migrations", "MIG-TRANSFORM-001", "transactions", "MTX-TRANSFORM-001", "execution", "intent.json"))).rejects.toThrow();
  });

  it("keeps ordinary portable in-root Markdown names valid", async () => {
    const header = { ...HEADER, topic_id: "portable" };
    for (const candidate of ["docs/My Notes 1.2.md", "docs/über-pflanzen.md", "docs/dot.name/plants.markdown"]) {
      const decision = {
        path: candidate,
        decision: "execute" as const,
        action: "normalize-header" as const,
        target_path: candidate,
        reason: "Portable-path counterexample.",
        target_header: header,
      };
      const operation = {
        operation_id: "OP-0001",
        action: "normalize-header" as const,
        source_path: candidate,
        target_path: candidate,
        source_hash: `sha256:${"1".repeat(64)}`,
        target_precondition: { state: "same-as-source" as const, content_hash: `sha256:${"1".repeat(64)}` },
        output_hash: `sha256:${"2".repeat(64)}`,
        output_bytes: 1,
        target_header: header,
      };
      expect(migrationTransactionBindingErrors({ documentation_roots: ["docs"], decisions: [decision], operations: [operation] })).toEqual([]);
    }
  });

  it.each([
    ["duplicate", ["docs", "docs"], /must be unique/],
    ["unsorted", ["docs/sub", "docs"], /deterministically sorted/],
    ["unnormalized", [".\\docs"], /normalized with forward slashes/],
    ["reserved", [".agent-context"], /must not use reserved/],
    ["alternate-data-stream", ["docs:stream"], /Windows-forbidden characters.*alternate-data-stream/],
    ["reserved-device", ["CON"], /Windows reserved device name/],
    ["trailing-dot", ["docs."], /ending in a dot or space/],
  ])("rejects %s transaction-bound documentation roots", async (_label, documentationRoots, expected) => {
    const root = await fixture();
    const report = await prepare(root);
    expect(migrationTransactionBindingErrors({ ...report.transaction, documentation_roots: documentationRoots })).toEqual(
      expect.arrayContaining([expect.stringMatching(expected)]),
    );
  });

  it("rejects a forged relocation transaction before filesystem writes", async () => {
    const root = await fixture();
    const report = await prepare(root);
    const absolute = path.join(root, ...report.output_path.split("/"));
    const tampered = JSON.parse(await readFile(absolute, "utf8"));
    tampered.decisions[0].target_path = "docs/canonical/plants.md";
    tampered.operations[0].target_path = "docs/canonical/plants.md";
    tampered.operations[0].target_precondition = { state: "absent", content_hash: null };
    tampered.decision_hash = computeMigrationDecisionSetHash({
      version: 1,
      migration_id: tampered.migration_id,
      plan_hash: tampered.plan_hash,
      reviewed_by: tampered.reviewed_by,
      reviewed_at: tampered.reviewed_at,
      decisions: tampered.decisions,
    });
    const { transaction_hash: _ignored, ...payload } = tampered;
    tampered.transaction_hash = computeMigrationTransactionHash(payload);
    await writeFile(absolute, `${JSON.stringify(tampered, null, 2)}\n`);

    await expect(executeMigrationTransaction(root, report.output_path, tampered.transaction_hash)).rejects.toThrow(/unsupported relocation/);
    expect(await readFile(path.join(root, "docs", "plants.md"), "utf8")).toBe(LEGACY);
  });

  it("rejects a forged reserved-path transaction before filesystem access", async () => {
    const root = await fixture();
    const report = await prepare(root);
    const absolute = path.join(root, ...report.output_path.split("/"));
    const tampered = JSON.parse(await readFile(absolute, "utf8"));
    tampered.decisions[0].path = ".git/hooks/post-commit.md";
    tampered.decisions[0].target_path = ".git/hooks/post-commit.md";
    tampered.operations[0].source_path = ".git/hooks/post-commit.md";
    tampered.operations[0].target_path = ".git/hooks/post-commit.md";
    tampered.decision_hash = computeMigrationDecisionSetHash({
      version: 1,
      migration_id: tampered.migration_id,
      plan_hash: tampered.plan_hash,
      reviewed_by: tampered.reviewed_by,
      reviewed_at: tampered.reviewed_at,
      decisions: tampered.decisions,
    });
    const { transaction_hash: _ignored, ...payload } = tampered;
    tampered.transaction_hash = computeMigrationTransactionHash(payload);
    await writeFile(absolute, `${JSON.stringify(tampered, null, 2)}\n`);

    await expect(executeMigrationTransaction(root, report.output_path, tampered.transaction_hash)).rejects.toThrow(/path is unsafe.*reserved/);
    expect(await readFile(path.join(root, "docs", "plants.md"), "utf8")).toBe(LEGACY);
  });

  it("rejects duplicate reviewed decision paths even when both hashes are recomputed", async () => {
    const root = await fixture();
    const report = await prepare(root);
    const absolute = path.join(root, ...report.output_path.split("/"));
    const tampered = JSON.parse(await readFile(absolute, "utf8"));
    tampered.decisions.push({ ...tampered.decisions[0], reason: "Duplicate reviewed entry." });
    tampered.decision_hash = computeMigrationDecisionSetHash({
      version: 1,
      migration_id: tampered.migration_id,
      plan_hash: tampered.plan_hash,
      reviewed_by: tampered.reviewed_by,
      reviewed_at: tampered.reviewed_at,
      decisions: tampered.decisions,
    });
    const { transaction_hash: _ignored, ...payload } = tampered;
    tampered.transaction_hash = computeMigrationTransactionHash(payload);
    await writeFile(absolute, `${JSON.stringify(tampered, null, 2)}\n`);

    await expect(executeMigrationTransaction(root, report.output_path, tampered.transaction_hash)).rejects.toThrow(/duplicate reviewed decision/);
    expect(await readFile(path.join(root, "docs", "plants.md"), "utf8")).toBe(LEGACY);
  });

  it("rejects duplicate operation source paths even when the outer hash is recomputed", async () => {
    const root = await fixture();
    const report = await prepare(root);
    const absolute = path.join(root, ...report.output_path.split("/"));
    const tampered = JSON.parse(await readFile(absolute, "utf8"));
    tampered.operations.push({ ...tampered.operations[0], operation_id: "OP-0002" });
    tampered.summary.operations = tampered.operations.length;
    const { transaction_hash: _ignored, ...payload } = tampered;
    tampered.transaction_hash = computeMigrationTransactionHash(payload);
    await writeFile(absolute, `${JSON.stringify(tampered, null, 2)}\n`);

    await expect(executeMigrationTransaction(root, report.output_path, tampered.transaction_hash)).rejects.toThrow(/duplicate migration operation/);
    expect(await readFile(path.join(root, "docs", "plants.md"), "utf8")).toBe(LEGACY);
  });

  it("rejects a reviewed execute decision whose operation was removed before successful no-op evidence", async () => {
    const root = await fixture();
    const report = await prepare(root);
    const absolute = path.join(root, ...report.output_path.split("/"));
    const tampered = JSON.parse(await readFile(absolute, "utf8"));
    tampered.operations = [];
    tampered.summary.operations = 0;
    const { transaction_hash: _ignored, ...payload } = tampered;
    tampered.transaction_hash = computeMigrationTransactionHash(payload);
    await writeFile(absolute, `${JSON.stringify(tampered, null, 2)}\n`);

    await expect(executeMigrationTransaction(root, report.output_path, tampered.transaction_hash)).rejects.toThrow(/execute decision.*has no matching migration operation/);
    await expect(rollbackMigrationTransaction(root, report.output_path, tampered.transaction_hash)).rejects.toThrow(/execute decision.*has no matching migration operation/);
    const execution = path.join(root, ".agent-context", "migrations", "MIG-TRANSFORM-001", "transactions", "MTX-TRANSFORM-001", "execution");
    await expect(readFile(path.join(execution, "apply.record.json"), "utf8")).rejects.toThrow();
    expect(await readFile(path.join(root, "docs", "plants.md"), "utf8")).toBe(LEGACY);
  });

  it("rejects ambiguous operation ids and nondeterministic decision or operation order", async () => {
    const root = await fixture();
    const report = await prepare(root);
    const firstDecision = report.transaction.decisions[0]!;
    const firstOperation = report.transaction.operations[0]!;
    const secondDecision = { ...firstDecision, path: "docs/z.md", target_path: "docs/z.md" };
    const secondOperation = { ...firstOperation, source_path: "docs/z.md", target_path: "docs/z.md" };

    expect(migrationTransactionBindingErrors({
      documentation_roots: ["docs"],
      decisions: [firstDecision, secondDecision],
      operations: [firstOperation, secondOperation],
    })).toEqual(expect.arrayContaining([
      expect.stringMatching(/duplicate migration operation id OP-0001/),
      expect.stringMatching(/index 1 must use deterministic id OP-0002/),
    ]));

    expect(migrationTransactionBindingErrors({
      documentation_roots: ["docs"],
      decisions: [secondDecision, firstDecision],
      operations: [firstOperation, { ...secondOperation, operation_id: "OP-0002" }],
    })).toEqual(expect.arrayContaining([expect.stringMatching(/decisions must be deterministically sorted/)]));

    expect(migrationTransactionBindingErrors({
      documentation_roots: ["docs"],
      decisions: [firstDecision, secondDecision],
      operations: [{ ...secondOperation, operation_id: "OP-0001" }, { ...firstOperation, operation_id: "OP-0002" }],
    })).toEqual(expect.arrayContaining([expect.stringMatching(/operations must be deterministically sorted/)]));
  });

  it("rechecks an in-place operation source immediately before writing", async () => {
    const root = await fixture();
    const report = await prepare(root);
    let injected = false;

    await expect(executeMigrationTransaction(
      root,
      report.output_path,
      report.transaction.transaction_hash,
      "2026-09-03T20:02:00.000Z",
      {
        beforeImmediateWriteCheck: async () => {
          injected = true;
          await writeFile(path.join(root, "docs", "plants.md"), `${LEGACY}\nConcurrent user edit.\n`);
        },
      },
    )).rejects.toThrow(/source drift immediately before write/);
    expect(injected).toBe(true);
    expect(await readFile(path.join(root, "docs", "plants.md"), "utf8")).toContain("Concurrent user edit.");
  });

  it("rejects a parent-directory link swap immediately before execute without touching the external target", async () => {
    const root = await fixture();
    const outside = await mkdtemp(path.join(tmpdir(), "canontrail-migration-external-"));
    roots.push(outside);
    await writeFile(path.join(outside, "plants.md"), LEGACY);
    const report = await prepare(root);

    await expect(executeMigrationTransaction(
      root,
      report.output_path,
      report.transaction.transaction_hash,
      "2026-09-03T20:02:00.000Z",
      {
        beforeImmediateWriteCheck: async () => {
          await rename(path.join(root, "docs"), path.join(root, "docs-real"));
          await symlink(outside, path.join(root, "docs"), process.platform === "win32" ? "junction" : "dir");
        },
      },
    )).rejects.toThrow(/symbolic link/);

    expect(await readFile(path.join(outside, "plants.md"), "utf8")).toBe(LEGACY);
    expect(await readFile(path.join(root, "docs-real", "plants.md"), "utf8")).toBe(LEGACY);
    const execution = path.join(root, ".agent-context", "migrations", "MIG-TRANSFORM-001", "transactions", "MTX-TRANSFORM-001", "execution");
    await expect(readFile(path.join(execution, "apply.record.json"), "utf8")).rejects.toThrow();
  });

  it("rejects a parent-directory link swap immediately before rollback without touching the external target", async () => {
    const root = await fixture();
    const outside = await mkdtemp(path.join(tmpdir(), "canontrail-migration-external-"));
    roots.push(outside);
    const report = await prepare(root);
    await executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash);
    const transformed = await readFile(path.join(root, "docs", "plants.md"));
    await writeFile(path.join(outside, "plants.md"), transformed);

    await expect(rollbackMigrationTransaction(
      root,
      report.output_path,
      report.transaction.transaction_hash,
      "2026-09-03T20:03:00.000Z",
      {
        beforeImmediateRollbackCheck: async () => {
          await rename(path.join(root, "docs"), path.join(root, "docs-real"));
          await symlink(outside, path.join(root, "docs"), process.platform === "win32" ? "junction" : "dir");
        },
      },
    )).rejects.toThrow(/symbolic link/);

    expect(await readFile(path.join(outside, "plants.md"))).toEqual(transformed);
    expect(await readFile(path.join(root, "docs-real", "plants.md"))).toEqual(transformed);
    const rollbackRecord = path.join(root, ".agent-context", "migrations", "MIG-TRANSFORM-001", "transactions", "MTX-TRANSFORM-001", "execution", "rollback.record.json");
    await expect(readFile(rollbackRecord, "utf8")).rejects.toThrow();
  });

  it("blocks relocation instead of copying a normalized document beside its source", async () => {
    const root = await fixture();
    const report = await prepare(root, "docs/canonical/plants.md");

    expect(report.transaction.summary).toEqual({ operations: 0, blockers: 1, skipped: 0 });
    expect(report.transaction.blockers[0]).toMatchObject({
      path: "docs/plants.md",
      code: "RELOCATION_UNSUPPORTED",
    });
    await expect(executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash)).rejects.toThrow(/unresolved blockers/);
    await expect(readFile(path.join(root, "docs", "canonical", "plants.md"), "utf8")).rejects.toThrow();
    expect(await readFile(path.join(root, "docs", "plants.md"), "utf8")).toBe(LEGACY);
  });

  it("blocks reserved and non-Markdown migration targets before creating an operation", async () => {
    const root = await fixture();
    const reserved = await prepare(root, ".git/hooks/post-commit.md");
    expect(reserved.transaction.summary.operations).toBe(0);
    expect(reserved.transaction.blockers[0]).toMatchObject({ code: "UNSAFE_TARGET_PATH" });
    expect(reserved.transaction.blockers[0]?.reason).toMatch(/reserved/);

    const secondRoot = await fixture();
    const nonMarkdown = await prepare(secondRoot, "docs/plants.json");
    expect(nonMarkdown.transaction.summary.operations).toBe(0);
    expect(nonMarkdown.transaction.blockers[0]).toMatchObject({ code: "UNSAFE_TARGET_PATH" });
    expect(nonMarkdown.transaction.blockers[0]?.reason).toMatch(/Markdown/);
  });

  it("returns the existing valid apply record on an execute retry", async () => {
    const root = await fixture();
    const report = await prepare(root);
    const applied = await executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash, "2026-09-03T20:02:00.000Z");
    const retried = await executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash, "2026-09-03T21:00:00.000Z");

    expect(retried).toEqual(applied);
  });

  it("rejects a rehashed apply record whose operations diverge from the transaction", async () => {
    const root = await fixture();
    const report = await prepare(root);
    await executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash);
    const applyPath = path.join(root, ".agent-context", "migrations", "MIG-TRANSFORM-001", "transactions", "MTX-TRANSFORM-001", "execution", "apply.record.json");
    const forged = JSON.parse(await readFile(applyPath, "utf8"));
    forged.operations = [];
    const { record_hash: _ignored, ...payload } = forged;
    forged.record_hash = computeMigrationExecutionRecordHash(payload);
    await writeFile(applyPath, `${JSON.stringify(forged, null, 2)}\n`);

    await expect(executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash)).rejects.toThrow(/apply record is invalid/);
  });

  it("rejects a rehashed recovery intent whose operations diverge from the transaction", async () => {
    const root = await fixture();
    const report = await prepare(root);
    await executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash);
    const execution = path.join(root, ".agent-context", "migrations", "MIG-TRANSFORM-001", "transactions", "MTX-TRANSFORM-001", "execution");
    await rm(path.join(execution, "apply.record.json"));
    const intentPath = path.join(execution, "intent.json");
    const forged = JSON.parse(await readFile(intentPath, "utf8"));
    forged.operations = [];
    const { record_hash: _ignored, ...payload } = forged;
    forged.record_hash = computeMigrationApplyIntentHash(payload);
    await writeFile(intentPath, `${JSON.stringify(forged, null, 2)}\n`);

    await expect(rollbackMigrationTransaction(root, report.output_path, report.transaction.transaction_hash)).rejects.toThrow(/apply intent is invalid/);
  });

  it.each([
    ["preimage", "OP-0001.before.bin"],
    ["postimage", "OP-0001.after.bin"],
  ])("rejects a corrupted staged %s before rollback", async (_label, filename) => {
    const root = await fixture();
    const report = await prepare(root);
    await executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash);
    const execution = path.join(root, ".agent-context", "migrations", "MIG-TRANSFORM-001", "transactions", "MTX-TRANSFORM-001", "execution");
    await writeFile(path.join(execution, filename), "corrupted evidence");

    await expect(rollbackMigrationTransaction(root, report.output_path, report.transaction.transaction_hash)).rejects.toThrow(/recovery (?:preimage|postimage)/);
  });

  it("rejects a completed apply whose intent record is missing", async () => {
    const root = await fixture();
    const report = await prepare(root);
    await executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash);
    const execution = path.join(root, ".agent-context", "migrations", "MIG-TRANSFORM-001", "transactions", "MTX-TRANSFORM-001", "execution");
    await rm(path.join(execution, "intent.json"));

    await expect(executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash)).rejects.toThrow(/completed apply is missing its intent/);
    await expect(rollbackMigrationTransaction(root, report.output_path, report.transaction.transaction_hash)).rejects.toThrow(/valid recovery intent is required/);
  });

  it("rejects rehashed execution evidence that violates the shipped schema", async () => {
    const root = await fixture();
    const report = await prepare(root);
    await executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash);
    const execution = path.join(root, ".agent-context", "migrations", "MIG-TRANSFORM-001", "transactions", "MTX-TRANSFORM-001", "execution");
    const applyPath = path.join(execution, "apply.record.json");
    const invalidApply = JSON.parse(await readFile(applyPath, "utf8"));
    invalidApply.observed_at = "not-a-date";
    invalidApply.unexpected_contract = true;
    const { record_hash: _applyHash, ...applyPayload } = invalidApply;
    invalidApply.record_hash = computeMigrationExecutionRecordHash(applyPayload);
    await writeFile(applyPath, `${JSON.stringify(invalidApply, null, 2)}\n`);

    await expect(executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash)).rejects.toThrow(/does not conform to the shipped execution-evidence schema/);

    const validApply = await executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash).catch(() => null);
    expect(validApply).toBeNull();
    await rm(applyPath);
    const intentPath = path.join(execution, "intent.json");
    const invalidIntent = JSON.parse(await readFile(intentPath, "utf8"));
    invalidIntent.observed_at = "not-a-date";
    const { record_hash: _intentHash, ...intentPayload } = invalidIntent;
    invalidIntent.record_hash = computeMigrationApplyIntentHash(intentPayload);
    await writeFile(intentPath, `${JSON.stringify(invalidIntent, null, 2)}\n`);

    await expect(rollbackMigrationTransaction(root, report.output_path, report.transaction.transaction_hash)).rejects.toThrow(/does not conform to the shipped execution-evidence schema/);
  });

  it("explains rollback before execution without exposing a raw filesystem error", async () => {
    const root = await fixture();
    const report = await prepare(root);

    await expect(rollbackMigrationTransaction(root, report.output_path, report.transaction.transaction_hash)).rejects.toThrow(/has not been executed; no rollback evidence exists/);
  });

  it("rejects a poisoned execution directory with a state-specific message", async () => {
    const root = await fixture();
    const report = await prepare(root);
    const execution = path.join(root, ".agent-context", "migrations", "MIG-TRANSFORM-001", "transactions", "MTX-TRANSFORM-001", "execution");
    await mkdir(execution);

    await expect(executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash)).rejects.toThrow(/already exists without a valid apply record or intent/);
  });

  it("keeps a rolled-back transaction single-use and returns the rollback record idempotently", async () => {
    const root = await fixture();
    const report = await prepare(root);
    await executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash);
    const rolledBack = await rollbackMigrationTransaction(root, report.output_path, report.transaction.transaction_hash);

    expect(await rollbackMigrationTransaction(root, report.output_path, report.transaction.transaction_hash)).toEqual(rolledBack);
    await expect(executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash)).rejects.toThrow(/already rolled back.*single-use/);
  });

  it("refuses rollback after a post-transaction user edit", async () => {
    const root = await fixture();
    const report = await prepare(root);
    await executeMigrationTransaction(root, report.output_path, report.transaction.transaction_hash);
    await writeFile(path.join(root, "docs", "plants.md"), "post-transaction user edit\n");

    await expect(rollbackMigrationTransaction(root, report.output_path, report.transaction.transaction_hash)).rejects.toThrow(/drift blocks rollback/);
    expect(await readFile(path.join(root, "docs", "plants.md"), "utf8")).toBe("post-transaction user edit\n");
  });
});

describe("reviewed decision serialization", () => {
  it("keeps a valid transaction executable when the reviewed decision file uses a different top-level key order", async () => {
    const root = await fixture();
    const canonical = await decisionSet(root);
    // Same reviewed values; JSON object members have no semantic order (RFC 8259).
    const reordered: MigrationDecisionSet = {
      decisions: canonical.decisions,
      reviewed_at: canonical.reviewed_at,
      reviewed_by: canonical.reviewed_by,
      plan_hash: canonical.plan_hash,
      migration_id: canonical.migration_id,
      version: canonical.version,
    };
    const prepared = await prepareMigrationTransformation({
      root,
      migrationId: "MIG-TRANSFORM-001",
      transactionId: "MTX-TRANSFORM-001",
      documentationRoots: ["docs"],
      createdAt: "2026-09-03T20:00:00.000Z",
      decisions: reordered,
      apply: true,
    });
    expect(prepared.transaction.blockers).toEqual([]);
    const record = await executeMigrationTransaction(root, prepared.output_path, prepared.transaction.transaction_hash);
    expect(record.record_hash).toMatch(/^sha256:/);
  });
});
