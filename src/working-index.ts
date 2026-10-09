import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { loadAuthoringConfig, requireAuthoringTask } from "./document-authoring.js";
import { readContinuityBytes, decodeContinuityText, resolveContinuityFile } from "./continuity-files.js";
import { resolveCompletionScope } from "./finalize-scope.js";
import { buildContextIndex, discoverMarkdown, isGovernedPath, normalizePath, sha256 } from "./indexer.js";
import { compareCodeUnits } from "./ordering.js";
import { safeRepositoryFile } from "./context-source-path.js";
import { governedMetadataReferences, validateRepository } from "./validator.js";
import type { CanonTrailConfig, ContextIndex, Diagnostic, DocumentRecord, ValidationReport } from "./types.js";

const ownerPattern = /^\.agent-context\/tasks\/([A-Za-z0-9][A-Za-z0-9._-]*)\//;
const noncanonical = new Set(["draft", "active-snapshot", "historical"]);

export interface TaskWorkingIndexReport {
  version: 1;
  validation_scope: "task-working";
  purpose: "orientation-and-context";
  root: string;
  task_id: string;
  ok: boolean;
  index_written: false;
  completion_approval: false;
  isolation_policy: "noncanonical-peer-markdown-v1";
  relevant_task_ids: string[];
  fallback_reason: string | null;
  excluded_documents: Array<{ path: string; task_id: string; content_hash: string; truth_level: string }>;
  isolated_findings: Diagnostic[];
  blocking_findings: Diagnostic[];
  repository_preflight: ValidationReport;
  index: ContextIndex | null;
}

function excluded(relative: string, config: CanonTrailConfig): boolean {
  return config.excludePaths.some(value => {
    const prefix = normalizePath(value).replace(/\/$/, "");
    return prefix === "." || relative === prefix || relative.startsWith(prefix + "/");
  });
}

/** Do not treat a skipped link as absence of governed truth. Stable tree only;
 * unlike the old scanner, this opt-in view fails closed on uncertain entries. */
async function checkWorkingTree(root: string, config: CanonTrailConfig): Promise<void> {
  let visited = 0;
  const tasksRoot = ".agent-context/tasks";
  await resolveContinuityFile(root, `${tasksRoot}/__working_index_probe__`);
  async function walk(relative: string): Promise<void> {
    const entries = await readdir(path.join(root, ...relative.split("/").filter(Boolean)), { withFileTypes: true });
    entries.sort((left, right) => compareCodeUnits(left.name, right.name));
    for (const entry of entries) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (excluded(name, config)) continue;
      if (++visited > 100000) throw new Error("Working-index coverage exceeded 100000 entries; narrow governed/excluded roots explicitly.");
      if (entry.isSymbolicLink()) throw new Error(`Working-index coverage encounters a link: ${name}`);
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) {
        if ((name.startsWith(tasksRoot + "/") || (isGovernedPath(name, config) && /\.md$/i.test(name)))
            && (await lstat(path.join(root, ...name.split("/")))).nlink !== 1) {
          throw new Error(`Working-index coverage encounters a multiply linked input: ${name}`);
        }
      } else throw new Error(`Working-index coverage encounters an unsupported filesystem entry: ${name}`);
    }
  }
  await walk("");
}

function excludedFromView(document: DocumentRecord, relevant: Set<string>): boolean {
  const owner = ownerPattern.exec(document.path)?.[1];
  return Boolean(owner && !relevant.has(owner) && document.header && noncanonical.has(document.header.truth_level));
}

/** A diagnostic saying "missing" is not proof of safe local path identity.
 * Use the same metadata fragment grammar, but prove exact portable identity
 * before allowing an excluded note to isolate a missing-reference error. */
