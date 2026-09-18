#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Command, Option } from "commander";
import { detectCompatibility, formatCompatibilityReport } from "./compatibility.js";
import {
  createCheckpoint,
  createClaudeCodePreCompactCheckpoint,
  formatCheckpointCreateReport,
} from "./checkpoint.js";
import {
  applyContextPreview,
  compileContext,
  formatContextCompileReport,
  formatContextPreviewApplyReport,
} from "./context.js";
import {
  auditDocumentation,
  documentationStatus,
  formatDocumentationAudit,
  formatDocumentationStatus,
} from "./docs.js";
import {
  discoverEvidenceCandidates,
  formatEvidenceDiscovery,
  formatLinkEvidenceReport,
  formatProjectEvidenceReport,
  linkExternalEvidence,
  recordProjectEvidence,
  type ProjectEvidenceKind,
  type ProjectEvidenceStatus,
  type ProjectEvidenceSubjectRole,
} from "./evidence.js";
import { excerptContextSource, formatContextExcerpt, formatContextInspection, inspectTaskContext } from "./context-inspection.js";
import { finalizeRepository, formatFinalizeReport } from "./finalize.js";
import {
  formatInitReport,
  initializeProject,
  type DocumentationMode,
  type InitProfile,
} from "./initializer.js";
import {
  CHECKPOINT_TRIGGERS,
  createHandoff,
  formatHandoffCreateReport,
  type CheckpointTrigger,
} from "./handoff.js";
import { generateContextIndex } from "./indexer.js";
import {
  executeMigrationTransaction,
  formatMigrationPlanReport,
  formatMigrationTransformationReport,
  MIGRATION_ADAPTERS,
  normalizeMigrationAdapter,
  planMigration,
  prepareMigrationTransformation,
  rollbackMigrationTransaction,
  type MigrationAdapter,
  type MigrationDecisionSet,
} from "./migration.js";
import { createResumePacket, formatResumeCreateReport } from "./resume.js";
import { formatValidationReport, validateRepository, validateResumePacketAt } from "./validator.js";

const program = new Command();

function integerOption(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`expected an integer, received '${value}'`);
  return parsed;
}

function checkpointTriggerOption(value: string): CheckpointTrigger {
  if (!CHECKPOINT_TRIGGERS.includes(value as CheckpointTrigger)) {
    throw new Error(`expected one of ${CHECKPOINT_TRIGGERS.join(", ")}, received '${value}'`);
  }
  return value as CheckpointTrigger;
}

async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonEvent(root: string, eventPath: string): Promise<unknown> {
  const raw = eventPath === "-"
    ? await readStandardInput()
    : await readFile(path.resolve(root, eventPath), "utf8");
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(`provider event is not valid JSON: ${(error as Error).message}`);
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

program
  .name("canontrail")
  .description("Govern documentation, bounded context, and handoffs across coding-agent workflows")
  .version("0.1.0");

program
  .command("init")
  .description("Safely initialize CanonTrail in an empty project or adopt an existing project")
  .argument("[root]", "project root", ".")
  .option("--adopt", "adopt a non-empty project without overwriting existing files")
  .option("--local-only", "record that remote Git and hosting operations are disabled")
  .option("--dry-run", "show the complete write plan without changing files")
  .option("--json", "print the machine-readable initialization report")
  .option("--documentation-root <paths...>", "repository-relative documentation roots to inventory first")
  .option("--owned-source-root <paths...>", "repository-relative project-owned source roots to inventory after documentation roots")
  .addOption(new Option("--profile <profile>", "project profile").choices(["auto", "generic", "unity"]).default("auto"))
  .addOption(new Option("--documentation <mode>", "documentation bootstrap depth").choices(["none", "baseline", "full"]))
  .action(async (
    root: string,
    options: {
      adopt?: boolean;
      localOnly?: boolean;
      dryRun?: boolean;
      json?: boolean;
      documentationRoot?: string[];
      ownedSourceRoot?: string[];
      profile: InitProfile;
      documentation?: DocumentationMode;
    },
  ) => {
    const report = await initializeProject(root, {
      adopt: options.adopt ?? false,
      localOnly: options.localOnly ?? false,
      dryRun: options.dryRun ?? false,
      profile: options.profile,
      documentationRoots: options.documentationRoot ?? [],
      ownedSourceRoots: options.ownedSourceRoot ?? [],
      ...(options.documentation ? { documentation: options.documentation } : {}),
    });
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatInitReport(report)}\n`);
    if (!report.ok) process.exitCode = 2;
  });

program
  .command("validate")
  .description("Validate governed documents, structured artifacts, references, and the context index")
  .argument("[root]", "repository root", ".")
  .option("--json", "print the machine-readable validation report")
  .option("--no-index", "skip context-index freshness validation")
  .action(async (root: string, options: { json?: boolean; index: boolean }) => {
    const report = await validateRepository(root, { checkIndex: options.index });
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatValidationReport(report)}\n`);
    if (!report.ok) {
      process.exitCode = 1;
    }
  });

