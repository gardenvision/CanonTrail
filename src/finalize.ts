import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { auditDocumentation, type DocumentationAuditReport } from "./docs.js";
import { taskCheckInvokesCanonTrailFinalize } from "./finalize-guard.js";
import { resolveCompletionScope, partitionCompletionDiagnostics, type CompletionScope } from "./finalize-scope.js";
import { generateContextIndex } from "./indexer.js";
import { validateRepository } from "./validator.js";
import type { ValidationReport } from "./types.js";

type JsonRecord = Record<string, unknown>;

export type FinalizeGateStatus = "pass" | "warning" | "fail" | "skipped";

export interface FinalizeFinding {
  code: string;
  message: string;
  path?: string;
  detail?: string;
}

export interface FinalizeGate {
  id: "index-refresh" | "repository" | "documentation" | "task" | "project-health";
  /** Only a separate project-health drift gate may be non-blocking. */
  blocking?: boolean;
  status: FinalizeGateStatus;
  summary: string;
  findings: FinalizeFinding[];
}

export interface FinalizeReport {
  root: string;
  task_id: string | null;
  as_of: string;
  fail_on_warnings: boolean;
  refresh_index: boolean;
  ok: boolean;
  gates: FinalizeGate[];
  repository: ValidationReport;
  completion_scope: CompletionScope;
  /** Null when the audit could not complete; the documentation gate then fails. */
  documentation: DocumentationAuditReport | null;
  writes_performed: boolean;
}

export interface FinalizeOptions {
  root: string;
  taskId?: string;
  asOf?: string;
  failOnWarnings?: boolean;
  refreshIndex?: boolean;
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

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readYamlRecord(filePath: string): Promise<JsonRecord> {
  const value: unknown = parse(await readFile(filePath, "utf8"));
  if (!isRecord(value)) throw new Error("artifact root must be a mapping");
  return value;
}

function taskPath(taskId: string, name: string): string {
  return `.agent-context/tasks/${taskId}/${name}`;
}

async function taskGate(root: string, taskId: string): Promise<FinalizeGate> {
  const findings: FinalizeFinding[] = [];
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(taskId)) {
    return {
      id: "task",
      status: "fail",
      summary: "Task completion gate failed.",
      findings: [{ code: "FINALIZE100", message: "task id must be one repository-local task directory name" }],
    };
  }

  const statePath = taskPath(taskId, "state.yaml");
  const changePath = taskPath(taskId, "change.yaml");
  const alternateChangePath = taskPath(taskId, "change.yml");
  const lockPath = taskPath(taskId, "context.lock.json");
  const absoluteState = path.join(root, ...statePath.split("/"));
  const resolvedChangePath = await exists(path.join(root, ...changePath.split("/"))) ? changePath : alternateChangePath;
  const absoluteChange = path.join(root, ...resolvedChangePath.split("/"));

  if (!await exists(absoluteState)) {
    findings.push({ code: "FINALIZE101", message: "task state is missing", path: statePath });
  }
  if (!await exists(absoluteChange)) {
    findings.push({ code: "FINALIZE102", message: "verified change record is missing", path: changePath });
  }
  if (!await exists(path.join(root, ...lockPath.split("/")))) {
    findings.push({ code: "FINALIZE103", message: "bounded task context lock is missing", path: lockPath });
  }

