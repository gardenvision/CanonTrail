import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parse, stringify } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { compileContext } from "../src/context.js";
import {
  computeHandoffHash,
  createHandoff,
  formatHandoffCreateReport,
  serializeHandoff,
  type Handoff,
} from "../src/handoff.js";
import { generateContextIndex } from "../src/indexer.js";
import { validateRepository } from "../src/validator.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];
const createdAt = "2026-08-26T22:30:00+02:00";

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
stand: "2026-08-26"
status: current
truth_level: canonical
verification:
  state: reviewed
  evidence: []
read_if_task_touches:
  - handoff fixture
primary_systems:
  - handoff fixture
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
  const root = await mkdtemp(path.join(tmpdir(), "canontrail-handoff-test-"));
  roots.push(root);
  await cp(path.resolve("schemas"), path.join(root, "schemas"), { recursive: true });
  await mkdir(path.join(root, ".agent-context", "tasks", "T-HANDOFF-001"), { recursive: true });
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
  await writeFile(path.join(root, "AGENTS.md"), markdown("fixture-agent-rules", "# Agent rules\n\nUse durable handoffs."));
  await writeFile(
    path.join(root, ".agent-context", "tasks", "T-HANDOFF-001", "brief.md"),
    markdown("fixture-handoff-task", "# Handoff task\n\nImplement the bounded feature."),
  );
  await writeFile(
    path.join(root, ".agent-context", "tasks", "T-HANDOFF-001", "state.yaml"),
    stringify({
      task_id: "T-HANDOFF-001",
      source_system: "canontrail",
      source_ref: ".agent-context/tasks/T-HANDOFF-001/brief.md",
      status: "in-progress",
      objective: "Implement and verify the bounded handoff fixture.",
      acceptance_criteria: [{
        id: "AC-001",
        statement: "A fresh session can resume safely.",
        verification: "Validate the generated handoff.",
        status: "pending",
      }],
      dependencies: [],
      file_intents: ["src/feature.ts"],
      checks: [{
        id: "CHECK-FOCUSED",
        command_or_observation: "Run the focused test.",
        status: "pending",
        evidence_refs: [],
      }],
    }),
  );
  await writeFile(path.join(root, "src", "feature.ts"), "export const feature = 'initial';\n");
  await generateContextIndex(root);
  await git(root, ["init"]);
  await git(root, ["config", "user.email", "fixture@example.invalid"]);
  await git(root, ["config", "user.name", "CanonTrail Fixture"]);
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "fixture base"]);
  await compileContext({
    root,
    taskId: "T-HANDOFF-001",
    createdAt: "2026-08-26T22:00:00+02:00",
    apply: true,
  });
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "fixture context"]);
  return root;
}

function createOptions(root: string) {
  return {
    root,
    taskId: "T-HANDOFF-001",
    sourceSessionId: "session-fixture-001",
    nextSafeAction: "Open src/feature.ts, implement the bounded behavior, and run CHECK-FOCUSED.",
    createdAt,
  };
}