async function checkExcludedReferences(root: string, document: DocumentRecord): Promise<void> {
  for (const reference of governedMetadataReferences(document)) {
    const relative = (reference.split("#", 1)[0] ?? "").replace(/^\.\//, "").replace(/\/$/, "");
    if (!relative) continue; // A pure documentary fragment is not a file.
    if (relative.split("/").some(segment => segment.toLowerCase() === ".git")) {
      throw new Error(`Excluded note refers to a Git control identity: ${document.path}`);
    }
    const absolute = await safeRepositoryFile(root, relative);
    const directory = absolute !== undefined && (await lstat(absolute)).isDirectory();
    // The probe permits a real directory reference, never creates anything,
    // and still checks every lexical/physical parent component before absence.
    await resolveContinuityFile(root, directory ? `${relative}/__working_reference_probe__` : relative);
  }
}

/** A report/current working view, never a replacement for the repository index.
 * Every peer exclusion needs positive present-day noncanonical metadata. */
export async function createTaskWorkingIndex(rootInput: string, taskId: string, additionalSources: string[] = []): Promise<TaskWorkingIndexReport> {
  const root = path.resolve(rootInput);
  const config = await loadAuthoringConfig(root);
  await requireAuthoringTask(root, config, taskId);
  const repository = await validateRepository(root, { checkIndex: false, checkContextLockFreshness: false });
  const result: TaskWorkingIndexReport = {
    version: 1, validation_scope: "task-working", purpose: "orientation-and-context", root, task_id: taskId,
    ok: false, index_written: false, completion_approval: false, isolation_policy: "noncanonical-peer-markdown-v1",
    relevant_task_ids: [], fallback_reason: null, excluded_documents: [], isolated_findings: [],
    blocking_findings: [], repository_preflight: repository, index: null,
  };
  try {
    await checkWorkingTree(root, config);
    const documents = await discoverMarkdown(root, config);
    // Validate exact physical/byte identity even for a proposed peer exclusion.
    for (const document of documents) {
      const bytes = (await readContinuityBytes(root, document.path))!;
      if (bytes.length > 8 * 1024 * 1024 || decodeContinuityText(bytes, document.path) !== document.source) {
        throw new Error(`Working-index source is oversized or changed during discovery: ${document.path}`);
      }
    }
    const checkedOwners = new Set<string>();
    for (const document of documents) {
      const owner = ownerPattern.exec(document.path)?.[1];
      if (owner && excludedFromView(document, new Set([taskId]))) {
        if (!checkedOwners.has(owner)) {
          await requireAuthoringTask(root, config, owner);
          checkedOwners.add(owner);
        }
        await checkExcludedReferences(root, document);
      }
    }
    let relevant = new Set<string>([taskId]);
    for (;;) {
      const retained = documents.filter(document => !excludedFromView(document, relevant));
      const scope = await resolveCompletionScope(root, taskId, {
        allowMissingTargetLock: true,
        additionalDocumentaryReferences: retained.flatMap(governedMetadataReferences),
        additionalLiteralReferences: [...additionalSources, ...retained.filter(document => ownerPattern.test(document.path)).map(document => document.path)],
      });
      if (scope.mode !== "task") throw new Error(scope.fallback_reason ?? "Task scope cannot be established.");
      const next = new Set([...relevant, ...scope.relevant_task_ids]);
      if (next.size === relevant.size) break;
      relevant = next;
    }
    result.relevant_task_ids = [...relevant].sort(compareCodeUnits);
    const kept: DocumentRecord[] = [];
    for (const document of documents) {
      if (excludedFromView(document, relevant)) {
        result.excluded_documents.push({ path: document.path, task_id: ownerPattern.exec(document.path)![1]!,
          content_hash: sha256(document.source), truth_level: document.header!.truth_level });
      } else kept.push(document);
    }
    const omitted = new Set(result.excluded_documents.map(document => document.path));
    for (const diagnostic of repository.diagnostics) {
      const isolatable = diagnostic.severity === "error" && diagnostic.path && omitted.has(diagnostic.path)
        && (diagnostic.code === "SCHEMA005" || (diagnostic.code === "REF001" && diagnostic.detail?.startsWith("Reference owner:")
          && diagnostic.detail.includes("Missing target:")));
      if (isolatable) result.isolated_findings.push(diagnostic);
      else if (diagnostic.severity === "error") result.blocking_findings.push(diagnostic);
    }
    if (result.blocking_findings.length === 0) {
      const index = buildContextIndex(kept);
      // Domain-bind the view to its task/scope/exclusions, not merely documents.
      index.root_hash = sha256(JSON.stringify({ kind: "task-working", task_id: taskId,
        relevant_task_ids: result.relevant_task_ids, excluded_documents: result.excluded_documents, documents: index.documents }));
      result.index = index;
      result.ok = true;
    }
  } catch (error) {
    result.fallback_reason = error instanceof Error ? error.message : String(error);
    result.blocking_findings = [...repository.diagnostics.filter(diagnostic => diagnostic.severity === "error"),
      { severity: "error", code: "WIDX001", message: "Task working-index safety/scope could not be established", detail: result.fallback_reason }];
    result.index = null;
    result.ok = false;
  }
  return result;
}

export async function requireTaskWorkingIndex(root: string, taskId: string, additionalSources: string[] = []): Promise<TaskWorkingIndexReport & { index: ContextIndex }> {
  const report = await createTaskWorkingIndex(root, taskId, additionalSources);
  if (!report.ok || !report.index) throw new Error(formatTaskWorkingIndex(report));
  return report as TaskWorkingIndexReport & { index: ContextIndex };
}

export function formatTaskWorkingIndex(report: TaskWorkingIndexReport): string {
  return [`Task working index ${report.ok ? "PASS" : "FAIL"}: ${report.task_id} (no global-index write; NOT completion/CI approval)`,
    `Scope: ${report.relevant_task_ids.join(", ") || "unconfirmed"}; documents: ${report.index?.documents.length ?? "unavailable"}`,
    `Repository structural preflight: ${report.repository_preflight.ok ? "PASS" : "FAIL"}; ${report.repository_preflight.stats.errors} errors, ${report.repository_preflight.stats.warnings} warnings. Active lock integrity is checked; current source/index freshness is not.`,
    ...report.isolated_findings.map(d => `ISOLATED ${d.code} ${JSON.stringify(d.path)}: ${d.message}${d.detail ? "\n  " + d.detail : ""}`),
    ...report.blocking_findings.map(d => `BLOCKING ${d.code} ${JSON.stringify(d.path ?? "")}: ${d.message}${d.detail ? "\n  " + d.detail : ""}`),
    ...report.repository_preflight.diagnostics.filter(d => d.severity === "warning").map(d => `WARN ${d.code} ${JSON.stringify(d.path ?? "")}: ${d.message}${d.detail ? "\n  " + d.detail : ""}`),
    ...(report.fallback_reason ? [`Scope unavailable: ${report.fallback_reason}`] : []),
    "Only positively noncanonical, unrelated Markdown header-schema/missing-local-reference defects are isolatable. Unparsable headers, unsafe/unknown findings, dependencies and structured corruption remain blocking."].join("\n");
}
