import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseDocument, stringify } from "yaml";
import {
  detectCompatibility,
  type CompatibilityArtifact,
  type IntegrationId,
} from "./compatibility.js";
import { isIsoDateTime } from "./date-time.js";
import { normalizePath, sha256 } from "./indexer.js";

export type ExternalEvidenceKind = "execution-summary" | "verification" | "human-acceptance" | "review";
export type ProjectEvidenceKind =
  | "technical-test"
  | "technical-build"
  | "semantic-runtime"
  | "visual-render"
  | "screenshot"
  | "data-safety-snapshot";
export type ProjectEvidenceStatus = "pass" | "fail" | "inconclusive" | "not-run";
export type ProjectEvidenceSubjectRole = "test-source" | "implementation" | "report" | "artifact" | "snapshot";

export interface ProjectEvidenceSubject {
  path: string;
  role: ProjectEvidenceSubjectRole;
  content_hash: string;
}

export interface ProjectEvidenceRecord {
  version: 1;
  evidence_id: string;
  task_id: string;
  kind: ProjectEvidenceKind;
  status: ProjectEvidenceStatus;
  claim: string;
  summary: string;
  observed_at: string;
  producer: { tool: string; command: string | null };
  subjects: ProjectEvidenceSubject[];
  references: string[];
  record_hash: string;
}

export interface RecordProjectEvidenceOptions {
  root: string;
  taskId: string;
  evidenceId: string;
  kind: ProjectEvidenceKind;
  status: ProjectEvidenceStatus;
  claim: string;
  summary: string;
  subjectPaths: string[];
  subjectRole?: ProjectEvidenceSubjectRole;
  references?: string[];
  tool?: string;
  command?: string | null;
  observedAt?: string;
  apply?: boolean;
}

export interface RecordProjectEvidenceReport {
  root: string;
  task_id: string;
  evidence_id: string;
  mode: "dry-run" | "applied";
  output_path: string;
  output_modified: boolean;
  record: ProjectEvidenceRecord;
}

export interface ExternalEvidenceCandidate {
  source_system: IntegrationId;
  path: string;
  artifact_kind: ExternalEvidenceKind;
  authority: "external-operational";
  content_hash: string;
}

export interface EvidenceDiscoveryReport {
  root: string;
  candidates: ExternalEvidenceCandidate[];
  notices: string[];
}

export interface ExternalEvidenceReference extends ExternalEvidenceCandidate {
  recorded_at: string;
}

export interface LinkEvidenceOptions {
  root: string;
  changePath: string;
  sources: string[];
  apply?: boolean;
  recordedAt?: string;
}

