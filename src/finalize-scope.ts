import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { isSupportedText, normalizeRelativePath } from "./context.js";
import { normalizePath } from "./indexer.js";
import type { Diagnostic } from "./types.js";

export interface CompletionScope {
  mode: "repository" | "task";
  relevant_task_ids: string[];
  fallback_reason: string | null;
  deferred_findings: Diagnostic[];
}

const taskIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const taskReference = /^\.agent-context\/tasks\/([A-Za-z0-9][A-Za-z0-9._-]*)(?:\/|$)/;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

type ReferenceMode = "documentary" | "declared" | "literal";
async function references(value: unknown, result: Set<string>, checkPath: (value: string) => Promise<void>, mode: ReferenceMode = "documentary"): Promise<void> {
  if (typeof value === "string") {
    if (mode === "documentary" && /^(?:https?:|urn:|mailto:)/i.test(value)) return;
    // Preserve each consumer's contract: declarations use compiler trimming,
    // stored paths are exact, and documentary references strip #fragments.
    const file = mode === "declared" ? normalizeRelativePath(value, "task reference")
      : mode === "literal" ? normalizePath(value) : (value.split("#", 1)[0] ?? "").replace(/\\/g, "/");
    if (!file) return;
    const normalized = path.posix.normalize(file);
    const match = taskReference.exec(normalized);
    if (match?.[1]) result.add(match[1]);
    await checkPath(normalized);
  } else if (Array.isArray(value)) {
    for (const item of value) await references(item, result, checkPath, mode);
  }
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(record) : [];
}

function changeReferences(change: Record<string, unknown> | null): unknown[] {
  if (!change) return [];
  const verification = record(change.verification) ? change.verification : {};
  const review = record(change.independent_review) ? change.independent_review : {};
  const structure = record(change.documentation_structure) ? change.documentation_structure : {};
  const terminology = record(verification.terminology_search) ? verification.terminology_search : {};
  const visual = record(verification.visual_review) ? verification.visual_review : {};
  return [review.evidence_refs, terminology.evidence_refs, visual.evidence_refs,
    ...records(change.acceptance_cases).map(entry => entry.evidence_refs),
    ...records(change.impacts).map(entry => entry.evidence_refs),
    ...records(verification.checks).map(entry => entry.evidence_refs),
    ...records(structure.feature_documents).map(entry => entry.evidence_refs)];
}

