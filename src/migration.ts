import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";
import { stringify } from "yaml";
import { parseFrontmatter } from "./frontmatter.js";
import { normalizePath } from "./indexer.js";
import { createMigrationContentView, formatMigrationContentPreview, type MigrationContentPreview } from "./migration-content-preview.js";
import { resolveMigrationControlPath } from "./migration-control-path.js";

export const MIGRATION_ADAPTERS = ["auto", "canontrail", "legacy-header-v1", "generic-markdown"] as const;
// Compatibility-only spellings for previously stored plans and callers.
export const DEPRECATED_MIGRATION_ADAPTER = "gaertnerei-legacy";
export const DEPRECATED_MIGRATION_SOURCE_FORMAT = "gaertnerei-legacy-header";
export type MigrationAdapter = (typeof MIGRATION_ADAPTERS)[number] | typeof DEPRECATED_MIGRATION_ADAPTER;
export type MigrationSourceFormat = "canontrail-frontmatter" | "legacy-header-v1" | typeof DEPRECATED_MIGRATION_SOURCE_FORMAT | "plain-markdown";

export function normalizeMigrationAdapter(value: string): (typeof MIGRATION_ADAPTERS)[number] {
  if (value === DEPRECATED_MIGRATION_ADAPTER) return "legacy-header-v1";
  const adapter = MIGRATION_ADAPTERS.find((item) => item === value);
  if (!adapter) throw new Error(`unsupported migration adapter: ${value}`);
  return adapter;
}
export type MigrationDocumentRole =
  | "canonical"
  | "active-reference"
  | "active-snapshot"
  | "design-target"
  | "handoff"
  | "review"
  | "historical"
  | "third-party"
  | "unknown";
export type MigrationAction =
  | "keep"
  | "normalize-header"
  | "review-metadata"
  | "classify-and-normalize"
  | "preserve-historical"
  | "preserve-review"
  | "exclude-external";

export interface DetectedMigrationMetadata {
  stand: string | null;
  status: string | null;
  truth_level: string | null;
  verification: string | null;
  read_if_task_touches: string[];
  primary_systems: string[];
  safe_to_edit: string[];
  do_not_use_instead: string[];
}

export interface MigrationPlanDocument {
  path: string;
  content_hash: string;
  bytes: number;
  source_format: MigrationSourceFormat;
  detected_metadata: DetectedMigrationMetadata;
  role: MigrationDocumentRole;
  proposed_action: MigrationAction;
  target_path: string;
  confidence: "high" | "medium" | "low";
  requires_review: boolean;
  reasons: string[];
}

export interface MigrationPlan {
  version: 1;
  migration_id: string;
  created_at: string;
  mode: "plan-only";
  adapter: MigrationAdapter;
  root: ".";
  documentation_roots: string[];
  summary: {
    documents: number;
    source_formats: Partial<Record<MigrationSourceFormat, number>>;
    roles: Record<MigrationDocumentRole, number>;
    actions: Record<MigrationAction, number>;
    review_required: number;
    ignored_by_extension: Record<string, number>;
    unreadable: number;
  };
  documents: MigrationPlanDocument[];
  unprocessed: Array<{ path: string; reason: string }>;
  warnings: string[];
  plan_hash: string;
}

export interface MigrationPlanOptions {
  root: string;
  migrationId: string;
  documentationRoots: string[];
  adapter?: MigrationAdapter;
  createdAt?: string;
  apply?: boolean;
}

export interface MigrationPlanReport {
  root: string;
  dry_run: boolean;
  output_path: string;
  written: boolean;
  plan: MigrationPlan;
}

export interface MigrationTargetHeader {
  topic_id?: string;
  stand: string;
  status: string;
  truth_level: "canonical" | "design-target" | "active-snapshot" | "draft" | "historical";
  verification: { state: "unverified" | "structurally-reviewed" | "internally-reviewed" | "reviewed" | "verified"; evidence: string[] };
  read_if_task_touches: string[];
  primary_systems: string[];
  safe_to_edit: string[];
  do_not_use_instead: string[];
}

export interface MigrationReviewDecision {
  path: string;
  decision: "execute" | "skip";
  action: "normalize-header";
  target_path: string;
  reason: string;
  target_header?: MigrationTargetHeader;
}

export interface MigrationDecisionSet {
  version: 1;
  migration_id: string;
  plan_hash: string;
  reviewed_by: string;
  reviewed_at: string;
  decisions: MigrationReviewDecision[];
}

export interface MigrationTransactionOperation {
  operation_id: string;
  action: "normalize-header";
  source_path: string;
  target_path: string;
  source_hash: string;
  target_precondition: { state: "same-as-source" | "absent"; content_hash: string | null };
  output_hash: string;
  output_bytes: number;
  target_header: MigrationTargetHeader;
}

export interface MigrationTransaction {
  version: 2;
  transaction_id: string;
  migration_id: string;
  created_at: string;
  mode: "transformation-preview";
  plan_hash: string;
  decision_hash: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  decisions: MigrationReviewDecision[];
  root: ".";
  documentation_roots: string[];
  operations: MigrationTransactionOperation[];
  blockers: Array<{ path: string; code: string; reason: string }>;
  summary: { operations: number; blockers: number; skipped: number };
  transaction_hash: string;
}

export interface MigrationTransformationOptions extends MigrationPlanOptions {
  transactionId: string;
  decisions?: MigrationDecisionSet;
  showContent?: boolean;
}

export interface MigrationTransformationReport {
  root: string;
  dry_run: boolean;
  output_path: string;
  written: boolean;
  transaction: MigrationTransaction;
  content_preview?: MigrationContentPreview;
}

export interface MigrationExecutionRecord {
  version: 1;
  kind: "migration-apply" | "migration-rollback";
  transaction_hash: string;
  observed_at: string;
  operations: Array<{ operation_id: string; path: string; before_hash: string | null; after_hash: string | null }>;
  record_hash: string;
}

export interface MigrationApplyIntent {
  version: 1;
  kind: "migration-apply-intent";
  transaction_hash: string;
  observed_at: string;
  operations: Array<{ operation_id: string; source_path: string; target_path: string; source_hash: string; output_hash: string }>;
  record_hash: string;
}

interface DetectedFormat {
  format: MigrationSourceFormat;
  metadata: DetectedMigrationMetadata;
  canonTrailHeaderComplete: boolean;
  reasons: string[];
}

const SOURCE_FORMATS: MigrationSourceFormat[] = ["canontrail-frontmatter", "legacy-header-v1", "plain-markdown"];
const ROLES: MigrationDocumentRole[] = ["canonical", "active-reference", "active-snapshot", "design-target", "handoff", "review", "historical", "third-party", "unknown"];
const ACTIONS: MigrationAction[] = ["keep", "normalize-header", "review-metadata", "classify-and-normalize", "preserve-historical", "preserve-review", "exclude-external"];
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const CANONTRAIL_TRUTH_LEVELS = new Set(["canonical", "design-target", "active-snapshot", "draft", "historical"]);
const CANONTRAIL_VERIFICATION_STATES = new Set(["unverified", "structurally-reviewed", "internally-reviewed", "reviewed", "verified"]);
const CANONTRAIL_ARRAY_FIELDS = ["read_if_task_touches", "primary_systems", "safe_to_edit", "do_not_use_instead"] as const;
const WINDOWS_DEVICE_BASENAME = /^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])$/i;
const WINDOWS_FORBIDDEN_PATH_CHARACTERS = /[<>:"|?*\u0000-\u001f]/;
const require = createRequire(import.meta.url);
const addFormats = require("ajv-formats") as FormatsPlugin;
let packagedMigrationTransactionValidator: Promise<ValidateFunction> | null = null;
let packagedMigrationExecutionValidator: Promise<ValidateFunction> | null = null;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: string | Buffer): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function migrationTransactionValidator(): Promise<ValidateFunction> {
  packagedMigrationTransactionValidator ??= (async () => {
    const schema = JSON.parse(await readFile(new URL("../schemas/migration-transaction.schema.json", import.meta.url), "utf8"));
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    return ajv.compile(schema);
  })();
  return packagedMigrationTransactionValidator;
}

async function migrationExecutionValidator(): Promise<ValidateFunction> {
  packagedMigrationExecutionValidator ??= (async () => {
    const schema = JSON.parse(await readFile(new URL("../schemas/migration-execution.schema.json", import.meta.url), "utf8"));
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    return ajv.compile(schema);
  })();
  return packagedMigrationExecutionValidator;
}

function migrationTransactionSchemaErrors(validate: ValidateFunction): string {
  return (validate.errors ?? [])
    .map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
    .join("; ");
}