program
  .command("finalize")
  .description("Run deterministic repository, documentation, and optional task completion gates")
  .argument("[root]", "repository root", ".")
  .option("--task <id>", "check task completion; report unrelated context drift separately from project-wide health")
  .option("--as-of <date>", "ISO date used for deterministic documentation freshness checks")
  .option("--fail-on-warnings", "fail on blocking repository or documentation warnings")
  .option("--refresh-index", "refresh the deterministic context index after a successful structural preflight")
  .option("--json", "print the machine-readable finalization report")
  .action(async (
    root: string,
    options: { task?: string; asOf?: string; failOnWarnings?: boolean; refreshIndex?: boolean; json?: boolean },
  ) => {
    const report = await finalizeRepository({
      root,
      ...(options.task ? { taskId: options.task } : {}),
      ...(options.asOf ? { asOf: options.asOf } : {}),
      failOnWarnings: options.failOnWarnings ?? false,
      refreshIndex: options.refreshIndex ?? false,
    });
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatFinalizeReport(report)}\n`);
    if (!report.ok) process.exitCode = 1;
  });

const docsCommand = program
  .command("docs")
  .description("Inspect governed documentation health without changing repository files");

docsCommand
  .command("status")
  .description("Summarize documentation, task, freshness, index, and finding health")
  .argument("[root]", "repository root", ".")
  .option("--as-of <date>", "ISO date used for deterministic freshness checks")
  .option("--json", "print the machine-readable status report")
  .action(async (root: string, options: { asOf?: string; json?: boolean }) => {
    const report = await documentationStatus(root, options.asOf ? { asOf: options.asOf } : {});
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatDocumentationStatus(report)}\n`);
    if (report.health === "invalid") process.exitCode = 1;
  });

docsCommand
  .command("audit")
  .description("Report detailed documentation integrity and maintenance findings")
  .argument("[root]", "repository root", ".")
  .option("--as-of <date>", "ISO date used for deterministic freshness checks")
  .option("--json", "print the machine-readable audit report")
  .action(async (root: string, options: { asOf?: string; json?: boolean }) => {
    const report = await auditDocumentation(root, options.asOf ? { asOf: options.asOf } : {});
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatDocumentationAudit(report)}\n`);
    if (report.health === "invalid") process.exitCode = 1;
  });

program
  .command("compat")
  .description("Detect supported external workflow artifacts without modifying them")
  .argument("[root]", "repository root", ".")
  .option("--json", "print the machine-readable compatibility report")
  .action(async (root: string, options: { json?: boolean }) => {
    const report = await detectCompatibility(root);
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatCompatibilityReport(report)}\n`);
  });

const migrateCommand = program
  .command("migrate")
  .description("Plan safe migration of existing documentation into CanonTrail governance");

