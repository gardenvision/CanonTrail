import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parse, stringify } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { compileContext, serializeContextLock } from "../src/context.js";
import { createHandoff, type Handoff } from "../src/handoff.js";
import { generateContextIndex } from "../src/indexer.js";
import {
  computeResumePacketHash,
  createResumePacket,
  serializeResumePacket,
  type ResumePacket,
} from "../src/resume.js";
import { validateRepository, validateResumePacketAt } from "../src/validator.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];
const createdAt = "2026-08-27T01:30:00+02:00";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true,
    maxRetries: process.platform === "win32" ? 8 : 0,
    retryDelay: 100,
  })));
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
  - resume fixture
primary_systems:
  - resume fixture
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
  const root = await mkdtemp(path.join(tmpdir(), "canontrail-resume-test-"));
  roots.push(root);
  await cp(path.resolve("schemas"), path.join(root, "schemas"), { recursive: true });
  await mkdir(path.join(root, ".agent-context", "tasks", "T-RESUME-001"), { recursive: true });
  await mkdir(path.join(root, ".planning"), { recursive: true });
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, ".agent-context", "config.yaml"), `version: 1
index_path: .agent-context/context-index.json
schema_path: schemas
governed_paths:
  - .
exclude_paths:
  - .git
  - .planning
  - node_modules
  - dist
require_frontmatter_for_all_markdown: true
require_topic_id_for_canonical: true
allow_missing_references: []
`);
  await writeFile(path.join(root, "AGENTS.md"), markdown("fixture-agent-rules", "# Agent rules\n\nResume only from durable evidence."));
  await writeFile(
    path.join(root, ".agent-context", "tasks", "T-RESUME-001", "brief.md"),
    markdown("fixture-resume-task", "# Resume task\n\nImplement the bounded parser change."),
  );
  await writeFile(
    path.join(root, ".agent-context", "tasks", "T-RESUME-001", "state.yaml"),
    stringify({
      task_id: "T-RESUME-001",
      source_system: "gsd-core",
      source_ref: ".planning/PLAN.md",
      status: "in-progress",
      objective: "Implement and verify the bounded resume fixture.",
      acceptance_criteria: [{
        id: "AC-001",
        statement: "A fresh session resumes without the old transcript.",
        verification: "Validate the immutable packet and receiving lock.",
        status: "pending",
      }],
      dependencies: [],
      file_intents: ["src/feature.ts"],
      checks: [{
        id: "CHECK-FOCUSED",
        command_or_observation: "Run the focused parser test.",
        status: "pending",
        evidence_refs: [],
      }],
    }),
  );
  await writeFile(path.join(root, ".planning", "PLAN.md"), "# External GSD plan\n\nImplement the parser fixture.\n");
  await writeFile(path.join(root, "src", "feature.ts"), "export const feature = 'source-session';\n");
  await generateContextIndex(root);
  await git(root, ["init"]);
  await git(root, ["config", "user.email", "fixture@example.invalid"]);
  await git(root, ["config", "user.name", "CanonTrail Fixture"]);
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "fixture base"]);
  await compileContext({
    root,
    taskId: "T-RESUME-001",
    agentRunId: "source-session-001",
    createdAt: "2026-08-27T01:00:00+02:00",
    apply: true,
  });
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "source context"]);
  await createHandoff({
    root,
    taskId: "T-RESUME-001",
    sourceSessionId: "source-session-001",
    nextSafeAction: "Open src/feature.ts, implement the bounded parser branch, and run CHECK-FOCUSED.",
    createdAt: "2026-08-27T01:10:00+02:00",
    apply: true,
  });
  return root;
}

function options(root: string) {
  return {
    root,
    taskId: "T-RESUME-001",
    receivingSessionId: "receiving-session-002",
    createdAt,
  };
}

