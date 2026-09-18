import { isDeepStrictEqual } from "node:util";
import { existsSync } from "node:fs";
import { safeRepositoryFile } from "./context-source-path.js";
import { parseContextSections, validateLockedSection, type LockedSection } from "./context-sections.js";
import { lstat, readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { validateFrozenExamplePolicy } from "./frozen-examples.js";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";
import { parse } from "yaml";
import { loadConfig } from "./config.js";
import { inspectMigrationControlTree, resolveMigrationControlPath } from "./migration-control-path.js";
import { computeContextLockHash, contextIndexCompatibilityReasons, type ContextLock } from "./context.js";
import { computeProjectEvidenceHash, discoverEvidenceCandidates, type ProjectEvidenceRecord } from "./evidence.js";
import { taskCheckInvokesCanonTrailFinalize } from "./finalize-guard.js";
import { validateHandoffSemantics } from "./handoff.js";
import {
  computeMigrationDecisionSetHash,
  computeMigrationApplyIntentHash,
  computeMigrationExecutionRecordHash,
  computeMigrationPlanHash,
  computeMigrationTransactionHash,
  DEPRECATED_MIGRATION_SOURCE_FORMAT,
  migrationExecutionEvidenceBindingErrors,
  migrationDocumentationRootErrors,
  migrationDocumentResolutionErrors,
  migrationPlanDocumentBindingErrors,
  migrationTransactionBindingErrors,
  type MigrationDecisionSet,
  type MigrationApplyIntent,
  type MigrationExecutionRecord,
  type MigrationPlan,
  type MigrationTransaction,
} from "./migration.js";
import {
  buildContextIndex,
  discoverMarkdown,
  isGovernedPath,
  normalizePath,
  serializeContextIndex,
  sha256,
  walkFiles,
} from "./indexer.js";
import type {
  CanonTrailConfig,
  Diagnostic,
  DocumentRecord,
  ValidationReport,
} from "./types.js";
import { auditResumeReferences } from "./resume-audit.js";
import { compareCodeUnits } from "./ordering.js";

type JsonRecord = Record<string, unknown>;

const require = createRequire(import.meta.url);
const addFormats = require("ajv-formats") as FormatsPlugin;

export interface ValidateOptions {
  checkIndex?: boolean;
  checkContextLocks?: boolean;
  strictContextLockTaskId?: string;
  /** Explicit current-use request: prove this packet participated and validate
   * its current sources/task policy. Without this, packets are retained receipts. */
  requiredResumePacketPath?: string;
}

export interface TargetResumeValidationReport {
  validation_scope: "current-use";
  root: string;
  path: string;
  ok: boolean;
  diagnostics: Diagnostic[];
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function addDiagnostic(
  diagnostics: Diagnostic[],
  severity: Diagnostic["severity"],
  code: string,
  message: string,
  artifactPath?: string,
  detail?: string,
): void {
  diagnostics.push({
    severity,
    code,
    message,
    ...(artifactPath ? { path: artifactPath } : {}),
    ...(detail ? { detail } : {}),
  });
}

function formatAjvErrors(validate: ValidateFunction): string {
  return (validate.errors ?? [])
    .map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
    .join("; ");
}

async function loadSchemaValidators(
  root: string,
  diagnostics: Diagnostic[],
  schemaPath: string,
): Promise<{ validators: Map<string, ValidateFunction>; count: number }> {
  const validators = new Map<string, ValidateFunction>();
  const normalizedSchemaPath = normalizePath(schemaPath);
  const schemaDirectory = path.join(root, ...normalizedSchemaPath.split("/"));
  let schemaFiles: string[];
  try {
    schemaFiles = (await readdir(schemaDirectory))
      .filter((name) => name.endsWith(".schema.json"))
      .sort((left, right) => compareCodeUnits(left, right));
  } catch (error) {
    addDiagnostic(diagnostics, "error", "SCHEMA001", "schemas directory cannot be read", normalizedSchemaPath, (error as Error).message);
    return { validators, count: 0 };
  }

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const loaded: Array<{ name: string; schema: JsonRecord }> = [];

  for (const schemaFile of schemaFiles) {
    const relativePath = `${normalizedSchemaPath}/${schemaFile}`;
    try {
      const schemaValue: unknown = JSON.parse(await readFile(path.join(schemaDirectory, schemaFile), "utf8"));
      if (!isRecord(schemaValue)) {
        throw new Error("schema root must be an object");
      }
      ajv.addSchema(schemaValue);
      loaded.push({ name: schemaFile.replace(/\.schema\.json$/, ""), schema: schemaValue });
    } catch (error) {
      addDiagnostic(diagnostics, "error", "SCHEMA002", "schema cannot be loaded", relativePath, (error as Error).message);
    }
  }

  for (const { name, schema } of loaded) {
    try {
      const schemaId = typeof schema.$id === "string" ? schema.$id : undefined;
      const validate = schemaId ? ajv.getSchema(schemaId) : ajv.compile(schema);
      if (!validate) {
        throw new Error("schema did not produce a validator");
      }
      validators.set(name, validate);
    } catch (error) {
      addDiagnostic(
        diagnostics,
        "error",
        "SCHEMA003",
        "schema compilation failed",
        `${normalizedSchemaPath}/${name}.schema.json`,
        (error as Error).message,
      );
    }
  }

  return { validators, count: schemaFiles.length };
}

function isLikelyPath(value: string): boolean {
  if (/^(?:https?:|urn:|mailto:)/i.test(value)) {
    return false;
  }
  const withoutFragment = value.split("#", 1)[0] ?? "";
  return withoutFragment.includes("/") || /\.(?:md|ya?ml|json|ts|js|cs)$/i.test(withoutFragment);
}

interface ReferenceTarget {
  allowedMissing: boolean;
  exists: boolean;
  absolutePath?: string;
  normalizedReference: string;
}

function referenceTarget(
  root: string,
  config: CanonTrailConfig,
  reference: string,
  baseDirectory: string,
): ReferenceTarget {
  const withoutFragment = reference.split("#", 1)[0] ?? "";
  const normalizedReference = withoutFragment.replace(/\\/g, "/").replace(/^\.\//, "");
  const absolutePath = path.resolve(baseDirectory, ...normalizedReference.split("/"));
  const relativeToRoot = normalizePath(path.relative(root, absolutePath));
  const outsideRoot = relativeToRoot === ".." || relativeToRoot.startsWith("../") || path.isAbsolute(relativeToRoot);
  if (outsideRoot) {
    return { allowedMissing: false, exists: false, normalizedReference };
  }
  const allowedMissing = config.allowMissingReferences.some((allowed) => {
    const normalizedAllowed = allowed.replace(/\\/g, "/").replace(/^\.\//, "");
    return normalizedAllowed === normalizedReference || normalizedAllowed === relativeToRoot;
  });
  return {
    allowedMissing,
    exists: existsSync(absolutePath),
    absolutePath,
    normalizedReference,
  };
}

function checkReference(
  diagnostics: Diagnostic[],
  root: string,
  config: CanonTrailConfig,
  sourcePath: string,
  reference: string,
  baseDirectory: string,
  code = "REF001",
  explicitPath = false,
  occurrences = 1,
): void {
  if (!reference || /^(?:https?:|urn:|mailto:)/i.test(reference) || (!explicitPath && !isLikelyPath(reference))) {
    return;
  }
  if (reference.includes("\\")) {
    addDiagnostic(diagnostics, "error", "REF002", `reference must use '/' separators: ${reference}`, sourcePath);
    return;
  }
  const target = referenceTarget(root, config, reference, baseDirectory);
  const occurrenceSuffix = occurrences > 1 ? ` (referenced ${occurrences} times)` : "";
  if (!target.absolutePath) {
    addDiagnostic(diagnostics, "error", code, `reference escapes the repository: ${reference}${occurrenceSuffix}`, sourcePath);
  } else if (!target.exists && !target.allowedMissing) {
    addDiagnostic(diagnostics, "error", code, `referenced path does not exist: ${reference}${occurrenceSuffix}`, sourcePath);
  }
}

/** Usage guidance is not an evidence field or a general Markdown dependency list. */
function standaloneUsageReference(value: string): { reference: string; explicit: boolean } | undefined {
  const entry = value.trim();
  // A sole single-backtick span is an explicit standalone path, not narrative.
  const codePath = /^`([^`\r\n]+)`$/.exec(entry);
  if (codePath?.[1]) return { reference: codePath[1], explicit: true };
  // Never turn surrounding prose, Markdown examples or multiline instructions
  // into a filename. Their exact text remains in the document and index.
  if (/[`\[\]\r\n]/.test(entry)) return undefined;
  const withoutFragment = entry.split("#", 1)[0] ?? "";
  const completeFile = /\.(?:md|ya?ml|json|ts|js|cs)$/i.test(withoutFragment);
  // Keep legacy bare filenames/directories containing spaces. A slash inside
  // an ordinary sentence alone does not declare a machine reference.
  if (/\s/.test(withoutFragment) && !completeFile && !withoutFragment.endsWith("/")) return undefined;
  return { reference: entry, explicit: false };
}