migrateCommand
  .command("plan")
  .description("Inventory documentation and propose per-file actions without rewriting source documents")
  .argument("[root]", "project root", ".")
  .requiredOption("--id <id>", "migration id matching MIG-[A-Z0-9-]+")
  .requiredOption("--documentation-root <paths...>", "repository-relative documentation roots to inspect")
  .addOption(new Option("--adapter <adapter>", `format adapter (${MIGRATION_ADAPTERS.join(", ")})`).argParser(normalizeMigrationAdapter).default("auto"))
  .option("--created-at <date-time>", "explicit timestamp for reproducible output")
  .option("--apply", "write only the CanonTrail-owned migration plan; default is dry-run")
  .option("--json", "print the machine-readable migration report")
  .action(async (
    root: string,
    options: { id: string; documentationRoot: string[]; adapter: MigrationAdapter; createdAt?: string; apply?: boolean; json?: boolean },
  ) => {
    const report = await planMigration({
      root,
      migrationId: options.id,
      documentationRoots: options.documentationRoot,
      adapter: options.adapter,
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      apply: options.apply ?? false,
    });
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatMigrationPlanReport(report)}\n`);
  });

migrateCommand
  .command("transform-preview")
  .description("Build a reviewed transformation proposal without changing source documents")
  .argument("[root]", "project root", ".")
  .requiredOption("--id <id>", "migration id matching MIG-[A-Z0-9-]+")
  .requiredOption("--transaction-id <id>", "transaction id matching MTX-[A-Z0-9-]+")
  .requiredOption("--documentation-root <paths...>", "repository-relative documentation roots to inspect")
  .addOption(new Option("--adapter <adapter>", `format adapter (${MIGRATION_ADAPTERS.join(", ")})`).argParser(normalizeMigrationAdapter).default("auto"))
  .option("--decisions <path>", "reviewed decision-set JSON; without it review-required actions stay blocked")
  .addOption(new Option("--show-content", "show complete byte-exact before/after text; read-only and potentially sensitive").conflicts("apply"))
  .option("--created-at <date-time>", "explicit timestamp for reproducible output")
  .option("--apply", "write only the immutable CanonTrail transaction proposal; source documents remain unchanged")
  .option("--json", "print the machine-readable transformation report")
  .action(async (
    root: string,
    options: { id: string; transactionId: string; documentationRoot: string[]; adapter: MigrationAdapter; decisions?: string; createdAt?: string; apply?: boolean; showContent?: boolean; json?: boolean },
  ) => {
    const decisions = options.decisions
      ? JSON.parse(await readFile(path.resolve(options.decisions), "utf8")) as MigrationDecisionSet
      : undefined;
    const report = await prepareMigrationTransformation({
      root,
      migrationId: options.id,
      transactionId: options.transactionId,
      documentationRoots: options.documentationRoot,
      adapter: options.adapter,
      ...(decisions ? { decisions } : {}),
      ...(options.showContent ? { showContent: true } : {}),
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      apply: options.apply ?? false,
    });
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatMigrationTransformationReport(report)}\n`);
  });

migrateCommand
  .command("execute")
  .description("Execute one blocker-free reviewed transaction after exact hash confirmation")
  .argument("[root]", "project root", ".")
  .requiredOption("--transaction <path>", "repository-relative transaction.json path")
  .requiredOption("--confirm-hash <hash>", "exact transaction hash to execute")
  .option("--observed-at <date-time>", "explicit timestamp for reproducible evidence")
  .option("--json", "print the machine-readable apply record")
  .action(async (root: string, options: { transaction: string; confirmHash: string; observedAt?: string; json?: boolean }) => {
    const record = await executeMigrationTransaction(root, options.transaction, options.confirmHash, options.observedAt);
    process.stdout.write(options.json ? `${JSON.stringify(record, null, 2)}\n` : `Migration transaction applied: ${record.transaction_hash}\nOperations: ${record.operations.length}\n`);
  });