describe("createHandoff", () => {
  it("is deterministic in dry-run and applies a valid handoff plus exact source-lock archive", async () => {
    const root = await fixture();
    const currentLockPath = path.join(root, ".agent-context", "tasks", "T-HANDOFF-001", "context.lock.json");
    const currentLockBefore = await readFile(currentLockPath, "utf8");

    const first = await createHandoff(createOptions(root));
    const second = await createHandoff(createOptions(root));

    expect(first).toEqual(second);
    expect(first.mode).toBe("dry-run");
    expect(first.output_modified).toBe(false);
    const statePath = path.join(root, ".agent-context/tasks/T-HANDOFF-001/state.yaml");
    const stateBefore = await readFile(statePath, "utf8");
    const reportBefore = JSON.stringify(first);
    expect(formatHandoffCreateReport(first)).toContain("Next (after --apply): ensure");
    expect(formatHandoffCreateReport(first)).toContain('latest_handoff to ".agent-context/tasks/T-HANDOFF-001/handoff.yaml"');
    expect(JSON.stringify(first)).toBe(reportBefore);
    await expect(readFile(path.join(root, ".agent-context", "tasks", "T-HANDOFF-001", "handoff.yaml"), "utf8"))
      .rejects.toThrow();

    const applied = await createHandoff({ ...createOptions(root), apply: true });
    const archive = path.join(root, ...applied.source_context_archive_path.split("/"));
    expect(applied.output_modified).toBe(true);
    expect(formatHandoffCreateReport(applied)).toContain("Next: ensure");
    expect(formatHandoffCreateReport(applied)).toContain("Task state was not modified.");
    expect(formatHandoffCreateReport(applied)).toContain("keep archived source context unchanged");
    expect(await readFile(statePath, "utf8")).toBe(stateBefore);
    const displayed = formatHandoffCreateReport({ ...applied, output_path: 'task/quote"\nname.yaml' });
    expect(displayed).toContain(JSON.stringify('task/quote"\nname.yaml'));
    expect(await readFile(archive, "utf8")).toBe(currentLockBefore);
    expect(await readFile(currentLockPath, "utf8")).toBe(currentLockBefore);
    expect(applied.handoff.worktree_dirty).toBe(false);
    expect(applied.handoff.uncommitted_summary).toBeNull();
    expect(applied.handoff.resume_sources).toContain(".agent-context/tasks/T-HANDOFF-001/context.lock.json");
    expect((await validateRepository(root, { checkIndex: false, checkContextLocks: false })).ok).toBe(true);
  });

  it("records dirty files and structured checkpoint input without rewriting project source", async () => {
    const root = await fixture();
    const featurePath = path.join(root, "src", "feature.ts");
    const changedSource = "export const feature = 'changed by source session';\n";
    await writeFile(featurePath, changedSource);
    const unicodePath = path.join(root, "src", "Änderung mit Leerzeichen.ts");
    await writeFile(unicodePath, "export const ergänzung = true;\n");
    const inputPath = ".agent-context/tasks/T-HANDOFF-001/handoff-input.yaml";
    await writeFile(path.join(root, ...inputPath.split("/")), stringify({
      completed: ["Inspected and changed the bounded feature."],
      decisions: [{
        statement: "Keep the change inside the feature boundary.",
        authority: "approved",
        source: ".agent-context/tasks/T-HANDOFF-001/brief.md",
      }],
      files: [{ path: "src/feature.ts", state: "modified", summary: "Changed the fixture behavior." }],
      checks: [{ name: "focused fixture", status: "not-run", evidence: "" }],
      blockers: [],
      open_questions: ["Should the receiving session add another edge case?"],
      do_not_repeat: ["Do not replace the approved boundary decision."],
      next_safe_action: "Run the focused fixture test, then inspect the exact failure before changing more code.",
    }));

    const report = await createHandoff({
      root,
      taskId: "T-HANDOFF-001",
      sourceSessionId: "session-fixture-002",
      inputPath,
      createdAt,
      apply: true,
    });

    expect(report.handoff.worktree_dirty).toBe(true);
    expect(report.handoff.uncommitted_summary).toContain("src/feature.ts");
    expect(report.handoff.files).toContainEqual({
      path: "src/feature.ts",
      state: "modified",
      summary: "Changed the fixture behavior.",
    });
    expect(report.handoff.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "src/Änderung mit Leerzeichen.ts", state: "created" }),
    ]));
    expect(report.handoff.completed).toEqual(["Inspected and changed the bounded feature."]);
    expect(await readFile(featurePath, "utf8")).toBe(changedSource);
    expect((await validateRepository(root, { checkIndex: false, checkContextLocks: false })).ok).toBe(true);
  });

  it("refuses implicit replacement and archives a valid previous handoff on explicit replacement", async () => {
    const root = await fixture();
    const first = await createHandoff({ ...createOptions(root), apply: true });
    const firstText = serializeHandoff(first.handoff);

    await expect(createHandoff({
      ...createOptions(root),
      createdAt: "2026-08-26T22:31:00+02:00",
      apply: true,
    })).rejects.toThrow(/--replace/);

    const replacement = await createHandoff({
      ...createOptions(root),
      createdAt: "2026-08-26T22:31:00+02:00",
      replace: true,
      apply: true,
    });

    expect(replacement.previous_handoff_archive_path).not.toBeNull();
    expect(await readFile(path.join(root, ...replacement.previous_handoff_archive_path!.split("/")), "utf8"))
      .toBe(firstText);
    expect(replacement.handoff.handoff_hash).not.toBe(first.handoff.handoff_hash);
    expect((await validateRepository(root)).ok).toBe(true);
  });

  it("refuses to replace a structurally invalid existing handoff even when its self-hash is recomputed", async () => {
    const root = await fixture();
    await createHandoff({ ...createOptions(root), apply: true });
    const handoffPath = path.join(root, ".agent-context", "tasks", "T-HANDOFF-001", "handoff.yaml");
    const invalid = parse(await readFile(handoffPath, "utf8")) as Record<string, unknown>;
    delete invalid.objective;
    const { handoff_hash: _ignored, ...payload } = invalid;
    invalid.handoff_hash = computeHandoffHash(payload);
    await writeFile(handoffPath, stringify(invalid));

    await expect(createHandoff({
      ...createOptions(root),
      createdAt: "2026-08-26T22:31:00+02:00",
      replace: true,
      apply: true,
    })).rejects.toThrow(/current schema/);
  });

  it("fails vague next actions before writing outputs", async () => {
    const root = await fixture();
    await expect(createHandoff({
      ...createOptions(root),
      nextSafeAction: "Continue",
      apply: true,
    })).rejects.toThrow(/too vague/);
    await expect(readFile(path.join(root, ".agent-context", "tasks", "T-HANDOFF-001", "handoff.yaml")))
      .rejects.toThrow();
  });

  it("rejects a locale-formatted timestamp before writing outputs", async () => {
    const root = await fixture();
    await expect(createHandoff({
      ...createOptions(root),
      createdAt: "08/26/2026 22:30:00",
      apply: true,
    })).rejects.toThrow(/ISO date-time/);
    await expect(readFile(path.join(root, ".agent-context", "tasks", "T-HANDOFF-001", "handoff.yaml")))
      .rejects.toThrow();
  });
});