  if (await exists(absoluteState)) {
    try {
      const state = await readYamlRecord(absoluteState);
      if (state.task_id !== taskId) {
        findings.push({ code: "FINALIZE104", message: `state.task_id does not match '${taskId}'`, path: statePath });
      }
      if (!new Set(["verified", "done"]).has(String(state.status))) {
        findings.push({ code: "FINALIZE105", message: `task status must be verified or done, found '${String(state.status)}'`, path: statePath });
      }
      for (const acceptance of records(state.acceptance_criteria)) {
        const status = String(acceptance.status ?? "pending");
        if (!new Set(["pass", "not-applicable"]).has(status)) {
          findings.push({
            code: "FINALIZE106",
            message: `acceptance criterion '${String(acceptance.id ?? "unknown")}' is '${status}'`,
            path: statePath,
          });
        }
      }
      const taskChecks = records(state.checks);
      if (taskChecks.length === 0) {
        findings.push({ code: "FINALIZE112", message: "task has no recorded project-owned check", path: statePath });
      }
      for (const check of taskChecks) {
        const status = String(check.status ?? "pending");
        if (await taskCheckInvokesCanonTrailFinalize(root, check.command_or_observation)) {
          findings.push({
            code: "FINALIZE114",
            message: `task check '${String(check.id ?? "unknown")}' invokes finalize itself; record its underlying project-owned checks instead`,
            path: statePath,
          });
        } else if (status !== "pass") {
          findings.push({
            code: "FINALIZE107",
            message: `task check '${String(check.id ?? "unknown")}' is '${status}'`,
            path: statePath,
          });
        } else if (strings(check.evidence_refs).length === 0) {
          findings.push({
            code: "FINALIZE108",
            message: `passing task check '${String(check.id ?? "unknown")}' has no evidence reference`,
            path: statePath,
          });
        }
      }
    } catch (error) {
      findings.push({ code: "FINALIZE109", message: `task state cannot be read: ${(error as Error).message}`, path: statePath });
    }
  }

  if (await exists(absoluteChange)) {
    try {
      const change = await readYamlRecord(absoluteChange);
      if (change.status !== "verified") {
        findings.push({
          code: "FINALIZE110",
          message: `change status must be verified, found '${String(change.status)}'`,
          path: resolvedChangePath,
        });
      }
      const verification = isRecord(change.verification) ? change.verification : {};
      if (records(verification.checks).length === 0) {
        findings.push({ code: "FINALIZE113", message: "change has no recorded verification check", path: resolvedChangePath });
      }
    } catch (error) {
      findings.push({ code: "FINALIZE111", message: `change record cannot be read: ${(error as Error).message}`, path: resolvedChangePath });
    }
  }

  return {
    id: "task",
    status: findings.length === 0 ? "pass" : "fail",
    summary: findings.length === 0 ? `Task ${taskId} satisfies the completion gate.` : `Task ${taskId} has ${findings.length} open completion gate(s).`,
    findings,
  };
}