migrateCommand
  .command("rollback")
  .description("Rollback one applied transaction when every postimage still matches")
  .argument("[root]", "project root", ".")
  .requiredOption("--transaction <path>", "repository-relative transaction.json path")
  .requiredOption("--confirm-hash <hash>", "exact transaction hash to roll back")
  .option("--observed-at <date-time>", "explicit timestamp for reproducible evidence")
  .option("--json", "print the machine-readable rollback record")
  .action(async (root: string, options: { transaction: string; confirmHash: string; observedAt?: string; json?: boolean }) => {
    const record = await rollbackMigrationTransaction(root, options.transaction, options.confirmHash, options.observedAt);
    process.stdout.write(options.json ? `${JSON.stringify(record, null, 2)}\n` : `Migration transaction rolled back: ${record.transaction_hash}\nOperations: ${record.operations.length}\n`);
  });

const evidenceCommand = program
  .command("evidence")
  .description("Discover or link durable external workflow evidence without modifying its source")
  .argument("[root]", "repository root", ".")
  .option("--change <path>", "CanonTrail-owned change.yaml to receive selected references")
  .option("--source <paths...>", "detected external evidence paths to link")
  .option("--apply", "write selected references to the change record; default is dry-run")
  .option("--json", "print the machine-readable evidence report")
  .action(async (
    root: string,
    options: { change?: string; source?: string[]; apply?: boolean; json?: boolean },
  ) => {
    if (!options.change) {
      if (options.apply || (options.source?.length ?? 0) > 0) {
        throw new Error("--source and --apply require --change <path>");
      }
      const report = await discoverEvidenceCandidates(root);
      process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatEvidenceDiscovery(report)}\n`);
      return;
    }
    const report = await linkExternalEvidence({
      root,
      changePath: options.change,
      sources: options.source ?? [],
      apply: options.apply ?? false,
    });
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatLinkEvidenceReport(report)}\n`);
  });

