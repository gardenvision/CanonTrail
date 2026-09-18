import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { cp, link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import {
  applyContextPreview,
  compileContext,
  formatContextCompileReport,
  serializeContextLock,
} from "../src/context.js";
import { generateContextIndex } from "../src/indexer.js";
import { recordProjectEvidence } from "../src/evidence.js";
import { validateRepository } from "../src/validator.js";

const roots: string[] = [];
const createdAt = "2026-08-26T19:00:00+02:00";
const execFileAsync = promisify(execFile);

// Some sandboxes (notably Windows without Developer Mode or elevated privileges) refuse to create
// file symlinks with EPERM. The symlink-alias self-guard regression test only runs where the
// environment actually supports creating one, so it stays meaningful instead of silently skipping
// the scenario it exists to catch.
const symlinksSupported = (() => {
  const probeDir = mkdtempSync(path.join(tmpdir(), "canontrail-symlink-probe-"));
  try {
    const target = path.join(probeDir, "target.txt");
    writeFileSync(target, "probe");
    symlinkSync(target, path.join(probeDir, "link.txt"), "file");
    return true;
  } catch {
    return false;
  } finally {
    rmSync(probeDir, { recursive: true, force: true });
  }
})();

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function markdown(
  topicId: string,
  truthLevel: "canonical" | "design-target" | "active-snapshot",
  routing: string[],
  body: string,
): string {
  return `---
topic_id: ${topicId}
stand: "2026-08-26"
status: current
truth_level: ${truthLevel}
verification:
  state: reviewed
  evidence: []
read_if_task_touches:
${routing.map((entry) => `  - ${entry}`).join("\n")}
primary_systems:
${routing.map((entry) => `  - ${entry}`).join("\n")}
safe_to_edit:
  - Keep the fixture valid.
do_not_use_instead: []
---

${body}
`;
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "canontrail-context-test-"));
  roots.push(root);
  await cp(path.resolve("schemas"), path.join(root, "schemas"), { recursive: true });
  await mkdir(path.join(root, ".agent-context", "tasks", "T-FEATURE-001"), { recursive: true });
  await mkdir(path.join(root, ".planning", "phases", "01-feature"), { recursive: true });
  await mkdir(path.join(root, "docs"), { recursive: true });
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "test"), { recursive: true });
  await writeFile(path.join(root, ".agent-context", "config.yaml"), `version: 1
index_path: .agent-context/context-index.json
schema_path: schemas
governed_paths:
  - .
exclude_paths:
  - .git
  - node_modules
  - dist
  - .planning
require_frontmatter_for_all_markdown: true
require_topic_id_for_canonical: true
allow_missing_references: []
`);
  await writeFile(
    path.join(root, "AGENTS.md"),
    markdown("agent-rules", "canonical", ["all repository work"], "# Agent rules\n\nUse durable project truth."),
  );
  await writeFile(
    path.join(root, "docs", "feature-storage.md"),
    markdown("feature-storage", "canonical", ["feature storage"], "# Feature storage\n\nThe storage contract is canonical."),
  );
  await writeFile(
    path.join(root, "docs", "future-storage.md"),
    markdown("future-storage", "design-target", ["feature storage"], "# Future storage\n\nThis design is optional context."),
  );
  await writeFile(
    path.join(root, "docs", "unrelated.md"),
    markdown("unrelated", "canonical", ["rendering graphics"], "# Rendering\n\nUnrelated canonical truth."),
  );
  await writeFile(
    path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "brief.md"),
    markdown("task-feature-001", "active-snapshot", ["feature storage"], "# Task brief\n\nImplement the focused storage feature."),
  );
  await writeFile(
    path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "state.yaml"),
    stringify({
      task_id: "T-FEATURE-001",
      source_system: "gsd-core",
      source_ref: ".planning/phases/01-feature/01-01-PLAN.md",
      status: "in-progress",
      objective: "Implement the feature storage contract.",
      acceptance_criteria: [{
        id: "AC-001",
        statement: "Feature storage remains deterministic.",
        verification: "Run the focused test.",
        status: "pending",
      }],
      dependencies: [],
      documentation_impact: ["docs/feature-storage.md"],
      file_intents: ["src/feature.ts", "src/planned.ts"],
      checks: [],
    }),
  );
  await writeFile(
    path.join(root, ".planning", "phases", "01-feature", "01-01-PLAN.md"),
    "# GSD-owned feature plan\n\nImplement feature storage.\n",
  );
  await writeFile(path.join(root, "src", "feature.ts"), "export const feature = 'storage';\n");
  await writeFile(path.join(root, "test", "feature.test.ts"), "export const expected = 'storage';\n");
  await generateContextIndex(root);
  return root;
}

