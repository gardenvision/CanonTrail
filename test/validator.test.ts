import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { generateContextIndex } from "../src/indexer.js";
import {
  computeMigrationApplyIntentHash,
  computeMigrationDecisionSetHash,
  computeMigrationPlanHash,
  computeMigrationTransactionHash,
  type MigrationApplyIntent,
  type MigrationDecisionSet,
  type MigrationPlan,
  type MigrationTransaction,
} from "../src/migration.js";
import { formatValidationReport, validateRepository } from "../src/validator.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function markdown(topic: string, truthLevel = "canonical", body = "# Fixture\n"): string {
  return `---
topic_id: ${topic}
stand: "2026-07-13"
status: current
truth_level: ${truthLevel}
verification:
  state: reviewed
  evidence: []
read_if_task_touches:
  - fixture
primary_systems:
  - fixture
safe_to_edit:
  - Keep valid.
do_not_use_instead: []
---

${body}`;
}

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "canontrail-test-"));
  temporaryRoots.push(root);
  await cp(path.resolve("schemas"), path.join(root, "schemas"), { recursive: true });
  await mkdir(path.join(root, ".agent-context"), { recursive: true });
  await writeFile(
    path.join(root, ".agent-context", "config.yaml"),
    `version: 1
index_path: .agent-context/context-index.json
exclude_paths:
  - .git
  - node_modules
  - dist
require_frontmatter_for_all_markdown: true
require_topic_id_for_canonical: true
allow_missing_references: []
`,
  );
  return root;
}

const impactAreas = [
  "requirement",
  "data-contracts",
  "domain-logic",
  "tests-reference-cases",
  "example-data",
  "ui-api",
  "documentation",
  "diagrams-visuals",
  "terminology",
  "operations-compatibility",
] as const;

function verifiedChangeRecord(): Record<string, unknown> {
  return {
    version: 1,
    change_id: "CHG-TEST-001",
    revision: 1,
    title: "Validator fixture",
    status: "verified",
    risk: "medium",
    author: "fixture-author",
    canonical_source: "README.md",
    decision_rationale: "The fixture README supplies the canonical expected behavior.",
    documentation_structure: {
      decision: "no-feature-document-change",
      rationale: "The validator fixture does not change a product feature or its documentation boundary.",
      feature_documents: [],
    },
    acceptance_cases: [{
      id: "AC-001",
      given: "A complete valid record.",
      expected: "Repository validation succeeds.",
      failure_or_uncertainty: "Incomplete records produce diagnostics.",
      counterexample: "Passing checks with a missing impact row remain invalid.",
      oracle: "The change-record schema and semantic validator.",
      status: "pass",
      evidence_refs: ["README.md"],
    }],
    impacts: impactAreas.map((area) => ({
      area,
      decision: "not-affected",
      rationale: `${area} is deliberately unchanged in this validator fixture.`,
      evidence_refs: [],
    })),
    verification: {
      checks: [{ name: "Fixture assertion", status: "pass", evidence_refs: ["README.md"] }],
      terminology_search: { status: "not-applicable", terms: [], evidence_refs: ["README.md"] },
      visual_review: { applicable: false, status: "not-applicable", evidence_refs: ["README.md"] },
      unverifiable_items: [],
    },
    independent_review: {
      status: "not-required",
      reviewer: null,
      findings: [],
      evidence_refs: [],
      waiver: null,
    },
    supersedes: [],
    superseded_by: null,
    updated_at: "2026-07-15T00:00:00+02:00",
  };
}