evidenceCommand
  .command("record")
  .description("Create compact, typed, hashed project evidence without copying subject source text")
  .argument("[root]", "repository root", ".")
  .requiredOption("--task <id>", "task id under .agent-context/tasks")
  .requiredOption("--id <id>", "evidence id matching EVID-[A-Z0-9-]+")
  .requiredOption("--kind <kind>", "technical-test, technical-build, semantic-runtime, visual-render, screenshot, or data-safety-snapshot")
  .requiredOption("--status <status>", "pass, fail, inconclusive, or not-run")
  .requiredOption("--claim <text>", "bounded claim supported by this evidence")
  .requiredOption("--summary <text>", "compact observed result")
  .requiredOption("--subject <paths...>", "repository-relative observed subject paths")
  .option("--subject-role <role>", "test-source, implementation, report, artifact, or snapshot", "artifact")
  .option("--reference <paths...>", "additional current repository references")
  .option("--tool <name>", "tool or workflow that produced the observation", "project-workflow")
  .option("--command <text>", "command used for the observation")
  .option("--observed-at <date-time>", "explicit observation timestamp")
  .option("--apply", "write the task-owned evidence record; default is dry-run")
  .option("--json", "print the machine-readable evidence record report")
  .action(async (
    root: string,
    options: {
      task: string;
      id: string;
      kind: ProjectEvidenceKind;
      status: ProjectEvidenceStatus;
      claim: string;
      summary: string;
      subject: string[];
      subjectRole: ProjectEvidenceSubjectRole;
      reference?: string[];
      tool: string;
      command?: string;
      observedAt?: string;
      apply?: boolean;
      json?: boolean;
    },
    command: Command,
  ) => {
    const kinds = new Set<ProjectEvidenceKind>(["technical-test", "technical-build", "semantic-runtime", "visual-render", "screenshot", "data-safety-snapshot"]);
    const statuses = new Set<ProjectEvidenceStatus>(["pass", "fail", "inconclusive", "not-run"]);
    const roles = new Set<ProjectEvidenceSubjectRole>(["test-source", "implementation", "report", "artifact", "snapshot"]);
    if (!kinds.has(options.kind)) throw new Error(`unsupported project evidence kind: ${options.kind}`);
    if (!statuses.has(options.status)) throw new Error(`unsupported project evidence status: ${options.status}`);
    if (!roles.has(options.subjectRole)) throw new Error(`unsupported project evidence subject role: ${options.subjectRole}`);
    const inherited = command.optsWithGlobals() as { apply?: boolean; json?: boolean };
    const report = await recordProjectEvidence({
      root,
      taskId: options.task,
      evidenceId: options.id,
      kind: options.kind,
      status: options.status,
      claim: options.claim,
      summary: options.summary,
      subjectPaths: options.subject,
      subjectRole: options.subjectRole,
      references: options.reference ?? [],
      tool: options.tool,
      command: options.command ?? null,
      ...(options.observedAt ? { observedAt: options.observedAt } : {}),
      apply: inherited.apply ?? options.apply ?? false,
    });
    process.stdout.write(inherited.json ?? options.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatProjectEvidenceReport(report)}\n`);
  });

const contextCommand = program
  .command("context")
  .description("Compile bounded, reproducible task context");

contextCommand
  .command("inspect")
  .description("Inspect stored selection, source freshness and advisory dependency hints; no writes")
  .argument("[root]", "repository root", ".")
  .requiredOption("--task <id>", "task id under .agent-context/tasks")
  .option("--json", "print the report-only inspection contract")
  .action(async (root: string, options: { task: string; json?: boolean }) => {
    const report = await inspectTaskContext({ root, taskId: options.task });
    process.stdout.write(options.json ? JSON.stringify(report, null, 2) + "\n" : formatContextInspection(report) + "\n");
    if (!report.source_snapshot_ok) process.exitCode = 1;
  });

contextCommand
  .command("excerpt")
  .description("Read an exact bounded line range with source/excerpt hashes; does not update the context lock")
  .argument("[root]", "repository root", ".")
  .requiredOption("--source <path>", "exact repository-relative text source")
  .requiredOption("--from <line>", "first source line, one-based", integerOption)
  .requiredOption("--to <line>", "last source line, inclusive", integerOption)
  .option("--max-tokens <number>", "maximum estimated excerpt-content tokens (not total response tokens)", integerOption, 4000)
  .option("--expect-source-hash <hash>", "require this exact whole-source SHA-256 identity")
  .option("--task <id>", "compare with the task's existing lock, without modifying it")
  .option("--json", "print exact content and its provenance as JSON")
  .action(async (root: string, options: { source: string; from: number; to: number; maxTokens: number; expectSourceHash?: string; task?: string; json?: boolean }) => {
    const report = await excerptContextSource({ root, source: options.source, from: options.from, to: options.to, maxTokens: options.maxTokens, ...(options.expectSourceHash !== undefined ? { expectedHash: options.expectSourceHash } : {}), ...(options.task !== undefined ? { taskId: options.task } : {}) });
    process.stdout.write(options.json ? JSON.stringify(report, null, 2) + "\n" : formatContextExcerpt(report) + "\n");
  });

contextCommand
  .command("compile")
  .description("Select task sources and produce a deterministic context.lock.json")
  .argument("[root]", "repository root", ".")
  .requiredOption("--task <id>", "task id under .agent-context/tasks")
  .option("--total-tokens <number>", "total model context budget", integerOption, 32_000)
  .option("--reserve-output <number>", "tokens reserved for output and tools", integerOption, 8_000)
  .option("--input-safety <number>", "tokens kept free inside the input budget", integerOption, 1_024)
  .option("--include <paths...>", "additional required repository-relative text sources")
  .option("--agent-run <id>", "optional provider-neutral agent run id")
  .option("--created-at <date-time>", "explicit timestamp for reproducible output")
  .option("--apply", "write the task-owned context.lock.json; default is dry-run")
  .option("--json", "print the machine-readable compile report")
  .action(async (
    root: string,
    options: {
      task: string;
      totalTokens: number;
      reserveOutput: number;
      inputSafety: number;
      include?: string[];
      agentRun?: string;
      createdAt?: string;
      apply?: boolean;
      json?: boolean;
    },
  ) => {
    const report = await compileContext({
      root,
      taskId: options.task,
      totalTokens: options.totalTokens,
      reservedOutputTokens: options.reserveOutput,
      inputSafetyTokens: options.inputSafety,
      includePaths: options.include ?? [],
      agentRunId: options.agentRun ?? null,
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      apply: options.apply ?? false,
    });
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatContextCompileReport(report)}\n`);
  });

