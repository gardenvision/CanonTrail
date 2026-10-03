import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";
import { stringify } from "yaml";
import { loadConfig } from "./config.js";
import { readContinuityText, resolveContinuityFile } from "./continuity-files.js";
import { isIsoDateTime } from "./date-time.js";
import { isGovernedPath, normalizePath, sha256 } from "./indexer.js";

const require = createRequire(import.meta.url);
const IMPACT_AREAS = ["requirement", "data-contracts", "domain-logic", "tests-reference-cases", "example-data",
  "ui-api", "documentation", "diagrams-visuals", "terminology", "operations-compatibility"] as const;
const NEXT_STEPS = [
  "Review the draft objective, acceptance oracles, non-goals, real source paths and dependencies.",
  "Record actual decision authority, documentation structure and all ten impacts before setting change status to decided and starting implementation.",
  "Keep planned outputs in file_intents; cite evidence only after it exists. No check or review has passed yet.",
  "Refresh the index, then compile and inspect a bounded task context. Task creation did not compile a lock or create a handoff.",
] as const;

export interface CreateTaskOptions {
  root: string;
  taskId: string;
  changeId: string;
  objective: string;
  acceptance: string[];
  author: string;
  risk: "low" | "medium" | "high" | "critical";
  createdAt?: string;
  apply?: boolean;
}

function text(value: string, name: string, maxBytes = 16000): string {
  if (typeof value !== "string" || !value.trim() || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)
      || Buffer.byteLength(value, "utf8") > maxBytes) throw new Error(`Invalid ${name}: provide bounded, non-empty text.`);
  return value.trim();
}