export interface LinkEvidenceReport {
  root: string;
  change_path: string;
  mode: "dry-run" | "applied";
  additions: ExternalEvidenceReference[];
  already_linked: string[];
  external_sources_modified: false;
  change_record_modified: boolean;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function evidenceKind(artifact: CompatibilityArtifact): ExternalEvidenceKind | undefined {
  if (artifact.role === "summary") return "execution-summary";
  if (artifact.role === "verification") return "verification";
  if (artifact.role === "acceptance") return "human-acceptance";
  if (artifact.role === "review") return "review";
  return undefined;
}

function resolveInsideRoot(root: string, relativePath: string, label: string): { absolute: string; relative: string } {
  const relative = normalizePath(relativePath.replace(/^\.\//, ""));
  if (!relative || path.isAbsolute(relativePath) || relative === ".." || relative.startsWith("../")) {
    throw new Error(`${label} must be a repository-relative path inside the project: ${relativePath}`);
  }
  const absolute = path.resolve(root, ...relative.split("/"));
  const relativeToRoot = normalizePath(path.relative(root, absolute));
  if (relativeToRoot === ".." || relativeToRoot.startsWith("../") || path.isAbsolute(relativeToRoot)) {
    throw new Error(`${label} escapes the project: ${relativePath}`);
  }
  return { absolute, relative: relativeToRoot };
}

async function assertRealPathInsideRoot(root: string, absolutePath: string, label: string): Promise<void> {
  const realRoot = await realpath(root);
  let probe = absolutePath;
  let resolved: string | undefined;
  while (!resolved) {
    try {
      resolved = await realpath(probe);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = path.dirname(probe);
      if (parent === probe) throw error;
      probe = parent;
    }
  }
  const relative = path.relative(realRoot, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} resolves outside the project through a symbolic link`);
  }
}

export function computeProjectEvidenceHash(value: Omit<ProjectEvidenceRecord, "record_hash">): string {
  // Version 1 hashes the public protocol's ordered payload via JSON.stringify, UTF-8, and SHA-256.
  return sha256(JSON.stringify(value));
}

export async function recordProjectEvidence(options: RecordProjectEvidenceOptions): Promise<RecordProjectEvidenceReport> {
  const root = path.resolve(options.root);
  const taskId = options.taskId.trim();
  const evidenceId = options.evidenceId.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(taskId)) throw new Error("task id must be one repository-local task directory name");
  if (!/^EVID-[A-Z0-9-]+$/.test(evidenceId)) throw new Error("evidence id must match EVID-[A-Z0-9-]+");
  if (!options.claim.trim() || !options.summary.trim()) throw new Error("claim and summary must not be empty");
  if (options.subjectPaths.length === 0) throw new Error("at least one --subject path is required");
  const observedAt = options.observedAt ?? new Date().toISOString();
  if (!isIsoDateTime(observedAt)) throw new Error("observed-at must be an ISO date-time");
  const taskState = resolveInsideRoot(root, `.agent-context/tasks/${taskId}/state.yaml`, "task state");
  await assertRealPathInsideRoot(root, taskState.absolute, "task state");
  try {
    await readFile(taskState.absolute);
  } catch {
    throw new Error(`task state does not exist: ${taskState.relative}`);
  }

  const subjects: ProjectEvidenceSubject[] = [];
  for (const subjectPath of [...new Set(options.subjectPaths)]) {
    const subject = resolveInsideRoot(root, subjectPath, "subject path");
    await assertRealPathInsideRoot(root, subject.absolute, "subject path");
    let content: Buffer;
    try {
      content = await readFile(subject.absolute);
    } catch {
      throw new Error(`subject path does not exist: ${subject.relative}`);
    }
    subjects.push({
      path: subject.relative,
      role: options.subjectRole ?? "artifact",
      content_hash: sha256(content),
    });
  }
  subjects.sort((left, right) => left.path.localeCompare(right.path));
  const references: string[] = [];
  for (const reference of [...new Set(options.references ?? [])]) {
    const resolved = resolveInsideRoot(root, reference, "reference");
    await assertRealPathInsideRoot(root, resolved.absolute, "reference");
    references.push(resolved.relative);
  }
  references.sort((left, right) => left.localeCompare(right));
  const payload: Omit<ProjectEvidenceRecord, "record_hash"> = {
    version: 1,
    evidence_id: evidenceId,
    task_id: taskId,
    kind: options.kind,
    status: options.status,
    claim: options.claim.trim(),
    summary: options.summary.trim(),
    observed_at: observedAt,
    producer: { tool: options.tool?.trim() || "project-workflow", command: options.command?.trim() || null },
    subjects,
    references,
  };
  const record: ProjectEvidenceRecord = { ...payload, record_hash: computeProjectEvidenceHash(payload) };
  const outputPath = `.agent-context/tasks/${taskId}/evidence/${evidenceId}.evidence.yaml`;
  const output = resolveInsideRoot(root, outputPath, "evidence output");
  await assertRealPathInsideRoot(root, output.absolute, "evidence output");
  const serialized = stringify(record, { lineWidth: 0 });
  let previous: string | undefined;
  try {
    previous = await readFile(output.absolute, "utf8");
  } catch {
    previous = undefined;
  }
  const outputModified = previous !== serialized;
  if (options.apply && previous !== undefined && outputModified) {
    throw new Error(`evidence record already exists with different content: ${outputPath}`);
  }
  if (options.apply && outputModified) {
    await mkdir(path.dirname(output.absolute), { recursive: true });
    await writeFile(output.absolute, serialized, "utf8");
  }
  return {
    root,
    task_id: taskId,
    evidence_id: evidenceId,
    mode: options.apply ? "applied" : "dry-run",
    output_path: outputPath,
    output_modified: Boolean(options.apply && outputModified),
    record,
  };
}

export function formatProjectEvidenceReport(report: RecordProjectEvidenceReport): string {
  return [
    `Project evidence ${report.mode}: ${report.evidence_id}`,
    `Kind/status: ${report.record.kind}/${report.record.status}`,
    `Subjects: ${report.record.subjects.length}`,
    `Output: ${report.output_path} (${report.mode === "dry-run" ? "not written" : report.output_modified ? "written" : "unchanged"})`,
    `Record hash: ${report.record.record_hash}`,
    "Subject source text was not copied into the evidence record.",
  ].join("\n");
}

export async function discoverEvidenceCandidates(rootInput: string): Promise<EvidenceDiscoveryReport> {
  const root = path.resolve(rootInput);
  const compatibility = await detectCompatibility(root);
  const candidates: ExternalEvidenceCandidate[] = [];
  const notices: string[] = [];

  for (const integration of compatibility.integrations) {
    for (const artifact of integration.artifacts) {
      const artifactKind = evidenceKind(artifact);
      if (!artifactKind) continue;
      const absolutePath = path.join(root, ...artifact.path.split("/"));
      candidates.push({
        source_system: integration.id,
        path: artifact.path,
        artifact_kind: artifactKind,
        authority: "external-operational",
        content_hash: sha256(await readFile(absolutePath)),
      });
    }
    if (integration.id === "superpowers" && integration.detected && !candidates.some((candidate) => candidate.source_system === "superpowers")) {
      notices.push("Superpowers specs/plans were detected, but its default layout contains no standard durable code-review artifact to link.");
    }
  }

  candidates.sort((left, right) => left.path.localeCompare(right.path));
  return { root, candidates, notices };
}

export async function linkExternalEvidence(options: LinkEvidenceOptions): Promise<LinkEvidenceReport> {
  const root = path.resolve(options.root);
  const changeTarget = resolveInsideRoot(root, options.changePath, "change path");
  if (!/^change\.ya?ml$/i.test(path.posix.basename(changeTarget.relative))) {
    throw new Error(`change path must point to change.yaml or change.yml: ${changeTarget.relative}`);
  }
  if (options.sources.length === 0) throw new Error("at least one --source path is required");

  const discovery = await discoverEvidenceCandidates(root);
  const candidateByPath = new Map(discovery.candidates.map((candidate) => [candidate.path, candidate]));
  const selected: ExternalEvidenceCandidate[] = [];
  for (const source of options.sources) {
    const normalized = resolveInsideRoot(root, source, "source path").relative;
    const candidate = candidateByPath.get(normalized);
    if (!candidate) {
      throw new Error(`source is not a detected durable evidence candidate: ${normalized}`);
    }
    if (!selected.some((entry) => entry.path === candidate.path)) selected.push(candidate);
  }

  const rawChange = await readFile(changeTarget.absolute, "utf8");
  const document = parseDocument(rawChange);
  if (document.errors.length > 0) throw new Error(`change record cannot be parsed: ${document.errors[0]!.message}`);
  const change = document.toJS() as unknown;
  if (!isRecord(change) || typeof change.change_id !== "string") {
    throw new Error("change record must contain a change_id");
  }
  const existingValue = change.external_evidence;
  if (existingValue !== undefined && !Array.isArray(existingValue)) {
    throw new Error("external_evidence must be an array");
  }
  const existing = (Array.isArray(existingValue) ? existingValue : []).filter(isRecord);
  const existingPaths = new Set(existing.map((entry) => entry.path).filter((value): value is string => typeof value === "string"));
  const alreadyLinked = selected.filter((candidate) => existingPaths.has(candidate.path)).map((candidate) => candidate.path);
  const recordedAt = options.recordedAt ?? new Date().toISOString();
  const additions: ExternalEvidenceReference[] = selected
    .filter((candidate) => !existingPaths.has(candidate.path))
    .map((candidate) => ({ ...candidate, recorded_at: recordedAt }));

  if (options.apply && additions.length > 0) {
    document.set("external_evidence", [...existing, ...additions]);
    await writeFile(changeTarget.absolute, document.toString(), "utf8");
  }

  return {
    root,
    change_path: changeTarget.relative,
    mode: options.apply ? "applied" : "dry-run",
    additions,
    already_linked: alreadyLinked,
    external_sources_modified: false,
    change_record_modified: Boolean(options.apply && additions.length > 0),
  };
}

export function formatEvidenceDiscovery(report: EvidenceDiscoveryReport): string {
  const lines = [`External evidence scan: ${report.root}`];
  for (const candidate of report.candidates) {
    lines.push(`CANDIDATE ${candidate.source_system} ${candidate.artifact_kind}: ${candidate.path} (${candidate.content_hash})`);
  }
  for (const notice of report.notices) lines.push(`NOTICE: ${notice}`);
  if (report.candidates.length === 0) lines.push("No durable external evidence candidates detected.");
  lines.push("Candidates remain external, read-only, and non-canonical.");
  return lines.join("\n");
}

export function formatLinkEvidenceReport(report: LinkEvidenceReport): string {
  const lines = [`External evidence ${report.mode}: ${report.change_path}`];
  for (const addition of report.additions) lines.push(`LINK ${addition.artifact_kind}: ${addition.path} (${addition.content_hash})`);
  for (const duplicate of report.already_linked) lines.push(`ALREADY LINKED: ${duplicate}`);
  lines.push(`Change record modified: ${report.change_record_modified ? "yes" : "no"}`);
  lines.push("External source files modified: no");
  return lines.join("\n");
}