contextCommand
  .command("apply-preview")
  .description("Validate and apply the exact lock payload from a saved JSON dry-run preview")
  .argument("[root]", "repository root", ".")
  .requiredOption("--preview <path>", "JSON output saved from context compile --json")
  .option("--json", "print the machine-readable apply report")
  .action(async (root: string, options: { preview: string; json?: boolean }) => {
    const report = await applyContextPreview({ root, previewPath: options.preview });
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatContextPreviewApplyReport(report)}\n`);
  });

const handoffCommand = program
  .command("handoff")
  .description("Create and validate durable task handoffs");

handoffCommand
  .command("create")
  .description("Compile a task handoff and preserve its source-session context lock")
  .argument("[root]", "repository root", ".")
  .requiredOption("--task <id>", "task id under .agent-context/tasks")
  .requiredOption("--session <id>", "source session id")
  .option("--input <path>", "optional repository-relative YAML checkpoint input")
  .option("--next-action <text>", "next concrete safe action; may instead be supplied by --input")
  .option("--handoff-id <id>", "explicit handoff id")
  .option("--created-at <date-time>", "explicit timestamp for reproducible output")
  .option("--replace", "archive and replace an existing valid latest handoff")
  .option("--apply", "write CanonTrail-owned handoff and archive outputs; default is dry-run")
  .option("--json", "print the machine-readable create report")
  .action(async (
    root: string,
    options: {
      task: string;
      session: string;
      input?: string;
      nextAction?: string;
      handoffId?: string;
      createdAt?: string;
      replace?: boolean;
      apply?: boolean;
      json?: boolean;
    },
  ) => {
    const report = await createHandoff({
      root,
      taskId: options.task,
      sourceSessionId: options.session,
      ...(options.input ? { inputPath: options.input } : {}),
      ...(options.nextAction ? { nextSafeAction: options.nextAction } : {}),
      ...(options.handoffId ? { handoffId: options.handoffId } : {}),
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      replace: options.replace ?? false,
      apply: options.apply ?? false,
    });
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatHandoffCreateReport(report)}\n`);
  });

handoffCommand
  .command("validate")
  .description("Validate the latest handoff for one task, including archived source-context evidence")
  .argument("[root]", "repository root", ".")
  .requiredOption("--task <id>", "task id under .agent-context/tasks")
  .option("--json", "print the machine-readable validation report")
  .action(async (root: string, options: { task: string; json?: boolean }) => {
    const absoluteRoot = path.resolve(root);
    const artifactPath = `.agent-context/tasks/${options.task}/handoff.yaml`;
    const exists = await pathExists(path.join(absoluteRoot, ...artifactPath.split("/")));
    const repository = await validateRepository(absoluteRoot, { checkIndex: false, checkContextLocks: false });
    const diagnostics = repository.diagnostics.filter((diagnostic) =>
      diagnostic.path === artifactPath || (!diagnostic.path && diagnostic.code.startsWith("SCHEMA")));
    if (!exists) {
      diagnostics.unshift({
        severity: "error",
        code: "HANDOFF000",
        message: "latest task handoff does not exist",
        path: artifactPath,
      });
    }
    const report = {
      root: absoluteRoot,
      task_id: options.task,
      path: artifactPath,
      ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
      diagnostics,
    };
    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else if (report.ok) {
      process.stdout.write(`PASS handoff: ${artifactPath}\n`);
    } else {
      for (const diagnostic of diagnostics) {
        process.stdout.write(`ERROR ${diagnostic.code} ${artifactPath}: ${diagnostic.message}\n`);
      }
      process.stdout.write(`FAIL handoff: ${artifactPath}\n`);
    }
    if (!report.ok) process.exitCode = 1;
  });

