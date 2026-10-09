import { parse } from "yaml";
import { decodeContinuityText, readContinuityBytes, resolveContinuityFile } from "./continuity-files.js";
import { finalizeRepository, formatFinalizeReport, type FinalizeOptions, type FinalizeReport } from "./finalize.js";

type RecordValue = Record<string, unknown>;
interface RecordedLifecycle {
  state: RecordValue | null;
  change: RecordValue | null;
  unavailable: string[];
  contextPathSafe: boolean;
}

function record(value: unknown): RecordValue | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as RecordValue : null;
}

/** Informational labels only. No inferred status, test run or approval. */
async function readLifecycle(report: FinalizeReport): Promise<RecordedLifecycle> {
  const result: RecordedLifecycle = { state: null, change: null, unavailable: [], contextPathSafe: false };
  if (!report.task_id || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(report.task_id)) {
    result.unavailable.push("task identity is unavailable or invalid");
    return result;
  }
  for (const [kind, names] of [
    ["state", ["state.yaml"]],
    ["change", ["change.yaml", "change.yml"]],
  ] as const) {
    for (let i = 0; i < names.length; i++) {
      const relative = `.agent-context/tasks/${report.task_id}/${names[i]}`;
      try {
        const bytes = await readContinuityBytes(report.root, relative, false);
        if (bytes === undefined) {
          if (i + 1 < names.length) continue;
          throw new Error("artifact is missing");
        }
        result[kind] = record(parse(decodeContinuityText(bytes, relative)));
        if (!result[kind]) throw new Error("artifact is not a mapping");
        break;
      } catch (error) {
        // Match finalize's primary/alternate choice without hiding an unsafe or
        // malformed primary behind a readable alternate.
        result.unavailable.push(`${relative}: ${(error as Error).message}`);
        break;
      }
    }
  }
  try {
    await resolveContinuityFile(report.root, `.agent-context/tasks/${report.task_id}/context.lock.json`, true);
    result.contextPathSafe = true;
  } catch (error) {
    result.unavailable.push(`context identity: ${(error as Error).message}`);
  }
  return result;
}

function label(value: unknown): string {
  return typeof value === "string" ? JSON.stringify(value) : "unavailable";
}

function counts(value: unknown): string {
  if (!Array.isArray(value)) return "unavailable";
  const statuses = ["pass", "pending", "fail", "blocked", "not-applicable", "not-run"];
  const totals = new Map(statuses.map(status => [status, 0]));
  let unknown = 0;
  for (const item of value) {
    const status = record(item)?.status;
    if (typeof status === "string" && totals.has(status)) totals.set(status, totals.get(status)! + 1);
    else unknown++;
  }
  return [...statuses.map(status => `${totals.get(status)} ${status}`), `${unknown} unspecified/unknown`].join(", ");
}

export async function formatTaskStatus(report: FinalizeReport): Promise<string> {
  const lifecycle = await readLifecycle(report);
  const taskGate = report.gates.find(gate => gate.id === "task");
  const structural = report.gates.find(gate => gate.id === "repository");
  const contextConfirmed = lifecycle.contextPathSafe && lifecycle.state?.task_id === report.task_id
    && structural !== undefined && structural.status !== "fail"
    && !taskGate?.findings.some(finding => ["FINALIZE100", "FINALIZE101", "FINALIZE103", "FINALIZE104", "FINALIZE109"].includes(finding.code));
  const lines = [
    `CanonTrail task status: ${label(report.task_id)} (recorded snapshot, not live agent state)`,
    `Recorded lifecycle: task=${label(lifecycle.state?.status)}; change=${label(lifecycle.change?.status)}; independent review=${label(record(lifecycle.change?.independent_review)?.status)}.`,
    `Recorded task acceptance: ${counts(lifecycle.state?.acceptance_criteria)}.`,
    `Recorded project checks: ${counts(lifecycle.state?.checks)} (not executed by this command).`,
    `Recorded change acceptance: ${counts(lifecycle.change?.acceptance_cases)}.`,
    `Recorded change verification: ${counts(record(lifecycle.change?.verification)?.checks)}.`,
    `Own context: ${contextConfirmed ? "CURRENT according to named-task structural checks" : "NOT CONFIRMED; inspect structural/missing-input findings below"}.`,
    `Formal completion: ${report.ok ? "PASS" : "NOT COMPLETE; open gates or errors remain"}.`,
  ];
  for (const issue of lifecycle.unavailable) lines.push(`Recorded metadata unavailable: ${JSON.stringify(issue)}`);
  lines.push("Recorded implemented work is not acceptance, independent review or canonical promotion.",
    formatFinalizeReport(report));
  return lines.join("\n");
}

/** Reuse authoritative predicates/JSON; status never requests index refresh. */
export async function inspectTaskStatus(options: Omit<FinalizeOptions, "refreshIndex" | "taskId"> & { taskId: string }): Promise<FinalizeReport> {
  if (typeof options.taskId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(options.taskId)) {
    throw new Error("task status requires one nonempty repository-local task directory identity");
  }
  return finalizeRepository({ ...options, refreshIndex: false });
}