describe("compileContext", () => {
  it("rejects a locale-formatted timestamp", async () => {
    const root = await fixture();
    await expect(compileContext({
      root,
      taskId: "T-FEATURE-001",
      createdAt: "08/26/2026 19:00:00",
    })).rejects.toThrow(/ISO date-time/);
  });

  it("produces a deterministic lock, records ownership and omissions, and avoids redundant writes", async () => {
    const root = await fixture();
    const options = {
      root,
      taskId: "T-FEATURE-001",
      createdAt,
      includePaths: ["test/feature.test.ts"],
    };

    const first = await compileContext(options);
    const second = await compileContext(options);

    expect(first.mode).toBe("dry-run");
    expect(first.output_modified).toBe(false);
    expect(serializeContextLock(first.lock)).toBe(serializeContextLock(second.lock));
    expect(first.lock.sources.map((source) => source.path)).toEqual([
      "AGENTS.md",
      ".agent-context/tasks/T-FEATURE-001/state.yaml",
      ".agent-context/tasks/T-FEATURE-001/brief.md",
      "docs/feature-storage.md",
      "docs/future-storage.md",
      ".planning/phases/01-feature/01-01-PLAN.md",
      "test/feature.test.ts",
      "src/feature.ts",
    ]);
    expect(first.lock.sources.find((source) => source.level === "L2")).toMatchObject({
      ownership: "external-tool",
      source_system: "gsd-core",
    });
    expect(first.lock.sources.filter((source) => source.ownership === "project").every((source) => source.source_system === null)).toBe(true);
    expect(first.lock.sources.find((source) => source.path === "docs/feature-storage.md")?.truth_level).toBe("canonical");
    expect(first.lock.sources.find((source) => source.path === "src/feature.ts")?.truth_level).toBe("unclassified");
    expect(first.lock.sources.find((source) => source.path === "test/feature.test.ts")?.truth_level).toBe("unclassified");
    expect(first.lock.omissions).toContainEqual({
      candidate: ".agent-context/tasks/T-FEATURE-001/handoff.yaml",
      reason: "No handoff exists for this task yet.",
      required: false,
    });
    expect(first.lock.omissions.some((entry) => entry.candidate === "src/planned.ts")).toBe(true);
    expect(first.omitted_file_intents).toEqual([]);
    expect(first.lock.raw_transcripts_included).toBe(false);
    expect(first.lock.budget.reserved_input_tokens).toBe(1_024);
    expect(first.required_context_breakdown).toEqual([
      { category: "governing-task", source_count: 3, estimated_tokens: expect.any(Number) },
      { category: "metadata-routed-canonical", source_count: 1, estimated_tokens: expect.any(Number) },
      { category: "external-workflow", source_count: 1, estimated_tokens: expect.any(Number) },
      { category: "explicit-required", source_count: 1, estimated_tokens: expect.any(Number) },
      { category: "task-evidence", source_count: 0, estimated_tokens: 0 },
      { category: "other-required", source_count: 0, estimated_tokens: 0 },
    ]);
    expect(first.required_context_breakdown.reduce((sum, entry) => sum + entry.estimated_tokens, 0)).toBe(
      first.lock.sources
        .filter((source) => [
          "AGENTS.md",
          ".agent-context/tasks/T-FEATURE-001/state.yaml",
          ".agent-context/tasks/T-FEATURE-001/brief.md",
          "docs/feature-storage.md",
          ".planning/phases/01-feature/01-01-PLAN.md",
          "test/feature.test.ts",
        ].includes(source.path))
        .reduce((sum, source) => sum + source.estimated_tokens, 0),
    );
    expect(formatContextCompileReport(first)).toContain("metadata-routed-canonical:");
    expect(formatContextCompileReport(first)).toContain("explicit-required:");

    const applied = await compileContext({ ...options, apply: true });
    const repeated = await compileContext({ ...options, apply: true });
    expect(applied.output_modified).toBe(true);
    expect(repeated.output_modified).toBe(false);
    expect(await readFile(path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "context.lock.json"), "utf8"))
      .toBe(serializeContextLock(first.lock));
    expect((await validateRepository(root)).ok).toBe(true);
  }, 15_000);

  it("never selects a legacy task-owned lock file intent and remains valid after recompilation", async () => {
    const root = await fixture();
    const relativeOutput = ".agent-context/tasks/T-FEATURE-001/context.lock.json";
    const output = path.join(root, ...relativeOutput.split("/"));
    const statePath = path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "state.yaml");
    const state = parse(await readFile(statePath, "utf8")) as Record<string, unknown>;
    state.file_intents = [...(state.file_intents as string[]), relativeOutput];
    await writeFile(statePath, stringify(state));

    const beforeOutputExists = await compileContext({ root, taskId: "T-FEATURE-001", createdAt });
    expect(beforeOutputExists.lock.sources.some((source) => source.path === relativeOutput)).toBe(false);
    expect(beforeOutputExists.lock.omissions).toContainEqual({
      candidate: relativeOutput,
      reason: "Task-owned context lock output cannot be selected as its own input.",
      required: false,
    });

    const first = await compileContext({ root, taskId: "T-FEATURE-001", createdAt, apply: true });
    expect(first.output_modified).toBe(true);
    expect((await validateRepository(root)).ok).toBe(true);
    const firstBytes = await readFile(output, "utf8");

    const repeated = await compileContext({ root, taskId: "T-FEATURE-001", createdAt, apply: true });
    expect(repeated.output_modified).toBe(false);
    expect(repeated.lock.sources.some((source) => source.path === relativeOutput)).toBe(false);
    expect(repeated.omitted_file_intents).toEqual([relativeOutput]);
    expect(await readFile(output, "utf8")).toBe(firstBytes);
    expect((await validateRepository(root)).ok).toBe(true);
  });

  it.each([
    ["required_context_sources", "required context source cannot be the context lock output itself"],
    ["includePaths", "explicit include cannot be the context lock output itself"],
  ])("rejects an explicit circular lock input through %s before replacing the output", async (route, message) => {
    const root = await fixture();
    const relativeOutput = ".agent-context/tasks/T-FEATURE-001/context.lock.json";
    const output = path.join(root, ...relativeOutput.split("/"));
    await compileContext({ root, taskId: "T-FEATURE-001", createdAt, apply: true });
    const before = await readFile(output, "utf8");

    if (route === "required_context_sources") {
      const statePath = path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "state.yaml");
      const state = parse(await readFile(statePath, "utf8")) as Record<string, unknown>;
      state.required_context_sources = [relativeOutput];
      await writeFile(statePath, stringify(state));
      await expect(compileContext({ root, taskId: "T-FEATURE-001", createdAt, apply: true }))
        .rejects.toThrow(message);
    } else {
      await expect(compileContext({
        root,
        taskId: "T-FEATURE-001",
        createdAt,
        includePaths: [relativeOutput],
        apply: true,
      })).rejects.toThrow(message);
    }

    expect(await readFile(output, "utf8")).toBe(before);
  });

  it.runIf(process.platform === "win32")(
    "rejects a required context source that differs from the lock output only by path case",
    async () => {
      const root = await fixture();
      const relativeOutput = ".agent-context/tasks/T-FEATURE-001/context.lock.json";
      const output = path.join(root, ...relativeOutput.split("/"));
      await compileContext({ root, taskId: "T-FEATURE-001", createdAt, apply: true });
      const before = await readFile(output, "utf8");

      // Same physical file on a case-insensitive filesystem (Windows), different string.
      const differentCase = ".agent-context/Tasks/T-FEATURE-001/Context.Lock.json";
      const statePath = path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "state.yaml");
      const state = parse(await readFile(statePath, "utf8")) as Record<string, unknown>;
      state.required_context_sources = [differentCase];
      await writeFile(statePath, stringify(state));

      await expect(compileContext({ root, taskId: "T-FEATURE-001", createdAt, apply: true }))
        .rejects.toThrow("required context source cannot be the context lock output itself");
      expect(await readFile(output, "utf8")).toBe(before);
    },
  );

  it.runIf(symlinksSupported)(
    "rejects a required context source that is a symlink alias of the lock output",
    async () => {
      const root = await fixture();
      const relativeOutput = ".agent-context/tasks/T-FEATURE-001/context.lock.json";
      const output = path.join(root, ...relativeOutput.split("/"));
      await compileContext({ root, taskId: "T-FEATURE-001", createdAt, apply: true });
      const before = await readFile(output, "utf8");

      const aliasRelative = ".agent-context/tasks/T-FEATURE-001/context.lock.alias.json";
      await symlink(output, path.join(root, ...aliasRelative.split("/")), "file");
      const statePath = path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "state.yaml");
      const state = parse(await readFile(statePath, "utf8")) as Record<string, unknown>;
      state.required_context_sources = [aliasRelative];
      await writeFile(statePath, stringify(state));

      await expect(compileContext({ root, taskId: "T-FEATURE-001", createdAt, apply: true }))
        .rejects.toThrow("required context source cannot be the context lock output itself");
      expect(await readFile(output, "utf8")).toBe(before);
    },
  );

  it("rejects a required context source that is a hard-link alias of the lock output", async () => {
    const root = await fixture();
    const relativeOutput = ".agent-context/tasks/T-FEATURE-001/context.lock.json";
    const output = path.join(root, ...relativeOutput.split("/"));
    await compileContext({ root, taskId: "T-FEATURE-001", createdAt, apply: true });
    const before = await readFile(output, "utf8");

    const aliasRelative = ".agent-context/tasks/T-FEATURE-001/context.lock.hardlink.json";
    await link(output, path.join(root, ...aliasRelative.split("/")));
    const statePath = path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "state.yaml");
    const state = parse(await readFile(statePath, "utf8")) as Record<string, unknown>;
    state.required_context_sources = [aliasRelative];
    await writeFile(statePath, stringify(state));

    await expect(compileContext({ root, taskId: "T-FEATURE-001", createdAt, apply: true }))
      .rejects.toThrow("required context source cannot be the context lock output itself");
    expect(await readFile(output, "utf8")).toBe(before);
  });

  it("rejects a required context source that transitively cites the compiling task's own lock through another task", async () => {
    const root = await fixture();
    const outputA = ".agent-context/tasks/T-FEATURE-001/context.lock.json";
    const outputB = ".agent-context/tasks/T-FEATURE-002/context.lock.json";

    // Task A compiles and applies first, with no reference to B yet -- nothing circular so far.
    await compileContext({ root, taskId: "T-FEATURE-001", createdAt, apply: true });
    const beforeA = await readFile(path.join(root, ...outputA.split("/")), "utf8");

    // Task B requires A's lock. In isolation this is an ordinary (non-circular) required source, so
    // it must succeed and produce a real lock for B that records outputA among its own sources.
    await mkdir(path.join(root, ".agent-context", "tasks", "T-FEATURE-002"), { recursive: true });
    await writeFile(
      path.join(root, ".agent-context", "tasks", "T-FEATURE-002", "brief.md"),
      markdown("task-feature-002", "active-snapshot", ["feature storage"], "# Task brief\n\nA second, related task."),
    );
    await writeFile(
      path.join(root, ".agent-context", "tasks", "T-FEATURE-002", "state.yaml"),
      stringify({
        task_id: "T-FEATURE-002",
        status: "in-progress",
        objective: "Implement a second feature that builds on task A's work.",
        acceptance_criteria: [{
          id: "AC-001",
          statement: "The second feature remains deterministic.",
          verification: "Run the focused test.",
          status: "pending",
        }],
        dependencies: [],
        documentation_impact: [],
        file_intents: [],
        required_context_sources: [outputA],
        checks: [],
      }),
    );
    await generateContextIndex(root);
    const bReport = await compileContext({ root, taskId: "T-FEATURE-002", createdAt, apply: true });
    expect(bReport.lock.sources.map((source) => source.path)).toContain(outputA);

    // Now A is changed to also require B's lock. Nothing about compiling A in isolation names A's own
    // output, so the plain self-guard cannot see this -- but B's already-written lock cites A's output,
    // so applying this would make A permanently, circularly dependent on B and vice versa.
    const statePathA = path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "state.yaml");
    const stateA = parse(await readFile(statePathA, "utf8")) as Record<string, unknown>;
    stateA.required_context_sources = [outputB];
    await writeFile(statePathA, stringify(stateA));

    await expect(compileContext({ root, taskId: "T-FEATURE-001", createdAt, apply: true }))
      .rejects.toThrow(/circular context-lock dependency/);
    expect(await readFile(path.join(root, ...outputA.split("/")), "utf8")).toBe(beforeA);
  });

  it("rejects an explicit include that creates a transitive context-lock cycle", async () => {
    const root = await fixture();
    const outputA = ".agent-context/tasks/T-FEATURE-001/context.lock.json";
    const outputB = ".agent-context/tasks/T-FEATURE-002/context.lock.json";
    await compileContext({ root, taskId: "T-FEATURE-001", createdAt, apply: true });
    const beforeA = await readFile(path.join(root, ...outputA.split("/")), "utf8");
    await mkdir(path.join(root, ".agent-context", "tasks", "T-FEATURE-002"), { recursive: true });
    await writeFile(
      path.join(root, ...outputB.split("/")),
      JSON.stringify({ task_id: "T-FEATURE-002", sources: [{ path: outputA }] }, null, 2),
    );

    await expect(compileContext({
      root,
      taskId: "T-FEATURE-001",
      createdAt,
      includePaths: [outputB],
      apply: true,
    })).rejects.toThrow(/explicit include creates a circular context-lock dependency/);
    expect(await readFile(path.join(root, ...outputA.split("/")), "utf8")).toBe(beforeA);
  });

  it("omits an optional file intent that creates a transitive context-lock cycle", async () => {
    const root = await fixture();
    const outputA = ".agent-context/tasks/T-FEATURE-001/context.lock.json";
    const outputB = ".agent-context/tasks/T-FEATURE-002/context.lock.json";
    await compileContext({ root, taskId: "T-FEATURE-001", createdAt, apply: true });
    await mkdir(path.join(root, ".agent-context", "tasks", "T-FEATURE-002"), { recursive: true });
    await writeFile(
      path.join(root, ...outputB.split("/")),
      JSON.stringify({ task_id: "T-FEATURE-002", sources: [{ path: outputA }] }, null, 2),
    );
    const statePath = path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "state.yaml");
    const state = parse(await readFile(statePath, "utf8")) as Record<string, unknown>;
    state.file_intents = [outputB];
    await writeFile(statePath, stringify(state));

    const report = await compileContext({ root, taskId: "T-FEATURE-001", createdAt });

    expect(report.lock.sources.some((source) => source.path === outputB)).toBe(false);
    expect(report.lock.omissions).toContainEqual(expect.objectContaining({
      candidate: outputB,
      reason: expect.stringContaining("circular context-lock dependency"),
      required: false,
    }));
  });

  it("fails before replacing an existing lock when required context exceeds the budget", async () => {
    const root = await fixture();
    const output = path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "context.lock.json");
    await compileContext({ root, taskId: "T-FEATURE-001", createdAt, apply: true });
    const before = await readFile(output, "utf8");
    const generous = await compileContext({ root, taskId: "T-FEATURE-001", createdAt });
    const requiredTokens = generous.required_context_breakdown.reduce(
      (sum, entry) => sum + entry.estimated_tokens,
      0,
    );

    const failure = compileContext({
      root,
      taskId: "T-FEATURE-001",
      createdAt,
      totalTokens: requiredTokens - 1,
      reservedOutputTokens: 0,
      inputSafetyTokens: 0,
      apply: true,
    });
    await expect(failure).rejects.toThrow(/required context needs/);
    await expect(failure).rejects.toThrow(/governing-task=\d+ tokens\/3 sources/);
    await expect(failure).rejects.toThrow(/metadata-routed-canonical=\d+ tokens\/1 sources/);
    await expect(failure).rejects.toThrow(/external-workflow=\d+ tokens\/1 sources/);
    expect(await readFile(output, "utf8")).toBe(before);
  });

  it("keeps weak semantic metadata matches optional and ignores path or topic prefixes", async () => {
    const root = await fixture();
    await writeFile(
      path.join(root, "docs", "weak-storage.md"),
      markdown("weak-storage", "canonical", ["storage"], "# Weak storage\n\nIndirectly related guidance."),
    );
    await writeFile(
      path.join(root, "docs", "storage-in-name-only.md"),
      markdown("storage-name-only", "canonical", ["rendering graphics"], "# Name-only match\n\nNot storage guidance."),
    );
    await generateContextIndex(root);

    const generous = await compileContext({ root, taskId: "T-FEATURE-001", createdAt });
    expect(generous.lock.sources.find((source) => source.path === "docs/weak-storage.md")).toMatchObject({
      selector: "metadata-routing",
      selection_reason: "Weak routing metadata matched 1 normalized semantic task term.",
    });
    expect(generous.lock.sources.some((source) => source.path === "docs/storage-in-name-only.md")).toBe(false);

    const requiredTokens = generous.required_context_breakdown.reduce(
      (sum, entry) => sum + entry.estimated_tokens,
      0,
    );
    const bounded = await compileContext({
      root,
      taskId: "T-FEATURE-001",
      createdAt,
      totalTokens: requiredTokens,
      reservedOutputTokens: 0,
      inputSafetyTokens: 0,
    });
    expect(bounded.lock.omissions).toContainEqual(expect.objectContaining({
      candidate: "docs/weak-storage.md",
      required: false,
    }));

    const statePath = path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "state.yaml");
    const state = parse(await readFile(statePath, "utf8")) as Record<string, unknown>;
    state.required_context_sources = ["docs/weak-storage.md"];
    await writeFile(statePath, stringify(state));
    const pinned = await compileContext({ root, taskId: "T-FEATURE-001", createdAt });
    expect(pinned.lock.sources.find((source) => source.path === "docs/weak-storage.md")).toMatchObject({
      selector: "metadata-routing,task-required-context",
      truth_level: "canonical",
    });
    expect(pinned.required_context_breakdown.find((entry) => entry.category === "explicit-required")?.source_count).toBe(1);
  });

  it("refuses to apply unclassified sources until the project context-lock schema is synchronized", async () => {
    const root = await fixture();
    const schemaPath = path.join(root, "schemas", "context-lock.schema.json");
    const schema = JSON.parse(await readFile(schemaPath, "utf8")) as {
      properties: { sources: { items: { properties: { truth_level: { enum: string[] } } } } };
    };
    schema.properties.sources.items.properties.truth_level.enum =
      schema.properties.sources.items.properties.truth_level.enum.filter((value) => value !== "unclassified");
    await writeFile(schemaPath, `${JSON.stringify(schema, null, 2)}\n`);
    const output = path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "context.lock.json");
    await writeFile(output, "existing legacy lock\n");

    await expect(compileContext({ root, taskId: "T-FEATURE-001", createdAt, apply: true }))
      .rejects.toThrow(/synchronize schemas\/context-lock\.schema\.json/);
    expect(await readFile(output, "utf8")).toBe("existing legacy lock\n");

    const preview = await compileContext({ root, taskId: "T-FEATURE-001", createdAt });
    const previewPath = path.join(root, "context-preview.json");
    await writeFile(previewPath, `${JSON.stringify(preview, null, 2)}\n`);
    await expect(applyContextPreview({ root, previewPath }))
      .rejects.toThrow(/synchronize schemas\/context-lock\.schema\.json/);
    expect(await readFile(output, "utf8")).toBe("existing legacy lock\n");
  });

  it("reserves room for later required sources before selecting optional documents", async () => {
    const root = await fixture();
    const includePaths = ["test/feature.test.ts"];
    const generous = await compileContext({ root, taskId: "T-FEATURE-001", createdAt, includePaths });
    const requiredPaths = new Set([
      "AGENTS.md",
      ".agent-context/tasks/T-FEATURE-001/state.yaml",
      ".agent-context/tasks/T-FEATURE-001/brief.md",
      "docs/feature-storage.md",
      ".planning/phases/01-feature/01-01-PLAN.md",
      "test/feature.test.ts",
    ]);
    const requiredTokens = generous.lock.sources
      .filter((source) => requiredPaths.has(source.path))
      .reduce((total, source) => total + source.estimated_tokens, 0);

    const bounded = await compileContext({
      root,
      taskId: "T-FEATURE-001",
      createdAt,
      includePaths,
      totalTokens: requiredTokens,
      reservedOutputTokens: 0,
      inputSafetyTokens: 0,
    });

    expect(bounded.lock.sources.map((source) => source.path)).toEqual([...requiredPaths]);
    expect(bounded.lock.omissions).toEqual(expect.arrayContaining([
      expect.objectContaining({ candidate: "docs/future-storage.md", required: false }),
      expect.objectContaining({ candidate: "src/feature.ts", required: false }),
    ]));
    expect(bounded.lock.omissions.every((entry) => entry.required === false)).toBe(true);
    expect(bounded.omitted_file_intents).toEqual(["src/feature.ts"]);
    expect(formatContextCompileReport(bounded)).toContain("existing file_intent was omitted");
    expect(formatContextCompileReport(bounded)).toContain("src/feature.ts");
  });

  it("persists task-required context under a tight budget while optional file intents are omitted", async () => {
    const root = await fixture();
    const statePath = path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "state.yaml");
    const state = parse(await readFile(statePath, "utf8")) as Record<string, unknown>;
    state.required_context_sources = ["test/feature.test.ts"];
    await writeFile(statePath, stringify(state));

    const generous = await compileContext({ root, taskId: "T-FEATURE-001", createdAt });
    const requiredTokens = generous.lock.sources
      .filter((source) => [
        "AGENTS.md",
        ".agent-context/tasks/T-FEATURE-001/state.yaml",
        ".agent-context/tasks/T-FEATURE-001/brief.md",
        "docs/feature-storage.md",
        ".planning/phases/01-feature/01-01-PLAN.md",
        "test/feature.test.ts",
      ].includes(source.path))
      .reduce((total, source) => total + source.estimated_tokens, 0);

    const bounded = await compileContext({
      root,
      taskId: "T-FEATURE-001",
      createdAt,
      totalTokens: requiredTokens,
      reservedOutputTokens: 0,
      inputSafetyTokens: 0,
    });

    expect(bounded.lock.sources.find((source) => source.path === "test/feature.test.ts")).toMatchObject({
      selector: "task-required-context",
      selection_reason: "Persistently required by the current task state.",
    });
    expect(bounded.omitted_file_intents).toEqual(["src/feature.ts"]);

    const applied = await compileContext({
      root,
      taskId: "T-FEATURE-001",
      createdAt,
      totalTokens: requiredTokens,
      reservedOutputTokens: 0,
      inputSafetyTokens: 0,
      apply: true,
    });
    const output = path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "context.lock.json");
    const before = await readFile(output, "utf8");
    expect(applied.output_modified).toBe(true);
    await expect(compileContext({
      root,
      taskId: "T-FEATURE-001",
      createdAt,
      totalTokens: requiredTokens - 1,
      reservedOutputTokens: 0,
      inputSafetyTokens: 0,
      apply: true,
    })).rejects.toThrow(/required context needs/);
    expect(await readFile(output, "utf8")).toBe(before);
  });

  it.each([
    ["src/missing.ts", "required context source does not exist: src/missing.ts"],
    [".planning/phases/01-feature/01-01-PLAN.md", "required context source is inside a configured excluded path"],
    ["assets/screenshot.png", "required context source is not a supported text source"],
    ["../outside.md", "required context source must be a repository-relative path"],
  ])("fails safely for invalid persistent required source %s", async (requiredSource, expectedMessage) => {
    const root = await fixture();
    const output = path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "context.lock.json");
    await compileContext({ root, taskId: "T-FEATURE-001", createdAt, apply: true });
    const before = await readFile(output, "utf8");
    const statePath = path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "state.yaml");
    const state = parse(await readFile(statePath, "utf8")) as Record<string, unknown>;
    state.required_context_sources = [requiredSource];
    await writeFile(statePath, stringify(state));

    await expect(compileContext({ root, taskId: "T-FEATURE-001", createdAt, apply: true }))
      .rejects.toThrow(expectedMessage);
    expect(await readFile(output, "utf8")).toBe(before);
  });

  it("applies the exact saved dry-run payload and rejects stale or tampered previews without replacing it", async () => {
    const root = await fixture();
    const preview = await compileContext({
      root,
      taskId: "T-FEATURE-001",
      createdAt,
      includePaths: ["test/feature.test.ts"],
    });
    const previewPath = path.join(root, "context-preview.json");
    await writeFile(previewPath, `${JSON.stringify(preview, null, 2)}\n`);

    const applied = await applyContextPreview({ root, previewPath });
    const outputPath = path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "context.lock.json");
    expect(applied.lock.lock_hash).toBe(preview.lock.lock_hash);
    expect(applied.lock.created_at).toBe(createdAt);
    expect(await readFile(outputPath, "utf8")).toBe(serializeContextLock(preview.lock));

    const beforeFailure = await readFile(outputPath, "utf8");
    const wrongTask = JSON.parse(JSON.stringify(preview)) as { task_id: string };
    wrongTask.task_id = "T-WRONG-001";
    await writeFile(previewPath, `${JSON.stringify(wrongTask, null, 2)}\n`);
    await expect(applyContextPreview({ root, previewPath })).rejects.toThrow(/task identity/);
    expect(await readFile(outputPath, "utf8")).toBe(beforeFailure);

    const tampered = JSON.parse(JSON.stringify(preview)) as { lock: { sources: Array<{ content_hash: string }> } };
    tampered.lock.sources[0]!.content_hash = `sha256:${"0".repeat(64)}`;
    await writeFile(previewPath, `${JSON.stringify(tampered, null, 2)}\n`);
    await expect(applyContextPreview({ root, previewPath })).rejects.toThrow(/self-hash/);
    expect(await readFile(outputPath, "utf8")).toBe(beforeFailure);

    await writeFile(previewPath, `${JSON.stringify(preview, null, 2)}\n`);
    await writeFile(path.join(root, "src", "feature.ts"), "export const feature = 'changed after preview';\n");
    await expect(applyContextPreview({ root, previewPath })).rejects.toThrow(/source changed/);
    expect(await readFile(outputPath, "utf8")).toBe(beforeFailure);

    await writeFile(path.join(root, "src", "feature.ts"), "export const feature = 'storage';\n");
    await writeFile(path.join(root, "docs", "unrelated.md"), markdown(
      "unrelated",
      "canonical",
      ["rendering graphics"],
      "# Rendering\n\nChanged after the preview.",
    ));
    await generateContextIndex(root);
    await expect(applyContextPreview({ root, previewPath })).rejects.toThrow(/stale context index/);
    expect(await readFile(outputPath, "utf8")).toBe(beforeFailure);
  });

  it("rejects an exact preview after the Git base revision changes", async () => {
    const root = await fixture();
    await execFileAsync("git", ["init"], { cwd: root, windowsHide: true });
    await execFileAsync("git", ["config", "user.email", "fixture@example.invalid"], { cwd: root, windowsHide: true });
    await execFileAsync("git", ["config", "user.name", "CanonTrail Fixture"], { cwd: root, windowsHide: true });
    await execFileAsync("git", ["add", "."], { cwd: root, windowsHide: true });
    await execFileAsync("git", ["commit", "-m", "fixture"], { cwd: root, windowsHide: true });
    const preview = await compileContext({ root, taskId: "T-FEATURE-001", createdAt });
    const previewPath = path.join(root, "context-preview.json");
    await writeFile(previewPath, `${JSON.stringify(preview, null, 2)}\n`);
    await execFileAsync("git", ["commit", "--allow-empty", "-m", "new base"], { cwd: root, windowsHide: true });

    await expect(applyContextPreview({ root, previewPath })).rejects.toThrow(/Git base revision/);
    await expect(readFile(path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "context.lock.json"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("fails when an explicit required include is missing", async () => {
    const root = await fixture();
    await expect(compileContext({
      root,
      taskId: "T-FEATURE-001",
      createdAt,
      includePaths: ["src/missing.ts"],
    })).rejects.toThrow("required explicit include does not exist: src/missing.ts");
  });

  it("records a Git blob only while the selected bytes still match HEAD", async () => {
    const root = await fixture();
    await execFileAsync("git", ["init"], { cwd: root, windowsHide: true });
    await execFileAsync("git", ["config", "user.email", "fixture@example.invalid"], { cwd: root, windowsHide: true });
    await execFileAsync("git", ["config", "user.name", "CanonTrail Fixture"], { cwd: root, windowsHide: true });
    await execFileAsync("git", ["add", "."], { cwd: root, windowsHide: true });
    await execFileAsync("git", ["commit", "-m", "fixture"], { cwd: root, windowsHide: true });

    const clean = await compileContext({ root, taskId: "T-FEATURE-001", createdAt });
    expect(clean.lock.sources.find((source) => source.path === "src/feature.ts")?.git_blob).toMatch(/^[a-f0-9]{40,64}$/);

    await writeFile(path.join(root, "src", "feature.ts"), "export const feature = 'modified';\n");
    const dirty = await compileContext({ root, taskId: "T-FEATURE-001", createdAt });
    expect(dirty.lock.sources.find((source) => source.path === "src/feature.ts")?.git_blob).toBeNull();
  });

  it("selects compact cited task evidence without loading its full subject source", async () => {
    const root = await fixture();
    const evidence = await recordProjectEvidence({
      root,
      taskId: "T-FEATURE-001",
      evidenceId: "EVID-FEATURE-TEST",
      kind: "technical-test",
      status: "pass",
      claim: "The focused storage behavior passed.",
      summary: "One focused fixture passed.",
      subjectPaths: ["test/feature.test.ts"],
      subjectRole: "test-source",
      observedAt: createdAt,
      apply: true,
    });
    const statePath = path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "state.yaml");
    const state = parse(await readFile(statePath, "utf8")) as Record<string, unknown>;
    state.checks = [{
      id: "CHECK-FOCUSED",
      command_or_observation: "Run the focused storage fixture.",
      status: "pass",
      evidence_refs: [evidence.output_path],
    }];
    await writeFile(statePath, stringify(state));

    const report = await compileContext({ root, taskId: "T-FEATURE-001", createdAt });

    expect(report.lock.sources.find((source) => source.path === evidence.output_path)).toMatchObject({
      level: "L4",
      selector: "task-evidence-reference",
    });
    expect(report.lock.sources.some((source) => source.path === "test/feature.test.ts")).toBe(false);
  });

  it("prefers cited compact evidence over uncited raw task-evidence file intents", async () => {
    const root = await fixture();
    const rawEvidence = ".agent-context/tasks/T-FEATURE-001/evidence/session-ui.xml";
    await mkdir(path.dirname(path.join(root, ...rawEvidence.split("/"))), { recursive: true });
    await writeFile(path.join(root, ...rawEvidence.split("/")), "<hierarchy><large-raw-ui /></hierarchy>\n");
    const evidence = await recordProjectEvidence({
      root,
      taskId: "T-FEATURE-001",
      evidenceId: "EVID-FEATURE-UI",
      kind: "semantic-runtime",
      status: "pass",
      claim: "The focused UI flow passed.",
      summary: "The raw hierarchy is retained by hash outside the default context.",
      subjectPaths: [rawEvidence],
      subjectRole: "raw-ui-hierarchy",
      observedAt: createdAt,
      apply: true,
    });
    const statePath = path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "state.yaml");
    const state = parse(await readFile(statePath, "utf8")) as Record<string, unknown>;
    state.file_intents = [...(state.file_intents as string[]), evidence.output_path, rawEvidence];
    state.checks = [{
      id: "CHECK-UI",
      command_or_observation: "Inspect the compact UI result.",
      status: "pass",
      evidence_refs: [evidence.output_path],
    }];
    await writeFile(statePath, stringify(state));

    const report = await compileContext({ root, taskId: "T-FEATURE-001", createdAt });

    expect(report.lock.sources.find((source) => source.path === evidence.output_path)).toMatchObject({
      selector: "task-evidence-reference",
      level: "L4",
    });
    expect(report.lock.sources.some((source) => source.path === rawEvidence)).toBe(false);
    expect(report.lock.omissions).toContainEqual({
      candidate: rawEvidence,
      reason: "Task-owned evidence file intent is archival by default; cite it or require it explicitly to load it.",
      required: false,
    });
    expect(report.omitted_file_intents).toEqual([rawEvidence]);
  });

  it("loads raw task evidence through persistent, one-run, and direct-citation overrides", async () => {
    const root = await fixture();
    const evidenceRoot = path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "evidence");
    await mkdir(evidenceRoot, { recursive: true });
    const persistent = ".agent-context/tasks/T-FEATURE-001/evidence/persistent.xml";
    const oneRun = ".agent-context/tasks/T-FEATURE-001/evidence/one-run.xml";
    const cited = ".agent-context/tasks/T-FEATURE-001/evidence/cited.xml";
    await writeFile(path.join(root, ...persistent.split("/")), "<persistent />\n");
    await writeFile(path.join(root, ...oneRun.split("/")), "<one-run />\n");
    await writeFile(path.join(root, ...cited.split("/")), "<cited />\n");
    const statePath = path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "state.yaml");
    const state = parse(await readFile(statePath, "utf8")) as Record<string, unknown>;
    state.required_context_sources = [persistent];
    state.file_intents = [...(state.file_intents as string[]), persistent, oneRun, cited];
    state.checks = [{
      id: "CHECK-RAW",
      command_or_observation: "Inspect explicitly requested raw evidence.",
      status: "pass",
      evidence_refs: [cited],
    }];
    await writeFile(statePath, stringify(state));

    const report = await compileContext({
      root,
      taskId: "T-FEATURE-001",
      createdAt,
      includePaths: [oneRun],
    });

    expect(report.lock.sources.find((source) => source.path === persistent)?.selector).toContain("task-required-context");
    expect(report.lock.sources.find((source) => source.path === oneRun)?.selector).toContain("explicit-include");
    expect(report.lock.sources.find((source) => source.path === cited)?.selector).toContain("task-evidence-reference");
    expect(report.lock.omissions.some((entry) => [persistent, oneRun, cited].includes(entry.candidate))).toBe(false);
    expect(report.omitted_file_intents).toEqual([]);
  });

  it("keeps completed locks historical while strict task validation still detects drift", async () => {
    const root = await fixture();
    await compileContext({ root, taskId: "T-FEATURE-001", createdAt, apply: true });
    const statePath = path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "state.yaml");
    const state = parse(await readFile(statePath, "utf8")) as Record<string, unknown>;
    state.status = "done";
    state.acceptance_criteria = [{
      id: "AC-001",
      statement: "Feature storage remains deterministic.",
      verification: "Run the focused test.",
      status: "pass",
    }];
    state.checks = [{
      id: "CHECK-001",
      command_or_observation: "Run the focused test.",
      status: "pass",
      evidence_refs: [".agent-context/tasks/T-FEATURE-001/brief.md"],
    }];
    await writeFile(statePath, stringify(state));
    await writeFile(path.join(root, "src", "feature.ts"), "export const feature = 'later shared change';\n");

    const historical = await validateRepository(root, { checkIndex: false });
    expect(historical.diagnostics.some((diagnostic) => diagnostic.code === "LOCK004")).toBe(false);
    expect(historical.diagnostics.some((diagnostic) => diagnostic.code === "LOCK008")).toBe(false);

    const strict = await validateRepository(root, { checkIndex: false, strictContextLockTaskId: "T-FEATURE-001" });
    expect(strict.diagnostics.some((diagnostic) => diagnostic.code === "LOCK004")).toBe(true);

    const lockPath = path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "context.lock.json");
    const lock = JSON.parse(await readFile(lockPath, "utf8")) as { sources: Array<{ selection_reason: string }> };
    lock.sources[0]!.selection_reason = "Tampered historical payload.";
    await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    const tamperedHistorical = await validateRepository(root, { checkIndex: false });
    expect(tamperedHistorical.diagnostics.some((diagnostic) => diagnostic.code === "LOCK007")).toBe(true);
  });

  it("reports selected-source drift and lock-payload tampering", async () => {
    const driftRoot = await fixture();
    await compileContext({ root: driftRoot, taskId: "T-FEATURE-001", createdAt, apply: true });
    await writeFile(path.join(driftRoot, "src", "feature.ts"), "export const feature = 'changed';\n");
    const drift = await validateRepository(driftRoot, { checkIndex: false });
    expect(drift.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "LOCK004", message: expect.stringContaining("src/feature.ts") }),
    ]));
    const indexPreflight = await validateRepository(driftRoot, { checkIndex: false, checkContextLocks: false });
    expect(indexPreflight.diagnostics.some((diagnostic) => diagnostic.code.startsWith("LOCK"))).toBe(false);

    const tamperRoot = await fixture();
    await compileContext({ root: tamperRoot, taskId: "T-FEATURE-001", createdAt, apply: true });
    const lockPath = path.join(tamperRoot, ".agent-context", "tasks", "T-FEATURE-001", "context.lock.json");
    const lock = JSON.parse(await readFile(lockPath, "utf8")) as { sources: Array<{ selection_reason: string }> };
    lock.sources[0]!.selection_reason = "Tampered after compilation.";
    await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    const tampered = await validateRepository(tamperRoot, { checkIndex: false });
    expect(tampered.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "LOCK007" }),
    ]));
  });
});