function validateMetadataReferences(
  diagnostics: Diagnostic[],
  root: string,
  config: CanonTrailConfig,
  documents: DocumentRecord[],
): void {
  for (const document of documents) {
    if (!document.header) {
      continue;
    }
    const referenceCounts = new Map<string, number>();
    for (const reference of [
      ...strings(document.header.verification.evidence),
      ...strings(document.header.supersedes),
    ]) {
      referenceCounts.set(reference, (referenceCounts.get(reference) ?? 0) + 1);
    }
    for (const [reference, occurrences] of referenceCounts) {
      checkReference(diagnostics, root, config, document.path, reference, root, "REF001", false, occurrences);
    }
    const usageReferences = new Map<string, { occurrences: number; explicit: boolean }>();
    for (const usage of strings(document.header.do_not_use_instead)) {
      const parsed = standaloneUsageReference(usage);
      if (!parsed) continue;
      const entry = usageReferences.get(parsed.reference) ?? { occurrences: 0, explicit: false };
      entry.occurrences += 1;
      entry.explicit = entry.explicit || parsed.explicit;
      usageReferences.set(parsed.reference, entry);
    }
    for (const [reference, entry] of usageReferences) {
      if (reference.startsWith("/") || /^[A-Za-z]:/.test(reference)) {
        addDiagnostic(diagnostics, "error", "REF001", `usage reference must be repository-relative: ${reference}`, document.path);
      } else {
        checkReference(diagnostics, root, config, document.path, reference, root, "REF001", entry.explicit, entry.occurrences);
      }
    }
  }
}

function validateDocumentIdentity(
  diagnostics: Diagnostic[],
  config: CanonTrailConfig,
  documents: DocumentRecord[],
): void {
  const artifactIds = new Map<string, string>();
  const canonicalTopics = new Map<string, string>();

  for (const document of documents) {
    const header = document.header;
    if (!header) {
      continue;
    }
    if (header.artifact_id) {
      const previous = artifactIds.get(header.artifact_id);
      if (previous) {
        addDiagnostic(
          diagnostics,
          "error",
          "DOC003",
          `artifact_id '${header.artifact_id}' is already used by ${previous}`,
          document.path,
        );
      } else {
        artifactIds.set(header.artifact_id, document.path);
      }
    }
    if (header.truth_level !== "canonical") {
      continue;
    }
    if (!header.topic_id) {
      if (config.requireTopicIdForCanonical) {
        addDiagnostic(diagnostics, "error", "CANON001", "canonical document is missing topic_id", document.path);
      }
      continue;
    }
    const previous = canonicalTopics.get(header.topic_id);
    if (previous) {
      addDiagnostic(
        diagnostics,
        "error",
        "CANON002",
        `canonical topic '${header.topic_id}' is also owned by ${previous}`,
        document.path,
      );
    } else {
      canonicalTopics.set(header.topic_id, document.path);
    }
  }
}

function schemaForArtifact(artifactPath: string): string | undefined {
  const basename = path.posix.basename(artifactPath);
  if (basename === "change.yaml" || basename === "change.yml") return "change-record";
  if (basename === "compatibility.yaml" || basename === "compatibility.yml") return "compatibility";
  if (basename === "context.lock.json") return "context-lock";
  if (basename.endsWith(".evidence.yaml") || basename.endsWith(".evidence.yml")) return "evidence-record";
  if (basename === "handoff.yaml" || basename === "handoff.yml") return "handoff";
  if (basename === "maintenance.yaml" || basename === "maintenance.yml") return "maintenance";
  if (basename === "migration.plan.json" && /^\.agent-context\/migrations\/[^/]+\/migration\.plan\.json$/.test(artifactPath)) return "migration-plan";
  if (basename === "transaction.json" && /^\.agent-context\/migrations\/[^/]+\/transactions\/[^/]+\/transaction\.json$/.test(artifactPath)) return "migration-transaction";
  if (["intent.json", "apply.record.json", "rollback.record.json"].includes(basename) && /^\.agent-context\/migrations\/[^/]+\/transactions\/[^/]+\/execution\/[^/]+\.json$/.test(artifactPath)) return "migration-execution";
  if (basename === "resume.packet.json" || basename.endsWith(".resume.packet.json")) return "resume-packet";
  if (basename === "state.yaml" || basename === "state.yml") return "task-state";
  return undefined;
}

function isStructuredArtifact(artifactPath: string): boolean {
  return schemaForArtifact(artifactPath) !== undefined;
}

async function validateMigrationCoverage(root: string, config: CanonTrailConfig, diagnostics: Diagnostic[]): Promise<void> {
  const migrationRoot = ".agent-context/migrations";
  try {
    if (!(await inspectMigrationControlTree(root))) return;
  } catch (error) {
    addDiagnostic(diagnostics, "error", "CFG002", "migration artifacts cannot be safely covered by repository validation", migrationRoot, (error as Error).message);
    return;
  }
  const exclusions = config.excludePaths.filter((entry) => {
    // Scanner configuration matches stored path spelling, even on case-insensitive volumes.
    // Lowercasing here invents exclusions that walkFiles does not actually apply.
    const excluded = path.posix.normalize(entry.replace(/\\/g, "/")).replace(/\/$/, "");
    return excluded === "." || excluded === migrationRoot || migrationRoot.startsWith(excluded + "/") || excluded.startsWith(migrationRoot + "/");
  });
  if (!isGovernedPath(migrationRoot, config) || exclusions.length > 0) {
    addDiagnostic(diagnostics, "error", "CFG002",
      "migration artifacts exist but validation coverage is incomplete; explicitly include .agent-context/migrations in governed_paths and remove overlapping exclude_paths",
      ".agent-context/config.yaml",
      exclusions.length > 0 ? "Overlapping exclusions: " + exclusions.join(", ") : "The complete migration root is not governed.");
  }
}

async function loadStructuredArtifacts(
  root: string,
  config: CanonTrailConfig,
  validators: Map<string, ValidateFunction>,
  diagnostics: Diagnostic[],
): Promise<Map<string, unknown>> {
  const artifacts = new Map<string, unknown>();
  const files = (await walkFiles(root, config)).filter(
    (artifactPath) => isStructuredArtifact(artifactPath) && isGovernedPath(artifactPath, config),
  );
  for (const artifactPath of files) {
    try {
      const absolute = artifactPath.startsWith(".agent-context/migrations/")
        ? await resolveMigrationControlPath(root, artifactPath, "file")
        : path.join(root, ...artifactPath.split("/"));
      const raw = await readFile(absolute, "utf8");
      const value: unknown = artifactPath.endsWith(".json") ? JSON.parse(raw) : parse(raw);
      artifacts.set(artifactPath, value);
      const schemaName = schemaForArtifact(artifactPath);
      if (schemaName) {
        const validate = validators.get(schemaName);
        if (!validate) {
          addDiagnostic(diagnostics, "error", "SCHEMA004", `validator '${schemaName}' is unavailable`, artifactPath);
        } else if (!validate(value)) {
          addDiagnostic(
            diagnostics,
            "error",
            "SCHEMA005",
            `artifact does not conform to ${schemaName}.schema.json`,
            artifactPath,
            formatAjvErrors(validate),
          );
        }
      }
    } catch (error) {
      addDiagnostic(diagnostics, "error", "DOC004", "structured artifact cannot be parsed", artifactPath, (error as Error).message);
    }
  }
  return artifacts;
}