function emptyMetadata(): DetectedMigrationMetadata {
  return {
    stand: null,
    status: null,
    truth_level: null,
    verification: null,
    read_if_task_touches: [],
    primary_systems: [],
    safe_to_edit: [],
    do_not_use_instead: [],
  };
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

function scalar(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasCanonTrailMarker(header: Record<string, unknown>): boolean {
  if (["topic_id", "truth_level", ...CANONTRAIL_ARRAY_FIELDS].some((key) => hasOwn(header, key))) return true;
  const verification = record(header.verification);
  return Boolean(verification && (hasOwn(verification, "state") || hasOwn(verification, "evidence")));
}

function hasCompleteCanonTrailHeader(header: Record<string, unknown>): boolean {
  const truthLevel = scalar(header.truth_level);
  const verification = record(header.verification);
  if (!scalar(header.stand) || !scalar(header.status) || !truthLevel || !CANONTRAIL_TRUTH_LEVELS.has(truthLevel)) return false;
  if (!verification || !CANONTRAIL_VERIFICATION_STATES.has(scalar(verification.state) ?? "") || !Array.isArray(verification.evidence)) return false;
  if (!CANONTRAIL_ARRAY_FIELDS.every((key) => Array.isArray(header[key]))) return false;
  return truthLevel !== "canonical" || Boolean(scalar(header.topic_id));
}

function frontmatterMetadata(source: string): { metadata: DetectedMigrationMetadata; complete: boolean } | null {
  if (!source.replace(/^\uFEFF/, "").startsWith("---")) return null;
  try {
    const { header } = parseFrontmatter(source);
    const headerRecord = record(header);
    if (!headerRecord || !hasCanonTrailMarker(headerRecord)) return null;
    return {
      metadata: {
        stand: scalar(headerRecord.stand),
        status: scalar(headerRecord.status),
        truth_level: scalar(headerRecord.truth_level),
        verification: scalar(record(headerRecord.verification)?.state),
        read_if_task_touches: strings(headerRecord.read_if_task_touches),
        primary_systems: strings(headerRecord.primary_systems),
        safe_to_edit: strings(headerRecord.safe_to_edit),
        do_not_use_instead: strings(headerRecord.do_not_use_instead),
      },
      complete: hasCompleteCanonTrailHeader(headerRecord),
    };
  } catch {
    return null;
  }
}

function splitLegacyList(value: string): string[] {
  return value
    .replace(/^\[|\]$/g, "")
    .split(/\s*[,;]\s*/)
    .map((item) => item.replace(/^['"`]|['"`]$/g, "").trim())
    .filter(Boolean);
}

interface LegacySourceLine {
  content: string;
  ending: string;
}

interface ParsedLegacyMetadataLine {
  key: string;
  value: string;
}

interface LegacyHeaderScan {
  bom: string;
  lines: LegacySourceLine[];
  metadataByLine: Map<number, ParsedLegacyMetadataLine>;
}

const RECOGNIZED_LEGACY_KEYS = new Set([
  "stand", "status", "truth level", "truthlevel", "verification", "read if task touches",
  "primary systems", "primary classes/systems", "primary classes", "primary docs", "safe to edit", "do not use instead",
]);

function splitSourceLines(source: string): LegacySourceLine[] {
  const lines: LegacySourceLine[] = [];
  const matcher = /([^\r\n]*)(\r\n|\n|\r|$)/g;
  for (const match of source.matchAll(matcher)) {
    if (!match[0]) break;
    lines.push({ content: match[1]!, ending: match[2]! });
  }
  return lines;
}

function parseLegacyMetadataLine(original: string): ParsedLegacyMetadataLine | null {
  const candidate = original.trim().replace(/^[-*]\s+/, "");
  const patterns = [
    /^\*\*([^:\r\n]{2,40}):\*\*\s*(.*)$/,
    /^\*\*([^:\r\n]{2,40})\*\*\s*:\s*(.*)$/,
    /^\*\*([^:\r\n]{2,40}):\s*(.*?)\*\*\s*$/,
    /^([^:*\r\n][^:\r\n]{1,39}):\s*(.*)$/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(candidate);
    if (!match) continue;
    const key = match[1]!.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
    return { key, value: match[2]!.trim() };
  }
  return null;
}

function fenceMarker(line: string): string | null {
  return /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1] ?? null;
}

function scanLegacyHeader(source: string): LegacyHeaderScan {
  const bom = source.startsWith("\uFEFF") ? "\uFEFF" : "";
  const lines = splitSourceLines(bom ? source.slice(1) : source);
  const metadataByLine = new Map<number, ParsedLegacyMetadataLine>();
  let openFence: { character: string; length: number } | null = null;
  for (let index = 0; index < Math.min(lines.length, 80); index += 1) {
    const line = lines[index]!.content;
    const marker = fenceMarker(line);
    if (openFence) {
      if (marker?.[0] === openFence.character && marker.length >= openFence.length) openFence = null;
      continue;
    }
    if (marker) {
      openFence = { character: marker[0]!, length: marker.length };
      continue;
    }
    if (/^\s*##\s+/.test(line)) break;
    const parsed = parseLegacyMetadataLine(line);
    if (parsed) metadataByLine.set(index, parsed);
  }
  return { bom, lines, metadataByLine };
}

function legacyMetadata(source: string): DetectedMigrationMetadata | null {
  const result = emptyMetadata();
  let recognized = 0;
  for (const { key, value: rawValue } of scanLegacyHeader(source).metadataByLine.values()) {
    const value = rawValue.replace(/\*\*/g, "").trim();
    if (!value) continue;
    if (key === "stand") result.stand = value;
    else if (key === "status") result.status = value;
    else if (key === "truth level" || key === "truthlevel") result.truth_level = value;
    else if (key === "verification") result.verification = value;
    else if (key === "read if task touches") result.read_if_task_touches = splitLegacyList(value);
    else if (["primary systems", "primary classes/systems", "primary classes", "primary docs"].includes(key)) result.primary_systems = splitLegacyList(value);
    else if (key === "safe to edit") result.safe_to_edit = splitLegacyList(value);
    else if (key === "do not use instead") result.do_not_use_instead = splitLegacyList(value);
    else continue;
    recognized += 1;
  }
  return recognized >= 2 ? result : null;
}

function legacyComplete(metadata: DetectedMigrationMetadata): boolean {
  return Boolean(
    metadata.stand && metadata.status && metadata.truth_level && metadata.verification &&
    metadata.read_if_task_touches.length > 0 && metadata.primary_systems.length > 0 &&
    metadata.safe_to_edit.length > 0 && metadata.do_not_use_instead.length > 0,
  );
}

function detectFormat(source: string, adapter: MigrationAdapter): DetectedFormat {
  if (adapter === "canontrail" || adapter === "auto") {
    const detected = frontmatterMetadata(source);
    if (detected) return {
      format: "canontrail-frontmatter",
      metadata: detected.metadata,
      canonTrailHeaderComplete: detected.complete,
      reasons: [detected.complete ? "complete CanonTrail YAML frontmatter detected" : "partial CanonTrail YAML frontmatter requires review"],
    };
    if (adapter === "canontrail") return { format: "plain-markdown", metadata: emptyMetadata(), canonTrailHeaderComplete: false, reasons: ["selected CanonTrail adapter found no recognizable CanonTrail YAML frontmatter"] };
  }
  if (adapter === "legacy-header-v1" || adapter === "auto") {
    const metadata = legacyMetadata(source);
    if (metadata) return { format: "legacy-header-v1", metadata, canonTrailHeaderComplete: false, reasons: ["near-CanonTrail legacy metadata header detected"] };
    if (adapter === "legacy-header-v1") return { format: "plain-markdown", metadata: emptyMetadata(), canonTrailHeaderComplete: false, reasons: ["selected legacy-header-v1 adapter found no supported legacy metadata header"] };
  }
  return { format: "plain-markdown", metadata: emptyMetadata(), canonTrailHeaderComplete: false, reasons: ["no supported structured metadata detected"] };
}

function classifyDocument(relativePath: string, format: MigrationSourceFormat, metadata: DetectedMigrationMetadata, canonTrailHeaderComplete: boolean): Pick<MigrationPlanDocument, "role" | "proposed_action" | "confidence" | "requires_review" | "reasons"> {
  const normalized = `/${relativePath.toLowerCase()}`;
  const truth = metadata.truth_level?.toLowerCase() ?? "";
  const status = metadata.status?.toLowerCase() ?? "";
  if (/(^|\/)thirdparty\//.test(normalized) || /(^|\/)vendor\//.test(normalized)) {
    return { role: "third-party", proposed_action: "exclude-external", confidence: "high", requires_review: false, reasons: ["path identifies third-party or vendor documentation"] };
  }
  if (/(^|\/)(_archive|archive|archived)\//.test(normalized) || ["historical", "archived", "obsolete", "superseded"].some((term) => truth.includes(term) || status.includes(term))) {
    return { role: "historical", proposed_action: "preserve-historical", confidence: "high", requires_review: false, reasons: ["archive path or historical lifecycle metadata detected"] };
  }
  if (/(^|\/)(_review|review)\//.test(normalized)) {
    return { role: "review", proposed_action: "preserve-review", confidence: "high", requires_review: true, reasons: ["review path detected"] };
  }
  if (/(^|\/)handoff\//.test(normalized) || /handoff/.test(path.posix.basename(normalized))) {
    return { role: "handoff", proposed_action: canonTrailHeaderComplete ? "keep" : "review-metadata", confidence: "high", requires_review: !canonTrailHeaderComplete, reasons: ["handoff path or filename detected"] };
  }
  if (format === "canontrail-frontmatter") {
    if (!canonTrailHeaderComplete) {
      return { role: "unknown", proposed_action: "review-metadata", confidence: "low", requires_review: true, reasons: ["CanonTrail markers are present but the complete governed header contract is not satisfied"] };
    }
    const role: MigrationDocumentRole = truth === "canonical" ? "canonical" : truth === "active-snapshot" ? "active-snapshot" : truth === "design-target" ? "design-target" : truth === "historical" ? "historical" : "active-reference";
    return { role, proposed_action: "keep", confidence: "high", requires_review: false, reasons: [`complete governed frontmatter declares truth level '${truth}'`] };
  }
  if (format === "legacy-header-v1" || format === DEPRECATED_MIGRATION_SOURCE_FORMAT) {
    const role: MigrationDocumentRole = status === "canonical" || truth.includes("canonical") || truth.includes("source-of-truth")
      ? "canonical"
      : truth.includes("snapshot")
        ? "active-snapshot"
        : truth.includes("design")
          ? "design-target"
          : "active-reference";
    const complete = legacyComplete(metadata);
    return { role, proposed_action: complete ? "normalize-header" : "review-metadata", confidence: complete ? "medium" : "low", requires_review: true, reasons: [complete ? "legacy header contains the full routable metadata set" : "legacy header is partial and needs human metadata review"] };
  }
  return { role: "unknown", proposed_action: "classify-and-normalize", confidence: "low", requires_review: true, reasons: ["plain Markdown has no authoritative role declaration"] };
}

async function safeDocumentationRoot(root: string, requested: string): Promise<{ absolute: string; relative: string }> {
  if (!requested.trim()) throw new Error("documentation root must not be empty");
  const absolute = path.resolve(root, requested);
  const rootReal = await realpath(root);
  try {
    if ((await lstat(absolute)).isSymbolicLink()) throw new Error(`documentation root must not be a symbolic link: ${requested}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  let resolved: string;
  try {
    resolved = await realpath(absolute);
  } catch {
    throw new Error(`documentation root does not exist: ${requested}`);
  }
  const relativeReal = path.relative(rootReal, resolved);
  if (relativeReal === ".." || relativeReal.startsWith(`..${path.sep}`) || path.isAbsolute(relativeReal)) {
    throw new Error(`documentation root resolves outside the project: ${requested}`);
  }
  if (!(await stat(resolved)).isDirectory()) throw new Error(`documentation root is not a directory: ${requested}`);
  const relative = normalizePath(path.relative(rootReal, resolved)) || ".";
  const rootValidation = normalizedMigrationDocumentationRoots([relative], "migration plan");
  if (rootValidation.errors.length > 0) throw new Error(rootValidation.errors[0]);
  return { absolute: resolved, relative };
}

async function walkDocumentation(rootReal: string, directory: string, files: string[], unprocessed: Array<{ path: string; reason: string }>, ignored: Record<string, number>, ignoredSeen: Set<string>): Promise<void> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    unprocessed.push({ path: normalizePath(path.relative(rootReal, directory)), reason: `directory unreadable: ${(error as Error).message}` });
    return;
  }
  entries.sort((left, right) => compareText(left.name, right.name));
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const relative = normalizePath(path.relative(rootReal, absolute));
    if (entry.isSymbolicLink()) {
      unprocessed.push({ path: relative, reason: "symbolic link not followed" });
    } else if (entry.isDirectory()) {
      const segments = relative.toLowerCase().split("/");
      if (segments.includes(".git") || segments.includes(".agent-context")) {
        unprocessed.push({ path: relative, reason: "reserved .git or .agent-context control tree not scanned" });
        continue;
      }
      await walkDocumentation(rootReal, absolute, files, unprocessed, ignored, ignoredSeen);
    } else if (entry.isFile()) {
      const extension = path.extname(entry.name).toLowerCase() || "[none]";
      if (extension === ".md" || extension === ".markdown") files.push(relative);
      else if (!ignoredSeen.has(relative)) { ignoredSeen.add(relative); ignored[extension] = (ignored[extension] ?? 0) + 1; }
    } else {
      unprocessed.push({ path: relative, reason: "unsupported filesystem entry" });
    }
  }
}

function countValues<T extends string>(values: readonly T[]): Record<T, number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
}

export function computeMigrationPlanHash(plan: Omit<MigrationPlan, "plan_hash">): string {
  return sha256(JSON.stringify(plan));
}

export async function planMigration(options: MigrationPlanOptions): Promise<MigrationPlanReport> {
  if (!/^MIG-[A-Z0-9-]+$/.test(options.migrationId)) throw new Error("migration id must match MIG-[A-Z0-9-]+");
  if (options.documentationRoots.length === 0) throw new Error("at least one documentation root is required");
  const adapter = normalizeMigrationAdapter(options.adapter ?? "auto");
  const root = await realpath(path.resolve(options.root));
  const createdAt = options.createdAt ?? new Date().toISOString();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(createdAt) || Number.isNaN(Date.parse(createdAt))) {
    throw new Error("created-at must be an ISO date-time with a timezone");
  }
  const requestedRoots = await Promise.all(options.documentationRoots.map((item) => safeDocumentationRoot(root, item)));
  const uniqueRoots = [...new Map(requestedRoots.map((item) => [item.relative, item])).values()].sort((left, right) => compareText(left.relative, right.relative));
  const paths = new Set<string>();
  const unprocessed: Array<{ path: string; reason: string }> = [];
  const ignoredByExtension: Record<string, number> = {};
  const ignoredSeen = new Set<string>();
  for (const documentationRoot of uniqueRoots) {
    const discovered: string[] = [];
    await walkDocumentation(root, documentationRoot.absolute, discovered, unprocessed, ignoredByExtension, ignoredSeen);
    for (const item of discovered) paths.add(item);
  }
  const unprocessedKeys = new Set<string>();
  for (let index = unprocessed.length - 1; index >= 0; index -= 1) {
    const entry = unprocessed[index]!;
    const key = JSON.stringify([entry.path, entry.reason]);
    if (unprocessedKeys.has(key)) unprocessed.splice(index, 1);
    else unprocessedKeys.add(key);
  }
  const documents: MigrationPlanDocument[] = [];
  for (const relativePath of [...paths].sort(compareText)) {
    try {
      assertRelativeMigrationPath(relativePath, "migration document path");
    } catch (error) {
      unprocessed.push({ path: relativePath, reason: `unsafe migration document path: ${(error as Error).message}` });
      continue;
    }
    try {
      const bytes = await readFile(path.join(root, ...relativePath.split("/")));
      const source = UTF8_DECODER.decode(bytes);
      const detected = detectFormat(source, adapter);
      const classification = classifyDocument(relativePath, detected.format, detected.metadata, detected.canonTrailHeaderComplete);
      documents.push({
        path: relativePath,
        content_hash: sha256(bytes),
        bytes: bytes.length,
        source_format: detected.format,
        detected_metadata: detected.metadata,
        role: classification.role,
        proposed_action: classification.proposed_action,
        target_path: relativePath,
        confidence: classification.confidence,
        requires_review: classification.requires_review,
        reasons: [...detected.reasons, ...classification.reasons],
      });
    } catch (error) {
      unprocessed.push({ path: relativePath, reason: `file unreadable: ${(error as Error).message}` });
    }
  }
  unprocessed.sort((left, right) => compareText(left.path, right.path) || compareText(left.reason, right.reason));
  const sourceFormats = countValues(SOURCE_FORMATS);
  const roles = countValues(ROLES);
  const actions = countValues(ACTIONS);
  for (const document of documents) {
    sourceFormats[document.source_format] += 1;
    roles[document.role] += 1;
    actions[document.proposed_action] += 1;
  }
  const warnings: string[] = [];
  if (unprocessed.length > 0) warnings.push(`${unprocessed.length} filesystem entries could not be processed and require review`);
  const planWithoutHash: Omit<MigrationPlan, "plan_hash"> = {
    version: 1,
    migration_id: options.migrationId,
    created_at: createdAt,
    mode: "plan-only",
    adapter,
    root: ".",
    documentation_roots: uniqueRoots.map((item) => item.relative),
    summary: {
      documents: documents.length,
      source_formats: sourceFormats,
      roles,
      actions,
      review_required: documents.filter((document) => document.requires_review).length,
      ignored_by_extension: Object.fromEntries(Object.entries(ignoredByExtension).sort(([left], [right]) => compareText(left, right))),
      unreadable: unprocessed.length,
    },
    documents,
    unprocessed,
    warnings,
  };
  const plan: MigrationPlan = { ...planWithoutHash, plan_hash: computeMigrationPlanHash(planWithoutHash) };
  const outputPath = `.agent-context/migrations/${options.migrationId}/migration.plan.json`;
  if (options.apply) {
    const absoluteOutput = path.join(root, ...outputPath.split("/"));
    await mkdir(await controlPath(root, path.dirname(absoluteOutput), "directory"), { recursive: true });
    await writeControlFile(root, absoluteOutput, `${JSON.stringify(plan, null, 2)}\n`);
  }
  return { root, dry_run: !(options.apply ?? false), output_path: outputPath, written: options.apply ?? false, plan };
}

export function formatMigrationPlanReport(report: MigrationPlanReport): string {
  const { summary } = report.plan;
  const lines = [
    `Migration plan ${report.dry_run ? "dry-run" : "applied"}: ${report.plan.migration_id}`,
    `Documents: ${summary.documents}; review required: ${summary.review_required}; unreadable: ${summary.unreadable}`,
    `Formats: ${Object.entries(summary.source_formats).map(([key, value]) => `${key}=${value}`).join(", ")}`,
    `Actions: ${Object.entries(summary.actions).map(([key, value]) => `${key}=${value}`).join(", ")}`,
    `Output: ${report.output_path} (${report.written ? "written" : "not written"})`,
    `Plan hash: ${report.plan.plan_hash}`,
    "Source documents changed: no",
  ];
  for (const warning of report.plan.warnings) lines.push(`WARNING: ${warning}`);
  return lines.join("\n");
}

function assertIsoDateTime(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be an ISO date-time with a timezone`);
  }
}

function assertRelativeMigrationPath(value: string, field: string): string {
  const normalized = normalizePath(path.posix.normalize(value.replace(/\\/g, "/")).replace(/^\.\//, ""));
  if (!normalized || normalized === "." || path.posix.isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../") || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`${field} must be a repository-relative path inside the project`);
  }
  const portableError = portableMigrationPathError(normalized);
  if (portableError) throw new Error(`${field} ${portableError}`);
  return normalized;
}

function portableMigrationPathError(relative: string): string | null {
  for (const segment of relative.split("/")) {
    if (!segment) return "must not contain empty path segments or a trailing separator";
    if (WINDOWS_FORBIDDEN_PATH_CHARACTERS.test(segment)) {
      return "must not use Windows-forbidden characters, control bytes, or alternate-data-stream syntax";
    }
    if (/[. ]$/.test(segment)) {
      return "must not use a path segment ending in a dot or space";
    }
    const basename = (segment.split(".", 1)[0] ?? "").replace(/[. ]+$/, "");
    if (WINDOWS_DEVICE_BASENAME.test(basename)) {
      return `must not use the Windows reserved device name '${basename}'`;
    }
  }
  return null;
}

function normalizedMigrationDocumentationRoots(documentationRoots: unknown, owner = "migration transaction"): { roots: string[]; errors: string[] } {
  if (!Array.isArray(documentationRoots) || documentationRoots.length === 0) {
    return { roots: [], errors: [`${owner} documentation_roots must contain at least one reviewed root`] };
  }
  const roots: string[] = [];
  const errors: string[] = [];
  for (const [index, input] of documentationRoots.entries()) {
    if (typeof input !== "string" || !input.trim()) {
      errors.push(`${owner} documentation_roots[${index}] must be a non-empty repository-relative path`);
      continue;
    }
    const forward = input.replace(/\\/g, "/");
    const normalized = normalizePath(path.posix.normalize(forward).replace(/^\.\//, "")) || ".";
    if (input !== normalized) {
      errors.push(`${owner} documentation root must be normalized with forward slashes: ${input}`);
      continue;
    }
    if (normalized !== ".") {
      try {
        assertRelativeMigrationPath(normalized, `${owner} documentation root`);
      } catch (error) {
        errors.push((error as Error).message);
        continue;
      }
      const segments = normalized.toLowerCase().split("/");
      if (segments.includes(".git") || segments.includes(".agent-context")) {
        errors.push(`${owner} documentation root must not use reserved .git or .agent-context trees: ${normalized}`);
        continue;
      }
    }
    roots.push(normalized);
  }
  if (new Set(roots).size !== roots.length) errors.push(`${owner} documentation_roots must be unique`);
  if (!isDeepStrictEqual(roots, [...roots].sort(compareText))) {
    errors.push(`${owner} documentation_roots must be deterministically sorted`);
  }
  return { roots, errors };
}

export function migrationDocumentationRootErrors(documentationRoots: unknown, owner = "migration transaction"): string[] {
  return normalizedMigrationDocumentationRoots(documentationRoots, owner).errors;
}

function migrationDocumentationPathError(relativeInput: unknown, documentationRoots: readonly string[]): string | null {
  if (typeof relativeInput !== "string") return "migration document path must be a string";
  let relative: string;
  try {
    relative = assertRelativeMigrationPath(relativeInput, "migration document path");
  } catch (error) {
    return (error as Error).message;
  }
  if (relativeInput !== relative) return "migration document path must be normalized with forward slashes";
  const segments = relative.toLowerCase().split("/");
  if (segments.includes(".git") || segments.includes(".agent-context")) {
    return "migration documents must not target reserved .git or .agent-context trees";
  }
  const extension = path.posix.extname(relative).toLowerCase();
  if (extension !== ".md" && extension !== ".markdown") {
    return "migration documents must use a Markdown .md or .markdown path";
  }
  if (!documentationRoots.some((root) => {
    return root === "." || relative === root || relative.startsWith(`${root}/`);
  })) {
    return "migration document is outside the transaction-bound reviewed documentation roots";
  }
  return null;
}

export function migrationPlanDocumentBindingErrors(
  documentationRoots: unknown,
  documents: Array<{ path?: unknown; target_path?: unknown }>,
): string[] {
  const rootValidation = normalizedMigrationDocumentationRoots(documentationRoots, "migration plan");
  if (rootValidation.errors.length > 0) return [];
  const errors: string[] = [];
  for (const [index, document] of documents.entries()) {
    const sourceError = migrationDocumentationPathError(document.path, rootValidation.roots);
    const targetError = migrationDocumentationPathError(document.target_path, rootValidation.roots);
    if (sourceError) errors.push(`migration plan document ${index} source path is unsafe: ${sourceError}`);
    if (targetError) errors.push(`migration plan document ${index} target path is unsafe: ${targetError}`);
  }
  return errors;
}

async function safeMigrationPath(root: string, relativeInput: string, mustExist: boolean, documentationRoots?: readonly string[]): Promise<string> {
  const relative = assertRelativeMigrationPath(relativeInput, "migration path");
  if (documentationRoots) {
    const policyError = migrationDocumentationPathError(relativeInput, documentationRoots);
    if (policyError) throw new Error(policyError);
  }
  const rootReal = await realpath(root);
  const segments = relative.split("/");
  let cursor = rootReal;
  for (let index = 0; index < segments.length; index += 1) {
    cursor = path.join(cursor, segments[index]!);
    try {
      const entry = await lstat(cursor);
      if (entry.isSymbolicLink()) throw new Error(`migration path must not traverse a symbolic link: ${relative}`);
      const resolved = await realpath(cursor);
      const fromRoot = path.relative(rootReal, resolved);
      if (fromRoot === ".." || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) {
        throw new Error(`migration path resolves outside the project: ${relative}`);
      }
      if (documentationRoots) {
        const resolvedRelative = normalizePath(fromRoot);
        const resolvedSegments = resolvedRelative.toLowerCase().split("/");
        if (resolvedSegments.includes(".git") || resolvedSegments.includes(".agent-context")) {
          throw new Error(`migration document resolves into a reserved control tree: ${relative}`);
        }
        // An 8.3 name or case alias is not the exact hash-bound stored spelling.
        // Check every component, including parents of a not-yet-existing target.
        // POSIX realpath can retain the requested case/Unicode alias spelling.
        // Require the actual parent directory entry as well as resolved containment.
        const storedNames = await readdir(path.dirname(cursor));
        if (resolvedRelative !== segments.slice(0, index + 1).join("/") || !storedNames.includes(segments[index]!)) {
          throw new Error(`migration document path uses a filesystem alias instead of its exact stored spelling: ${relative}`);
        }
      }
      cursor = resolved;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (mustExist) throw new Error(`migration path does not exist: ${relative}`);
      cursor = path.join(cursor, ...segments.slice(index + 1));
      break;
    }
  }
  if (mustExist) {
    const value = await stat(cursor);
    if (!value.isFile()) throw new Error(`migration path is not a file: ${relative}`);
  }
  return cursor;
}

/** Read-only identity checks; missing historical documents do not become drift errors. */
export async function migrationDocumentResolutionErrors(root: string, documentationRoots: unknown, paths: unknown[]): Promise<string[]> {
  const validation = normalizedMigrationDocumentationRoots(documentationRoots);
  if (validation.errors.length > 0) return [];
  const errors: string[] = [];
  for (const relative of new Set(paths.filter((value): value is string => typeof value === "string"))) {
    // Lexical errors have their own binding diagnostics.
    if (migrationDocumentationPathError(relative, validation.roots)) continue;
    try {
      await safeMigrationPath(root, relative, false, validation.roots);
    } catch (error) {
      errors.push(`${relative}: ${(error as Error).message}`);
    }
  }
  return errors;
}

function stripRecognizedLegacyMetadata(source: string): { bom: string; body: string; eol: string } {
  const scan = scanLegacyHeader(source);
  // Never strip recognized-looking keys out of an unmarked leading YAML frontmatter block:
  // mixed frontmatter/legacy input stays review-gated and the block is preserved verbatim.
  let frontmatterEnd = -1;
  if ((scan.lines[0]?.content ?? "").trim() === "---") {
    for (let index = 1; index < scan.lines.length; index += 1) {
      if ((scan.lines[index]?.content ?? "").trim() === "---") {
        frontmatterEnd = index;
        break;
      }
    }
  }
  const body = scan.lines
    .filter((_line, index) => index <= frontmatterEnd || !RECOGNIZED_LEGACY_KEYS.has(scan.metadataByLine.get(index)?.key ?? ""))
    .map((line) => `${line.content}${line.ending}`)
    .join("");
  const eol = scan.lines.find((line) => line.ending)?.ending ?? "\n";
  return { bom: scan.bom, body, eol };
}

function legacyVerificationStatements(source: string): string[] {
  return [...scanLegacyHeader(source).metadataByLine.values()]
    .filter(({ key, value }) => key === "verification" && Boolean(value))
    .map(({ value }) => value);
}

function migratedVerificationHeading(body: string): string {
  const headings = new Set(splitSourceLines(body)
    .map(({ content }) => /^\s*##\s+(.+?)\s*$/.exec(content)?.[1]?.toLowerCase())
    .filter((heading): heading is string => Boolean(heading)));
  const base = "Migrated legacy verification";
  if (!headings.has(base.toLowerCase())) return base;
  let suffix = 2;
  while (headings.has(`${base.toLowerCase()} (${suffix})`)) suffix += 1;
  return `${base} (${suffix})`;
}

function migratedVerificationProvenance(body: string, statements: string[], eol: string): string | null {
  if (statements.length === 0) return null;
  const explanation = statements.length === 1
    ? "The following text was preserved verbatim from a legacy `Verification:` declaration as migration provenance. CanonTrail has not independently verified or promoted this statement."
    : "The following text was preserved verbatim from legacy `Verification:` declarations as migration provenance. CanonTrail has not independently verified or promoted these statements.";
  return [
    `## ${migratedVerificationHeading(body)}`,
    "",
    explanation,
    "",
    ...statements.flatMap((statement, index) => [
      ...(index > 0 ? [""] : []),
      `> ${statement}`,
    ]),
  ].join(eol);
}

function insertBeforeFirstSecondLevelHeading(body: string, section: string, eol: string): string {
  const lines = splitSourceLines(body);
  let openFence: { character: string; length: number } | null = null;
  let insertionIndex = lines.length;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.content;
    const marker = fenceMarker(line);
    if (openFence) {
      if (marker?.[0] === openFence.character && marker.length >= openFence.length) openFence = null;
      continue;
    }
    if (marker) {
      openFence = { character: marker[0]!, length: marker.length };
      continue;
    }
    if (/^\s*##\s+/.test(line)) {
      insertionIndex = index;
      break;
    }
  }
  const before = lines.slice(0, insertionIndex).map((line) => `${line.content}${line.ending}`).join("");
  const after = lines.slice(insertionIndex).map((line) => `${line.content}${line.ending}`).join("");
  const originalEndedWithEol = /(?:\r\n|\n|\r)$/.test(body);
  const separatedBefore = before.length === 0
    ? ""
    : before.endsWith(`${eol}${eol}`)
      ? before
      : before.endsWith(eol)
        ? `${before}${eol}`
        : `${before}${eol}${eol}`;
  if (after) return `${separatedBefore}${section}${eol}${eol}${after}`;
  return `${separatedBefore}${section}${originalEndedWithEol ? eol : ""}`;
}

function normalizedLegacySource(source: string, header: MigrationTargetHeader): string {
  if (!hasCompleteCanonTrailHeader(header as unknown as Record<string, unknown>)) {
    throw new Error("review decision target_header is not a complete CanonTrail header");
  }
  const stripped = stripRecognizedLegacyMetadata(source);
  const provenance = migratedVerificationProvenance(stripped.body, legacyVerificationStatements(source), stripped.eol);
  const body = provenance ? insertBeforeFirstSecondLevelHeading(stripped.body, provenance, stripped.eol) : stripped.body;
  const serializedHeader = stringify(header, { lineWidth: 0 }).trimEnd().replace(/\n/g, stripped.eol);
  return `${stripped.bom}---${stripped.eol}${serializedHeader}${stripped.eol}---${stripped.eol}${stripped.eol}${body}`;
}

export function computeMigrationTransactionHash(transaction: Omit<MigrationTransaction, "transaction_hash">): string {
  return sha256(JSON.stringify(transaction));
}

function canonicalDecisionSet(decisionSet: MigrationDecisionSet): MigrationDecisionSet {
  // The reviewed decision set is hash-bound, so it is rebuilt in a fixed field order.
  // JSON object member order must not decide whether a valid transaction stays executable.
  return {
    version: 1,
    migration_id: decisionSet.migration_id,
    plan_hash: decisionSet.plan_hash,
    reviewed_by: decisionSet.reviewed_by,
    reviewed_at: decisionSet.reviewed_at,
    decisions: decisionSet.decisions,
  };
}

export function computeMigrationDecisionSetHash(decisions: MigrationDecisionSet): string {
  return sha256(JSON.stringify(decisions));
}

export function computeMigrationExecutionRecordHash(recordValue: Omit<MigrationExecutionRecord, "record_hash">): string {
  return sha256(JSON.stringify(recordValue));
}

export function computeMigrationApplyIntentHash(intent: Omit<MigrationApplyIntent, "record_hash">): string {
  return sha256(JSON.stringify(intent));
}

export function migrationExecutionEvidenceBindingErrors(
  evidence: { kind?: unknown; transaction_hash?: unknown; operations?: unknown },
  transaction: Pick<MigrationTransaction, "transaction_hash" | "operations">,
): string[] {
  const errors: string[] = [];
  if (evidence.transaction_hash !== transaction.transaction_hash) {
    errors.push("migration execution evidence does not reference its parent transaction hash");
  }
  const rawOperations: unknown = transaction.operations;
  if (!Array.isArray(rawOperations) || rawOperations.some((operation) => record(operation) === null || record(record(operation)?.target_precondition) === null)) {
    return [...errors, "parent migration transaction operations are malformed"];
  }
  const operations = rawOperations as MigrationTransactionOperation[];
  let expected: unknown[];
  if (evidence.kind === "migration-apply-intent") {
    expected = operations.map((operation) => ({
      operation_id: operation.operation_id,
      source_path: operation.source_path,
      target_path: operation.target_path,
      source_hash: operation.source_hash,
      output_hash: operation.output_hash,
    }));
  } else if (evidence.kind === "migration-apply") {
    expected = operations.map((operation) => ({
      operation_id: operation.operation_id,
      path: operation.target_path,
      before_hash: operation.target_precondition.content_hash,
      after_hash: operation.output_hash,
    }));
  } else if (evidence.kind === "migration-rollback") {
    expected = operations.map((operation) => ({
      operation_id: operation.operation_id,
      path: operation.target_path,
      before_hash: operation.output_hash,
      after_hash: operation.target_precondition.content_hash,
    }));
  } else {
    return [...errors, "migration execution evidence kind is unsupported"];
  }
  if (!isDeepStrictEqual(evidence.operations, expected)) {
    errors.push("migration execution evidence operations do not match the parent transaction");
  }
  return errors;
}

export function migrationTransactionBindingErrors(
  transaction: Pick<MigrationTransaction, "documentation_roots" | "decisions" | "operations">
    & Partial<Pick<MigrationTransaction, "blockers">>,
): string[] {
  const errors: string[] = [];
  const rootValidation = normalizedMigrationDocumentationRoots(transaction.documentation_roots);
  errors.push(...rootValidation.errors);
  const decisionsByPath = new Map<string, MigrationReviewDecision>();
  const decisionPaths = transaction.decisions.map((decision) => decision.path);
  if (!isDeepStrictEqual(decisionPaths, [...decisionPaths].sort(compareText))) {
    errors.push("migration reviewed decisions must be deterministically sorted by path");
  }
  for (const decision of transaction.decisions) {
    if (rootValidation.errors.length === 0) {
      const decisionPathError = migrationDocumentationPathError(decision.path, rootValidation.roots);
      const targetPathError = migrationDocumentationPathError(decision.target_path, rootValidation.roots);
      if (decisionPathError) errors.push(`reviewed decision ${decision.path} source path is unsafe: ${decisionPathError}`);
      if (targetPathError) errors.push(`reviewed decision ${decision.path} target path is unsafe: ${targetPathError}`);
    }
    if (decisionsByPath.has(decision.path)) {
      errors.push(`duplicate reviewed decision for ${decision.path}`);
      continue;
    }
    decisionsByPath.set(decision.path, decision);
  }
  const operationSources = new Set<string>();
  const operationIds = new Set<string>();
  const operationSourceOrder = transaction.operations.map((operation) => operation.source_path);
  if (!isDeepStrictEqual(operationSourceOrder, [...operationSourceOrder].sort(compareText))) {
    errors.push("migration operations must be deterministically sorted by source path");
  }
  for (const [index, operation] of transaction.operations.entries()) {
    const expectedOperationId = `OP-${String(index + 1).padStart(4, "0")}`;
    if (operationIds.has(operation.operation_id)) {
      errors.push(`duplicate migration operation id ${operation.operation_id}`);
    } else {
      operationIds.add(operation.operation_id);
    }
    if (operation.operation_id !== expectedOperationId) {
      errors.push(`migration operation at index ${index} must use deterministic id ${expectedOperationId}`);
    }
    if (operationSources.has(operation.source_path)) {
      errors.push(`duplicate migration operation for ${operation.source_path}`);
      continue;
    }
    operationSources.add(operation.source_path);
    const sourcePathError = rootValidation.errors.length === 0
      ? migrationDocumentationPathError(operation.source_path, rootValidation.roots)
      : null;
    const targetPathError = rootValidation.errors.length === 0
      ? migrationDocumentationPathError(operation.target_path, rootValidation.roots)
      : null;
    if (sourcePathError) errors.push(`operation ${operation.operation_id} source path is unsafe: ${sourcePathError}`);
    if (targetPathError) errors.push(`operation ${operation.operation_id} target path is unsafe: ${targetPathError}`);
    if (operation.target_path !== operation.source_path) {
      errors.push(`operation ${operation.operation_id} requests unsupported relocation; normalize-header is in-place only`);
    }
    if (operation.target_precondition.state !== "same-as-source" || operation.target_precondition.content_hash !== operation.source_hash) {
      errors.push(`operation ${operation.operation_id} does not use the required in-place source precondition`);
    }
    const decision = decisionsByPath.get(operation.source_path);
    if (!decision || decision.decision !== "execute") {
      errors.push(`operation ${operation.operation_id} has no matching execute decision`);
      continue;
    }
    if (decision.action !== operation.action) {
      errors.push(`operation ${operation.operation_id} action does not match its reviewed decision`);
    }
    if (decision.target_path !== operation.target_path) {
      errors.push(`operation ${operation.operation_id} target path does not match its reviewed decision`);
    }
    if (decision.target_path !== decision.path) {
      errors.push(`operation ${operation.operation_id} is bound to an unsupported relocation decision`);
    }
    if (!decision.target_header || !isDeepStrictEqual(decision.target_header, operation.target_header)) {
      errors.push(`operation ${operation.operation_id} target header does not match its reviewed decision`);
    }
  }
  const blockerFree = !Array.isArray(transaction.blockers) || transaction.blockers.length === 0;
  for (const decision of transaction.decisions) {
    if (blockerFree && decision.decision === "execute" && !operationSources.has(decision.path)) {
      errors.push(`reviewed execute decision for ${decision.path} has no matching migration operation`);
    }
  }
  return errors;
}

function validateDecisionSet(plan: MigrationPlan, decisions: MigrationDecisionSet | undefined): Map<string, MigrationReviewDecision> {
  if (!decisions) return new Map();
  if (decisions.version !== 1 || decisions.migration_id !== plan.migration_id || decisions.plan_hash !== plan.plan_hash) {
    throw new Error("decision set does not match the migration plan identity");
  }
  const knownDecisionKeys = new Set(["version", "migration_id", "plan_hash", "reviewed_by", "reviewed_at", "decisions"]);
  const unknownDecisionKeys = Object.keys(decisions).filter((key) => !knownDecisionKeys.has(key));
  if (unknownDecisionKeys.length > 0) {
    throw new Error(`decision set contains unsupported top-level keys: ${unknownDecisionKeys.join(", ")}`);
  }
  if (!decisions.reviewed_by.trim()) throw new Error("decision set reviewed_by must not be empty");
  assertIsoDateTime(decisions.reviewed_at, "decision reviewed_at");
  const result = new Map<string, MigrationReviewDecision>();
  for (const decision of decisions.decisions) {
    const decisionPath = assertRelativeMigrationPath(decision.path, "decision path");
    if (result.has(decisionPath)) throw new Error(`duplicate migration decision for ${decisionPath}`);
    if (!decision.reason.trim()) throw new Error(`migration decision reason must not be empty for ${decisionPath}`);
    if (decision.decision === "execute" && !decision.target_header) throw new Error(`execute decision requires target_header for ${decisionPath}`);
    result.set(decisionPath, { ...decision, path: decisionPath, target_path: assertRelativeMigrationPath(decision.target_path, "decision target_path") });
  }
  return result;
}

export async function prepareMigrationTransformation(options: MigrationTransformationOptions): Promise<MigrationTransformationReport> {
  if (options.showContent && options.apply) throw new Error("show-content is read-only and cannot be combined with apply");
  if (!/^MTX-[A-Z0-9-]+$/.test(options.transactionId)) throw new Error("transaction id must match MTX-[A-Z0-9-]+");
  const planReport = await planMigration({ ...options, apply: false });
  const plan = planReport.plan;
  const decisions = validateDecisionSet(plan, options.decisions);
  const normalizedDecisionSet = options.decisions ? canonicalDecisionSet({
    ...options.decisions,
    decisions: [...decisions.values()].sort((left, right) => compareText(left.path, right.path)),
  }) : null;
  const root = planReport.root;
  const blockers: MigrationTransaction["blockers"] = [];
  const operations: MigrationTransactionOperation[] = [];
  const contentPreview: MigrationContentPreview = { version: 1, encoding: "utf-8", views: [] };
  let skipped = 0;
  for (const document of plan.documents) {
    const decision = decisions.get(document.path);
    if (["keep", "preserve-historical", "preserve-review", "exclude-external"].includes(document.proposed_action) && !decision) {
      skipped += 1;
      continue;
    }
    if (!decision) {
      blockers.push({ path: document.path, code: "REVIEW_REQUIRED", reason: `no reviewed decision for ${document.proposed_action}` });
      continue;
    }
    if (decision.decision === "skip") {
      skipped += 1;
      continue;
    }
    if (document.proposed_action !== "normalize-header" || document.source_format !== "legacy-header-v1") {
      blockers.push({ path: document.path, code: "UNSUPPORTED_ACTION", reason: `execution of ${document.proposed_action} is not implemented; review must skip or defer it` });
      continue;
    }
    if (decision.action !== document.proposed_action || !decision.target_header) {
      blockers.push({ path: document.path, code: "DECISION_MISMATCH", reason: "review decision does not match the planned action or lacks a complete target header" });
      continue;
    }
    const sourcePathError = migrationDocumentationPathError(document.path, plan.documentation_roots);
    const targetPathError = migrationDocumentationPathError(decision.target_path, plan.documentation_roots);
    if (sourcePathError) {
      blockers.push({ path: document.path, code: "UNSAFE_SOURCE_PATH", reason: sourcePathError });
      continue;
    }
    if (targetPathError) {
      blockers.push({ path: decision.target_path, code: "UNSAFE_TARGET_PATH", reason: targetPathError });
      continue;
    }
    if (decision.target_path !== document.path) {
      blockers.push({ path: document.path, code: "RELOCATION_UNSUPPORTED", reason: "normalize-header is in-place only; moving or copying documentation requires a separately reviewed relocation policy" });
      continue;
    }
    try {
      const sourcePath = await safeMigrationPath(root, document.path, true, plan.documentation_roots);
      const current = await readFile(sourcePath);
      if (sha256(current) !== document.content_hash) {
        blockers.push({ path: document.path, code: "SOURCE_DRIFT", reason: "source hash no longer matches the reviewed migration plan" });
        continue;
      }
      const output = Buffer.from(normalizedLegacySource(UTF8_DECODER.decode(current), decision.target_header), "utf8");
      const operation: MigrationTransactionOperation = {
        operation_id: `OP-${String(operations.length + 1).padStart(4, "0")}`,
        action: "normalize-header",
        source_path: document.path,
        target_path: decision.target_path,
        source_hash: document.content_hash,
        target_precondition: { state: "same-as-source", content_hash: document.content_hash },
        output_hash: sha256(output),
        output_bytes: output.length,
        target_header: decision.target_header,
      };
      const view = options.showContent ? createMigrationContentView(operation, current, output) : undefined;
      operations.push(operation);
      if (view) contentPreview.views.push(view);
    } catch (error) {
      blockers.push({ path: document.path, code: "PREVIEW_ERROR", reason: (error as Error).message });
    }
  }
  for (const decisionPath of decisions.keys()) {
    if (!plan.documents.some((document) => document.path === decisionPath)) {
      blockers.push({ path: decisionPath, code: "UNKNOWN_DECISION", reason: "decision path is not present in the migration plan" });
    }
  }
  blockers.sort((left, right) => compareText(left.path, right.path) || compareText(left.code, right.code));
  const createdAt = options.createdAt ?? new Date().toISOString();
  assertIsoDateTime(createdAt, "created-at");
  const payload: Omit<MigrationTransaction, "transaction_hash"> = {
    version: 2,
    transaction_id: options.transactionId,
    migration_id: plan.migration_id,
    created_at: createdAt,
    mode: "transformation-preview",
    plan_hash: plan.plan_hash,
    decision_hash: normalizedDecisionSet ? computeMigrationDecisionSetHash(normalizedDecisionSet) : null,
    reviewed_by: normalizedDecisionSet?.reviewed_by ?? null,
    reviewed_at: normalizedDecisionSet?.reviewed_at ?? null,
    decisions: normalizedDecisionSet?.decisions ?? [],
    root: ".",
    documentation_roots: plan.documentation_roots,
    operations,
    blockers,
    summary: { operations: operations.length, blockers: blockers.length, skipped },
  };
  const transaction: MigrationTransaction = { ...payload, transaction_hash: computeMigrationTransactionHash(payload) };
  const outputPath = `.agent-context/migrations/${plan.migration_id}/transactions/${options.transactionId}/transaction.json`;
  if (options.apply) {
    const absolute = path.join(root, ...outputPath.split("/"));
    await mkdir(await controlPath(root, path.dirname(absolute), "directory"), { recursive: true });
    await writeControlFile(root, absolute, `${JSON.stringify(transaction, null, 2)}\n`);
  }
  return {
    root, dry_run: !(options.apply ?? false), output_path: outputPath, written: options.apply ?? false, transaction,
    ...(options.showContent ? { content_preview: contentPreview } : {}),
  };
}

async function readTransaction(root: string, transactionInput: string): Promise<{ path: string; value: MigrationTransaction }> {
  const relative = assertRelativeMigrationPath(transactionInput, "transaction path");
  const absolute = await resolveMigrationControlPath(root, relative, "file");
  const parsed: unknown = JSON.parse(await readFile(absolute, "utf8"));
  if (record(parsed) === null) throw new Error("migration transaction must be a JSON object");
  const value = parsed as MigrationTransaction;
  const { transaction_hash: supplied, ...payload } = value;
  if (supplied !== computeMigrationTransactionHash(payload)) throw new Error("migration transaction self-hash is invalid");
  if (value.version !== 2) throw new Error("migration transaction version 2 with hash-bound documentation_roots is required for execution or rollback");
  const rootValidation = normalizedMigrationDocumentationRoots(value.documentation_roots);
  if (rootValidation.errors.length > 0) {
    throw new Error(`migration operations are not bound to reviewed decisions: ${rootValidation.errors.join("; ")}`);
  }
  const bindableShape = Array.isArray(value.decisions)
    && value.decisions.every((decision) => record(decision) !== null)
    && Array.isArray(value.operations)
    && value.operations.every((operation) => record(operation) !== null && record(record(operation)?.target_precondition) !== null);
  if (bindableShape) {
    const bindingErrors = migrationTransactionBindingErrors(value);
    if (bindingErrors.length > 0) throw new Error(`migration operations are not bound to reviewed decisions: ${bindingErrors.join("; ")}`);
  }
  const validateShape = await migrationTransactionValidator();
  if (!validateShape(value)) {
    throw new Error(`migration transaction does not conform to the shipped version-2 schema: ${migrationTransactionSchemaErrors(validateShape)}`);
  }
  const identity = /^\.agent-context\/migrations\/([^/]+)\/transactions\/([^/]+)\/transaction\.json$/.exec(relative);
  if (!identity || identity[1] !== value.migration_id || identity[2] !== value.transaction_id) throw new Error("migration transaction identity does not match its path");
  if (value.summary.operations !== value.operations.length || value.summary.blockers !== value.blockers.length) throw new Error("migration transaction summary is inconsistent");
  const resolutionErrors = await migrationDocumentResolutionErrors(root, value.documentation_roots, [
    ...value.decisions.flatMap((decision) => [decision.path, decision.target_path]),
    ...value.operations.flatMap((operation) => [operation.source_path, operation.target_path]),
  ]);
  if (resolutionErrors.length > 0) throw new Error(`migration document identity is unsafe: ${resolutionErrors.join("; ")}`);
  if (value.blockers.length > 0) throw new Error("migration transaction has unresolved blockers");
  if (value.operations.length > 0 && (!value.reviewed_by?.trim() || !value.reviewed_at || !value.decision_hash || value.decisions.length === 0)) {
    throw new Error("migration transaction operations require reviewed decisions");
  }
  if (value.decision_hash) {
    const decisionSet = canonicalDecisionSet({
      version: 1,
      migration_id: value.migration_id,
      plan_hash: value.plan_hash,
      reviewed_by: value.reviewed_by ?? "",
      reviewed_at: value.reviewed_at ?? "",
      decisions: value.decisions,
    });
    if (computeMigrationDecisionSetHash(decisionSet) !== value.decision_hash) throw new Error("migration decision-set hash is invalid");
  }
  if (!bindableShape) {
    const bindingErrors = migrationTransactionBindingErrors(value);
    if (bindingErrors.length > 0) throw new Error(`migration operations are not bound to reviewed decisions: ${bindingErrors.join("; ")}`);
  }
  return { path: relative, value };
}

async function currentHash(absolute: string): Promise<string | null> {
  try {
    return sha256(await readFile(absolute));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function pathExists(absolute: string): Promise<boolean> {
  try {
    await lstat(absolute);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function controlPath(root: string, absolute: string, kind: "file" | "directory", mustExist = false): Promise<string> {
  return resolveMigrationControlPath(root, normalizePath(path.relative(root, absolute)), kind, mustExist);
}

async function writeControlFile(root: string, absolute: string, bytes: string | Buffer): Promise<void> {
  const checked = await controlPath(root, absolute, "file");
  await writeFile(checked, bytes, { flag: "wx" });
}

async function readJsonIfExists<T>(root: string, absolute: string, label: string): Promise<T | null> {
  try {
    const checked = await controlPath(root, absolute, "file");
    return JSON.parse(await readFile(checked, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(`${label} could not be read: ${(error as Error).message}`);
  }
}

async function validateExecutionRecord(value: unknown, transaction: MigrationTransaction, kind: MigrationExecutionRecord["kind"], label: string): Promise<MigrationExecutionRecord> {
  const validateShape = await migrationExecutionValidator();
  if (!validateShape(value)) {
    throw new Error(`${label} does not conform to the shipped execution-evidence schema: ${migrationTransactionSchemaErrors(validateShape)}`);
  }
  const evidence = value as MigrationExecutionRecord;
  const { record_hash: supplied, ...payload } = evidence;
  const bindingErrors = migrationExecutionEvidenceBindingErrors(evidence, transaction);
  if (supplied !== computeMigrationExecutionRecordHash(payload) || evidence.kind !== kind || bindingErrors.length > 0) {
    throw new Error(`${label} is invalid or belongs to a different transaction`);
  }
  return evidence;
}

async function validateApplyIntent(value: unknown, transaction: MigrationTransaction): Promise<MigrationApplyIntent> {
  const validateShape = await migrationExecutionValidator();
  if (!validateShape(value)) {
    throw new Error(`migration apply intent does not conform to the shipped execution-evidence schema: ${migrationTransactionSchemaErrors(validateShape)}`);
  }
  const intent = value as MigrationApplyIntent;
  const { record_hash: supplied, ...payload } = intent;
  const bindingErrors = migrationExecutionEvidenceBindingErrors(intent, transaction);
  if (supplied !== computeMigrationApplyIntentHash(payload) || intent.kind !== "migration-apply-intent" || bindingErrors.length > 0) {
    throw new Error("migration apply intent is invalid or belongs to a different transaction");
  }
  return intent;
}

async function validateStagedMigrationImages(root: string, executionDirectory: string, transaction: MigrationTransaction): Promise<Map<string, { before: Buffer; after: Buffer }>> {
  const result = new Map<string, { before: Buffer; after: Buffer }>();
  for (const operation of transaction.operations) {
    let before: Buffer;
    let after: Buffer;
    try {
      before = await readFile(await controlPath(root, path.join(executionDirectory, `${operation.operation_id}.before.bin`), "file", true));
      after = await readFile(await controlPath(root, path.join(executionDirectory, `${operation.operation_id}.after.bin`), "file", true));
    } catch (error) {
      throw new Error(`migration recovery evidence is incomplete for ${operation.operation_id}: ${(error as Error).message}`);
    }
    if (sha256(before) !== operation.source_hash) {
      throw new Error(`migration recovery preimage hash mismatch for ${operation.operation_id}`);
    }
    if (sha256(after) !== operation.output_hash || after.length !== operation.output_bytes) {
      throw new Error(`migration recovery postimage hash or size mismatch for ${operation.operation_id}`);
    }
    result.set(operation.operation_id, { before, after });
  }
  return result;
}

async function writeAtomic(absolute: string, bytes: Buffer, token: string): Promise<void> {
  await mkdir(path.dirname(absolute), { recursive: true });
  // Unique suffix: a leftover from a killed run must not block later transactions
  // for the same document (operation ids restart per transaction).
  const temporary = `${absolute}.canontrail-${token}-${process.pid}-${Date.now().toString(36)}.tmp`;
  // Atomic replacement must not widen a private document's basic POSIX permissions.
  // ACLs, ownership, xattrs and timestamps are not a byte-rollback guarantee.
  let mode: number | undefined;
  if (process.platform !== "win32") {
    try { mode = (await stat(absolute)).mode & 0o777; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  await writeFile(temporary, bytes, { flag: "wx", mode: mode ?? 0o600 });
  try {
    if (mode !== undefined) await chmod(temporary, mode);
    await rename(temporary, absolute);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export interface MigrationExecutionTestHooks {
  beforeEvidenceRecordWrite?: (kind: MigrationExecutionRecord["kind"]) => Promise<void>;
  beforeIntentWrite?: () => Promise<void>;
  beforeImmediateWriteCheck?: (operation: MigrationTransactionOperation) => Promise<void>;
  beforeImmediateRollbackCheck?: (operation: MigrationTransactionOperation) => Promise<void>;
}

export async function executeMigrationTransaction(rootInput: string, transactionInput: string, confirmationHash: string, observedAt = new Date().toISOString(), testHooks?: MigrationExecutionTestHooks): Promise<MigrationExecutionRecord> {
  assertIsoDateTime(observedAt, "observed-at");
  const root = await realpath(path.resolve(rootInput));
  const loaded = await readTransaction(root, transactionInput);
  const transaction = loaded.value;
  if (confirmationHash !== transaction.transaction_hash) throw new Error("confirmation hash does not match the migration transaction");
  const transactionDirectory = path.dirname(path.join(root, ...loaded.path.split("/")));
  const executionDirectory = await controlPath(root, path.join(transactionDirectory, "execution"), "directory");
  const rollbackPath = path.join(executionDirectory, "rollback.record.json");
  const applyPath = path.join(executionDirectory, "apply.record.json");
  const intentPath = path.join(executionDirectory, "intent.json");
  const previousRollback = await readJsonIfExists<MigrationExecutionRecord>(root, rollbackPath, "migration rollback record");
  if (previousRollback) {
    await validateExecutionRecord(previousRollback, transaction, "migration-rollback", "migration rollback record");
    throw new Error("migration transaction was already rolled back; transaction ids are single-use and cannot be executed again");
  }
  const previousApply = await readJsonIfExists<MigrationExecutionRecord>(root, applyPath, "migration apply record");
  if (previousApply) {
    const validatedApply = await validateExecutionRecord(previousApply, transaction, "migration-apply", "migration apply record");
    const previousIntent = await readJsonIfExists<MigrationApplyIntent>(root, intentPath, "migration apply intent");
    if (!previousIntent) throw new Error("migration execution evidence is incomplete; a completed apply is missing its intent record");
    await validateApplyIntent(previousIntent, transaction);
    await validateStagedMigrationImages(root, executionDirectory, transaction);
    return validatedApply;
  }
  if (await pathExists(executionDirectory)) {
    const previousIntent = await readJsonIfExists<MigrationApplyIntent>(root, intentPath, "migration apply intent");
    if (previousIntent) {
      await validateApplyIntent(previousIntent, transaction);
      await validateStagedMigrationImages(root, executionDirectory, transaction);
      throw new Error("migration execution is incomplete; run rollback with the same transaction hash, then create a new transaction id for another attempt");
    }
    throw new Error("migration execution evidence directory already exists without a valid apply record or intent; inspect and preserve it, then create a new transaction id");
  }
  const prepared: Array<{ operation: MigrationTransactionOperation; source: string; target: string; before: Buffer; output: Buffer }> = [];
  let intentWritten = false;
  let writesStarted = false;
  try {
    for (const operation of transaction.operations) {
      const source = await safeMigrationPath(root, operation.source_path, true, transaction.documentation_roots);
      const target = operation.target_path === operation.source_path ? source : await safeMigrationPath(root, operation.target_path, false, transaction.documentation_roots);
      const before = await readFile(source);
      if (sha256(before) !== operation.source_hash) throw new Error(`source drift blocks ${operation.operation_id}`);
      const targetHash = await currentHash(target);
      if (operation.target_precondition.state === "same-as-source" && targetHash !== operation.source_hash) throw new Error(`target drift blocks ${operation.operation_id}`);
      if (operation.target_precondition.state === "absent" && targetHash !== null) throw new Error(`target collision blocks ${operation.operation_id}`);
      const output = Buffer.from(normalizedLegacySource(UTF8_DECODER.decode(before), operation.target_header), "utf8");
      if (sha256(output) !== operation.output_hash || output.length !== operation.output_bytes) throw new Error(`generated output mismatch blocks ${operation.operation_id}`);
      prepared.push({ operation, source, target, before, output });
    }
    await mkdir(await controlPath(root, executionDirectory, "directory"), { recursive: false });
    for (const item of prepared) {
      await writeControlFile(root, path.join(executionDirectory, `${item.operation.operation_id}.before.bin`), item.before);
      await writeControlFile(root, path.join(executionDirectory, `${item.operation.operation_id}.after.bin`), item.output);
    }
    await testHooks?.beforeIntentWrite?.();
    const intentPayload: Omit<MigrationApplyIntent, "record_hash"> = {
      version: 1,
      kind: "migration-apply-intent",
      transaction_hash: transaction.transaction_hash,
      observed_at: observedAt,
      operations: prepared.map(({ operation }) => ({ operation_id: operation.operation_id, source_path: operation.source_path, target_path: operation.target_path, source_hash: operation.source_hash, output_hash: operation.output_hash })),
    };
    await writeControlFile(root, intentPath, `${JSON.stringify({ ...intentPayload, record_hash: computeMigrationApplyIntentHash(intentPayload) }, null, 2)}\n`);
    intentWritten = true;
    for (const item of prepared) {
      if (await currentHash(item.source) !== item.operation.source_hash) throw new Error(`source drift before write blocks ${item.operation.operation_id}`);
      const targetHash = await currentHash(item.target);
      if (item.operation.target_precondition.state === "same-as-source" && targetHash !== item.operation.source_hash) throw new Error(`target drift before write blocks ${item.operation.operation_id}`);
      if (item.operation.target_precondition.state === "absent" && targetHash !== null) throw new Error(`target collision before write blocks ${item.operation.operation_id}`);
    }
    for (const item of prepared) {
      await testHooks?.beforeImmediateWriteCheck?.(item.operation);
      await controlPath(root, executionDirectory, "directory", true);
      const immediateSource = await safeMigrationPath(root, item.operation.source_path, true, transaction.documentation_roots);
      const immediateTarget = item.operation.target_path === item.operation.source_path
        ? immediateSource
        : await safeMigrationPath(root, item.operation.target_path, false, transaction.documentation_roots);
      if (await currentHash(immediateSource) !== item.operation.source_hash) throw new Error(`source drift immediately before write blocks ${item.operation.operation_id}`);
      const immediateTargetHash = await currentHash(immediateTarget);
      if (item.operation.target_precondition.state === "same-as-source" && immediateTargetHash !== item.operation.source_hash) throw new Error(`target drift immediately before write blocks ${item.operation.operation_id}`);
      if (item.operation.target_precondition.state === "absent" && immediateTargetHash !== null) throw new Error(`target collision immediately before write blocks ${item.operation.operation_id}`);
      writesStarted = true;
      await writeAtomic(immediateTarget, item.output, item.operation.operation_id);
      if (await currentHash(immediateTarget) !== item.operation.output_hash) throw new Error(`postimage verification failed for ${item.operation.operation_id}`);
    }
    const payload: Omit<MigrationExecutionRecord, "record_hash"> = {
      version: 1,
      kind: "migration-apply",
      transaction_hash: transaction.transaction_hash,
      observed_at: observedAt,
      operations: prepared.map(({ operation }) => ({ operation_id: operation.operation_id, path: operation.target_path, before_hash: operation.target_precondition.content_hash, after_hash: operation.output_hash })),
    };
    const record = { ...payload, record_hash: computeMigrationExecutionRecordHash(payload) };
    await testHooks?.beforeEvidenceRecordWrite?.("migration-apply");
    await writeControlFile(root, applyPath, `${JSON.stringify(record, null, 2)}\n`);
    return record;
  } catch (error) {
    const recoveryFailures: string[] = [];
    for (const item of writesStarted ? [...prepared].reverse() : []) {
      try {
        const recoveryTarget = await safeMigrationPath(
          root,
          item.operation.target_path,
          item.operation.target_precondition.state === "same-as-source",
          transaction.documentation_roots,
        );
        if (await currentHash(recoveryTarget) === item.operation.output_hash) {
          if (item.operation.target_precondition.state === "absent") await rm(recoveryTarget, { force: true });
          else await writeAtomic(recoveryTarget, item.before, `${item.operation.operation_id}-recover`);
        }
      } catch (recoveryError) {
        recoveryFailures.push(`${item.operation.operation_id}: ${(recoveryError as Error).message}`);
      }
    }
    if (await pathExists(executionDirectory)) {
      const recoveryDetail = recoveryFailures.length > 0
        ? ` Automatic recovery skipped unsafe targets: ${recoveryFailures.join("; ")}.`
        : "";
      let rollbackAvailable = false;
      if (intentWritten) {
        try {
          const intent = await readJsonIfExists<MigrationApplyIntent>(root, intentPath, "migration apply intent");
          if (!intent) throw new Error("missing intent");
          await validateApplyIntent(intent, transaction);
          await validateStagedMigrationImages(root, executionDirectory, transaction);
          rollbackAvailable = true;
        } catch {
          // Preserve incomplete evidence; a rollback cannot consume it safely.
        }
      }
      const guidance = rollbackAvailable
        ? "Run rollback with the same transaction hash before creating a new transaction id."
        : "Staging evidence is incomplete; rollback is unavailable. Inspect and preserve the evidence, then create a new transaction id. Do not discard any possible document changes.";
      throw new Error(`migration execution stopped: ${(error as Error).message}.${recoveryDetail} ${guidance}`);
    }
    throw error;
  }
}

export async function rollbackMigrationTransaction(rootInput: string, transactionInput: string, confirmationHash: string, observedAt = new Date().toISOString(), testHooks?: MigrationExecutionTestHooks): Promise<MigrationExecutionRecord> {
  assertIsoDateTime(observedAt, "observed-at");
  const root = await realpath(path.resolve(rootInput));
  const loaded = await readTransaction(root, transactionInput);
  const transaction = loaded.value;
  if (confirmationHash !== transaction.transaction_hash) throw new Error("confirmation hash does not match the migration transaction");
  const executionDirectory = await controlPath(root, path.join(path.dirname(path.join(root, ...loaded.path.split("/"))), "execution"), "directory");
  if (!(await pathExists(executionDirectory))) throw new Error("migration transaction has not been executed; no rollback evidence exists");
  const rollbackPath = path.join(executionDirectory, "rollback.record.json");
  const existing = await readJsonIfExists<MigrationExecutionRecord>(root, rollbackPath, "migration rollback record");
  // A prior success record cannot substitute for the required durable recovery evidence.
  if (existing) await validateExecutionRecord(existing, transaction, "migration-rollback", "migration rollback record");
  const applyRecord = await readJsonIfExists<MigrationExecutionRecord>(root, path.join(executionDirectory, "apply.record.json"), "migration apply record");
  const intent = await readJsonIfExists<MigrationApplyIntent>(root, path.join(executionDirectory, "intent.json"), "migration apply intent");
  if (applyRecord) await validateExecutionRecord(applyRecord, transaction, "migration-apply", "migration apply record");
  if (intent) await validateApplyIntent(intent, transaction);
  if (!intent) throw new Error("migration execution evidence is incomplete; a valid recovery intent is required");
  const stagedImages = await validateStagedMigrationImages(root, executionDirectory, transaction);
  if (existing) return existing;
  const targets = await Promise.all(transaction.operations.map(async (operation) => {
    const target = await safeMigrationPath(root, operation.target_path, operation.target_precondition.state === "same-as-source", transaction.documentation_roots);
    return { operation, target, current: await currentHash(target), before: stagedImages.get(operation.operation_id)!.before };
  }));
  for (const item of targets) {
    const alreadyBefore = item.operation.target_precondition.state === "same-as-source" && item.current === item.operation.source_hash;
    const alreadyAbsent = item.operation.target_precondition.state === "absent" && item.current === null;
    if (!alreadyBefore && !alreadyAbsent && item.current !== item.operation.output_hash) throw new Error(`post-transaction drift blocks rollback for ${item.operation.operation_id}`);
  }
  for (const item of [...targets].reverse()) {
    await testHooks?.beforeImmediateRollbackCheck?.(item.operation);
    await controlPath(root, executionDirectory, "directory", true);
    const immediateTarget = await safeMigrationPath(
      root,
      item.operation.target_path,
      item.operation.target_precondition.state === "same-as-source",
      transaction.documentation_roots,
    );
    const immediateCurrent = await currentHash(immediateTarget);
    const alreadyBefore = item.operation.target_precondition.state === "same-as-source" && immediateCurrent === item.operation.source_hash;
    const alreadyAbsent = item.operation.target_precondition.state === "absent" && immediateCurrent === null;
    if (!alreadyBefore && !alreadyAbsent && immediateCurrent !== item.operation.output_hash) {
      throw new Error(`post-transaction drift immediately before rollback blocks ${item.operation.operation_id}`);
    }
    if (item.operation.target_precondition.state === "absent") {
      if (immediateCurrent === item.operation.output_hash) await rm(immediateTarget, { force: true });
    } else if (immediateCurrent === item.operation.output_hash) {
      if (sha256(item.before) !== item.operation.source_hash) throw new Error(`backup hash mismatch blocks rollback for ${item.operation.operation_id}`);
      await writeAtomic(immediateTarget, item.before, `${item.operation.operation_id}-rollback`);
      if (await currentHash(immediateTarget) !== item.operation.source_hash) throw new Error(`rollback verification failed for ${item.operation.operation_id}`);
    }
  }
  const payload: Omit<MigrationExecutionRecord, "record_hash"> = {
    version: 1,
    kind: "migration-rollback",
    transaction_hash: transaction.transaction_hash,
    observed_at: observedAt,
    operations: transaction.operations.map((operation) => ({ operation_id: operation.operation_id, path: operation.target_path, before_hash: operation.output_hash, after_hash: operation.target_precondition.content_hash })),
  };
  const record = { ...payload, record_hash: computeMigrationExecutionRecordHash(payload) };
  await testHooks?.beforeEvidenceRecordWrite?.("migration-rollback");
  await writeControlFile(root, rollbackPath, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

export function formatMigrationTransformationReport(report: MigrationTransformationReport): string {
  return [
    `Migration transformation ${report.dry_run ? "preview" : "proposal written"}: ${report.transaction.transaction_id}`,
    `Operations: ${report.transaction.summary.operations}; blockers: ${report.transaction.summary.blockers}; skipped: ${report.transaction.summary.skipped}`,
    `Output: ${report.output_path} (${report.written ? "written" : "not written"})`,
    `Transaction hash: ${report.transaction.transaction_hash}`,
    "Source documents changed: no",
    ...(report.content_preview ? ["", formatMigrationContentPreview(report.content_preview)] : []),
  ].join("\n");
}
