import path from "node:path";
import {
  CHECKPOINT_TRIGGERS,
  createHandoff,
  formatHandoffCreateReport,
  type CheckpointTrigger,
  type HandoffCreateReport,
} from "./handoff.js";

type JsonRecord = Record<string, unknown>;

export interface CreateCheckpointOptions {
  root: string;
  taskId: string;
  sourceSessionId: string;
  trigger: CheckpointTrigger;
  provider?: string;
  providerEvent?: string;
  inputPath?: string;
  nextSafeAction?: string;
  handoffId?: string;
  createdAt?: string;
  allowMissingResumeSources?: boolean;
  replace?: boolean;
  apply?: boolean;
}

export interface CheckpointCreateReport extends HandoffCreateReport {
  checkpoint: {
    trigger: CheckpointTrigger;
    provider: string | null;
    provider_event: string | null;
    transcript_read: false;
    provider_controlled: false;
  };
}

export interface ClaudeCodePreCompactEvent {
  session_id: string;
  cwd: string;
  hook_event_name: "PreCompact";
  trigger: "manual" | "auto";
}

export interface CreateClaudeCheckpointOptions {
  root: string;
  taskId: string;
  event: unknown;
  inputPath?: string;
  nextSafeAction?: string;
  handoffId?: string;
  createdAt?: string;
  allowMissingResumeSources?: boolean;
  replace?: boolean;
  apply?: boolean;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Claude Code PreCompact ${field} must be a non-empty string`);
  }
  return value.trim();
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function parseClaudeCodePreCompactEvent(value: unknown): ClaudeCodePreCompactEvent {
  if (!isRecord(value)) throw new Error("Claude Code PreCompact event must be a JSON object");
  const hookEventName = requiredString(value.hook_event_name, "hook_event_name");
  if (hookEventName !== "PreCompact") {
    throw new Error(`expected Claude Code hook_event_name PreCompact, received ${hookEventName}`);
  }
  const trigger = requiredString(value.trigger, "trigger");
  if (trigger !== "manual" && trigger !== "auto") {
    throw new Error(`unsupported Claude Code PreCompact trigger: ${trigger}`);
  }
  const sessionId = requiredString(value.session_id, "session_id");
  const cwd = requiredString(value.cwd, "cwd");
  const transcriptPath = value.transcript_path;
  if (transcriptPath !== undefined && typeof transcriptPath !== "string") {
    throw new Error("Claude Code PreCompact transcript_path must be a string when supplied");
  }
  const customInstructions = value.custom_instructions;
  if (customInstructions !== undefined && typeof customInstructions !== "string") {
    throw new Error("Claude Code PreCompact custom_instructions must be a string when supplied");
  }
  return {
    session_id: sessionId,
    cwd,
    hook_event_name: "PreCompact",
    trigger,
  };
}

export async function createCheckpoint(options: CreateCheckpointOptions): Promise<CheckpointCreateReport> {
  if (!CHECKPOINT_TRIGGERS.includes(options.trigger)) {
    throw new Error(`unsupported checkpoint trigger: ${options.trigger}`);
  }
  const provider = options.provider?.trim();
  if (options.provider !== undefined && !provider) throw new Error("provider must be non-empty when supplied");
  const providerEvent = options.providerEvent?.trim();
  if (options.providerEvent !== undefined && !providerEvent) {
    throw new Error("provider event must be non-empty when supplied");
  }
  if (providerEvent && !provider) throw new Error("provider event requires a provider");

  const handoff = await createHandoff({
    root: options.root,
    taskId: options.taskId,
    sourceSessionId: options.sourceSessionId,
    checkpointTrigger: options.trigger,
    ...(provider ? { sourceProvider: provider } : {}),
    ...(providerEvent ? { sourceProviderEvent: providerEvent } : {}),
    ...(options.inputPath ? { inputPath: options.inputPath } : {}),
    ...(options.nextSafeAction ? { nextSafeAction: options.nextSafeAction } : {}),
    ...(options.handoffId ? { handoffId: options.handoffId } : {}),
    ...(options.createdAt ? { createdAt: options.createdAt } : {}),
    allowMissingResumeSources: options.allowMissingResumeSources ?? false,
    replace: options.replace ?? false,
    apply: options.apply ?? false,
  });
  return {
    ...handoff,
    checkpoint: {
      trigger: options.trigger,
      provider: provider ?? null,
      provider_event: providerEvent ?? null,
      transcript_read: false,
      provider_controlled: false,
    },
  };
}

export async function createClaudeCodePreCompactCheckpoint(
  options: CreateClaudeCheckpointOptions,
): Promise<CheckpointCreateReport> {
  const event = parseClaudeCodePreCompactEvent(options.event);
  const root = path.resolve(options.root);
  if (!path.isAbsolute(event.cwd)) {
    throw new Error(`Claude Code PreCompact cwd must be absolute: ${event.cwd}`);
  }
  const eventCwd = path.resolve(event.cwd);
  if (!isInside(root, eventCwd)) {
    throw new Error(`Claude Code PreCompact cwd is outside the CanonTrail repository: ${event.cwd}`);
  }
  return createCheckpoint({
    root,
    taskId: options.taskId,
    sourceSessionId: event.session_id,
    trigger: "pre-compaction",
    provider: "claude-code",
    providerEvent: event.trigger,
    ...(options.inputPath ? { inputPath: options.inputPath } : {}),
    ...(options.nextSafeAction ? { nextSafeAction: options.nextSafeAction } : {}),
    ...(options.handoffId ? { handoffId: options.handoffId } : {}),
    ...(options.createdAt ? { createdAt: options.createdAt } : {}),
    allowMissingResumeSources: options.allowMissingResumeSources ?? false,
    replace: options.replace ?? false,
    apply: options.apply ?? false,
  });
}

export function formatCheckpointCreateReport(report: CheckpointCreateReport): string {
  return [
    `Checkpoint trigger: ${report.checkpoint.trigger}`,
    `Source provider: ${report.checkpoint.provider ?? "provider-neutral"}`,
    `Provider event: ${report.checkpoint.provider_event ?? "none"}`,
    "Transcript read: no",
    "Provider controlled: no",
    formatHandoffCreateReport(report),
  ].join("\n");
}