async function assertNewTask(root: string, base: string): Promise<void> {
  // Checking a child verifies exact spelling, no-link ancestors and portable components.
  const child = await resolveContinuityFile(root, `${base}/state.yaml`);
  try { await lstat(path.dirname(child)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  throw new Error(`Task directory already exists: ${base}. Continue its owning task; no files were overwritten.`);
}

async function validateDraft(root: string, schemaPath: string, name: string, payload: unknown): Promise<void> {
  const relative = `${schemaPath}/${name}.schema.json`;
  const installed = JSON.parse(await readContinuityText(root, relative));
  const shipped = JSON.parse(await readFile(new URL(`../schemas/${name}.schema.json`, import.meta.url), "utf8"));
  // Check both contracts independently; an old or permissive consumer schema is not authority.
  for (const [label, schema] of [["shipped", shipped], ["installed", installed]] as const) {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    (require("ajv-formats") as FormatsPlugin)(ajv);
    const validate = ajv.compile(schema);
    if (!validate(payload)) throw new Error(`Task draft rejected by ${label} ${relative}: ${ajv.errorsText(validate.errors)}. No task output written.`);
  }
}

/** Draft authoring only. Stable exclusive inputs are required; this does not
 * schedule work, grant a decision, or provide a multi-file crash transaction. */
export async function createTask(options: CreateTaskOptions) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(options.taskId)) throw new Error("Invalid task id: use one portable directory component (up to 128 characters).");
  if (!/^CHG-[A-Z0-9-]{1,124}$/.test(options.changeId)) throw new Error("Invalid change id: use CHG- followed by uppercase letters, digits or hyphens.");
  if (!["low", "medium", "high", "critical"].includes(options.risk)) throw new Error("Explicit risk must be low, medium, high or critical.");
  const objective = text(options.objective, "objective");
  const author = text(options.author, "author", 512);
  if (!Array.isArray(options.acceptance) || options.acceptance.length < 1 || options.acceptance.length > 64) throw new Error("Provide 1..64 explicit acceptance statements.");
  const acceptance = options.acceptance.map((entry, i) => text(entry, `acceptance ${i + 1}`));
  if (new Set(acceptance).size !== acceptance.length) throw new Error("Acceptance statements must be distinct.");
  const createdAt = options.createdAt ?? new Date().toISOString();
  if (!isIsoDateTime(createdAt)) throw new Error("created-at must be an ISO date-time.");
  const root = path.resolve(options.root);
  const base = `.agent-context/tasks/${options.taskId}`;
  await assertNewTask(root, base);
  // An initialized, readable local entry is required. Never fall back to implicit init.
  await readContinuityText(root, ".agent-context/config.yaml");
  await readContinuityText(root, "AGENTS.md");
  const config = await loadConfig(root);
  const paths = ["brief.md", "state.yaml", "change.yaml"].map(name => `${base}/${name}`);
  for (const relative of paths) {
    const isExcluded = config.excludePaths.some(entry => {
      const prefix = normalizePath(entry).replace(/\/$/, "");
      return prefix === "." || relative === prefix || relative.startsWith(prefix + "/");
    });
    if (isExcluded || !isGovernedPath(relative, config)) throw new Error(`Task output is excluded or outside governed paths: ${relative}. Review configuration explicitly; nothing was changed.`);
  }
  const criteria = acceptance.map((statement, i) => ({ id: `AC-${String(i + 1).padStart(3, "0")}`, statement,
    verification: "TODO: define an observable oracle and failure/counterexample before implementation.", status: "pending" }));
  const state = { task_id: options.taskId, status: "draft", objective, non_goals: [], acceptance_criteria: criteria,
    dependencies: [], documentation_impact: [], file_intents: [], required_context_sources: [], parallel_safety: "unknown",
    owner: null, worktree: null, checks: [], latest_handoff: null, updated_at: createdAt };
  const change = { version: 1, change_id: options.changeId, revision: 1, title: objective, status: "idea", risk: options.risk,
    author, canonical_source: null, decision_rationale: "",
    documentation_structure: { decision: "reassess-documentation-structure", rationale: "TODO: identify existing topic owners and choose the documentation boundary before deciding this change.", feature_documents: [] },
    acceptance_cases: criteria.map(c => ({ id: c.id, given: "TODO: record the starting condition.", expected: c.statement,
      failure_or_uncertainty: "TODO: define safe failure and unresolved uncertainty.", counterexample: null,
      oracle: c.verification, status: "pending", evidence_refs: [] })),
    impacts: IMPACT_AREAS.map(area => ({ area, decision: "pending", rationale: "TODO: assess this impact before implementation.", evidence_refs: [] })),
    verification: { checks: [], terminology_search: { status: "pending", terms: [], evidence_refs: [] },
      visual_review: { applicable: true, status: "pending", evidence_refs: [] }, unverifiable_items: [] },
    independent_review: { status: "pending", reviewer: null, findings: [], evidence_refs: [], waiver: null },
    supersedes: [], superseded_by: null, updated_at: createdAt };
  const header = { topic_id: `task-${options.taskId}`, stand: createdAt.slice(0, 10), status: "draft", truth_level: "active-snapshot",
    verification: { state: "unverified", evidence: [] }, read_if_task_touches: [options.taskId], primary_systems: [],
    safe_to_edit: ["Owning task; preserve existing project instructions, evidence and peer tasks."], do_not_use_instead: ["AGENTS.md"] };
  const schemaPath = config.schemaPath.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
  await validateDraft(root, schemaPath, "task-state", state);
  await validateDraft(root, schemaPath, "change-record", change);
  await validateDraft(root, schemaPath, "artifact-header", header);
  const yaml = (value: unknown) => stringify(value, { lineWidth: 0 });
  const brief = `---\n${yaml(header)}---\n\n# Task draft: ${options.taskId}\n\n## Objective\n\n${JSON.stringify(objective)}\n\n## Acceptance statements (not verified)\n\n${criteria.map(c => `- ${c.id}: ${JSON.stringify(c.statement)}`).join("\n")}\n\n## Before implementation\n\n${NEXT_STEPS.map(step => `- ${step}`).join("\n")}\n\nNo implementation decision, execution authority, acceptance, review, or canonical promotion is supplied by this scaffold. The caller must resolve every TODO and record actual evidence.\n`;
  const files = [brief, yaml(state), yaml(change)].map((content, i) => ({ path: paths[i]!, bytes: Buffer.byteLength(content), content_hash: sha256(content), content }));
  const written: string[] = [];
  if (options.apply) {
    await assertNewTask(root, base);
    const directory = path.dirname(await resolveContinuityFile(root, `${base}/state.yaml`));
    await mkdir(path.dirname(directory), { recursive: true });
    await assertNewTask(root, base);
    await mkdir(directory); // exclusive directory creation also rejects an empty peer-owned task.
    try {
      for (const file of files) {
        const absolute = await resolveContinuityFile(root, file.path);
        await writeFile(absolute, file.content, { encoding: "utf8", flag: "wx" });
        written.push(file.path);
      }
    } catch (error) {
      throw new Error(`Task draft creation stopped at ${base}; partial new files may remain and were preserved. Inspect before continuing, never overwrite them blindly. Cause: ${(error as Error).message}`);
    }
  }
  return { version: 1 as const, kind: "task-draft" as const, root, task_id: options.taskId, change_id: options.changeId,
    created_at: createdAt, task_status: "draft" as const, change_status: "idea" as const, files,
    writes_performed: written.length > 0, written_paths: written, next_steps: [...NEXT_STEPS],
    boundary: "Draft authoring only: no implementation decision, context lock, handoff, Git operation, execution or passing check. Stable exclusive tree required; multi-file creation is not crash-atomic." };
}

export function formatTaskCreateReport(report: Awaited<ReturnType<typeof createTask>>): string {
  return [`Task draft ${report.writes_performed ? "created" : "preview (no writes)"}: ${JSON.stringify(report.task_id)}`,
    "Task: draft; change: idea; acceptance, impact decisions and review: pending.",
    ...report.files.map(file => `  ${JSON.stringify(file.path)} (${file.bytes} bytes; ${file.content_hash})`),
    ...report.next_steps.map(step => `Next: ${step}`), report.boundary].join("\n");
}