describe("cited evidence stability guard", () => {
  it("rejects cited task evidence that embeds the current lock or index hash", async () => {
    const root = await fixture();
    await compileContext({ root, taskId: "T-FEATURE-001", createdAt, apply: true });
    const lockPath = path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "context.lock.json");
    const lock = JSON.parse(await readFile(lockPath, "utf8")) as { lock_hash: string };
    const evidenceDir = path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "evidence");
    await mkdir(evidenceDir, { recursive: true });
    const reportPath = ".agent-context/tasks/T-FEATURE-001/evidence/compile-report.json";
    await writeFile(path.join(evidenceDir, "compile-report.json"), JSON.stringify({ lock_hash: lock.lock_hash }, null, 2));
    const statePath = path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "state.yaml");
    const state = parse(await readFile(statePath, "utf8")) as Record<string, unknown>;
    state.checks = [{ id: "CHECK-REPORT", command_or_observation: "Compile report captured.", status: "pass", evidence_refs: [reportPath] }];
    await writeFile(statePath, stringify(state));
    await expect(compileContext({ root, taskId: "T-FEATURE-001", createdAt })).rejects.toThrow(/cannot be a stable context source/);
  });

  it("still allows hash-named archived lock copies under evidence/context-locks", async () => {
    const root = await fixture();
    await compileContext({ root, taskId: "T-FEATURE-001", createdAt, apply: true });
    const lockPath = path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "context.lock.json");
    const lockBytes = await readFile(lockPath, "utf8");
    const archiveDir = path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "evidence", "context-locks");
    await mkdir(archiveDir, { recursive: true });
    const archivePath = ".agent-context/tasks/T-FEATURE-001/evidence/context-locks/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json";
    await writeFile(path.join(root, ...archivePath.split("/")), lockBytes);
    const statePath = path.join(root, ".agent-context", "tasks", "T-FEATURE-001", "state.yaml");
    const state = parse(await readFile(statePath, "utf8")) as Record<string, unknown>;
    state.checks = [{ id: "CHECK-ARCHIVE", command_or_observation: "Archived lock cited.", status: "pass", evidence_refs: [archivePath] }];
    await writeFile(statePath, stringify(state));
    const report = await compileContext({ root, taskId: "T-FEATURE-001", createdAt });
    expect(report.lock.sources.some((source) => source.path === archivePath)).toBe(true);
  });
});