describe("createResumePacket", () => {
  it("is deterministic in dry-run and writes nothing", async () => {
    const root = await fixture();
    const activePath = path.join(root, ".agent-context", "tasks", "T-RESUME-001", "context.lock.json");
    const activeBefore = await readFile(activePath, "utf8");

    const first = await createResumePacket(options(root));
    const second = await createResumePacket(options(root));

    expect(first).toEqual(second);
    expect(first.mode).toBe("dry-run");
    expect(first.packet_written).toBe(false);
    expect(first.context_archive_written).toBe(false);
    expect(first.active_context_modified).toBe(false);
    expect(first.packet.raw_transcripts_included).toBe(false);
    expect(first.context_lock.raw_transcripts_included).toBe(false);
    expect(first.context_lock.agent_run_id).toBe("receiving-session-002");
    expect(first.packet.read_order).toContain(".agent-context/tasks/T-RESUME-001/handoff.yaml");
    expect(first.context_lock.sources.find((source) => source.path.endsWith("handoff.yaml"))?.selector)
      .toContain("explicit-include");
    expect(await readFile(activePath, "utf8")).toBe(activeBefore);
    await expect(readFile(path.join(root, ...first.packet_path.split("/")), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(root, ...first.receiving_context_archive_path.split("/")), "utf8")).rejects.toThrow();
  }, 15_000);

  it("applies exact immutable evidence and leaves project and external sources unchanged", async () => {
    const root = await fixture();
    const sourcePath = path.join(root, "src", "feature.ts");
    const externalPath = path.join(root, ".planning", "PLAN.md");
    const handoffPath = path.join(root, ".agent-context", "tasks", "T-RESUME-001", "handoff.yaml");
    const [sourceBefore, externalBefore, handoffBefore] = await Promise.all([
      readFile(sourcePath, "utf8"),
      readFile(externalPath, "utf8"),
      readFile(handoffPath, "utf8"),
    ]);

    const applied = await createResumePacket({ ...options(root), apply: true });
    const packetText = await readFile(path.join(root, ...applied.packet_path.split("/")), "utf8");
    const archiveText = await readFile(path.join(root, ...applied.receiving_context_archive_path.split("/")), "utf8");
    const activeText = await readFile(path.join(root, ...applied.active_context_lock_path.split("/")), "utf8");

    expect(applied.packet_written).toBe(true);
    expect(applied.context_archive_written).toBe(true);
    expect(applied.active_context_modified).toBe(true);
    expect(packetText).toBe(serializeResumePacket(applied.packet));
    expect(archiveText).toBe(serializeContextLock(applied.context_lock));
    expect(activeText).toBe(archiveText);
    expect(await readFile(sourcePath, "utf8")).toBe(sourceBefore);
    expect(await readFile(externalPath, "utf8")).toBe(externalBefore);
    expect(await readFile(handoffPath, "utf8")).toBe(handoffBefore);
    expect((await validateRepository(root)).ok).toBe(true);

    const repeated = await createResumePacket({ ...options(root), apply: true });
    expect(repeated.packet_written).toBe(false);
    expect(repeated.context_archive_written).toBe(false);
    expect(repeated.active_context_modified).toBe(false);
  }, 15_000);

  it("fails a missing handoff before changing the active lock", async () => {
    const root = await fixture();
    const active = path.join(root, ".agent-context", "tasks", "T-RESUME-001", "context.lock.json");
    const before = await readFile(active, "utf8");
    await unlink(path.join(root, ".agent-context", "tasks", "T-RESUME-001", "handoff.yaml"));
    await expect(createResumePacket({ ...options(root), apply: true })).rejects.toThrow(/required latest handoff/);
    expect(await readFile(active, "utf8")).toBe(before);
  });

  it("fails a tampered handoff before changing the active lock", async () => {
    const root = await fixture();
    const active = path.join(root, ".agent-context", "tasks", "T-RESUME-001", "context.lock.json");
    const before = await readFile(active, "utf8");
    const handoffPath = path.join(root, ".agent-context", "tasks", "T-RESUME-001", "handoff.yaml");
    const handoff = parse(await readFile(handoffPath, "utf8")) as Handoff;
    handoff.next_safe_action = "A tampered action that is long enough but has no matching handoff hash.";
    await writeFile(handoffPath, stringify(handoff));
    await expect(createResumePacket({ ...options(root), apply: true })).rejects.toThrow(/invalid/);
    expect(await readFile(active, "utf8")).toBe(before);
  });

  it("fails insufficient required budget before changing the active lock", async () => {
    const root = await fixture();
    const active = path.join(root, ".agent-context", "tasks", "T-RESUME-001", "context.lock.json");
    const before = await readFile(active, "utf8");
    await expect(createResumePacket({
      ...options(root),
      totalTokens: 500,
      reservedOutputTokens: 100,
      inputSafetyTokens: 0,
      apply: true,
    })).rejects.toThrow(/required context/);
    expect(await readFile(active, "utf8")).toBe(before);
  });

  it("rejects locale-formatted timestamps", async () => {
    const root = await fixture();
    await expect(createResumePacket({
      ...options(root),
      createdAt: "08/27/2026 01:30:00",
      apply: true,
    })).rejects.toThrow(/ISO date-time/);
  });
});