async function validateMigrationPlans(diagnostics: Diagnostic[], artifacts: Map<string, unknown>, root: string): Promise<void> {
  for (const [artifactPath, artifact] of artifacts) {
    if (schemaForArtifact(artifactPath) !== "migration-plan" || !isRecord(artifact)) continue;
    const migrationId = typeof artifact.migration_id === "string" ? artifact.migration_id : "";
    const pathMatch = /^\.agent-context\/migrations\/([^/]+)\/migration\.plan\.json$/.exec(artifactPath);
    if (!pathMatch || pathMatch[1] !== migrationId) {
      addDiagnostic(diagnostics, "error", "MIGRATION001", "migration_id does not match its migration directory", artifactPath);
    }
    const suppliedHash = typeof artifact.plan_hash === "string" ? artifact.plan_hash : "";
    const { plan_hash: _ignored, ...payload } = artifact;
    const expectedHash = computeMigrationPlanHash(payload as Omit<MigrationPlan, "plan_hash">);
    if (suppliedHash !== expectedHash) {
      addDiagnostic(diagnostics, "error", "MIGRATION002", "migration plan self-hash is invalid", artifactPath);
    }
    const documents = records(artifact.documents);
    const rootErrors = migrationDocumentationRootErrors(artifact.documentation_roots, "migration plan");
    if (rootErrors.length > 0) {
      addDiagnostic(diagnostics, "error", "MIGRATION005", `migration plan documentation roots are invalid: ${rootErrors.join("; ")}`, artifactPath);
    }
    const documentBindingErrors = migrationPlanDocumentBindingErrors(artifact.documentation_roots, documents);
    const resolutionErrors = await migrationDocumentResolutionErrors(root, artifact.documentation_roots, documents.flatMap((document) => [document.path, document.target_path]));
    for (const message of resolutionErrors) addDiagnostic(diagnostics, "error", "MIGRATION007", message, artifactPath);
    if (documentBindingErrors.length > 0) {
      addDiagnostic(diagnostics, "error", "MIGRATION006", `migration plan documents are not bound to its documentation roots: ${documentBindingErrors.join("; ")}`, artifactPath);
    }
    const paths = documents.map((document) => typeof document.path === "string" ? document.path : "");
    const sortedPaths = [...paths].sort();
    if (!isDeepStrictEqual(paths, sortedPaths) || new Set(paths).size !== paths.length) {
      addDiagnostic(diagnostics, "error", "MIGRATION003", "migration plan document paths must be unique and deterministically sorted", artifactPath);
    }
    const summary = isRecord(artifact.summary) ? artifact.summary : {};
    const sourceCounts = isRecord(summary.source_formats) ? summary.source_formats : {};
    const legacyFormat = Object.hasOwn(sourceCounts, DEPRECATED_MIGRATION_SOURCE_FORMAT)
      ? DEPRECATED_MIGRATION_SOURCE_FORMAT : "legacy-header-v1";
    const formatKeys = ["canontrail-frontmatter", legacyFormat, "plain-markdown"];
    const expectedSourceFormats = Object.fromEntries(formatKeys.map((key) => [key, documents.filter((document) => document.source_format === key).length]));
    const expectedRoles = Object.fromEntries(["canonical", "active-reference", "active-snapshot", "design-target", "handoff", "review", "historical", "third-party", "unknown"].map((key) => [key, documents.filter((document) => document.role === key).length]));
    const expectedActions = Object.fromEntries(["keep", "normalize-header", "review-metadata", "classify-and-normalize", "preserve-historical", "preserve-review", "exclude-external"].map((key) => [key, documents.filter((document) => document.proposed_action === key).length]));
    if (
      summary.documents !== documents.length
      || summary.review_required !== documents.filter((document) => document.requires_review === true).length
      || summary.unreadable !== records(artifact.unprocessed).length
      || !isDeepStrictEqual(summary.source_formats, expectedSourceFormats)
      || documents.some((document) => !formatKeys.includes(String(document.source_format)))
      || !isDeepStrictEqual(summary.roles, expectedRoles)
      || !isDeepStrictEqual(summary.actions, expectedActions)
    ) {
      addDiagnostic(diagnostics, "error", "MIGRATION004", "migration plan summary counts do not match its documents or unprocessed entries", artifactPath);
    }
  }
}

async function validateMigrationTransactions(diagnostics: Diagnostic[], artifacts: Map<string, unknown>, root: string): Promise<void> {
  for (const [artifactPath, artifact] of artifacts) {
    if (schemaForArtifact(artifactPath) !== "migration-transaction" || !isRecord(artifact)) continue;
    const match = /^\.agent-context\/migrations\/([^/]+)\/transactions\/([^/]+)\/transaction\.json$/.exec(artifactPath);
    if (!match || match[1] !== artifact.migration_id || match[2] !== artifact.transaction_id) {
      addDiagnostic(diagnostics, "error", "MIGRATION101", "migration and transaction ids must match their artifact directories", artifactPath);
    }
    const suppliedHash = typeof artifact.transaction_hash === "string" ? artifact.transaction_hash : "";
    const { transaction_hash: _ignored, ...payload } = artifact;
    const expectedHash = computeMigrationTransactionHash(payload as Omit<MigrationTransaction, "transaction_hash">);
    if (suppliedHash !== expectedHash) addDiagnostic(diagnostics, "error", "MIGRATION102", "migration transaction self-hash is invalid", artifactPath);
    const operations = records(artifact.operations);
    const resolutionErrors = await migrationDocumentResolutionErrors(root, artifact.documentation_roots, [
      ...operations.flatMap((operation) => [operation.source_path, operation.target_path]),
      ...records(artifact.decisions).flatMap((decision) => [decision.path, decision.target_path]),
    ]);
    for (const message of resolutionErrors) addDiagnostic(diagnostics, "error", "MIGRATION107", message, artifactPath);
    const blockers = records(artifact.blockers);
    const summary = isRecord(artifact.summary) ? artifact.summary : {};
    if (summary.operations !== operations.length || summary.blockers !== blockers.length) {
      addDiagnostic(diagnostics, "error", "MIGRATION103", "migration transaction summary counts do not match its entries", artifactPath);
    }
    const decisions = Array.isArray(artifact.decisions) ? artifact.decisions as MigrationDecisionSet["decisions"] : [];
    const hasReviewedMetadata = typeof artifact.reviewed_by === "string" && artifact.reviewed_by.trim().length > 0
      && typeof artifact.reviewed_at === "string" && artifact.reviewed_at.length > 0
      && typeof artifact.decision_hash === "string"
      && decisions.length > 0;
    if (operations.length > 0 && !hasReviewedMetadata) {
      addDiagnostic(diagnostics, "error", "MIGRATION105", "migration transaction operations require reviewed decisions", artifactPath);
    }
    if (typeof artifact.decision_hash === "string") {
      const decisionSet: MigrationDecisionSet = {
        version: 1,
        migration_id: typeof artifact.migration_id === "string" ? artifact.migration_id : "",
        plan_hash: typeof artifact.plan_hash === "string" ? artifact.plan_hash : "",
        reviewed_by: typeof artifact.reviewed_by === "string" ? artifact.reviewed_by : "",
        reviewed_at: typeof artifact.reviewed_at === "string" ? artifact.reviewed_at : "",
        decisions,
      };
      if (computeMigrationDecisionSetHash(decisionSet) !== artifact.decision_hash) {
        addDiagnostic(diagnostics, "error", "MIGRATION104", "migration decision-set hash is invalid", artifactPath);
      }
    }
    const bindingErrors = migrationTransactionBindingErrors({
      documentation_roots: artifact.documentation_roots as MigrationTransaction["documentation_roots"],
      decisions,
      operations: operations as unknown as MigrationTransaction["operations"],
      blockers: blockers as unknown as MigrationTransaction["blockers"],
    });
    if (bindingErrors.length > 0) {
      addDiagnostic(diagnostics, "error", "MIGRATION106", `migration operations are not bound to reviewed decisions: ${bindingErrors.join("; ")}`, artifactPath);
    }
  }
}