describe("handoff validation", () => {
  it("detects self-hash tampering and archived source-lock tampering", async () => {
    const root = await fixture();
    const applied = await createHandoff({ ...createOptions(root), apply: true });
    const handoffPath = path.join(root, ".agent-context", "tasks", "T-HANDOFF-001", "handoff.yaml");
    const handoff = parse(await readFile(handoffPath, "utf8")) as Handoff;
    handoff.next_safe_action = "Tampered action that remains long enough for semantic validation.";
    await writeFile(handoffPath, stringify(handoff));
    let validation = await validateRepository(root, { checkIndex: false, checkContextLocks: false });
    expect(validation.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "HANDOFF005" }),
    ]));

    handoff.handoff_hash = computeHandoffHash((({ handoff_hash: _ignored, ...payload }) => payload)(handoff));
    await writeFile(handoffPath, stringify(handoff));
    await writeFile(path.join(root, ...applied.source_context_archive_path.split("/")), "{}\n");
    validation = await validateRepository(root, { checkIndex: false, checkContextLocks: false });
    expect(validation.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "HANDOFF006" }),
    ]));
  });

  it("detects task-directory mismatch and broken resume references with a valid self-hash", async () => {
    const root = await fixture();
    await createHandoff({ ...createOptions(root), apply: true });
    const handoffPath = path.join(root, ".agent-context", "tasks", "T-HANDOFF-001", "handoff.yaml");
    const handoff = parse(await readFile(handoffPath, "utf8")) as Handoff;
    handoff.task_id = "T-DIFFERENT";
    handoff.resume_sources.push("src/missing.ts");
    const { handoff_hash: _ignored, ...payload } = handoff;
    handoff.handoff_hash = computeHandoffHash(payload);
    await writeFile(handoffPath, stringify(handoff));

    const validation = await validateRepository(root, { checkIndex: false, checkContextLocks: false });
    expect(validation.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "HANDOFF004" }),
      expect.objectContaining({ code: "HANDOFF007" }),
    ]));
  });
});

describe("missing resume source recovery", () => {
  it("refuses replacement when a resume source is missing, and archives the receipt list with an explicit acknowledgment", async () => {
    const root = await fixture();
    const first = await createHandoff({ ...createOptions(root), apply: true });
    expect(first.handoff.resume_sources).toContain("src/feature.ts");
    // Legitimate deletion: a recorded resume source is gone (for example, evidence cleanup).
    await rm(path.join(root, "src", "feature.ts"), { force: true });
    await expect(createHandoff({ ...createOptions(root), replace: true, apply: true })).rejects.toThrow(/missing resume source/);
    const replacement = await createHandoff({
      ...createOptions(root),
      replace: true,
      apply: true,
      allowMissingResumeSources: true,
    });
    expect(replacement.missing_resume_sources).toContain("src/feature.ts");
    expect(formatHandoffCreateReport(replacement)).toContain("WARNING: prior receipt list references missing resume source(s)");
    expect(replacement.previous_handoff_archive_path).not.toBeNull();
    expect(replacement.output_modified).toBe(true);
  });
});
