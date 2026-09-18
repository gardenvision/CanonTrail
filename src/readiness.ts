import { access, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { normalizePath, sha256 } from "./indexer.js";
import { compareCodeUnits } from "./ordering.js";

export type GsdReadinessDeclaredStatus = "ready" | "not-ready" | "human-decision-required";
export type GsdReadinessObservationState = "current" | "stale" | "invalid" | "unsupported";

export interface GsdReadinessFinding {
  code: string;
  message: string;
  source_path?: string;
}

export interface GsdReadinessSourceObservation {
  path: string;
  expected_hash: string;
  actual_hash: string | null;
  current: boolean;
}

export interface GsdReadinessObservation {
  path: string;
  contract: "project-policy/gsd-phase-readiness";
  schema_version: number | null;
  contract_owner: string | null;
  workflow_owner: string | null;
  declared_status: GsdReadinessDeclaredStatus | null;
  state: GsdReadinessObservationState;
  findings: GsdReadinessFinding[];
  sources: GsdReadinessSourceObservation[];
}

type JsonRecord = Record<string, unknown>;

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const DECLARED_STATUSES = new Set<GsdReadinessDeclaredStatus>([
  "ready",
  "not-ready",
  "human-decision-required",
]);
const CHECK_STATUSES = new Set(["pass", "fail", "unknown", "not-applicable"]);

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

function relativePath(value: string): string | undefined {
  const normalized = normalizePath(value.trim().replace(/^\.\//, ""));
  if (!normalized || path.isAbsolute(value) || normalized === ".." || normalized.startsWith("../")) {
    return undefined;
  }
  return normalized;
}

async function safeFile(root: string, repositoryPath: string): Promise<string | undefined> {
  const normalized = relativePath(repositoryPath);
  if (!normalized) return undefined;
  const absolute = path.join(root, ...normalized.split("/"));
  if (!(await exists(absolute))) return undefined;
  const [realRoot, realTarget] = await Promise.all([realpath(root), realpath(absolute)]);
  const relative = normalizePath(path.relative(realRoot, realTarget));
  if (relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)) return undefined;
  return realTarget;
}

function frontmatter(source: string): unknown {
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) throw new Error("readiness projection must start with YAML frontmatter");
  const end = normalized.indexOf("\n---", 4);
  if (end < 0) throw new Error("readiness projection frontmatter is not closed");
  return parse(normalized.slice(4, end));
}

function finding(code: string, message: string, sourcePath?: string): GsdReadinessFinding {
  return { code, message, ...(sourcePath ? { source_path: sourcePath } : {}) };
}

function stableFindings(findings: GsdReadinessFinding[]): GsdReadinessFinding[] {
  return findings.sort((left, right) =>
    compareCodeUnits(left.code, right.code) ||
    compareCodeUnits(left.source_path ?? "", right.source_path ?? "") ||
    compareCodeUnits(left.message, right.message));
}

function baseObservation(repositoryPath: string): GsdReadinessObservation {
  return {
    path: repositoryPath,
    contract: "project-policy/gsd-phase-readiness",
    schema_version: null,
    contract_owner: null,
    workflow_owner: null,
    declared_status: null,
    state: "invalid",
    findings: [],
    sources: [],
  };
}

export async function observeGsdReadiness(
  rootInput: string,
  readinessPathInput: string,
): Promise<GsdReadinessObservation> {
  const root = path.resolve(rootInput);
  const readinessPath = relativePath(readinessPathInput);
  const observation = baseObservation(readinessPath ?? readinessPathInput);
  if (!readinessPath || !readinessPath.startsWith(".planning/") || !readinessPath.endsWith("-READINESS.md")) {
    observation.findings.push(finding(
      "RDY001",
      "readiness projection must be a repository-relative *-READINESS.md file under .planning",
    ));
    return observation;
  }

  const absoluteReadiness = await safeFile(root, readinessPath);
  if (!absoluteReadiness) {
    observation.findings.push(finding("RDY002", "readiness projection is missing or resolves outside the repository"));
    return observation;
  }

  let value: unknown;
  try {
    value = frontmatter(await readFile(absoluteReadiness, "utf8"));
  } catch (error) {
    observation.findings.push(finding("RDY003", (error as Error).message));
    return observation;
  }
  if (!isRecord(value)) {
    observation.findings.push(finding("RDY003", "readiness frontmatter must contain a mapping"));
    return observation;
  }

  observation.schema_version = typeof value.schema_version === "number" ? value.schema_version : null;
  observation.contract_owner = typeof value.contract_owner === "string" ? value.contract_owner : null;
  observation.workflow_owner = typeof value.workflow_owner === "string" ? value.workflow_owner : null;
  observation.declared_status = typeof value.status === "string" && DECLARED_STATUSES.has(value.status as GsdReadinessDeclaredStatus)
    ? value.status as GsdReadinessDeclaredStatus
    : null;

  if (value.artifact_kind !== "gsd-phase-readiness") {
    observation.findings.push(finding("RDY004", "artifact_kind must be gsd-phase-readiness"));
  }
  if (observation.schema_version !== 1) {
    observation.state = "unsupported";
    observation.findings.push(finding("RDY005", `unsupported readiness schema version: ${String(value.schema_version)}`));
    observation.findings = stableFindings(observation.findings);
    return observation;
  }
  if (observation.contract_owner !== "project-policy") {
    observation.findings.push(finding("RDY006", "contract_owner must be project-policy for the local projection"));
  }
  if (observation.workflow_owner !== "gsd-core") {
    observation.findings.push(finding("RDY007", "workflow_owner must be gsd-core"));
  }
  if (typeof value.phase !== "string" || value.phase.length === 0) {
    observation.findings.push(finding("RDY008", "phase must be a non-empty string"));
  }
  if (!observation.declared_status) {
    observation.findings.push(finding("RDY009", "status must be ready, not-ready, or human-decision-required"));
  }
  if (
    typeof value.assessed_at !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(value.assessed_at) ||
    Number.isNaN(Date.parse(value.assessed_at))
  ) {
    observation.findings.push(finding("RDY010", "assessed_at must be an ISO date-time"));
  }
  if (!Array.isArray(value.sources) || value.sources.length === 0) {
    observation.findings.push(finding("RDY011", "sources must contain at least one hashed repository source"));
  }
  if (!Array.isArray(value.checks) || value.checks.length === 0) {
    observation.findings.push(finding("RDY012", "checks must contain at least one policy check"));
  }
  if (!Array.isArray(value.blockers) || value.blockers.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    observation.findings.push(finding("RDY013", "blockers must be an array of non-empty strings"));
  }
  if (typeof value.next_action !== "string" || value.next_action.length === 0) {
    observation.findings.push(finding("RDY014", "next_action must be a non-empty string"));
  }

  const sourceEntries = records(value.sources);
  if (Array.isArray(value.sources) && sourceEntries.length !== value.sources.length) {
    observation.findings.push(finding("RDY015", "every source entry must be a mapping"));
  }
  const sourcePaths = new Set<string>();
  for (const source of sourceEntries) {
    const sourcePath = typeof source.path === "string" ? relativePath(source.path) : undefined;
    const expectedHash = typeof source.sha256 === "string" ? source.sha256 : "";
    if (!sourcePath) {
      observation.findings.push(finding("RDY015", "source path must be repository-relative"));
      continue;
    }
    if (sourcePath === readinessPath) {
      observation.findings.push(finding("RDY015", "readiness projection cannot hash itself", sourcePath));
      continue;
    }
    if (sourcePaths.has(sourcePath)) {
      observation.findings.push(finding("RDY016", "source paths must be unique", sourcePath));
      continue;
    }
    sourcePaths.add(sourcePath);
    if (!HASH_PATTERN.test(expectedHash)) {
      observation.findings.push(finding("RDY017", "source sha256 must use sha256:<64 lowercase hex>", sourcePath));
      continue;
    }
    const absoluteSource = await safeFile(root, sourcePath);
    if (!absoluteSource) {
      observation.sources.push({ path: sourcePath, expected_hash: expectedHash, actual_hash: null, current: false });
      observation.findings.push(finding("RDY_SOURCE_MISSING", "referenced source is missing or outside the repository", sourcePath));
      continue;
    }
    const actualHash = sha256(await readFile(absoluteSource));
    const current = actualHash === expectedHash;
    observation.sources.push({ path: sourcePath, expected_hash: expectedHash, actual_hash: actualHash, current });
    if (!current) observation.findings.push(finding("RDY_SOURCE_HASH", "referenced source hash is stale", sourcePath));
  }

  const checkEntries = records(value.checks);
  if (Array.isArray(value.checks) && checkEntries.length !== value.checks.length) {
    observation.findings.push(finding("RDY018", "every check entry must be a mapping"));
  }
  const checkIds = new Set<string>();
  let requiredChecks = 0;
  let failingRequiredChecks = 0;
  for (const check of checkEntries) {
    const id = typeof check.id === "string" ? check.id : "";
    const status = typeof check.status === "string" ? check.status : "";
    const required = check.required === true;
    if (!id) observation.findings.push(finding("RDY018", "every check needs a non-empty id"));
    else if (checkIds.has(id)) observation.findings.push(finding("RDY019", "check ids must be unique", id));
    else checkIds.add(id);
    if (!CHECK_STATUSES.has(status)) observation.findings.push(finding("RDY020", "check status is invalid", id || undefined));
    if (typeof check.owner !== "string" || check.owner.length === 0) {
      observation.findings.push(finding("RDY021", "every check needs a non-empty owner", id || undefined));
    }
    if (typeof check.required !== "boolean") {
      observation.findings.push(finding("RDY022", "every check must declare required as a boolean", id || undefined));
    }
    if (!Array.isArray(check.evidence_refs) || check.evidence_refs.some((entry) => typeof entry !== "string")) {
      observation.findings.push(finding("RDY023", "check evidence_refs must be an array of strings", id || undefined));
    }
    if (typeof check.notes !== "string" || check.notes.length === 0) {
      observation.findings.push(finding("RDY024", "every check needs non-empty notes", id || undefined));
    }
    if (required) {
      requiredChecks += 1;
      if (!new Set(["pass", "not-applicable"]).has(status)) failingRequiredChecks += 1;
    }
  }

  if (observation.declared_status === "ready") {
    if (requiredChecks === 0) observation.findings.push(finding("RDY_READY_NO_REQUIRED", "ready requires at least one required check"));
    if (failingRequiredChecks > 0) {
      observation.findings.push(finding("RDY_READY_CHECK", "ready requires every required check to pass or be not-applicable"));
    }
    if (strings(value.blockers).length > 0) observation.findings.push(finding("RDY_READY_BLOCKER", "ready cannot contain blockers"));
  }

  observation.sources.sort((left, right) => compareCodeUnits(left.path, right.path));
  observation.findings = stableFindings(observation.findings);
  const stale = observation.findings.some((entry) => entry.code === "RDY_SOURCE_HASH" || entry.code === "RDY_SOURCE_MISSING");
  const invalid = observation.findings.some((entry) => !["RDY_SOURCE_HASH", "RDY_SOURCE_MISSING"].includes(entry.code));
  observation.state = invalid ? "invalid" : stale ? "stale" : "current";
  return observation;
}