async function validateMigrationExecutionEvidence(diagnostics: Diagnostic[], artifacts: Map<string, unknown>, root: string): Promise<void> {
  for (const [artifactPath, artifact] of artifacts) {
    if (schemaForArtifact(artifactPath) !== "migration-execution" || !isRecord(artifact)) continue;
    const suppliedHash = typeof artifact.record_hash === "string" ? artifact.record_hash : "";
    const { record_hash: _ignored, ...payload } = artifact;
    const expectedHash = artifact.kind === "migration-apply-intent"
      ? computeMigrationApplyIntentHash(payload as Omit<MigrationApplyIntent, "record_hash">)
      : computeMigrationExecutionRecordHash(payload as Omit<MigrationExecutionRecord, "record_hash">);
    if (suppliedHash !== expectedHash) addDiagnostic(diagnostics, "error", "MIGRATION201", "migration execution evidence self-hash is invalid", artifactPath);
    const match = /^(\.agent-context\/migrations\/[^/]+\/transactions\/[^/]+)\/execution\/[^/]+\.json$/.exec(artifactPath);
    const transaction = match ? artifacts.get(`${match[1]}/transaction.json`) : undefined;
    if (!isRecord(transaction) || transaction.transaction_hash !== artifact.transaction_hash) {
      addDiagnostic(diagnostics, "error", "MIGRATION202", "migration execution evidence does not reference its parent transaction", artifactPath);
      continue;
    }
    const bindingErrors = migrationExecutionEvidenceBindingErrors(
      artifact,
      transaction as unknown as Pick<MigrationTransaction, "transaction_hash" | "operations">,
    );
    if (bindingErrors.length > 0) {
      addDiagnostic(diagnostics, "error", "MIGRATION203", `migration execution evidence is not bound to its parent transaction: ${bindingErrors.join("; ")}`, artifactPath);
    }
    const executionRoot = match![1]!;
    const intentPath = `${executionRoot}/execution/intent.json`;
    if ((artifact.kind === "migration-apply" || artifact.kind === "migration-rollback") && !artifacts.has(intentPath)) {
      addDiagnostic(diagnostics, "error", "MIGRATION204", "completed migration execution evidence is missing its apply intent", artifactPath);
    }
    const rawTransactionOperations = transaction.operations;
    const transactionOperations = records(rawTransactionOperations);
    if (
      artifact.kind === "migration-apply-intent"
      && Array.isArray(rawTransactionOperations)
      && transactionOperations.length === rawTransactionOperations.length
    ) {
      for (const operation of transactionOperations) {
        const operationId = typeof operation.operation_id === "string" ? operation.operation_id : "";
        try {
          // Malformed transaction fields must not become filesystem selectors.
          if (!/^OP-[0-9]{4,}$/.test(operationId)) throw new Error("invalid staged operation identity");
          const beforePath = await resolveMigrationControlPath(root, `${executionRoot}/execution/${operationId}.before.bin`, "file");
          const afterPath = await resolveMigrationControlPath(root, `${executionRoot}/execution/${operationId}.after.bin`, "file");
          const before = await readFile(beforePath);
          const after = await readFile(afterPath);
          if (sha256(before) !== operation.source_hash || sha256(after) !== operation.output_hash || after.length !== operation.output_bytes) {
            addDiagnostic(diagnostics, "error", "MIGRATION205", `staged migration preimage or postimage does not match ${operationId}`, artifactPath);
          }
        } catch (error) {
          addDiagnostic(diagnostics, "error", "MIGRATION205", `staged migration evidence is incomplete for ${operationId}`, artifactPath, (error as Error).message);
        }
      }
    }
  }
}

async function validateProjectEvidenceRecords(
  diagnostics: Diagnostic[],
  root: string,
  config: CanonTrailConfig,
  artifacts: Map<string, unknown>,
): Promise<void> {
  const ids = new Map<string, string>();
  for (const [artifactPath, value] of artifacts) {
    const basename = path.posix.basename(artifactPath);
    if (!(basename.endsWith(".evidence.yaml") || basename.endsWith(".evidence.yml")) || !isRecord(value)) continue;
    const match = /^\.agent-context\/tasks\/([^/]+)\/evidence\/([^/]+)\.evidence\.ya?ml$/.exec(artifactPath)
      ?? /^examples\/[^/]+\/tasks\/([^/]+)\/evidence\/([^/]+)\.evidence\.ya?ml$/.exec(artifactPath);
    const taskId = typeof value.task_id === "string" ? value.task_id : "";
    const evidenceId = typeof value.evidence_id === "string" ? value.evidence_id : "";
    if (!match || match[1] !== taskId || match[2] !== evidenceId) {
      addDiagnostic(diagnostics, "error", "EVIDENCE001", "evidence path, task_id, and evidence_id must identify the same task-owned record", artifactPath);
    }
    const previous = ids.get(evidenceId);
    if (evidenceId && previous) {
      addDiagnostic(diagnostics, "error", "EVIDENCE002", `duplicate evidence_id '${evidenceId}' also used by ${previous}`, artifactPath);
    } else if (evidenceId) {
      ids.set(evidenceId, artifactPath);
    }
    const recordHash = typeof value.record_hash === "string" ? value.record_hash : "";
    const { record_hash: _ignored, ...payload } = value;
    if (recordHash.toLowerCase() !== computeProjectEvidenceHash(payload as Omit<ProjectEvidenceRecord, "record_hash">).toLowerCase()) {
      addDiagnostic(diagnostics, "error", "EVIDENCE003", "evidence record self-hash does not match its payload", artifactPath);
    }
    for (const subject of records(value.subjects)) {
      if (typeof subject.path !== "string") continue;
      const target = referenceTarget(root, config, subject.path, root);
      if (!target.absolutePath || subject.path.includes("\\")) {
        addDiagnostic(diagnostics, "error", "EVIDENCE004", `evidence subject must be a normalized repository-relative path: ${subject.path}`, artifactPath);
      }
    }
    for (const reference of strings(value.references)) {
      checkReference(diagnostics, root, config, artifactPath, reference, root, "EVIDENCE005");
    }
  }
}