const checkpointCommand = program
  .command("checkpoint")
  .description("Create durable handoffs at pause, switch, blocker, phase, or pre-compaction boundaries");

checkpointCommand
  .command("create")
  .description("Create a provider-neutral checkpoint backed by the durable handoff lifecycle")
  .argument("[root]", "repository root", ".")
  .requiredOption("--task <id>", "task id under .agent-context/tasks")
  .requiredOption("--session <id>", "source session id")
  .requiredOption("--trigger <kind>", `checkpoint trigger: ${CHECKPOINT_TRIGGERS.join(", ")}`, checkpointTriggerOption)
  .option("--provider <name>", "optional source provider name, for example codex")
  .option("--provider-event <name>", "optional provider-native event name")
  .option("--input <path>", "optional repository-relative YAML checkpoint input")
  .option("--next-action <text>", "next concrete safe action; may instead be supplied by --input")
  .option("--handoff-id <id>", "explicit handoff id")
  .option("--created-at <date-time>", "explicit timestamp for reproducible output")
  .option("--replace", "archive and replace an existing valid latest handoff")
  .option("--apply", "write CanonTrail-owned handoff and archive outputs; default is dry-run")
  .option("--json", "print the machine-readable checkpoint report")
  .action(async (
    root: string,
    options: {
      task: string;
      session: string;
      trigger: CheckpointTrigger;
      provider?: string;
      providerEvent?: string;
      input?: string;
      nextAction?: string;
      handoffId?: string;
      createdAt?: string;
      replace?: boolean;
      apply?: boolean;
      json?: boolean;
    },
  ) => {
    const report = await createCheckpoint({
      root,
      taskId: options.task,
      sourceSessionId: options.session,
      trigger: options.trigger,
      ...(options.provider ? { provider: options.provider } : {}),
      ...(options.providerEvent ? { providerEvent: options.providerEvent } : {}),
      ...(options.input ? { inputPath: options.input } : {}),
      ...(options.nextAction ? { nextSafeAction: options.nextAction } : {}),
      ...(options.handoffId ? { handoffId: options.handoffId } : {}),
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      replace: options.replace ?? false,
      apply: options.apply ?? false,
    });
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatCheckpointCreateReport(report)}\n`);
  });

checkpointCommand
  .command("claude-code")
  .description("Adapt one Claude Code PreCompact JSON event into a CanonTrail handoff checkpoint")
  .argument("[root]", "repository root", ".")
  .requiredOption("--task <id>", "task id under .agent-context/tasks")
  .requiredOption("--event <path>", "PreCompact JSON file, or '-' to read hook JSON from stdin")
  .option("--input <path>", "optional repository-relative YAML checkpoint input")
  .option("--next-action <text>", "next concrete safe action; may instead be supplied by --input")
  .option("--handoff-id <id>", "explicit handoff id")
  .option("--created-at <date-time>", "explicit timestamp for reproducible output")
  .option("--replace", "archive and replace an existing valid latest handoff")
  .option("--apply", "write CanonTrail-owned handoff and archive outputs; default is dry-run")
  .option("--quiet", "write no successful output, suitable for an opt-in provider hook")
  .option("--json", "print the machine-readable checkpoint report")
  .action(async (
    root: string,
    options: {
      task: string;
      event: string;
      input?: string;
      nextAction?: string;
      handoffId?: string;
      createdAt?: string;
      replace?: boolean;
      apply?: boolean;
      quiet?: boolean;
      json?: boolean;
    },
  ) => {
    if (options.quiet && options.json) throw new Error("--quiet and --json cannot be combined");
    const event = await readJsonEvent(root, options.event);
    const report = await createClaudeCodePreCompactCheckpoint({
      root,
      taskId: options.task,
      event,
      ...(options.input ? { inputPath: options.input } : {}),
      ...(options.nextAction ? { nextSafeAction: options.nextAction } : {}),
      ...(options.handoffId ? { handoffId: options.handoffId } : {}),
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      replace: options.replace ?? false,
      apply: options.apply ?? false,
    });
    if (!options.quiet) {
      process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatCheckpointCreateReport(report)}\n`);
    }
  });

