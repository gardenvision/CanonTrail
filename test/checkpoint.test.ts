import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { stringify } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import {
  createCheckpoint,
  formatCheckpointCreateReport,
  createClaudeCodePreCompactCheckpoint,
  parseClaudeCodePreCompactEvent,
} from "../src/checkpoint.js";
import { compileContext } from "../src/context.js";
import { generateContextIndex } from "../src/indexer.js";
import { validateRepository } from "../src/validator.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];
const createdAt = "2026-08-27T10:30:00+02:00";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function markdown(topicId: string, body: string): string {
  return `---
topic_id: ${topicId}
stand: "2026-08-27"
status: current
truth_level: canonical
verification:
  state: reviewed
  evidence: []
read_if_task_touches:
  - checkpoint fixture
primary_systems:
  - checkpoint fixture
safe_to_edit:
  - Keep the fixture valid.
do_not_use_instead: []
---

${body}
`;
}

async function git(root: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd: root, windowsHide: true });
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "canontrail-checkpoint-test-"));
  roots.push(root);
  await cp(path.resolve("schemas"), path.join(root, "schemas"), { recursive: true });
  await mkdir(path.join(root, ".agent-context", "tasks", "T-CHECKPOINT-001"), { recursive: true });
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, ".agent-context", "config.yaml"), `version: 1
index_path: .agent-context/context-index.json
schema_path: schemas
governed_paths:
  - .
exclude_paths:
  - .git
  - node_modules
  - dist
require_frontmatter_for_all_markdown: true
require_topic_id_for_canonical: true
allow_missing_references: []
`);
  await writeFile(path.join(root, "AGENTS.md"), markdown("fixture-agent-rules", "# Agent rules\n\nUse durable checkpoints."));
  await writeFile(
    path.join(root, ".agent-context", "tasks", "T-CHECKPOINT-001", "brief.md"),
    markdown("fixture-checkpoint-task", "# Checkpoint task\n\nPreserve the bounded task state."),
  );
  await writeFile(
    path.join(root, ".agent-context", "tasks", "T-CHECKPOINT-001", "state.yaml"),
    stringify({
      task_id: "T-CHECKPOINT-001",
      source_system: "canontrail",
      source_ref: ".agent-context/tasks/T-CHECKPOINT-001/brief.md",
      status: "in-progress",
      objective: "Create and verify a bounded pre-compaction checkpoint.",
      acceptance_criteria: [{
        id: "AC-001",
        statement: "A fresh session can resume from the checkpoint.",
        verification: "Validate the generated handoff.",
        status: "pending",
      }],
      dependencies: [],
      file_intents: ["src/feature.ts"],
      checks: [{
        id: "CHECK-FOCUSED",
        command_or_observation: "Run the checkpoint test.",
        status: "pending",
        evidence_refs: [],
      }],
    }),
  );
  await writeFile(path.join(root, "src", "feature.ts"), "export const feature = 'unchanged';\n");
  await generateContextIndex(root);
  await git(root, ["init"]);
  await git(root, ["config", "user.email", "fixture@example.invalid"]);
  await git(root, ["config", "user.name", "CanonTrail Fixture"]);
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "fixture base"]);
  await compileContext({
    root,
    taskId: "T-CHECKPOINT-001",
    createdAt: "2026-08-27T10:20:00+02:00",
    apply: true,
  });
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "fixture context"]);
  return root;
}

const nextAction = "Open src/feature.ts, verify the pending boundary, and run CHECK-FOCUSED before editing.";