const CHANGE_IMPACT_AREAS = [
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

async function validateChangeRecords(
  diagnostics: Diagnostic[],
  root: string,
  config: CanonTrailConfig,
  artifacts: Map<string, unknown>,
  documents: DocumentRecord[],
): Promise<void> {
  const documentsByPath = new Map(documents.map((document) => [document.path, document]));
  const hasExternalEvidence = [...artifacts.values()].some(
    (value) => isRecord(value) && records(value.external_evidence).length > 0,
  );
  const candidateByKey = new Map<string, Awaited<ReturnType<typeof discoverEvidenceCandidates>>["candidates"][number]>();
  if (hasExternalEvidence) {
    const discovery = await discoverEvidenceCandidates(root);
    for (const candidate of discovery.candidates) {
      candidateByKey.set(`${candidate.source_system}:${candidate.path}`, candidate);
    }
  }

  for (const [artifactPath, value] of artifacts) {
    if (!/^change\.ya?ml$/.test(path.posix.basename(artifactPath)) || !isRecord(value)) continue;
    const status = typeof value.status === "string" ? value.status : "";
    const author = typeof value.author === "string" ? value.author : "";
    const impacts = records(value.impacts);
    const areaCounts = new Map<string, number>();
    for (const impact of impacts) {
      if (typeof impact.area === "string") areaCounts.set(impact.area, (areaCounts.get(impact.area) ?? 0) + 1);
    }
    for (const [area, count] of areaCounts) {
      if (count > 1) addDiagnostic(diagnostics, "error", "CHANGE001", `duplicate impact area '${area}'`, artifactPath);
    }
    if (["decided", "implemented", "verified", "superseded"].includes(status)) {
      const missing = CHANGE_IMPACT_AREAS.filter((area) => !areaCounts.has(area));
      if (missing.length > 0) {
        addDiagnostic(diagnostics, "error", "CHANGE002", `impact matrix is missing: ${missing.join(", ")}`, artifactPath);
      }
    }

    if (typeof value.canonical_source === "string") {
      checkReference(diagnostics, root, config, artifactPath, value.canonical_source, root, "CHANGE003");
    }
    const evidenceReferenceCounts = new Map<string, number>();
    const addEvidenceReferences = (values: string[]): void => {
      for (const reference of values) {
        evidenceReferenceCounts.set(reference, (evidenceReferenceCounts.get(reference) ?? 0) + 1);
      }
    };
    for (const acceptanceCase of records(value.acceptance_cases)) addEvidenceReferences(strings(acceptanceCase.evidence_refs));
    for (const impact of impacts) addEvidenceReferences(strings(impact.evidence_refs));
    const verification = isRecord(value.verification) ? value.verification : {};
    for (const check of records(verification.checks)) addEvidenceReferences(strings(check.evidence_refs));
    if (isRecord(verification.terminology_search)) addEvidenceReferences(strings(verification.terminology_search.evidence_refs));
    if (isRecord(verification.visual_review)) addEvidenceReferences(strings(verification.visual_review.evidence_refs));
    const documentationStructure = isRecord(value.documentation_structure) ? value.documentation_structure : {};
    const featureDocuments = records(documentationStructure.feature_documents);
    const featureIds = new Set<string>();
    const featurePaths = new Set<string>();
    for (const featureDocument of featureDocuments) {
      const featureId = typeof featureDocument.feature_id === "string" ? featureDocument.feature_id : "";
      if (featureId && featureIds.has(featureId)) {
        addDiagnostic(diagnostics, "error", "CHANGE014", `duplicate feature document id '${featureId}'`, artifactPath);
      }
      if (featureId) featureIds.add(featureId);
      addEvidenceReferences(strings(featureDocument.evidence_refs));
      const documentStatus = typeof featureDocument.status === "string" ? featureDocument.status : "";
      const documentPath = typeof featureDocument.path === "string" ? featureDocument.path : "";
      if (documentPath && featurePaths.has(documentPath)) {
        addDiagnostic(diagnostics, "error", "CHANGE014", `duplicate feature document path '${documentPath}'`, artifactPath);
      }
      if (documentPath) featurePaths.add(documentPath);
      if ((featureDocument.action === "update" || documentStatus !== "planned") && documentPath) {
        checkReference(diagnostics, root, config, artifactPath, documentPath, root, "CHANGE016");
      }
      const governedDocument = documentsByPath.get(normalizePath(documentPath));
      const header = governedDocument?.header;
      if (!header || documentStatus === "planned") continue;
      const verificationState = header.verification.state;
      if (
        documentStatus === "drafted" &&
        featureDocument.action === "create" &&
        (header.truth_level !== "draft" || ["verified", "reviewed"].includes(verificationState))
      ) {
        addDiagnostic(
          diagnostics,
          "error",
          "CHANGE018",
          `drafted feature document '${featureId}' must remain draft and not yet verified`,
          artifactPath,
        );
      } else if (documentStatus === "verified" && !["verified", "reviewed"].includes(verificationState)) {
        addDiagnostic(
          diagnostics,
          "error",
          "CHANGE018",
          `verified feature document '${featureId}' has document verification state '${verificationState}'`,
          artifactPath,
        );
      } else if (
        documentStatus === "promoted" &&
        (header.truth_level !== "canonical" || !["verified", "reviewed"].includes(verificationState))
      ) {
        addDiagnostic(
          diagnostics,
          "error",
          "CHANGE018",
          `promoted feature document '${featureId}' must be canonical and verified`,
          artifactPath,
        );
      }
    }
    const independentReview = isRecord(value.independent_review) ? value.independent_review : {};
    addEvidenceReferences(strings(independentReview.evidence_refs));
    for (const [reference, occurrences] of evidenceReferenceCounts) {
      checkReference(diagnostics, root, config, artifactPath, reference, root, "CHANGE004", false, occurrences);
    }

    const externalEvidence = records(value.external_evidence);
    const externalKeys = new Set<string>();
    for (const reference of externalEvidence) {
      const sourceSystem = typeof reference.source_system === "string" ? reference.source_system : "";
      const sourcePath = typeof reference.path === "string" ? reference.path : "";
      const key = `${sourceSystem}:${sourcePath}`;
      if (externalKeys.has(key)) {
        addDiagnostic(diagnostics, "error", "CHANGE009", `duplicate external evidence reference '${key}'`, artifactPath);
      }
      externalKeys.add(key);
      checkReference(diagnostics, root, config, artifactPath, sourcePath, root, "CHANGE010");
      const target = referenceTarget(root, config, sourcePath, root);
      if (!target.absolutePath) continue;
      if (!target.exists) {
        addDiagnostic(diagnostics, "error", "CHANGE010", `linked external evidence does not exist: ${sourcePath}`, artifactPath);
        continue;
      }
      const candidate = candidateByKey.get(key);
      if (!candidate) {
        addDiagnostic(diagnostics, "error", "CHANGE012", `external evidence is not a detected candidate for '${sourceSystem}': ${sourcePath}`, artifactPath);
      } else if (candidate.artifact_kind !== reference.artifact_kind) {
        addDiagnostic(
          diagnostics,
          "error",
          "CHANGE013",
          `external evidence kind '${String(reference.artifact_kind)}' does not match detected kind '${candidate.artifact_kind}'`,
          artifactPath,
        );
      }
      const expectedHash = typeof reference.content_hash === "string" ? reference.content_hash : "";
      const actualHash = sha256(await readFile(target.absolutePath));
      if (expectedHash.toLowerCase() !== actualHash.toLowerCase()) {
        addDiagnostic(diagnostics, "error", "CHANGE011", `stale external evidence hash for '${sourcePath}'`, artifactPath);
      }
    }

    if (["implemented", "verified", "superseded"].includes(status)) {
      if (documentationStructure.decision === "reassess-documentation-structure") {
        addDiagnostic(
          diagnostics,
          "error",
          "CHANGE015",
          "documentation structure reassessment must be resolved before implementation is complete",
          artifactPath,
        );
      }
      for (const featureDocument of featureDocuments) {
        if (featureDocument.status === "planned") {
          addDiagnostic(
            diagnostics,
            "error",
            "CHANGE015",
            `feature document '${String(featureDocument.feature_id)}' must be drafted before implementation is complete`,
            artifactPath,
          );
        }
      }
    }

    if (status !== "verified") continue;
    for (const featureDocument of featureDocuments) {
      if (!["verified", "promoted"].includes(String(featureDocument.status)) || strings(featureDocument.evidence_refs).length === 0) {
        addDiagnostic(
          diagnostics,
          "error",
          "CHANGE017",
          `feature document '${String(featureDocument.feature_id)}' requires verified evidence before the change can be verified`,
          artifactPath,
        );
      }
    }
    const affectedAreas = new Set(
      impacts
        .filter((impact) => impact.decision === "affected" && typeof impact.area === "string")
        .map((impact) => impact.area as string),
    );
    const terminologySearch = isRecord(verification.terminology_search) ? verification.terminology_search : {};
    if (affectedAreas.has("terminology") && terminologySearch.status !== "pass") {
      addDiagnostic(diagnostics, "error", "CHANGE005", "affected terminology requires a passing project-wide search", artifactPath);
    }
    const visualReview = isRecord(verification.visual_review) ? verification.visual_review : {};
    if (affectedAreas.has("diagrams-visuals") && visualReview.applicable !== true) {
      addDiagnostic(diagnostics, "error", "CHANGE006", "affected diagrams or visuals must declare visual review applicable", artifactPath);
    } else if (visualReview.applicable === true && visualReview.status !== "pass") {
      addDiagnostic(diagnostics, "error", "CHANGE006", "an applicable visual review must pass before verification", artifactPath);
    }
    if (independentReview.status === "pass") {
      const reviewer = typeof independentReview.reviewer === "string" ? independentReview.reviewer : "";
      if (!reviewer || reviewer === author) {
        addDiagnostic(diagnostics, "error", "CHANGE007", "independent review must identify a reviewer different from the author", artifactPath);
      }
      if (strings(independentReview.evidence_refs).length === 0) {
        addDiagnostic(diagnostics, "error", "CHANGE008", "independent review pass requires evidence", artifactPath);
      }
    }
  }
}

function findCycle(graph: Map<string, string[]>): string[] | undefined {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  function visit(node: string): string[] | undefined {
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      return [...stack.slice(start), node];
    }
    if (visited.has(node)) return undefined;
    visiting.add(node);
    stack.push(node);
    for (const dependency of graph.get(node) ?? []) {
      if (!graph.has(dependency)) continue;
      const cycle = visit(dependency);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
    return undefined;
  }

  for (const node of graph.keys()) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return undefined;
}

async function validateHandoffs(
  diagnostics: Diagnostic[],
  root: string,
  config: CanonTrailConfig,
  artifacts: Map<string, unknown>,
): Promise<void> {
  for (const [artifactPath, value] of artifacts) {
    if (!/^handoff\.ya?ml$/.test(path.posix.basename(artifactPath)) || !isRecord(value)) continue;
    for (const finding of validateHandoffSemantics(value)) {
      addDiagnostic(diagnostics, "error", finding.code, finding.message, artifactPath);
    }
    for (const reference of strings(value.resume_sources)) {
      checkReference(diagnostics, root, config, artifactPath, reference, root, "HANDOFF004");
    }
    const taskMatch = /^\.agent-context\/tasks\/([^/]+)\/handoff\.ya?ml$/.exec(artifactPath);
    if (taskMatch && value.task_id !== taskMatch[1]) {
      addDiagnostic(diagnostics, "error", "HANDOFF007", "handoff task_id does not match its task directory", artifactPath);
    }
    if (typeof value.source_context_lock_path !== "string") continue;
    const sourceLockPath = normalizePath(value.source_context_lock_path);
    if (taskMatch && !sourceLockPath.startsWith(`.agent-context/tasks/${taskMatch[1]}/evidence/context-locks/`)) {
      addDiagnostic(diagnostics, "error", "HANDOFF006", "source context lock must be archived under the owning task", artifactPath);
      continue;
    }
    checkReference(diagnostics, root, config, artifactPath, sourceLockPath, root, "HANDOFF006");
    const target = referenceTarget(root, config, sourceLockPath, root);
    if (!target.exists || !target.absolutePath) continue;
    try {
      const archive: unknown = JSON.parse(await readFile(target.absolutePath, "utf8"));
      if (!isRecord(archive) || typeof archive.lock_hash !== "string") {
        addDiagnostic(diagnostics, "error", "HANDOFF006", "archived source context lock is invalid", artifactPath);
        continue;
      }
      const { lock_hash: _ignored, ...payload } = archive;
      const computed = computeContextLockHash(payload as Omit<ContextLock, "lock_hash">);
      if (
        computed !== archive.lock_hash ||
        archive.lock_hash !== value.source_context_lock_hash ||
        archive.task_id !== value.task_id
      ) {
        addDiagnostic(diagnostics, "error", "HANDOFF006", "archived source context lock does not match the handoff", artifactPath);
      }
    } catch (error) {
      addDiagnostic(diagnostics, "error", "HANDOFF006", "archived source context lock cannot be parsed", artifactPath, (error as Error).message);
    }
  }
}

async function validateResumePackets(
  diagnostics: Diagnostic[],
  root: string,
  config: CanonTrailConfig,
  artifacts: Map<string, unknown>,
  documents: DocumentRecord[],
  documentInventoryValid: boolean,
  validators: Map<string, ValidateFunction>,
  currentUsePacketPath?: string,
): Promise<void> {
  for (const [artifactPath, value] of artifacts) {
    const basename = path.posix.basename(artifactPath);
    if (!(basename === "resume.packet.json" || basename.endsWith(".resume.packet.json")) || !isRecord(value)) continue;
    // Purpose is supplied by the validating caller, never by mutable packet fields
    // or a task status. Repository integrity PASS is not current-use approval.
    const currentUse = artifactPath === currentUsePacketPath;
    const audited = await auditResumeReferences(root, artifactPath, value, validators,
      currentUse ? "current-use" : "retained-integrity", diagnostics);
    if (!audited || !currentUse) continue;
    const { lock, taskRoot } = audited;
    if (taskRoot) {
      try {
        if (!documentInventoryValid) throw new Error("Current document inventory is incomplete or has invalid routing metadata.");
        const reasons = await contextIndexCompatibilityReasons(root, buildContextIndex(documents), lock);
        if (reasons.length) addDiagnostic(diagnostics, "error", "RESUME010", "receiving context does not satisfy task requirements", artifactPath, reasons.join("; "));
      } catch (error) {
        addDiagnostic(diagnostics, "error", "RESUME010", "receiving context task compatibility cannot be established", artifactPath, (error as Error).message);
      }
    }
    for (const source of lock.sources) {
      const target = referenceTarget(root, config, source.path, root);
      if (!target.exists || !target.absolutePath) {
        addDiagnostic(diagnostics, "error", "RESUME008", "resume source does not exist: " + source.path, artifactPath);
        continue;
      }
      try {
        const exact = await safeRepositoryFile(root, source.path);
        if (!exact) throw new Error("Source no longer exists with exact path spelling.");
        const content = await readFile(exact);
        if (sha256(content) !== source.content_hash) {
          addDiagnostic(diagnostics, "error", "RESUME008", "resume source content changed: " + source.path, artifactPath);
        }
        validateLockedSection(source, content);
      } catch (error) {
        addDiagnostic(diagnostics, "error", "RESUME008", "resume source cannot be read: " + source.path, artifactPath, (error as Error).message);
      }
    }
  }
}

async function validateContextLocks(
  diagnostics: Diagnostic[],
  root: string,
  config: CanonTrailConfig,
  artifacts: Map<string, unknown>,
  strictTaskId?: string,
  documents: DocumentRecord[] = [],
): Promise<void> {
  for (const [artifactPath, value] of artifacts) {
    if (path.posix.basename(artifactPath) !== "context.lock.json" || !isRecord(value)) continue;
    const taskMatch = /^\.agent-context\/tasks\/([^/]+)\/context\.lock\.json$/.exec(artifactPath);
    const taskId = taskMatch?.[1];
    const taskState = taskId ? artifacts.get(`.agent-context/tasks/${taskId}/state.yaml`) : undefined;
    const taskStatus = isRecord(taskState) && typeof taskState.status === "string" ? taskState.status : "";
    const historical = Boolean(
      taskId &&
      taskId !== strictTaskId &&
      ["verified", "done", "superseded"].includes(taskStatus),
    );
    const driftOwner = taskId && value.task_id === taskId && isRecord(taskState) && taskState.task_id === taskId ? taskId : undefined;
    const budget = isRecord(value.budget) ? value.budget : {};
    const total = typeof budget.total_tokens === "number" ? budget.total_tokens : 0;
    const output = typeof budget.reserved_output_tokens === "number" ? budget.reserved_output_tokens : 0;
    const safety = typeof budget.reserved_input_tokens === "number" ? budget.reserved_input_tokens : 0;
    const input = typeof budget.estimated_input_tokens === "number" ? budget.estimated_input_tokens : 0;
    if (input + output + safety > total) {
      addDiagnostic(diagnostics, "error", "LOCK001", "estimated input plus output and input-safety reserves exceeds total token budget", artifactPath);
    }

    const lockHash = typeof value.lock_hash === "string" ? value.lock_hash : "";
    const { lock_hash: _ignoredLockHash, ...lockPayload } = value;
    const expectedLockHash = computeContextLockHash(lockPayload as Omit<ContextLock, "lock_hash">);
    if (lockHash.toLowerCase() !== expectedLockHash.toLowerCase()) {
      addDiagnostic(diagnostics, "error", "LOCK007", "context lock self-hash does not match its payload", artifactPath);
    }

    const seenPaths = new Set<string>();
    for (const source of records(value.sources)) {
      if (typeof source.path !== "string") continue;
      if (seenPaths.has(source.path)) {
        addDiagnostic(diagnostics, "error", "LOCK002", `duplicate context source '${source.path}'`, artifactPath);
      }
      seenPaths.add(source.path);
      try { validateLockedSection(source as unknown as LockedSection); }
      catch (error) { addDiagnostic(diagnostics, "error", "LOCK009", "invalid context section", artifactPath, (error as Error).message); }
      if (historical) continue;
      checkReference(diagnostics, root, config, artifactPath, source.path, root, "LOCK003");
      const target = referenceTarget(root, config, source.path, root);
      if (target.exists && target.absolutePath && typeof source.content_hash === "string" && /^sha256:[a-f0-9]{64}$/i.test(source.content_hash)) {
        let bytes: Buffer;
        try {
          const exact = await safeRepositoryFile(root, source.path);
          if (!exact) throw new Error("Source no longer exists with exact path spelling.");
          bytes = await readFile(exact);
        } catch (error) {
          addDiagnostic(diagnostics, "error", "LOCK003", "context source path cannot be resolved exactly", artifactPath, (error as Error).message);
          continue;
        }
        const actualHash = sha256(bytes);
        if (actualHash.toLowerCase() !== source.content_hash.toLowerCase()) {
          diagnostics.push({ severity: "error", code: "LOCK004", message: `stale content hash for '${source.path}'`, path: artifactPath,
            ...(driftOwner ? { context_drift: { task_id: driftOwner, kind: "source-content" as const } } : {}),
          });
        }
        if (actualHash.toLowerCase() === source.content_hash.toLowerCase()) {
          try { validateLockedSection(source as unknown as LockedSection, bytes); }
          catch (error) { addDiagnostic(diagnostics, "error", "LOCK009", "invalid context section bytes or budget", artifactPath, (error as Error).message); }
        }
      }
    }
    for (const omission of records(value.omissions)) {
      if (omission.required === true) {
        addDiagnostic(
          diagnostics,
          "error",
          "LOCK005",
          `required context candidate was omitted: ${String(omission.candidate)}`,
          artifactPath,
        );
      }
    }
    if (value.raw_transcripts_included === true) {
      addDiagnostic(diagnostics, "warning", "LOCK006", "raw transcripts are included in the context lock", artifactPath);
    }
    if (artifactPath.startsWith(".agent-context/tasks/") && !historical) {
      const indexPath = path.join(root, ...normalizePath(config.indexPath).split("/"));
      try {
        const currentIndex: unknown = JSON.parse(await readFile(indexPath, "utf8"));
        const currentRootHash = isRecord(currentIndex) && typeof currentIndex.root_hash === "string" ? currentIndex.root_hash : "";
        if (value.context_index_hash !== currentRootHash || records(value.sources).some(source => source.line_ranges !== undefined)
            || (isRecord(taskState) && Array.isArray(taskState.context_sections) && taskState.context_sections.length > 0)) {
          if (!taskId || value.task_id !== taskId) throw new Error("context lock task identity is unavailable or inconsistent");
          // Never trust a new stored root hash alone: independently reconstruct its documents.
          const expectedIndex = buildContextIndex(documents);
          if (!isDeepStrictEqual(currentIndex, expectedIndex)) throw new Error("current context index is stale or inconsistent; refresh the index first");
          const reasons = await contextIndexCompatibilityReasons(root, expectedIndex, value as unknown as ContextLock);
          if (reasons.length > 0) {
            diagnostics.push({ severity: "error", code: "LOCK008", message: "context lock needs recompilation after task-relevant index changes", path: artifactPath, detail: reasons.join("; "),
              ...(driftOwner ? { context_drift: { task_id: driftOwner, kind: "task-requirements" as const } } : {}),
            });
          }
        }
      } catch (error) {
        const detail = (error as Error).message;
        const classified =
          detail === "current context index is stale or inconsistent; refresh the index first"
            ? "context index is stale or inconsistent; run 'canontrail index .' before recompiling the lock"
            : detail === "context lock task identity is unavailable or inconsistent"
              ? "context lock task identity is unavailable or inconsistent; restore the task state or recompile the lock"
              : /ENOENT|Unexpected token|is not valid JSON|JSON/i.test(detail)
                ? "context index is missing or unreadable; run 'canontrail index .'"
                : "context index compatibility cannot be established";
        addDiagnostic(diagnostics, "error", "LOCK008", classified, artifactPath, detail);
      }
    }
  }
}

async function validateTaskStates(diagnostics: Diagnostic[], root: string, artifacts: Map<string, unknown>): Promise<void> {
  const graph = new Map<string, string[]>();
  const sourceByTask = new Map<string, string>();
  for (const [artifactPath, value] of artifacts) {
    if (!/^state\.ya?ml$/.test(path.posix.basename(artifactPath)) || !isRecord(value)) continue;
    if (typeof value.task_id !== "string") continue;
    graph.set(value.task_id, strings(value.dependencies));
    try { parseContextSections(value.context_sections); }
    catch (error) { addDiagnostic(diagnostics, "error", "TASK005", "invalid explicit context sections", artifactPath, (error as Error).message); }
    sourceByTask.set(value.task_id, artifactPath);
    for (const check of records(value.checks)) {
      if (await taskCheckInvokesCanonTrailFinalize(root, check.command_or_observation)) {
        addDiagnostic(
          diagnostics,
          "error",
          "TASK004",
          `task check '${String(check.id ?? "unknown")}' invokes CanonTrail finalize and creates a circular completion dependency`,
          artifactPath,
          "Record the underlying project-owned checks instead; canontrail finalize is the terminal aggregator.",
        );
      }
    }
    if (value.status === "verified" || value.status === "done") {
      for (const criterion of records(value.acceptance_criteria)) {
        if (criterion.status !== "pass" && criterion.status !== "not-applicable") {
          addDiagnostic(
            diagnostics,
            "error",
            "TASK001",
            `${value.task_id} is ${value.status} but acceptance criterion '${String(criterion.id)}' is not satisfied`,
            artifactPath,
          );
        }
      }
      for (const check of records(value.checks)) {
        if (check.status !== "pass" || strings(check.evidence_refs).length === 0) {
          addDiagnostic(
            diagnostics,
            "error",
            "TASK002",
            `${value.task_id} is ${value.status} but check '${String(check.id)}' lacks passing evidence`,
            artifactPath,
          );
        }
      }
    }
  }
  const cycle = findCycle(graph);
  if (cycle) {
    addDiagnostic(
      diagnostics,
      "error",
      "TASK003",
      `task-state dependency cycle: ${cycle.join(" -> ")}`,
      sourceByTask.get(cycle[0] ?? ""),
    );
  }
}

async function validateIndex(
  diagnostics: Diagnostic[],
  root: string,
  config: CanonTrailConfig,
  documents: DocumentRecord[],
): Promise<void> {
  if (documents.some((document) => !document.header)) {
    return;
  }
  const expected = buildContextIndex(documents);
  const indexPath = path.join(root, ...normalizePath(config.indexPath).split("/"));
  let actual: unknown;
  try {
    actual = JSON.parse(await readFile(indexPath, "utf8"));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    addDiagnostic(
      diagnostics,
      "error",
      code === "ENOENT" ? "INDEX001" : "INDEX002",
      code === "ENOENT" ? "context index is missing; run 'canontrail index .'" : "context index cannot be parsed",
      normalizePath(config.indexPath),
      code === "ENOENT" ? undefined : (error as Error).message,
    );
    return;
  }
  if (!isDeepStrictEqual(actual, expected)) {
    addDiagnostic(
      diagnostics,
      "error",
      "INDEX003",
      "context index is stale; run 'canontrail index .', then rerun this command",
      normalizePath(config.indexPath),
      `expected root_hash ${expected.root_hash}`,
    );
  }
}

export async function validateRepository(rootInput: string, options: ValidateOptions = {}): Promise<ValidationReport> {
  const root = path.resolve(rootInput);
  const diagnostics: Diagnostic[] = [];
  let config: CanonTrailConfig;
  try {
    config = await loadConfig(root);
  } catch (error) {
    addDiagnostic(
      diagnostics,
      "error",
      "CFG001",
      "CanonTrail configuration is invalid",
      ".agent-context/config.yaml",
      (error as Error).message,
    );
    return {
      resume_validation: { purpose: options.requiredResumePacketPath ? "current-use" : "retained-integrity", current_use_packet_path: options.requiredResumePacketPath ?? null },
      root,
      ok: false,
      diagnostics,
      stats: { markdownDocuments: 0, structuredArtifacts: 0, schemas: 0, errors: 1, warnings: 0 },
    };
  }

  await validateMigrationCoverage(root, config, diagnostics);
  const { validators, count: schemaCount } = await loadSchemaValidators(root, diagnostics, config.schemaPath);
  let documents: DocumentRecord[] = [];
  try {
    documents = await discoverMarkdown(root, config);
  } catch (error) {
    addDiagnostic(diagnostics, "error", "DOC001", "repository files cannot be scanned", undefined, (error as Error).message);
  }

  const headerValidator = validators.get("artifact-header");
  for (const document of documents) {
    if (!document.header) {
      if (config.requireFrontmatterForAllMarkdown) {
        addDiagnostic(diagnostics, "error", "DOC002", "Markdown frontmatter is invalid", document.path, document.parseError);
      }
      continue;
    }
    if (!headerValidator) {
      addDiagnostic(diagnostics, "error", "SCHEMA004", "artifact-header validator is unavailable", document.path);
    } else if (!headerValidator(document.header)) {
      addDiagnostic(
        diagnostics,
        "error",
        "SCHEMA005",
        "Markdown header does not conform to artifact-header.schema.json",
        document.path,
        formatAjvErrors(headerValidator),
      );
    }
  }

  validateDocumentIdentity(diagnostics, config, documents);
  validateMetadataReferences(diagnostics, root, config, documents);

  let artifacts = new Map<string, unknown>();
  try {
    artifacts = await loadStructuredArtifacts(root, config, validators, diagnostics);
  } catch (error) {
    addDiagnostic(diagnostics, "error", "DOC005", "structured artifacts cannot be scanned", undefined, (error as Error).message);
  }
  await validateChangeRecords(diagnostics, root, config, artifacts, documents);
  diagnostics.push(...await validateFrozenExamplePolicy(root, documents));
  if (options.requiredResumePacketPath && !artifacts.has(options.requiredResumePacketPath)) {
    addDiagnostic(diagnostics, "error", "RESUME000", "requested packet was not loaded by the governed artifact scan; excluded, aliased or unreadable inputs cannot be approved", options.requiredResumePacketPath);
  }
  await validateProjectEvidenceRecords(diagnostics, root, config, artifacts);
  await validateMigrationPlans(diagnostics, artifacts, root);
  await validateMigrationTransactions(diagnostics, artifacts, root);
  await validateMigrationExecutionEvidence(diagnostics, artifacts, root);
  await validateHandoffs(diagnostics, root, config, artifacts);
  const documentPaths = new Set(documents.map(document => document.path));
  const documentInventoryValid = !diagnostics.some(d => d.severity === "error" &&
    (d.code === "DOC001" || d.code === "DOC002" || (documentPaths.has(d.path ?? "") && ["SCHEMA004", "SCHEMA005"].includes(d.code))));
  await validateResumePackets(diagnostics, root, config, artifacts, documents, documentInventoryValid, validators, options.requiredResumePacketPath);
  if (options.checkContextLocks !== false) {
    await validateContextLocks(diagnostics, root, config, artifacts, options.strictContextLockTaskId, documents);
  }
  await validateTaskStates(diagnostics, root, artifacts);

  if (options.checkIndex !== false) {
    await validateIndex(diagnostics, root, config, documents);
  }

  diagnostics.sort((left, right) => {
    const severity = left.severity === right.severity ? 0 : left.severity === "error" ? -1 : 1;
    return severity || compareCodeUnits(left.path ?? "", right.path ?? "") || compareCodeUnits(left.code, right.code);
  });
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warnings = diagnostics.length - errors;
  return {
    resume_validation: { purpose: options.requiredResumePacketPath ? "current-use" : "retained-integrity", current_use_packet_path: options.requiredResumePacketPath ?? null },
    root,
    ok: errors === 0,
    diagnostics,
    stats: {
      markdownDocuments: documents.length,
      structuredArtifacts: artifacts.size,
      schemas: schemaCount,
      errors,
      warnings,
    },
  };
}

export async function validateResumePacketAt(rootInput: string, packetInput: string): Promise<TargetResumeValidationReport> {
  const root = path.resolve(rootInput);
  const raw = packetInput.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  const packetPath = normalizePath(path.posix.normalize(raw));
  const invalidPath =
    !raw ||
    !/^\.agent-context\/tasks\/[^/]+\//.test(packetPath) ||
    path.isAbsolute(packetInput) ||
    raw.startsWith("/") ||
    packetPath === ".." ||
    packetPath.startsWith("../") ||
    !(path.posix.basename(packetPath) === "resume.packet.json" || path.posix.basename(packetPath).endsWith(".resume.packet.json"));
  if (invalidPath) {
    return {
      validation_scope: "current-use",
      root,
      path: packetPath,
      ok: false,
      diagnostics: [{
        severity: "error",
        code: "RESUME000",
        message: "packet must be a repository-relative resume packet path inside its operational .agent-context/tasks owner",
        path: packetPath || raw,
      }],
    };
  }
  const config = await loadConfig(root);
  const absolute = path.join(root, ...packetPath.split("/"));
  if (!existsSync(absolute) || !isGovernedPath(packetPath, config) || schemaForArtifact(packetPath) !== "resume-packet") {
    return {
      validation_scope: "current-use",
      root,
      path: packetPath,
      ok: false,
      diagnostics: [{
        severity: "error",
        code: "RESUME000",
        message: "resume packet does not exist inside the governed repository boundary",
        path: packetPath,
      }],
    };
  }
  const repository = await validateRepository(root, { checkIndex: false, checkContextLocks: false, requiredResumePacketPath: packetPath });
  const diagnostics = repository.diagnostics.filter((diagnostic) =>
    diagnostic.path === packetPath || (!diagnostic.path && diagnostic.code.startsWith("SCHEMA")));
  return {
    validation_scope: "current-use",
    root,
    path: packetPath,
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    diagnostics,
  };
}

export function formatValidationReport(report: ValidationReport): string {
  const lines: string[] = [];
  for (const diagnostic of report.diagnostics) {
    const marker = diagnostic.severity === "error" ? "ERROR" : "WARN";
    const location = diagnostic.path ? ` ${diagnostic.path}` : "";
    lines.push(`${marker} ${diagnostic.code}${location}: ${diagnostic.message}`);
    if (diagnostic.detail) {
      lines.push(`  ${diagnostic.detail}`);
    }
  }
  if (lines.length > 0) lines.push("");
  lines.push(
    `Structural validation ${report.ok ? "PASS" : "FAIL"}: ${report.stats.markdownDocuments} Markdown, ` +
      `${report.stats.structuredArtifacts} structured artifacts, ${report.stats.schemas} schemas, ` +
      `${report.stats.errors} errors, ${report.stats.warnings} warnings`,
  );
  lines.push("Resume receipts: integrity/provenance only; use resume validate --packet before consuming a packet.");
  return lines.join("\n");
}

export function expectedIndexText(documents: DocumentRecord[]): string {
  return serializeContextIndex(buildContextIndex(documents));
}