const resumeCommand = program
  .command("resume")
  .description("Create and validate immutable fresh-session resume packets");

resumeCommand
  .command("create")
  .description("Compile a receiving-session context lock and immutable resume packet")
  .argument("[root]", "repository root", ".")
  .requiredOption("--task <id>", "task id under .agent-context/tasks")
  .requiredOption("--session <id>", "receiving session id")
  .addOption(new Option("--total-tokens <number>", "total context window budget").argParser(integerOption))
  .addOption(new Option("--reserve-output <number>", "tokens reserved for output and tools").argParser(integerOption))
  .addOption(new Option("--input-safety <number>", "tokens kept free inside the input budget").argParser(integerOption))
  .option("--include <paths...>", "additional required repository-relative sources")
  .option("--packet-id <id>", "explicit packet id")
  .option("--created-at <date-time>", "explicit timestamp for reproducible output")
  .option("--apply", "write CanonTrail-owned packet and context outputs; default is dry-run")
  .option("--json", "print the machine-readable create report")
  .action(async (
    root: string,
    options: {
      task: string;
      session: string;
      totalTokens?: number;
      reserveOutput?: number;
      inputSafety?: number;
      include?: string[];
      packetId?: string;
      createdAt?: string;
      apply?: boolean;
      json?: boolean;
    },
  ) => {
    const report = await createResumePacket({
      root,
      taskId: options.task,
      receivingSessionId: options.session,
      ...(options.totalTokens === undefined ? {} : { totalTokens: options.totalTokens }),
      ...(options.reserveOutput === undefined ? {} : { reservedOutputTokens: options.reserveOutput }),
      ...(options.inputSafety === undefined ? {} : { inputSafetyTokens: options.inputSafety }),
      ...(options.include ? { includePaths: options.include } : {}),
      ...(options.packetId ? { packetId: options.packetId } : {}),
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      apply: options.apply ?? false,
    });
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatResumeCreateReport(report)}\n`);
  });

resumeCommand
  .command("validate")
  .description("Validate one operational resume packet for current use, including its retained evidence")
  .argument("[root]", "repository root", ".")
  .requiredOption("--packet <path>", "repository-relative resume packet path returned by resume create")
  .option("--json", "print the machine-readable validation report")
  .action(async (root: string, options: { packet: string; json?: boolean }) => {
    const report = await validateResumePacketAt(root, options.packet);
    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else if (report.ok) {
      process.stdout.write(`PASS resume packet: ${report.path} (current-use validation)\n`);
    } else {
      for (const diagnostic of report.diagnostics) {
        process.stdout.write(`ERROR ${diagnostic.code} ${report.path}: ${diagnostic.message}\n`);
      }
      process.stdout.write(`FAIL resume packet: ${report.path}\n`);
    }
    if (!report.ok) process.exitCode = 1;
  });

program
  .command("index")
  .description("Generate the deterministic context index from governed Markdown")
  .argument("[root]", "repository root", ".")
  .option("--json", "print the machine-readable index report")
  .action(async (root: string, options: { json?: boolean }) => {
    const absoluteRoot = path.resolve(root);
    const preflight = await validateRepository(absoluteRoot, { checkIndex: false, checkContextLocks: false });
    if (!preflight.ok) {
      process.stderr.write(`${formatValidationReport(preflight)}\n`);
      process.exitCode = 1;
      return;
    }
    const result = await generateContextIndex(absoluteRoot);
    if (options.json) {
      process.stdout.write(`${JSON.stringify({ root: absoluteRoot, path: result.path, documents: result.index.documents.length, root_hash: result.index.root_hash }, null, 2)}\n`);
    } else {
      process.stdout.write(`Wrote ${result.path} with ${result.index.documents.length} documents (${result.index.root_hash}).\n`);
    }
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  process.stderr.write(`canontrail: ${(error as Error).message}\n`);
  process.exitCode = 1;
});