describe("resume packet validation", () => {
  it("detects packet and receiving-lock tampering", async () => {
    const packetRoot = await fixture();
    const applied = await createResumePacket({ ...options(packetRoot), apply: true });
    const packetPath = path.join(packetRoot, ...applied.packet_path.split("/"));
    const packet = JSON.parse(await readFile(packetPath, "utf8")) as ResumePacket;
    packet.next_safe_action = "Tampered packet action that no longer matches the durable handoff.";
    await writeFile(packetPath, JSON.stringify(packet, null, 2));
    let validation = await validateRepository(packetRoot, { checkIndex: false, checkContextLocks: false });
    expect(validation.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "RESUME001", path: applied.packet_path }),
      expect.objectContaining({ code: "RESUME006", path: applied.packet_path }),
    ]));

    const lockRoot = await fixture();
    const lockApplied = await createResumePacket({ ...options(lockRoot), apply: true });
    await writeFile(path.join(lockRoot, ...lockApplied.receiving_context_archive_path.split("/")), "{}\n");
    validation = await validateRepository(lockRoot, { checkIndex: false, checkContextLocks: false });
    expect(validation.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "RESUME007", path: lockApplied.packet_path }),
    ]));

  });

  it("detects source-session context-lock tampering through the packet", async () => {
    const root = await fixture();
    const applied = await createResumePacket({ ...options(root), apply: true });
    await writeFile(path.join(root, ...applied.packet.source_context_lock_path.split("/")), "{}\n");

    const validation = await validateRepository(root, { checkIndex: false, checkContextLocks: false });
    expect(validation.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "RESUME006", path: applied.packet_path }),
    ]));
  });

  it("detects validly rehashed task, filename, and read-order mismatches", async () => {
    const root = await fixture();
    const applied = await createResumePacket({ ...options(root), apply: true });
    const packetPath = path.join(root, ...applied.packet_path.split("/"));
    const packet = JSON.parse(await readFile(packetPath, "utf8")) as ResumePacket;
    packet.task_id = "T-DIFFERENT";
    packet.read_order = [...packet.read_order].reverse();
    const { packet_hash: _ignored, ...payload } = packet;
    packet.packet_hash = computeResumePacketHash(payload);
    await writeFile(packetPath, JSON.stringify(packet, null, 2));

    const validation = await validateRepository(root, { checkIndex: false, checkContextLocks: false });
    expect(validation.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "RESUME005", path: applied.packet_path }),
      expect.objectContaining({ code: "RESUME006", path: applied.packet_path }),
    ]));
  });

  it("keeps an immutable packet valid after a later active context compile", async () => {
    const root = await fixture();
    const applied = await createResumePacket({ ...options(root), apply: true });
    await compileContext({
      root,
      taskId: "T-RESUME-001",
      agentRunId: "later-session-003",
      createdAt: "2026-08-27T02:00:00+02:00",
      apply: true,
    });

    const validation = await validateRepository(root);
    expect(validation.diagnostics.filter((diagnostic) => diagnostic.path === applied.packet_path)).toEqual([]);
    expect(validation.ok).toBe(true);
  });

  it("detects source drift through the immutable receiving lock", async () => {
    const root = await fixture();
    const applied = await createResumePacket({ ...options(root), apply: true });
    await writeFile(path.join(root, "src", "feature.ts"), "export const feature = 'drifted-after-resume';\n");

    const validation = await validateResumePacketAt(root, applied.packet_path);
    expect(validation.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "RESUME008", path: applied.packet_path }),
    ]));
  });

  it("rejects traversal and non-resume paths in targeted validation", async () => {
    const root = await fixture();
    expect((await validateResumePacketAt(root, "../outside.resume.packet.json")).ok).toBe(false);
    expect((await validateResumePacketAt(root, "src/feature.ts")).ok).toBe(false);
  });
});