describe("provider-neutral checkpoint", () => {
  it("is deterministic and records checkpoint provenance in the durable handoff", async () => {
    const root = await fixture();
    const options = {
      root,
      taskId: "T-CHECKPOINT-001",
      sourceSessionId: "codex-session-001",
      trigger: "pre-compaction" as const,
      provider: "codex",
      providerEvent: "manual",
      nextSafeAction: nextAction,
      createdAt,
    };

    const first = await createCheckpoint(options);
    const second = await createCheckpoint(options);
    expect(first).toEqual(second);
    expect(first.output_modified).toBe(false);
    expect(first.checkpoint).toEqual({
      trigger: "pre-compaction",
      provider: "codex",
      provider_event: "manual",
      transcript_read: false,
      provider_controlled: false,
    });
    expect(formatCheckpointCreateReport(first)).toContain("Next (after --apply): ensure");
    expect(formatCheckpointCreateReport(first)).toContain("latest_handoff");
    expect(first.handoff.checkpoint_trigger).toBe("pre-compaction");
    expect(first.handoff.source_provider).toBe("codex");
    expect(first.handoff.source_provider_event).toBe("manual");

    const applied = await createCheckpoint({ ...options, apply: true });
    expect(applied.output_modified).toBe(true);
    expect(formatCheckpointCreateReport(applied)).toContain("Next: ensure");
    expect(formatCheckpointCreateReport(applied)).toContain("Task state was not modified.");
    expect((await validateRepository(root, { checkIndex: false, checkContextLocks: false })).ok).toBe(true);
  });
});

describe("Claude Code PreCompact adapter", () => {
  it("maps the event without reading its transcript path or changing project source", async () => {
    const root = await fixture();
    const sourcePath = path.join(root, "src", "feature.ts");
    const sourceBefore = await readFile(sourcePath, "utf8");
    const event = {
      session_id: "claude-session-001",
      transcript_path: path.join(root, "missing-and-intentionally-unreadable.jsonl"),
      cwd: path.join(root, "src"),
      hook_event_name: "PreCompact",
      trigger: "auto",
      custom_instructions: "",
    };

    const report = await createClaudeCodePreCompactCheckpoint({
      root,
      taskId: "T-CHECKPOINT-001",
      event,
      nextSafeAction: nextAction,
      createdAt,
      apply: true,
    });

    expect(report.handoff.source_session_id).toBe("claude-session-001");
    expect(report.handoff.checkpoint_trigger).toBe("pre-compaction");
    expect(report.handoff.source_provider).toBe("claude-code");
    expect(report.handoff.source_provider_event).toBe("auto");
    expect(report.checkpoint.transcript_read).toBe(false);
    expect(await readFile(sourcePath, "utf8")).toBe(sourceBefore);
  });

  it("rejects invalid events and an outside-repository cwd before writing a handoff", async () => {
    const root = await fixture();
    const base = {
      root,
      taskId: "T-CHECKPOINT-001",
      nextSafeAction: nextAction,
      createdAt,
      apply: true,
    };

    await expect(createClaudeCodePreCompactCheckpoint({
      ...base,
      event: { session_id: "s", cwd: root, hook_event_name: "PostCompact", trigger: "manual" },
    })).rejects.toThrow(/hook_event_name PreCompact/);
    await expect(createClaudeCodePreCompactCheckpoint({
      ...base,
      event: { session_id: "s", cwd: root, hook_event_name: "PreCompact", trigger: "scheduled" },
    })).rejects.toThrow(/unsupported.*trigger/i);
    await expect(createClaudeCodePreCompactCheckpoint({
      ...base,
      event: { session_id: "s", cwd: path.dirname(root), hook_event_name: "PreCompact", trigger: "manual" },
    })).rejects.toThrow(/outside the CanonTrail repository/);
    await expect(readFile(path.join(root, ".agent-context", "tasks", "T-CHECKPOINT-001", "handoff.yaml"), "utf8"))
      .rejects.toThrow();
  });

  it("parses both documented trigger variants and rejects malformed event fields", () => {
    expect(parseClaudeCodePreCompactEvent({
      session_id: "s",
      cwd: "C:/repo",
      hook_event_name: "PreCompact",
      trigger: "manual",
      transcript_path: "C:/opaque.jsonl",
      custom_instructions: "preserve decisions",
    }).trigger).toBe("manual");
    expect(() => parseClaudeCodePreCompactEvent({
      session_id: "s",
      cwd: "C:/repo",
      hook_event_name: "PreCompact",
      trigger: "auto",
      transcript_path: 42,
    })).toThrow(/transcript_path must be a string/);
  });
});