describe("validateRepository", () => {
  it("validates migration plans through the dedicated schema", async () => {
    const root = await fixtureRoot();
    await mkdir(path.join(root, ".agent-context", "migrations", "MIG-TEST-001"), { recursive: true });
    const planWithoutHash: Omit<MigrationPlan, "plan_hash"> = {
      version: 1,
      migration_id: "MIG-TEST-001",
      created_at: "2026-09-03T12:00:00.000Z",
      mode: "plan-only",
      adapter: "auto",
      root: ".",
      documentation_roots: ["docs"],
      summary: {
        documents: 0,
        source_formats: { "canontrail-frontmatter": 0, "gaertnerei-legacy-header": 0, "plain-markdown": 0 },
        roles: { canonical: 0, "active-reference": 0, "active-snapshot": 0, "design-target": 0, handoff: 0, review: 0, historical: 0, "third-party": 0, unknown: 0 },
        actions: { keep: 0, "normalize-header": 0, "review-metadata": 0, "classify-and-normalize": 0, "preserve-historical": 0, "preserve-review": 0, "exclude-external": 0 },
        review_required: 0,
        ignored_by_extension: {},
        unreadable: 0,
      },
      documents: [],
      unprocessed: [],
      warnings: [],
    };
    const plan: MigrationPlan = { ...planWithoutHash, plan_hash: computeMigrationPlanHash(planWithoutHash) };
    await writeFile(
      path.join(root, ".agent-context", "migrations", "MIG-TEST-001", "migration.plan.json"),
      JSON.stringify(plan, null, 2),
    );

    const report = await validateRepository(root, { checkIndex: false });

    expect(report.diagnostics).toEqual([]);

    await writeFile(
      path.join(root, ".agent-context", "migrations", "MIG-TEST-001", "migration.plan.json"),
      JSON.stringify({ ...plan, plan_hash: `sha256:${"0".repeat(64)}` }, null, 2),
    );
    const tampered = await validateRepository(root, { checkIndex: false });
    expect(tampered.diagnostics.some((diagnostic) => diagnostic.code === "MIGRATION002")).toBe(true);

    const invalidRootPayload = { ...planWithoutHash, documentation_roots: ["docs:stream"] };
    await writeFile(
      path.join(root, ".agent-context", "migrations", "MIG-TEST-001", "migration.plan.json"),
      JSON.stringify({ ...invalidRootPayload, plan_hash: computeMigrationPlanHash(invalidRootPayload) }, null, 2),
    );
    const invalidRoot = await validateRepository(root, { checkIndex: false });
    expect(invalidRoot.diagnostics.some((diagnostic) => diagnostic.code === "SCHEMA005")).toBe(true);

    const reportedUnsafePathPayload = {
      ...planWithoutHash,
      summary: { ...planWithoutHash.summary, unreadable: 1 },
      unprocessed: [{ path: "docs/odd?.md", reason: "unsafe migration document path" }],
    };
    await writeFile(
      path.join(root, ".agent-context", "migrations", "MIG-TEST-001", "migration.plan.json"),
      JSON.stringify({ ...reportedUnsafePathPayload, plan_hash: computeMigrationPlanHash(reportedUnsafePathPayload) }, null, 2),
    );
    const reportedUnsafePath = await validateRepository(root, { checkIndex: false });
    expect(reportedUnsafePath.diagnostics).toEqual([]);

    const unsortedRootsPayload = { ...planWithoutHash, documentation_roots: ["docs/z", "docs"] };
    await writeFile(
      path.join(root, ".agent-context", "migrations", "MIG-TEST-001", "migration.plan.json"),
      JSON.stringify({ ...unsortedRootsPayload, plan_hash: computeMigrationPlanHash(unsortedRootsPayload) }, null, 2),
    );
    const unsortedRoots = await validateRepository(root, { checkIndex: false });
    expect(unsortedRoots.diagnostics.some((diagnostic) => diagnostic.code === "MIGRATION005" && diagnostic.message.includes("deterministically sorted"))).toBe(true);

    const falseCountsPayload = {
      ...planWithoutHash,
      summary: {
        ...planWithoutHash.summary,
        source_formats: { ...planWithoutHash.summary.source_formats, "plain-markdown": 1 },
        unreadable: 1,
      },
    };
    await writeFile(
      path.join(root, ".agent-context", "migrations", "MIG-TEST-001", "migration.plan.json"),
      JSON.stringify({ ...falseCountsPayload, plan_hash: computeMigrationPlanHash(falseCountsPayload) }, null, 2),
    );
    const falseCounts = await validateRepository(root, { checkIndex: false });
    expect(falseCounts.diagnostics.some((diagnostic) => diagnostic.code === "MIGRATION004")).toBe(true);

    const outOfRootDocument = {
      path: "other/outside.md",
      content_hash: `sha256:${"1".repeat(64)}`,
      bytes: 1,
      source_format: "plain-markdown" as const,
      detected_metadata: {
        stand: null,
        status: null,
        truth_level: null,
        verification: null,
        read_if_task_touches: [],
        primary_systems: [],
        safe_to_edit: [],
        do_not_use_instead: [],
      },
      role: "unknown" as const,
      proposed_action: "classify-and-normalize" as const,
      target_path: "other/outside.md",
      confidence: "low" as const,
      requires_review: true,
      reasons: ["Adversarial out-of-root plan document."],
    };
    const outOfRootPayload: Omit<MigrationPlan, "plan_hash"> = {
      ...planWithoutHash,
      summary: {
        ...planWithoutHash.summary,
        documents: 1,
        source_formats: { ...planWithoutHash.summary.source_formats, "plain-markdown": 1 },
        roles: { ...planWithoutHash.summary.roles, unknown: 1 },
        actions: { ...planWithoutHash.summary.actions, "classify-and-normalize": 1 },
        review_required: 1,
      },
      documents: [outOfRootDocument],
    };
    await writeFile(
      path.join(root, ".agent-context", "migrations", "MIG-TEST-001", "migration.plan.json"),
      JSON.stringify({ ...outOfRootPayload, plan_hash: computeMigrationPlanHash(outOfRootPayload) }, null, 2),
    );
    const outOfRoot = await validateRepository(root, { checkIndex: false });
    expect(outOfRoot.diagnostics.some((diagnostic) => diagnostic.code === "MIGRATION006" && diagnostic.message.includes("outside"))).toBe(true);
  });

  it("validates migration transactions through the dedicated schema and self-hash", async () => {
    const root = await fixtureRoot();
    const directory = path.join(root, ".agent-context", "migrations", "MIG-TEST-001", "transactions", "MTX-TEST-001");
    await mkdir(directory, { recursive: true });
    const payload: Omit<MigrationTransaction, "transaction_hash"> = {
      version: 2,
      transaction_id: "MTX-TEST-001",
      migration_id: "MIG-TEST-001",
      created_at: "2026-09-03T12:00:00.000Z",
      mode: "transformation-preview",
      plan_hash: `sha256:${"1".repeat(64)}`,
      decision_hash: null,
      reviewed_by: null,
      reviewed_at: null,
      decisions: [],
      root: ".",
      documentation_roots: ["docs"],
      operations: [],
      blockers: [],
      summary: { operations: 0, blockers: 0, skipped: 0 },
    };
    const transaction: MigrationTransaction = { ...payload, transaction_hash: computeMigrationTransactionHash(payload) };
    const transactionPath = path.join(directory, "transaction.json");
    await writeFile(transactionPath, JSON.stringify(transaction, null, 2));
    const executionDirectory = path.join(directory, "execution");
    await mkdir(executionDirectory);
    const intentPayload: Omit<MigrationApplyIntent, "record_hash"> = {
      version: 1,
      kind: "migration-apply-intent",
      transaction_hash: transaction.transaction_hash,
      observed_at: "2026-09-03T12:01:00.000Z",
      operations: [],
    };
    const intent: MigrationApplyIntent = { ...intentPayload, record_hash: computeMigrationApplyIntentHash(intentPayload) };
    const intentPath = path.join(executionDirectory, "intent.json");
    await writeFile(intentPath, JSON.stringify(intent, null, 2));

    expect((await validateRepository(root, { checkIndex: false })).diagnostics).toEqual([]);

    await writeFile(intentPath, JSON.stringify({ ...intent, record_hash: `sha256:${"0".repeat(64)}` }, null, 2));
    const tamperedIntent = await validateRepository(root, { checkIndex: false });
    expect(tamperedIntent.diagnostics.some((diagnostic) => diagnostic.code === "MIGRATION201")).toBe(true);
    await writeFile(intentPath, JSON.stringify(intent, null, 2));

    const forgedIntentPayload = { ...intentPayload, operations: [{
      operation_id: "OP-0001",
      source_path: "docs/forged.md",
      target_path: "docs/forged.md",
      source_hash: `sha256:${"1".repeat(64)}`,
      output_hash: `sha256:${"2".repeat(64)}`,
    }] };
    await writeFile(intentPath, JSON.stringify({ ...forgedIntentPayload, record_hash: computeMigrationApplyIntentHash(forgedIntentPayload) }, null, 2));
    const forgedIntent = await validateRepository(root, { checkIndex: false });
    expect(forgedIntent.diagnostics.some((diagnostic) => diagnostic.code === "MIGRATION203")).toBe(true);
    await writeFile(intentPath, JSON.stringify(intent, null, 2));

    const malformedPayload = {
      ...payload,
      operations: [null],
      summary: { operations: 1, blockers: 0, skipped: 0 },
    };
    const malformedTransaction = { ...malformedPayload, transaction_hash: computeMigrationTransactionHash(malformedPayload as never) };
    await writeFile(transactionPath, JSON.stringify(malformedTransaction, null, 2));
    const malformedIntentPayload = { ...intentPayload, transaction_hash: malformedTransaction.transaction_hash };
    await writeFile(intentPath, JSON.stringify({ ...malformedIntentPayload, record_hash: computeMigrationApplyIntentHash(malformedIntentPayload) }, null, 2));
    const malformed = await validateRepository(root, { checkIndex: false });
    expect(malformed.diagnostics.some((diagnostic) => diagnostic.code === "SCHEMA005")).toBe(true);
    expect(malformed.diagnostics.some((diagnostic) => diagnostic.code === "MIGRATION203" && diagnostic.message.includes("malformed"))).toBe(true);

    await writeFile(intentPath, JSON.stringify(intent, null, 2));
    await writeFile(transactionPath, JSON.stringify({ ...transaction, summary: { operations: 1, blockers: 0, skipped: 0 } }, null, 2));
    const tampered = await validateRepository(root, { checkIndex: false });
    expect(tampered.diagnostics.some((diagnostic) => diagnostic.code === "MIGRATION102")).toBe(true);
    expect(tampered.diagnostics.some((diagnostic) => diagnostic.code === "MIGRATION103")).toBe(true);
  });

  it("rejects unreviewed and decision-divergent migration operations during repository validation", async () => {
    const root = await fixtureRoot();
    const directory = path.join(root, ".agent-context", "migrations", "MIG-TEST-001", "transactions", "MTX-TEST-001");
    await mkdir(directory, { recursive: true });
    const header = {
      topic_id: "plants",
      stand: "2026-09-04",
      status: "current",
      truth_level: "canonical" as const,
      verification: { state: "reviewed" as const, evidence: ["docs/plants.md"] },
      read_if_task_touches: ["plants"],
      primary_systems: ["PlantService"],
      safe_to_edit: ["Preserve behavior."],
      do_not_use_instead: [],
    };
    const operation = {
      operation_id: "OP-0001",
      action: "normalize-header" as const,
      source_path: "docs/plants.md",
      target_path: "docs/plants.md",
      source_hash: `sha256:${"1".repeat(64)}`,
      target_precondition: { state: "same-as-source" as const, content_hash: `sha256:${"1".repeat(64)}` },
      output_hash: `sha256:${"2".repeat(64)}`,
      output_bytes: 10,
      target_header: header,
    };
    const unreviewedPayload: Omit<MigrationTransaction, "transaction_hash"> = {
      version: 2,
      transaction_id: "MTX-TEST-001",
      migration_id: "MIG-TEST-001",
      created_at: "2026-09-04T08:00:00.000Z",
      mode: "transformation-preview",
      plan_hash: `sha256:${"3".repeat(64)}`,
      decision_hash: null,
      reviewed_by: null,
      reviewed_at: null,
      decisions: [],
      root: ".",
      documentation_roots: ["docs"],
      operations: [operation],
      blockers: [],
      summary: { operations: 1, blockers: 0, skipped: 0 },
    };
    const transactionPath = path.join(directory, "transaction.json");
    await writeFile(transactionPath, JSON.stringify({ ...unreviewedPayload, transaction_hash: computeMigrationTransactionHash(unreviewedPayload) }, null, 2));
    const unreviewed = await validateRepository(root, { checkIndex: false });
    expect(unreviewed.diagnostics.some((diagnostic) => diagnostic.code === "MIGRATION105")).toBe(true);
    expect(unreviewed.diagnostics.some((diagnostic) => diagnostic.code === "MIGRATION106")).toBe(true);

    const decisionSet: MigrationDecisionSet = {
      version: 1,
      migration_id: "MIG-TEST-001",
      plan_hash: `sha256:${"3".repeat(64)}`,
      reviewed_by: "independent-reviewer",
      reviewed_at: "2026-09-04T08:01:00.000Z",
      decisions: [{
        path: "docs/plants.md",
        decision: "execute",
        action: "normalize-header",
        target_path: "docs/plants.md",
        reason: "Reviewed mapping.",
        target_header: header,
      }],
    };
    const divergentPayload: Omit<MigrationTransaction, "transaction_hash"> = {
      ...unreviewedPayload,
      decision_hash: computeMigrationDecisionSetHash(decisionSet),
      reviewed_by: decisionSet.reviewed_by,
      reviewed_at: decisionSet.reviewed_at,
      decisions: decisionSet.decisions,
      operations: [{ ...operation, target_header: { ...header, verification: { ...header.verification, state: "verified" as const } } }],
    };
    await writeFile(transactionPath, JSON.stringify({ ...divergentPayload, transaction_hash: computeMigrationTransactionHash(divergentPayload) }, null, 2));
    const divergent = await validateRepository(root, { checkIndex: false });
    expect(divergent.diagnostics.some((diagnostic) => diagnostic.code === "MIGRATION106")).toBe(true);
  });

  it("rejects self-consistent transactions whose operations escape their hash-bound documentation roots", async () => {
    const root = await fixtureRoot();
    const directory = path.join(root, ".agent-context", "migrations", "MIG-TEST-001", "transactions", "MTX-TEST-001");
    await mkdir(directory, { recursive: true });
    const header = {
      topic_id: "other",
      stand: "2026-09-05",
      status: "current",
      truth_level: "canonical" as const,
      verification: { state: "reviewed" as const, evidence: ["elsewhere/other.md"] },
      read_if_task_touches: ["other"],
      primary_systems: ["fixture"],
      safe_to_edit: ["Preserve behavior."],
      do_not_use_instead: [],
    };
    const decisions: MigrationDecisionSet["decisions"] = [{
      path: "elsewhere/other.md",
      decision: "execute",
      action: "normalize-header",
      target_path: "elsewhere/other.md",
      reason: "Forged but internally consistent out-of-root decision.",
      target_header: header,
    }];
    const decisionSet: MigrationDecisionSet = {
      version: 1,
      migration_id: "MIG-TEST-001",
      plan_hash: `sha256:${"3".repeat(64)}`,
      reviewed_by: "forged-reviewer",
      reviewed_at: "2026-09-05T08:00:00.000Z",
      decisions,
    };
    const payload: Omit<MigrationTransaction, "transaction_hash"> = {
      version: 2,
      transaction_id: "MTX-TEST-001",
      migration_id: "MIG-TEST-001",
      created_at: "2026-09-05T08:01:00.000Z",
      mode: "transformation-preview",
      plan_hash: decisionSet.plan_hash,
      decision_hash: computeMigrationDecisionSetHash(decisionSet),
      reviewed_by: decisionSet.reviewed_by,
      reviewed_at: decisionSet.reviewed_at,
      decisions,
      root: ".",
      documentation_roots: ["docs"],
      operations: [{
        operation_id: "OP-0001",
        action: "normalize-header",
        source_path: "elsewhere/other.md",
        target_path: "elsewhere/other.md",
        source_hash: `sha256:${"1".repeat(64)}`,
        target_precondition: { state: "same-as-source", content_hash: `sha256:${"1".repeat(64)}` },
        output_hash: `sha256:${"2".repeat(64)}`,
        output_bytes: 10,
        target_header: header,
      }],
      blockers: [],
      summary: { operations: 1, blockers: 0, skipped: 0 },
    };
    const transaction = { ...payload, transaction_hash: computeMigrationTransactionHash(payload) };
    await writeFile(path.join(directory, "transaction.json"), JSON.stringify(transaction, null, 2));

    const report = await validateRepository(root, { checkIndex: false });
    expect(report.diagnostics.some((diagnostic) => diagnostic.code === "MIGRATION106" && diagnostic.message.includes("transaction-bound reviewed documentation roots"))).toBe(true);

    const rootless = { ...transaction } as Record<string, unknown>;
    delete rootless.documentation_roots;
    const { transaction_hash: _rootlessHash, ...rootlessPayload } = rootless;
    rootless.transaction_hash = computeMigrationTransactionHash(rootlessPayload as Omit<MigrationTransaction, "transaction_hash">);
    await writeFile(path.join(directory, "transaction.json"), JSON.stringify(rootless, null, 2));
    const rootlessReport = await validateRepository(root, { checkIndex: false });
    expect(rootlessReport.diagnostics.some((diagnostic) => diagnostic.code === "SCHEMA005")).toBe(true);
    expect(rootlessReport.diagnostics.some((diagnostic) => diagnostic.code === "MIGRATION106" && diagnostic.message.includes("documentation_roots must contain"))).toBe(true);

    const emptyRoots = { ...transaction, documentation_roots: [] };
    const { transaction_hash: _emptyHash, ...emptyPayload } = emptyRoots;
    const rehashedEmptyRoots = { ...emptyRoots, transaction_hash: computeMigrationTransactionHash(emptyPayload) };
    await writeFile(path.join(directory, "transaction.json"), JSON.stringify(rehashedEmptyRoots, null, 2));
    const emptyReport = await validateRepository(root, { checkIndex: false });
    expect(emptyReport.diagnostics.some((diagnostic) => diagnostic.code === "SCHEMA005")).toBe(true);
    expect(emptyReport.diagnostics.some((diagnostic) => diagnostic.code === "MIGRATION106" && diagnostic.message.includes("documentation_roots must contain"))).toBe(true);

    const streamPath = "docs/other:review.md";
    const streamTransaction = structuredClone(transaction);
    streamTransaction.documentation_roots = ["docs"];
    streamTransaction.decisions[0]!.path = streamPath;
    streamTransaction.decisions[0]!.target_path = streamPath;
    streamTransaction.operations[0]!.source_path = streamPath;
    streamTransaction.operations[0]!.target_path = streamPath;
    streamTransaction.decision_hash = computeMigrationDecisionSetHash({
      version: 1,
      migration_id: streamTransaction.migration_id,
      plan_hash: streamTransaction.plan_hash,
      reviewed_by: streamTransaction.reviewed_by ?? "",
      reviewed_at: streamTransaction.reviewed_at ?? "",
      decisions: streamTransaction.decisions,
    });
    const { transaction_hash: _streamHash, ...streamPayload } = streamTransaction;
    streamTransaction.transaction_hash = computeMigrationTransactionHash(streamPayload);
    await writeFile(path.join(directory, "transaction.json"), JSON.stringify(streamTransaction, null, 2));
    const streamReport = await validateRepository(root, { checkIndex: false });
    expect(streamReport.diagnostics.some((diagnostic) => diagnostic.code === "SCHEMA005")).toBe(true);
    expect(streamReport.diagnostics.some((diagnostic) => diagnostic.code === "MIGRATION106" && diagnostic.message.includes("alternate-data-stream"))).toBe(true);

    const missingOperation = structuredClone(transaction);
    missingOperation.operations = [];
    missingOperation.summary.operations = 0;
    const { transaction_hash: _missingOperationHash, ...missingOperationPayload } = missingOperation;
    missingOperation.transaction_hash = computeMigrationTransactionHash(missingOperationPayload);
    await writeFile(path.join(directory, "transaction.json"), JSON.stringify(missingOperation, null, 2));
    const missingOperationReport = await validateRepository(root, { checkIndex: false });
    expect(missingOperationReport.diagnostics.some((diagnostic) => diagnostic.code === "MIGRATION106" && diagnostic.message.includes("has no matching migration operation"))).toBe(true);
  });

  it("validates a complete indexed artifact fixture with the shipped schemas", async () => {
    // The caller's dirty task history is not a unit-test fixture. Actual
    // repository health remains a separate, mandatory strict CLI/CI gate.
    const root = await fixtureRoot();
    await writeFile(path.join(root, "README.md"), markdown("indexed-artifact-fixture"));
    await writeFile(path.join(root, "change.yaml"), stringify(verifiedChangeRecord()));
    await generateContextIndex(root);
    const report = await validateRepository(root);
    expect(report.diagnostics).toEqual([]);
    expect(report.ok).toBe(true);
    expect(formatValidationReport(report)).toContain("Structural validation PASS");
  });

  it("detects two canonical documents for one topic", async () => {
    const root = await fixtureRoot();
    await writeFile(path.join(root, "one.md"), markdown("duplicate-topic"));
    await writeFile(path.join(root, "two.md"), markdown("duplicate-topic"));

    const report = await validateRepository(root, { checkIndex: false });

    expect(report.diagnostics.some((diagnostic) => diagnostic.code === "CANON002")).toBe(true);
  });

  it("rejects a compatibility manifest that permits external artifact writes", async () => {
    const root = await fixtureRoot();
    await writeFile(
      path.join(root, "compatibility.yaml"),
      `version: 1
generated: 2026-07-13
policy:
  external_artifacts_are_read_only: false
  external_artifacts_are_canonical: false
  canonical_promotion_is_explicit: true
integrations: []
`,
    );

    const report = await validateRepository(root, { checkIndex: false });

    expect(report.diagnostics.some((diagnostic) => diagnostic.code === "SCHEMA005")).toBe(true);
  });

  it("rejects a dirty handoff without an uncommitted summary", async () => {
    const root = await fixtureRoot();
    await writeFile(path.join(root, "README.md"), markdown("fixture-readme"));
    await writeFile(
      path.join(root, "handoff.yaml"),
      `handoff_id: H-TEST-001
task_id: T-TEST-001
created_at: "2026-07-13T17:00:00+02:00"
source_session_id: session-test
objective: Validate dirty handoff behavior.
completed: []
decisions: []
files: []
checks: []
blockers: []
open_questions: []
next_safe_action: Implement the next deterministic fixture step and run its focused test.
do_not_repeat: []
resume_sources:
  - README.md
worktree_dirty: true
`,
    );

    const report = await validateRepository(root, { checkIndex: false });

    expect(report.diagnostics.some((diagnostic) => diagnostic.code === "HANDOFF002")).toBe(true);
  });

  it("detects a stale deterministic context index", async () => {
    const root = await fixtureRoot();
    const readme = path.join(root, "README.md");
    await writeFile(readme, markdown("fixture-readme"));
    await generateContextIndex(root);
    const previousIndex = await readFile(path.join(root, ".agent-context", "context-index.json"), "utf8");
    await writeFile(readme, markdown("fixture-readme", "canonical", "# Changed fixture\n"));

    const report = await validateRepository(root);

    expect(report.diagnostics.some((diagnostic) => diagnostic.code === "INDEX003")).toBe(true);
    expect(await readFile(path.join(root, ".agent-context", "context-index.json"), "utf8")).toBe(previousIndex);
  });

  it("rejects a verified change with a duplicate and missing impact area", async () => {
    const root = await fixtureRoot();
    await writeFile(path.join(root, "README.md"), markdown("fixture-readme"));
    const change = verifiedChangeRecord();
    const impacts = change.impacts as Array<Record<string, unknown>>;
    impacts[impacts.length - 1] = { ...impacts[0] };
    await writeFile(path.join(root, "change.yaml"), stringify(change));

    const report = await validateRepository(root, { checkIndex: false });

    expect(report.diagnostics.some((diagnostic) => diagnostic.code === "CHANGE001")).toBe(true);
    expect(report.diagnostics.some((diagnostic) => diagnostic.code === "CHANGE002")).toBe(true);
  });

  it("keeps unversioned legacy change records readable", async () => {
    const root = await fixtureRoot();
    await writeFile(path.join(root, "README.md"), markdown("fixture-readme"));
    const change = verifiedChangeRecord();
    delete change.version;
    delete change.documentation_structure;
    await writeFile(path.join(root, "change.yaml"), stringify(change));

    const report = await validateRepository(root, { checkIndex: false });

    expect(report.diagnostics).toEqual([]);
  });

  it("requires documentation structure for a version-1 decided change", async () => {
    const root = await fixtureRoot();
    await writeFile(path.join(root, "README.md"), markdown("fixture-readme"));
    const change = verifiedChangeRecord();
    change.status = "decided";
    delete change.documentation_structure;
    await writeFile(path.join(root, "change.yaml"), stringify(change));

    const report = await validateRepository(root, { checkIndex: false });

    expect(report.diagnostics.some((diagnostic) => diagnostic.code === "SCHEMA005")).toBe(true);
  });

  it("requires structure reassessment and planned feature documents to close before implemented", async () => {
    const root = await fixtureRoot();
    await writeFile(path.join(root, "README.md"), markdown("fixture-readme"));
    const change = verifiedChangeRecord();
    change.status = "implemented";
    change.documentation_structure = {
      decision: "reassess-documentation-structure",
      rationale: "The fixture deliberately leaves the product boundary unresolved.",
      feature_documents: [{
        feature_id: "fixture-feature",
        action: "create",
        status: "planned",
        path: "feature.md",
        evidence_refs: [],
      }],
    };
    await writeFile(path.join(root, "change.yaml"), stringify(change));

    const report = await validateRepository(root, { checkIndex: false });

    expect(report.diagnostics.filter((diagnostic) => diagnostic.code === "CHANGE015")).toHaveLength(2);
  });

  it("requires feature-document verification evidence before a change is verified", async () => {
    const root = await fixtureRoot();
    await writeFile(path.join(root, "README.md"), markdown("fixture-readme"));
    await writeFile(path.join(root, "feature.md"), markdown("fixture-feature", "draft"));
    const change = verifiedChangeRecord();
    change.documentation_structure = {
      decision: "create-feature-documents",
      rationale: "The fixture models a newly independent user-facing capability.",
      feature_documents: [{
        feature_id: "fixture-feature",
        action: "create",
        status: "drafted",
        path: "feature.md",
        evidence_refs: [],
      }],
    };
    await writeFile(path.join(root, "change.yaml"), stringify(change));

    const report = await validateRepository(root, { checkIndex: false });

    expect(report.diagnostics.some((diagnostic) => diagnostic.code === "CHANGE017")).toBe(true);
    expect(report.diagnostics.some((diagnostic) => diagnostic.code === "SCHEMA005")).toBe(true);
  });

  it("rejects duplicate feature-document identities", async () => {
    const root = await fixtureRoot();
    await writeFile(path.join(root, "README.md"), markdown("fixture-readme"));
    const change = verifiedChangeRecord();
    change.documentation_structure = {
      decision: "create-feature-documents",
      rationale: "The fixture deliberately repeats one stable product-feature identity.",
      feature_documents: ["create", "update"].map((action) => ({
        feature_id: "fixture-feature",
        action,
        status: "promoted",
        path: "README.md",
        evidence_refs: ["README.md"],
      })),
    };
    await writeFile(path.join(root, "change.yaml"), stringify(change));

    const report = await validateRepository(root, { checkIndex: false });

    expect(report.diagnostics.some((diagnostic) => diagnostic.code === "CHANGE014")).toBe(true);
  });

  it("accepts an evidence-backed verified feature-document update before promotion", async () => {
    const root = await fixtureRoot();
    await writeFile(path.join(root, "README.md"), markdown("fixture-readme"));
    const change = verifiedChangeRecord();
    change.documentation_structure = {
      decision: "update-existing-feature-documents",
      rationale: "The existing feature document remains the single product-behavior owner.",
      feature_documents: [{
        feature_id: "fixture-feature",
        action: "update",
        status: "verified",
        path: "README.md",
        evidence_refs: ["README.md"],
      }],
    };
    await writeFile(path.join(root, "change.yaml"), stringify(change));

    const report = await validateRepository(root, { checkIndex: false });

    expect(report.diagnostics).toEqual([]);
  });

  it("rejects a verified feature-document claim while its header remains draft and internally reviewed", async () => {
    const root = await fixtureRoot();
    await writeFile(path.join(root, "README.md"), markdown("fixture-readme"));
    await writeFile(
      path.join(root, "feature.md"),
      markdown("fixture-feature", "draft").replace("state: reviewed", "state: internally-reviewed"),
    );
    const change = verifiedChangeRecord();
    change.documentation_structure = {
      decision: "create-feature-documents",
      rationale: "The fixture models an overclaimed new feature document.",
      feature_documents: [{
        feature_id: "fixture-feature",
        action: "create",
        status: "verified",
        path: "feature.md",
        evidence_refs: ["feature.md"],
      }],
    };
    await writeFile(path.join(root, "change.yaml"), stringify(change));

    const report = await validateRepository(root, { checkIndex: false });

    expect(report.diagnostics.some((diagnostic) => diagnostic.code === "CHANGE018")).toBe(true);
  });

  it("accepts a drafted new feature document that remains draft and internally reviewed", async () => {
    const root = await fixtureRoot();
    await writeFile(path.join(root, "README.md"), markdown("fixture-readme"));
    await writeFile(
      path.join(root, "feature.md"),
      markdown("fixture-feature", "draft").replace("state: reviewed", "state: internally-reviewed"),
    );
    const change = verifiedChangeRecord();
    change.status = "implemented";
    change.documentation_structure = {
      decision: "create-feature-documents",
      rationale: "The fixture preserves the draft boundary before verification.",
      feature_documents: [{
        feature_id: "fixture-feature",
        action: "create",
        status: "drafted",
        path: "feature.md",
        evidence_refs: ["feature.md"],
      }],
    };
    await writeFile(path.join(root, "change.yaml"), stringify(change));

    const report = await validateRepository(root, { checkIndex: false });

    expect(report.diagnostics.some((diagnostic) => diagnostic.code === "CHANGE018")).toBe(false);
  });

  it("requires promoted feature documents to be canonical and verified", async () => {
    const root = await fixtureRoot();
    await writeFile(path.join(root, "README.md"), markdown("fixture-readme"));
    await writeFile(path.join(root, "feature.md"), markdown("fixture-feature", "design-target"));
    const change = verifiedChangeRecord();
    change.documentation_structure = {
      decision: "create-feature-documents",
      rationale: "The fixture overclaims promotion from a design target.",
      feature_documents: [{
        feature_id: "fixture-feature",
        action: "create",
        status: "promoted",
        path: "feature.md",
        evidence_refs: ["feature.md"],
      }],
    };
    await writeFile(path.join(root, "change.yaml"), stringify(change));

    const report = await validateRepository(root, { checkIndex: false });

    expect(report.diagnostics.some((diagnostic) => diagnostic.code === "CHANGE018")).toBe(true);
  });

  it("rejects verified terminology impact without a passing scoped search", async () => {
    const root = await fixtureRoot();
    await writeFile(path.join(root, "README.md"), markdown("fixture-readme"));
    const change = verifiedChangeRecord();
    const impacts = change.impacts as Array<Record<string, unknown>>;
    const terminology = impacts.find((impact) => impact.area === "terminology");
    Object.assign(terminology!, { decision: "affected", evidence_refs: ["README.md"] });
    const verification = change.verification as Record<string, unknown>;
    verification.terminology_search = { status: "pending", terms: ["old-term"], evidence_refs: [] };
    await writeFile(path.join(root, "change.yaml"), stringify(change));

    const report = await validateRepository(root, { checkIndex: false });

    expect(report.diagnostics.some((diagnostic) => diagnostic.code === "CHANGE005")).toBe(true);
  });

  it("allows a high-risk change to await review until verified", async () => {
    const root = await fixtureRoot();
    await writeFile(path.join(root, "README.md"), markdown("fixture-readme"));
    const change = verifiedChangeRecord();
    change.status = "implemented";
    change.risk = "high";
    change.independent_review = {
      status: "pending",
      reviewer: null,
      findings: [],
      evidence_refs: [],
      waiver: null,
    };
    await writeFile(path.join(root, "change.yaml"), stringify(change));

    const report = await validateRepository(root, { checkIndex: false });

    expect(report.diagnostics.some((diagnostic) => diagnostic.code === "SCHEMA005")).toBe(false);
  });

  it("rejects a verified change with a failed acceptance case", async () => {
    const root = await fixtureRoot();
    await writeFile(path.join(root, "README.md"), markdown("fixture-readme"));
    const change = verifiedChangeRecord();
    const acceptanceCases = change.acceptance_cases as Array<Record<string, unknown>>;
    acceptanceCases[0]!.status = "fail";
    await writeFile(path.join(root, "change.yaml"), stringify(change));

    const report = await validateRepository(root, { checkIndex: false });

    expect(report.diagnostics.some((diagnostic) => diagnostic.code === "SCHEMA005")).toBe(true);
  });

  it("requires review or waiver before a high-risk change is verified", async () => {
    const root = await fixtureRoot();
    await writeFile(path.join(root, "README.md"), markdown("fixture-readme"));
    const change = verifiedChangeRecord();
    change.risk = "high";
    change.independent_review = {
      status: "pending",
      reviewer: null,
      findings: [],
      evidence_refs: [],
      waiver: null,
    };
    await writeFile(path.join(root, "change.yaml"), stringify(change));

    const report = await validateRepository(root, { checkIndex: false });

    expect(report.diagnostics.some((diagnostic) => diagnostic.code === "SCHEMA005")).toBe(true);
  });

  it("rejects an independent review performed by the change author", async () => {
    const root = await fixtureRoot();
    await writeFile(path.join(root, "README.md"), markdown("fixture-readme"));
    const change = verifiedChangeRecord();
    change.independent_review = {
      status: "pass",
      reviewer: "fixture-author",
      findings: [],
      evidence_refs: ["README.md"],
      waiver: null,
    };
    await writeFile(path.join(root, "change.yaml"), stringify(change));

    const report = await validateRepository(root, { checkIndex: false });

    expect(report.diagnostics.some((diagnostic) => diagnostic.code === "CHANGE007")).toBe(true);
  });
});