export async function finalizeRepository(options: FinalizeOptions): Promise<FinalizeReport> {
  const root = path.resolve(options.root);
  const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
  const failOnWarnings = options.failOnWarnings ?? false;
  const refreshIndex = options.refreshIndex ?? false;
  const gates: FinalizeGate[] = [];
  let writesPerformed = false;

  if (refreshIndex) {
    const preflight = await validateRepository(root, { checkIndex: false, checkContextLocks: false });
    if (!preflight.ok) {
      gates.push({
        id: "index-refresh",
        status: "fail",
        summary: "Context index was not refreshed because structural preflight failed.",
        findings: preflight.diagnostics.map((diagnostic) => ({
          code: diagnostic.code,
          message: diagnostic.message,
          ...(diagnostic.path ? { path: diagnostic.path } : {}),
        })),
      });
    } else {
      const result = await generateContextIndex(root);
      writesPerformed = true;
      gates.push({
        id: "index-refresh",
        status: "pass",
        summary: `Refreshed ${path.relative(root, result.path).replace(/\\/g, "/")} (${result.index.root_hash}).`,
        findings: [],
      });
    }
  } else {
    gates.push({
      id: "index-refresh",
      status: "skipped",
      summary: "Context index refresh was not requested; freshness is checked without writes.",
      findings: [],
    });
  }

  const repository = await validateRepository(root, {
    ...(options.taskId ? { strictContextLockTaskId: options.taskId } : {}),
  });
  const completionScope = await resolveCompletionScope(root, options.taskId);
  const blockingDiagnostics = partitionCompletionDiagnostics(completionScope, repository.diagnostics);
  const blockingErrors = blockingDiagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const blockingWarnings = blockingDiagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
  const repositoryFails = blockingErrors > 0 || (failOnWarnings && blockingWarnings > 0);
  gates.push({
    id: "repository",
    status: repositoryFails ? "fail" : repository.stats.warnings > 0 ? "warning" : "pass",
    summary: repositoryFails
      ? `Structural completion gate failed with ${blockingErrors} blocking error(s) and ${blockingWarnings} warning(s).`
      : repository.stats.warnings > 0
        ? `Structural validation passed with ${repository.stats.warnings} advisory warning(s).`
        : completionScope.deferred_findings.length > 0
          ? "Task-scoped structural checks passed; separate project-health failures remain."
          : "Structural validation passed without warnings.",
    findings: blockingDiagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      message: diagnostic.message,
      ...(diagnostic.path ? { path: diagnostic.path } : {}),
    })),
  });

  if (completionScope.deferred_findings.length > 0) {
    gates.push({
      id: "project-health", status: "fail", blocking: false,
      summary: `${completionScope.deferred_findings.length} unrelated task-context drift finding(s) remain. Repository health is NOT passing; no peer lock was rewritten.`,
      findings: completionScope.deferred_findings.map((diagnostic) => ({ ...diagnostic })),
    });
  }

  let documentation: DocumentationAuditReport | null = null;
  try {
    documentation = await auditDocumentation(root, {
      asOf,
      validation: repository,
      includeRepositoryDiagnostics: false,
    });
  } catch (error) {
    // An unavailable audit is not an empty/healthy audit. Preserve the failed
    // boundary while allowing the CLI to emit its normal structured report.
    gates.push({
      id: "documentation",
      status: "fail",
      summary: "Documentation audit is unavailable; finalization cannot pass.",
      findings: [{
        code: "FINALIZE001",
        message: `Documentation audit could not complete: ${error instanceof Error ? error.message : String(error)}`,
      }],
    });
  }
  if (documentation !== null) {
    const documentationFails = documentation.health === "invalid" || (failOnWarnings && documentation.finding_counts.warnings > 0);
    gates.push({
      id: "documentation",
      status: documentationFails ? "fail" : documentation.finding_counts.warnings > 0 ? "warning" : "pass",
      summary: documentationFails
        ? `Documentation gate failed with ${documentation.finding_counts.errors} error(s) and ${documentation.finding_counts.warnings} warning(s).`
        : documentation.finding_counts.warnings > 0
          ? `Documentation has ${documentation.finding_counts.warnings} warning(s); warning policy is advisory.`
          : "Documentation audit is healthy.",
      findings: documentation.findings.map((finding) => ({
        code: finding.code,
        message: finding.message,
        ...(finding.path ? { path: finding.path } : {}),
      })),
    });
  }

  if (options.taskId) {
    gates.push(await taskGate(root, options.taskId));
  } else {
    gates.push({
      id: "task",
      status: "skipped",
      summary: "No task id was supplied; repository-level gates only.",
      findings: [],
    });
  }

  return {
    root,
    task_id: options.taskId ?? null,
    as_of: asOf,
    fail_on_warnings: failOnWarnings,
    refresh_index: refreshIndex,
    ok: gates.every((gate) => gate.status !== "fail" || (
      completionScope.mode === "task" && gate.id === "project-health" && gate.blocking === false
    )),
    gates,
    repository,
    completion_scope: completionScope,
    documentation,
    writes_performed: writesPerformed,
  };
}

export function formatFinalizeReport(report: FinalizeReport): string {
  const lines = [
    `CanonTrail finalize ${report.ok ? "PASS" : "FAIL"}${report.task_id ? ` for ${report.task_id}` : ""}`,
  ];
  for (const gate of report.gates) {
    lines.push(`${gate.status.toUpperCase()} ${gate.id}${gate.blocking === false ? " [non-blocking for this task only]" : ""}: ${gate.summary}`);
    for (const finding of gate.findings) {
      lines.push(`  ${finding.code}${finding.path ? ` ${finding.path}` : ""}: ${finding.message}`);
      if (finding.detail) lines.push(`    ${finding.detail}`);
    }
  }
  if (report.completion_scope.fallback_reason) lines.push(`Task scope unresolved; global strictness retained: ${report.completion_scope.fallback_reason}`);
  if (report.completion_scope.deferred_findings.length > 0) lines.push("A task PASS is not a repository/CI/release PASS. Run finalize without --task for project-wide health.");
  lines.push(`Writes performed: ${report.writes_performed ? "context index refreshed" : "no"}`);
  lines.push("Canonical promotion and project-owned test execution are not performed by finalize.");
  return lines.join("\n");
}
