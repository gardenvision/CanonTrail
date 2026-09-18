import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { loadConfig } from "./config.js";
import { discoverMarkdown, normalizePath, walkFiles } from "./indexer.js";
import type { Diagnostic, DocumentRecord, GovernedHeader, ValidationReport } from "./types.js";
import { validateRepository } from "./validator.js";
import { assessFrozenExamples, parseFrozenExamples, type FrozenExample } from "./frozen-examples.js";
import { compareCodeUnits } from "./ordering.js";

type JsonRecord = Record<string, unknown>;
type TruthLevel = GovernedHeader["truth_level"];
type AuditSeverity = "error" | "warning";
type AuditCategory = "policy" | "freshness" | "integrity" | "consistency" | "continuity" | "structure" | "supersession";

const DAY_MS = 24 * 60 * 60 * 1000;
const TRUTH_LEVELS: TruthLevel[] = ["canonical", "design-target", "active-snapshot", "draft", "historical"];
const VERIFICATION_STATES = ["unverified", "structurally-reviewed", "internally-reviewed", "reviewed", "verified"] as const;
const DEFAULT_THRESHOLDS: Record<TruthLevel, number | null> = {
  canonical: 180,
  "design-target": 90,
  "active-snapshot": 30,
  draft: 30,
  historical: null,
};

export interface MaintenancePolicy {
  source: "file" | "defaults";
  path: string;
  defaults_applied: boolean;
  cadence: string;
  mode: "report-first";
  remote_required: false;
  stale_after_days: Record<TruthLevel, number | null>;
  future_date_tolerance_days: number;
  mutation_policy: string;
  frozen_examples: FrozenExample[];
}

export interface DocumentationAuditFinding {
  severity: AuditSeverity;
  code: string;
  category: AuditCategory;
  message: string;
  path?: string;
  detail?: string;
  related_paths?: string[];
}

export interface DocumentationAuditReport {
  root: string;
  as_of: string;
  health: "healthy" | "attention" | "invalid";
  policy: MaintenancePolicy;
  documents: {
    total: number;
    by_truth_level: Record<TruthLevel, number>;
    by_verification_state: Record<string, number>;
    freshness: { current: number; stale: number; future: number; exempt: number; invalid: number };
    frozen_examples: FrozenExample[];
  };
  tasks: {
    total: number;
    by_status: Record<string, number>;
    orphaned: number;
  };
  index: { state: "current" | "missing" | "stale" | "invalid" };
  validation: { errors: number; warnings: number };
  findings: DocumentationAuditFinding[];
  finding_counts: { errors: number; warnings: number; total: number };
  writes_performed: false;
}

export interface DocumentationStatusReport extends Omit<DocumentationAuditReport, "findings"> {}

interface LoadedPolicy {
  policy: MaintenancePolicy;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDate(value: string, field: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${field} must be an ISO date (YYYY-MM-DD)`);
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 10) !== value) {
    throw new Error(`${field} must be a valid ISO date (YYYY-MM-DD)`);
  }
  return milliseconds;
}

function optionalThreshold(value: unknown, field: string, fallback: number | null): { value: number | null; defaulted: boolean } {
  if (value === undefined) return { value: fallback, defaulted: true };
  if (value === null) return { value: null, defaulted: false };
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${field} must be a non-negative integer or null`);
  }
  return { value: value as number, defaulted: false };
}