describe("reference diagnostics occurrence counting", () => {
  it("reports one CHANGE004 per missing path with an occurrence count", async () => {
    const root = await fixtureRoot();
    await writeFile(path.join(root, "README.md"), "# Fixture\n");
    const change = verifiedChangeRecord();
    (change.acceptance_cases as Array<Record<string, unknown>>)[0]!.evidence_refs = ["missing/report.md", "missing/report.md"];
    ((change.verification as Record<string, unknown>).checks as Array<Record<string, unknown>>)[0]!.evidence_refs = ["missing/report.md"];
    (change.impacts as Array<Record<string, unknown>>)[0]!.evidence_refs = ["missing/report.md"];
    await mkdir(path.join(root, ".agent-context", "tasks", "T-X"), { recursive: true });
    await writeFile(path.join(root, ".agent-context", "tasks", "T-X", "change.yaml"), stringify(change));
    const report = await validateRepository(root, { checkIndex: false, checkContextLocks: false });
    const hits = report.diagnostics.filter((d) => d.code === "CHANGE004" && d.message.includes("missing/report.md"));
    expect(hits).toHaveLength(1);
    expect(hits[0]!.message).toContain("(referenced 4 times)");
  });

  it("dedupes repeated metadata references", async () => {
    const root = await fixtureRoot();
    const doc = markdown("topic-a").replace("  evidence: []", "  evidence:\n    - missing/doc.md\n    - missing/doc.md");
    await writeFile(path.join(root, "a.md"), doc);
    const report = await validateRepository(root, { checkIndex: false, checkContextLocks: false });
    const hits = report.diagnostics.filter((d) => d.code === "REF001" && d.message.includes("missing/doc.md"));
    expect(hits).toHaveLength(1);
    expect(hits[0]!.message).toContain("(referenced 2 times)");
  });
});