// This only resolves documentary dependencies. It never acquires a lease,
// changes task state, follows transcripts, or schedules an executing agent.
export async function resolveCompletionScope(root: string, taskId?: string): Promise<CompletionScope> {
  const global: CompletionScope = { mode: "repository", relevant_task_ids: [], fallback_reason: null, deferred_findings: [] };
  if (taskId === undefined) return global;
  const relevant = new Set<string>();
  try {
    const physicalRoot = await realpath(root);
    const entries = new Map<string, Promise<Set<string>>>();
    const checkedPaths = new Set<string>();
    // Documentary reference matching must not treat an alternate filesystem
    // spelling/link as proof that a selected peer is unrelated. Resolve only
    // contained paths; uncertain identity retains the strict repository scope.
    async function checkReferencePath(value: string): Promise<void> {
      if (/[\r\n\0]/.test(value)) throw new Error("Unsupported control character in a task reference");
      if (checkedPaths.has(value)) return;
      checkedPaths.add(value);
      if (path.posix.isAbsolute(value) || /^[a-z]:/i.test(value) || value === ".." || value.startsWith("../")) {
        throw new Error("Non-local documentary reference cannot establish task scope: " + value);
      }
      if (value === ".") return;
      let parent = physicalRoot;
      for (const segment of value.split("/")) {
        if (!segment) continue;
        const file = path.join(parent, segment);
        let info;
        try { info = await lstat(file); }
        catch (error) {
          // Missing optional paths are not aliases; the validator still owns
          // mandatory-source existence and evidence errors.
          if (["ENOENT", "ENOTDIR", "EINVAL", "ENAMETOOLONG"].includes((error as NodeJS.ErrnoException).code ?? "")) return;
          throw error;
        }
        let names = entries.get(parent);
        if (!names) { names = readdir(parent).then(values => new Set(values)); entries.set(parent, names); }
        if (!(await names).has(segment) || info.isSymbolicLink() || (info.isFile() && info.nlink > 1)) {
          throw new Error("Aliased documentary reference requires global strictness: " + value);
        }
        if (!info.isDirectory() && !info.isFile()) throw new Error("Unsupported documentary reference identity: " + value);
        parent = file;
      }
    }
    async function readTaskFile(id: string, name: string, optional = false): Promise<Record<string, unknown> | null> {
      if (!taskIdPattern.test(id)) throw new Error("Non-local or unsupported dependency identity: " + id);
      const file = path.join(root, ".agent-context", "tasks", id, name);
      await checkReferencePath(".agent-context/tasks/" + id + "/" + name);
      let physical: string;
      try { physical = await realpath(file); }
      catch (error) {
        if (optional && (error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
      const relative = path.relative(physicalRoot, physical);
      if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
        throw new Error("Task dependency resolves outside the repository");
      }
      const value: unknown = parse(await readFile(physical, "utf8"));
      if (!record(value)) throw new Error("Task artifact is not a mapping: " + id + "/" + name);
      return value;
    }
    const pending = [taskId];
    while (pending.length > 0) {
      const id = pending.shift()!;
      if (relevant.has(id)) continue;
      relevant.add(id);
      const state = await readTaskFile(id, "state.yaml");
      if (!state || state.task_id !== id || !Array.isArray(state.dependencies) || state.dependencies.some((entry) => typeof entry !== "string")) {
        throw new Error("Task identity/dependencies cannot be established: " + id);
      }
      const lock = await readTaskFile(id, "context.lock.json", id !== taskId);
      if (lock && lock.task_id !== id) throw new Error("Context lock identity does not match task: " + id);
      const changes = [await readTaskFile(id, "change.yaml", true), await readTaskFile(id, "change.yml", true)];
      const linked = new Set<string>(state.dependencies as string[]);
      // Inspect schema-defined reference fields, not arbitrary objective prose,
      // command text, worktree paths, owner identities or selection explanations.
      await references([state.source_ref, state.latest_handoff, state.documentation_impact,
        state.file_intents, state.required_context_sources], linked, checkReferencePath, "declared");
      await references(records(state.context_sections).map(entry => entry.path), linked, checkReferencePath, "literal");
      await references(records(lock?.sources).map(entry => entry.path), linked, checkReferencePath, "literal");
      await references(records(lock?.omissions).map(entry => entry.candidate), linked, checkReferencePath, "declared");
      const stateEvidence = records(state.checks).map(entry => entry.evidence_refs);
      await references(stateEvidence, linked, checkReferencePath);
      // The compiler additionally loads exact trimmed, supported files below
      // this task's evidence directory. Outside it, evidence stays documentary.
      async function compiledEvidence(value: unknown): Promise<void> {
        if (Array.isArray(value)) { for (const item of value) await compiledEvidence(item); }
        else if (typeof value === "string") {
          let normalized: string;
          try { normalized = normalizeRelativePath(value, "task evidence reference"); } catch { return; }
          if (normalized.startsWith(".agent-context/tasks/" + id + "/evidence/") && isSupportedText(normalized)) {
            await references(normalized, linked, checkReferencePath, "literal");
          }
        }
      }
      await compiledEvidence(stateEvidence);
      for (const [position, change] of changes.entries()) {
        if (!change) continue;
        const evidence = changeReferences(change);
        await references(change.canonical_source, linked, checkReferencePath);
        await references(evidence, linked, checkReferencePath);
        if (position === 0) await compiledEvidence(evidence); // Compiler currently loads change.yaml only.
        const structure = record(change.documentation_structure) ? change.documentation_structure : {};
        for (const feature of records(structure.feature_documents)) {
          await references(feature.path, linked, checkReferencePath, "literal");
          if (feature.action === "update" || feature.status !== "planned") await references(feature.path, linked, checkReferencePath);
        }
        for (const external of records(change.external_evidence)) {
          await references(external.path, linked, checkReferencePath, "literal");
          await references(external.path, linked, checkReferencePath);
        }
      }
      for (const dependency of linked) if (!relevant.has(dependency)) pending.push(dependency);
    }
    return { mode: "task", relevant_task_ids: [...relevant].sort(), fallback_reason: null, deferred_findings: [] };
  } catch (error) {
    // Unresolved ownership is never permission to downgrade a finding.
    return { ...global, relevant_task_ids: [...relevant].sort(), fallback_reason: error instanceof Error ? error.message : String(error) };
  }
}

export function partitionCompletionDiagnostics(scope: CompletionScope, diagnostics: Diagnostic[]): Diagnostic[] {
  scope.deferred_findings = [];
  if (scope.mode !== "task") return diagnostics;
  return diagnostics.filter((diagnostic) => {
    const drift = diagnostic.context_drift;
    const expectedCode = drift?.kind === "source-content" ? "LOCK004" : drift?.kind === "task-requirements" ? "LOCK008" : undefined;
    const ownedPath = drift ? ".agent-context/tasks/" + drift.task_id + "/context.lock.json" : undefined;
    if (drift && diagnostic.severity === "error" && diagnostic.code === expectedCode && diagnostic.path === ownedPath && !scope.relevant_task_ids.includes(drift.task_id)) {
      scope.deferred_findings.push(diagnostic);
      return false;
    }
    return true;
  });
}