export async function loadMaintenancePolicy(rootInput: string): Promise<LoadedPolicy> {
  const root = path.resolve(rootInput);
  const policyPath = ".agent-context/maintenance.yaml";
  const absolute = path.join(root, ".agent-context", "maintenance.yaml");
  let raw: string;
  try {
    raw = await readFile(absolute, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return {
      policy: {
        source: "defaults",
        path: policyPath,
        defaults_applied: true,
        cadence: "weekly",
        mode: "report-first",
        remote_required: false,
        stale_after_days: { ...DEFAULT_THRESHOLDS },
        future_date_tolerance_days: 1,
        mutation_policy: "Never delete, rewrite, merge, archive, or promote documentation without review.",
        frozen_examples: [],
      },
    };
  }

  let value: unknown;
  try {
    value = parse(raw);
  } catch (error) {
    throw new Error(`maintenance policy cannot be parsed: ${(error as Error).message}`);
  }
  if (!isRecord(value)) throw new Error("maintenance policy must contain a mapping");
  if (value.version !== 1) throw new Error("maintenance policy version must be 1");
  if (value.mode !== "report-first") throw new Error("maintenance policy mode must be report-first");
  if (value.remote_required !== false) throw new Error("maintenance policy remote_required must be false");
  if (typeof value.cadence !== "string" || !value.cadence.trim()) {
    throw new Error("maintenance policy cadence must be a non-empty string");
  }
  if (typeof value.mutation_policy !== "string" || !value.mutation_policy.trim()) {
    throw new Error("maintenance policy mutation_policy must be a non-empty string");
  }
  if (value.stale_after_days !== undefined && !isRecord(value.stale_after_days)) {
    throw new Error("maintenance policy stale_after_days must be a mapping");
  }
  const thresholds = isRecord(value.stale_after_days) ? value.stale_after_days : {};
  const resolved = Object.fromEntries(TRUTH_LEVELS.map((truthLevel) => {
    const threshold = optionalThreshold(thresholds[truthLevel], `stale_after_days.${truthLevel}`, DEFAULT_THRESHOLDS[truthLevel]);
    return [truthLevel, threshold];
  })) as Record<TruthLevel, { value: number | null; defaulted: boolean }>;
  const futureTolerance = value.future_date_tolerance_days;
  if (futureTolerance !== undefined && (!Number.isInteger(futureTolerance) || (futureTolerance as number) < 0)) {
    throw new Error("maintenance policy future_date_tolerance_days must be a non-negative integer");
  }
  return {
    policy: {
      source: "file",
      path: policyPath,
      defaults_applied: value.stale_after_days === undefined || futureTolerance === undefined || TRUTH_LEVELS.some((level) => resolved[level].defaulted),
      cadence: value.cadence.trim(),
      mode: "report-first",
      remote_required: false,
      stale_after_days: Object.fromEntries(TRUTH_LEVELS.map((level) => [level, resolved[level].value])) as Record<TruthLevel, number | null>,
      future_date_tolerance_days: (futureTolerance as number | undefined) ?? 1,
      mutation_policy: value.mutation_policy.trim(),
      frozen_examples: parseFrozenExamples(value.frozen_examples),
    },
  };
}

function validationCategory(diagnostic: Diagnostic): AuditCategory {
  if (diagnostic.code.startsWith("INDEX")) return "freshness";
  if (diagnostic.code.startsWith("CANON") || diagnostic.code === "DOC003") return "consistency";
  if (/^(?:TASK|HANDOFF|RESUME|LOCK)/.test(diagnostic.code)) return "continuity";
  return "integrity";
}

function fromDiagnostic(diagnostic: Diagnostic): DocumentationAuditFinding {
  return {
    severity: diagnostic.severity,
    code: diagnostic.code,
    category: validationCategory(diagnostic),
    message: diagnostic.message,
    ...(diagnostic.path ? { path: diagnostic.path } : {}),
    ...(diagnostic.detail ? { detail: diagnostic.detail } : {}),
  };
}

function findContradictionCandidates(documents: DocumentRecord[]): DocumentationAuditFinding[] {
  const topics = new Map<string, DocumentRecord[]>();
  for (const document of documents) {
    const header = document.header;
    if (!header?.topic_id || header.truth_level === "historical") continue;
    const entries = topics.get(header.topic_id) ?? [];
    entries.push(document);
    topics.set(header.topic_id, entries);
  }
  const findings: DocumentationAuditFinding[] = [];
  for (const [topicId, entries] of topics) {
    if (entries.length < 2) continue;
    const signatures = new Set(entries.map((entry) => {
      const header = entry.header!;
      return `${header.truth_level}\u0000${header.status}\u0000${header.verification.state}`;
    }));
    if (signatures.size < 2) continue;
    const paths = entries.map((entry) => entry.path).sort((left, right) => compareCodeUnits(left, right));
    findings.push({
      severity: "warning",
      code: "DOCS201",
      category: "consistency",
      message: `topic '${topicId}' has conflicting non-historical metadata; review content before deciding whether it is contradictory`,
      path: paths[0]!,
      related_paths: paths.slice(1),
    });
  }
  return findings;
}

function findSupersessionCandidates(documents: DocumentRecord[]): DocumentationAuditFinding[] {
  const byPath = new Map(documents.map((document) => [document.path, document]));
  const findings: DocumentationAuditFinding[] = [];
  for (const document of documents) {
    const header = document.header;
    if (!header) continue;
    for (const reference of Array.isArray(header.supersedes) ? header.supersedes : []) {
      if (typeof reference !== "string") continue;
      const targetPath = normalizePath(reference.split("#", 1)[0] ?? "").replace(/^\.\//, "");
      const target = byPath.get(targetPath);
      if (!target?.header || target.header.truth_level === "historical") continue;
      findings.push({
        severity: "warning",
        code: "DOCS401",
        category: "supersession",
        message: "superseded document remains non-historical and should be reviewed for archival",
        path: target.path,
        related_paths: [document.path],
      });
    }
    if (/superseded/i.test(header.status) && header.truth_level !== "historical") {
      findings.push({
        severity: "warning",
        code: "DOCS402",
        category: "supersession",
        message: "document status says superseded but truth_level is not historical",
        path: document.path,
      });
    }
  }
  return findings;
}

type LifecyclePhase = "planned" | "active" | "completed";

function taskLifecycle(status: string): LifecyclePhase | undefined {
  if (["draft", "ready"].includes(status)) return "planned";
  if (["claimed", "in-progress", "blocked", "review"].includes(status)) return "active";
  if (["verified", "done", "superseded"].includes(status)) return "completed";
  return undefined;
}

function documentLifecycle(status: string): LifecyclePhase | undefined {
  if (["draft", "planned", "proposal"].includes(status)) return "planned";
  if (["active", "in-progress", "blocked", "review"].includes(status)) return "active";
  if (["completed", "done", "verified", "superseded", "archived"].includes(status)) return "completed";
  return undefined;
}

function planLifecycle(status: string): LifecyclePhase | undefined {
  if (status === "planned") return "planned";
  if (["in-progress", "blocked", "review"].includes(status)) return "active";
  if (["completed", "done", "verified"].includes(status)) return "completed";
  return undefined;
}

function changeLifecycleCompatible(taskPhase: LifecyclePhase, changeStatus: string): boolean {
  if (taskPhase === "planned") return !["implemented", "verified"].includes(changeStatus);
  if (taskPhase === "active") return changeStatus !== "verified";
  return !["idea", "decided"].includes(changeStatus);
}

async function taskAudit(root: string, files: string[], documents: DocumentRecord[]): Promise<{
  findings: DocumentationAuditFinding[];
  total: number;
  byStatus: Record<string, number>;
  orphaned: number;
}> {
  const taskFiles = new Map<string, Set<string>>();
  for (const file of files) {
    const match = /^\.agent-context\/tasks\/([^/]+)\/(.+)$/.exec(file);
    if (!match) continue;
    const entries = taskFiles.get(match[1]!) ?? new Set<string>();
    entries.add(match[2]!);
    taskFiles.set(match[1]!, entries);
  }
  const findings: DocumentationAuditFinding[] = [];
  const statuses = new Map<string, number>();
  const orphanedTasks = new Set<string>();
  const documentsByPath = new Map(documents.map((document) => [document.path, document]));
  const plannedTasks = new Map<string, { status: string; path: string }>();
  const planPath = ".agent-context/documentation-plan.yaml";
  if (files.includes(planPath)) {
    try {
      const plan = parse(await readFile(path.join(root, ...planPath.split("/")), "utf8"));
      if (isRecord(plan) && Array.isArray(plan.subsystem_tasks)) {
        for (const entry of plan.subsystem_tasks) {
          if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.status !== "string") continue;
          plannedTasks.set(entry.id, { status: entry.status, path: planPath });
        }
      }
    } catch {
      // Repository validation reports malformed structured artifacts.
    }
  }
  for (const taskId of [...taskFiles.keys()].sort((left, right) => compareCodeUnits(left, right))) {
    const entries = taskFiles.get(taskId)!;
    const statePath = `.agent-context/tasks/${taskId}/state.yaml`;
    if (!entries.has("state.yaml")) {
      findings.push({
        severity: "warning",
        code: "DOCS301",
        category: "continuity",
        message: "task directory contains artifacts but no state.yaml",
        path: `.agent-context/tasks/${taskId}/`,
      });
      orphanedTasks.add(taskId);
      continue;
    }
    let state: unknown;
    try {
      state = parse(await readFile(path.join(root, ...statePath.split("/")), "utf8"));
    } catch {
      continue;
    }
    if (!isRecord(state)) continue;
    const status = typeof state.status === "string" && state.status ? state.status : "unknown";
    statuses.set(status, (statuses.get(status) ?? 0) + 1);
    const taskPhase = taskLifecycle(status);
    const briefPath = `.agent-context/tasks/${taskId}/brief.md`;
    const briefStatus = documentsByPath.get(briefPath)?.header?.status;
    const briefPhase = typeof briefStatus === "string" ? documentLifecycle(briefStatus) : undefined;
    if (taskPhase && briefPhase && taskPhase !== briefPhase) {
      findings.push({
        severity: "warning",
        code: "DOCS601",
        category: "consistency",
        message: `task lifecycle drift: state is '${status}' (${taskPhase}) but brief is '${briefStatus}' (${briefPhase})`,
        path: statePath,
        related_paths: [briefPath],
      });
    }
    const plannedTask = plannedTasks.get(taskId);
    const plannedPhase = plannedTask ? planLifecycle(plannedTask.status) : undefined;
    if (taskPhase && plannedTask && plannedPhase && taskPhase !== plannedPhase) {
      findings.push({
        severity: "warning",
        code: "DOCS602",
        category: "consistency",
        message: `task lifecycle drift: state is '${status}' (${taskPhase}) but documentation plan is '${plannedTask.status}' (${plannedPhase})`,
        path: statePath,
        related_paths: [plannedTask.path],
      });
    }
    const changeName = entries.has("change.yaml") ? "change.yaml" : entries.has("change.yml") ? "change.yml" : undefined;
    if (changeName) {
      const changePath = `.agent-context/tasks/${taskId}/${changeName}`;
      try {
        const change = parse(await readFile(path.join(root, ...changePath.split("/")), "utf8"));
        if (isRecord(change) && taskPhase && typeof change.status === "string" && !changeLifecycleCompatible(taskPhase, change.status)) {
          findings.push({
            severity: "warning",
            code: "DOCS603",
            category: "consistency",
            message: `task/change lifecycle drift: task is '${status}' (${taskPhase}) but change is '${change.status}'`,
            path: statePath,
            related_paths: [changePath],
          });
        }
        if (isRecord(change) && ["decided", "implemented"].includes(String(change.status))) {
          if (!isRecord(change.documentation_structure)) {
            findings.push({
              severity: "warning",
              code: "DOCS501",
              category: "structure",
              message: "active change has no documentation-structure decision; review whether product growth needs feature documents",
              path: changePath,
            });
          } else if (change.documentation_structure.decision === "reassess-documentation-structure") {
            findings.push({
              severity: "warning",
              code: "DOCS502",
              category: "structure",
              message: "active change requires a documentation-structure reassessment before implementation can be completed",
              path: changePath,
            });
          }
        }
      } catch {
        // Repository validation reports malformed change records with schema diagnostics.
      }
    }
    if (!entries.has("brief.md") && !entries.has("change.yaml") && !entries.has("change.yml")) {
      findings.push({
        severity: "warning",
        code: "DOCS302",
        category: "continuity",
        message: "task state has neither brief.md nor change.yaml",
        path: statePath,
      });
      orphanedTasks.add(taskId);
    }
    const latest = state.latest_handoff;
    if (typeof latest === "string" && latest.trim()) {
      const latestPath = normalizePath(latest.trim().replace(/^\.\//, ""));
      if (!files.includes(latestPath)) {
        findings.push({
          severity: "warning",
          code: "DOCS303",
          category: "continuity",
          message: `latest_handoff does not exist: ${latestPath}`,
          path: statePath,
        });
        orphanedTasks.add(taskId);
      }
    } else if (entries.has("handoff.yaml")) {
      findings.push({
        severity: "warning",
        code: "DOCS304",
        category: "continuity",
        message: "task has a latest handoff artifact but state.latest_handoff is empty",
        path: `.agent-context/tasks/${taskId}/handoff.yaml`,
        related_paths: [statePath],
      });
      orphanedTasks.add(taskId);
    }
  }
  return {
    findings,
    total: taskFiles.size,
    byStatus: Object.fromEntries([...statuses].sort(([left], [right]) => compareCodeUnits(left, right))),
    orphaned: orphanedTasks.size,
  };
}

function sortFindings(findings: DocumentationAuditFinding[]): DocumentationAuditFinding[] {
  return findings.sort((left, right) => {
    const severity = left.severity === right.severity ? 0 : left.severity === "error" ? -1 : 1;
    return severity || compareCodeUnits(left.category, right.category) || compareCodeUnits(left.code, right.code) ||
      compareCodeUnits(left.path ?? "", right.path ?? "") || compareCodeUnits(left.message, right.message);
  });
}

export interface DocumentationAuditOptions {
  asOf?: string;
  validation?: ValidationReport;
  includeRepositoryDiagnostics?: boolean;
}

export async function auditDocumentation(rootInput: string, options: DocumentationAuditOptions = {}): Promise<DocumentationAuditReport> {
  const root = path.resolve(rootInput);
  const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
  const asOfMs = parseDate(asOf, "as-of");
  const { policy } = await loadMaintenancePolicy(root);
  const config = await loadConfig(root);
  const [documents, files, validation] = await Promise.all([
    discoverMarkdown(root, config),
    walkFiles(root, config),
    options.validation ?? validateRepository(root),
  ]);
  const findings = options.includeRepositoryDiagnostics === false ? [] : validation.diagnostics.map(fromDiagnostic);
  const frozen = await assessFrozenExamples(root, policy.frozen_examples, documents);
  for (const diagnostic of frozen.diagnostics) {
    if (!findings.some(f => f.code === diagnostic.code && f.path === diagnostic.path && f.message === diagnostic.message)) findings.push(fromDiagnostic(diagnostic));
  }
  const frozenByPath = new Map(frozen.examples.map(entry => [entry.path, entry]));
  const appliedFrozen: FrozenExample[] = [];
  const byTruthLevel = Object.fromEntries(TRUTH_LEVELS.map((level) => [level, 0])) as Record<TruthLevel, number>;
  const byVerification = Object.fromEntries(VERIFICATION_STATES.map((state) => [state, 0])) as Record<string, number>;
  const freshness = { current: 0, stale: 0, future: 0, exempt: 0, invalid: 0 };
  for (const document of documents) {
    const header = document.header;
    if (!header) {
      freshness.invalid += 1;
      continue;
    }
    byTruthLevel[header.truth_level] += 1;
    byVerification[header.verification.state] = (byVerification[header.verification.state] ?? 0) + 1;
    let standMs: number;
    try {
      standMs = parseDate(header.stand, `${document.path} stand`);
    } catch {
      freshness.invalid += 1;
      continue;
    }
    const ageDays = Math.floor((asOfMs - standMs) / DAY_MS);
    if (ageDays < -policy.future_date_tolerance_days) {
      freshness.future += 1;
      findings.push({
        severity: "warning",
        code: "DOCS102",
        category: "freshness",
        message: `stand date is ${Math.abs(ageDays)} days after the audit date`,
        path: document.path,
      });
      continue;
    }
    const threshold = policy.stale_after_days[header.truth_level];
    const frozenEntry = frozenByPath.get(document.path);
    if (frozenEntry) {
      freshness.exempt += 1;
      appliedFrozen.push(frozenEntry);
    } else if (threshold === null) {
      freshness.exempt += 1;
    } else if (ageDays > threshold) {
      freshness.stale += 1;
      findings.push({
        severity: "warning",
        code: "DOCS101",
        category: "freshness",
        message: `${header.truth_level} document is ${ageDays} days old; policy threshold is ${threshold} days`,
        path: document.path,
      });
    } else {
      freshness.current += 1;
    }
  }
  findings.push(...findContradictionCandidates(documents), ...findSupersessionCandidates(documents));
  const tasks = await taskAudit(root, files, documents);
  findings.push(...tasks.findings);
  sortFindings(findings);
  const errors = findings.filter((finding) => finding.severity === "error").length;
  const warnings = findings.length - errors;
  const indexCode = validation.diagnostics.find((diagnostic) => diagnostic.code.startsWith("INDEX"))?.code;
  const indexState = indexCode === "INDEX001" ? "missing"
    : indexCode === "INDEX003" ? "stale"
      : indexCode ? "invalid"
        : "current";
  return {
    root,
    as_of: asOf,
    health: errors > 0 ? "invalid" : warnings > 0 ? "attention" : "healthy",
    policy,
    documents: {
      total: documents.length,
      by_truth_level: byTruthLevel,
      by_verification_state: byVerification,
      freshness,
      frozen_examples: appliedFrozen,
    },
    tasks: { total: tasks.total, by_status: tasks.byStatus, orphaned: tasks.orphaned },
    index: { state: indexState },
    validation: { errors: validation.stats.errors, warnings: validation.stats.warnings },
    findings,
    finding_counts: { errors, warnings, total: findings.length },
    writes_performed: false,
  };
}

export async function documentationStatus(rootInput: string, options: { asOf?: string } = {}): Promise<DocumentationStatusReport> {
  const { findings: _ignored, ...status } = await auditDocumentation(rootInput, options);
  return status;
}

export function formatDocumentationStatus(report: DocumentationStatusReport): string {
  return [
    `Documentation status: ${report.health}`,
    `As of: ${report.as_of}`,
    `Documents: ${report.documents.total} (current ${report.documents.freshness.current}, stale ${report.documents.freshness.stale}, future ${report.documents.freshness.future}, exempt ${report.documents.freshness.exempt})`,
    `Frozen synthetic examples (age only): ${report.documents.frozen_examples.length}`,
    `Tasks: ${report.tasks.total} (orphaned ${report.tasks.orphaned})`,
    `Context index: ${report.index.state}`,
    `Findings: ${report.finding_counts.errors} errors, ${report.finding_counts.warnings} warnings`,
    `Maintenance policy: ${report.policy.source}${report.policy.defaults_applied ? " (defaults applied)" : ""}`,
    "Writes performed: no",
  ].join("\n");
}

export function formatDocumentationAudit(report: DocumentationAuditReport): string {
  const lines = [formatDocumentationStatus(report)];
  for (const example of report.documents.frozen_examples) {
    lines.push(`FROZEN [age-only] ${example.path} ${example.content_hash}: ${JSON.stringify(example.rationale)}`);
  }
  for (const finding of report.findings) {
    lines.push(`${finding.severity.toUpperCase()} ${finding.code} [${finding.category}]${finding.path ? ` ${finding.path}` : ""}: ${finding.message}`);
  }
  return lines.join("\n");
}
