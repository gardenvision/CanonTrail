import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compileContext, computeContextLockHash, type ContextLock } from "../src/context.js";
import { finalizeRepository, formatFinalizeReport } from "../src/finalize.js";
import { invokesCanonTrailFinalize, taskCheckInvokesCanonTrailFinalize } from "../src/finalize-guard.js";
import { generateContextIndex } from "../src/indexer.js";
import { initializeProject } from "../src/initializer.js";

const roots: string[] = [];
const taskId = "T-FINALIZE-001";
const auditDate = "2026-08-29";
const impactAreas = [
  "requirement",
  "data-contracts",
  "domain-logic",
  "tests-reference-cases",
  "example-data",
  "ui-api",
  "documentation",
  "diagrams-visuals",
  "terminology",
  "operations-compatibility",
] as const;

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function brief(status: "in-progress" | "completed"): string {
  return `---
topic_id: finalize-fixture-task
stand: "2026-08-29"
status: ${status}
truth_level: active-snapshot
verification:
  state: ${status === "completed" ? "verified" : "unverified"}
  evidence:
    - AGENTS.md
read_if_task_touches:
  - finalize fixture
primary_systems:
  - finalization
safe_to_edit:
  - Keep deterministic.
do_not_use_instead:
  - .agent-context/tasks/${taskId}/change.yaml
---

# Finalize fixture
`;
}

function state(complete: boolean): string {
  return stringify({
    task_id: taskId,
    source_system: "canontrail",
    source_ref: `.agent-context/tasks/${taskId}/brief.md`,
    status: complete ? "verified" : "in-progress",
    objective: "Exercise the completion gate.",
    acceptance_criteria: [{
      id: "AC-001",
      statement: "The fixture satisfies finalization.",
      verification: "Run the focused finalization test.",
      status: complete ? "pass" : "pending",
    }],
    dependencies: [],
    file_intents: ["AGENTS.md"],
    checks: [{
      id: "CHECK-001",
      command_or_observation: "Run the focused fixture.",
      status: complete ? "pass" : "pending",
      evidence_refs: complete ? [`.agent-context/tasks/${taskId}/brief.md`] : [],
    }],
    latest_handoff: null,
    updated_at: "2026-08-29T00:00:00+02:00",
  });
}

function change(complete: boolean): string {
  return stringify({
    version: 1,
    change_id: "CHG-FINALIZE-001",
    revision: 1,
    title: "Finalize fixture",
    status: complete ? "verified" : "implemented",
    risk: "low",
    author: "fixture-author",
    canonical_source: "AGENTS.md",
    decision_rationale: "The fixture needs a complete change record.",
    documentation_structure: {
      decision: "no-feature-document-change",
      rationale: "The fixture does not change product documentation.",
      feature_documents: [],
    },
    acceptance_cases: [{
      id: "AC-001",
      given: "A finalization fixture.",
      expected: "The deterministic gate reports its state.",
      failure_or_uncertainty: "Open state fails visibly.",
      counterexample: "Structural validation alone is insufficient.",
      oracle: "The focused fixture.",
      status: complete ? "pass" : "pending",
      evidence_refs: complete ? [`.agent-context/tasks/${taskId}/brief.md`] : [],
    }],
    impacts: impactAreas.map((area) => ({
      area,
      decision: "not-affected",
      rationale: `${area} is outside this fixture.`,
      evidence_refs: [],
    })),
    verification: {
      checks: [{
        name: "Focused fixture",
        status: complete ? "pass" : "pending",
        evidence_refs: complete ? [`.agent-context/tasks/${taskId}/brief.md`] : [],
      }],
      terminology_search: {
        status: "not-applicable",
        terms: [],
        evidence_refs: [`.agent-context/tasks/${taskId}/brief.md`],
      },
      visual_review: {
        applicable: false,
        status: "not-applicable",
        evidence_refs: [`.agent-context/tasks/${taskId}/brief.md`],
      },
      unverifiable_items: [],
    },
    independent_review: {
      status: "not-required",
      reviewer: null,
      findings: [],
      evidence_refs: [],
      waiver: null,
    },
    external_evidence: [],
    supersedes: [],
    superseded_by: null,
    updated_at: "2026-08-29T00:00:00+02:00",
  });
}

async function fixture(complete = true): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "canontrail-finalize-test-"));
  roots.push(root);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-29T12:00:00Z"));
  try {
    await initializeProject(root);
  } finally {
    vi.useRealTimers();
  }
  const directory = path.join(root, ".agent-context", "tasks", taskId);
  await import("node:fs/promises").then(({ mkdir }) => mkdir(directory, { recursive: true }));
  await writeFile(path.join(directory, "brief.md"), brief(complete ? "completed" : "in-progress"));
  await writeFile(path.join(directory, "state.yaml"), state(complete));
  await writeFile(path.join(directory, "change.yaml"), change(complete));
  await generateContextIndex(root);
  await compileContext({
    root,
    taskId,
    totalTokens: 32_000,
    reservedOutputTokens: 8_000,
    createdAt: "2026-08-29T00:00:00+02:00",
    apply: true,
  });
  return root;
}

describe("finalizeRepository", () => {
  it("distinguishes supported commands from narrative prose", async () => {
    expect(invokesCanonTrailFinalize("canontrail finalize . --task T-123")).toBe(true);
    expect(invokesCanonTrailFinalize("npm run canontrail -- finalize . --fail-on-warnings")).toBe(true);
    expect(invokesCanonTrailFinalize('node "C:\\tools\\CanonTrail\\dist\\cli.js" finalize .')).toBe(true);
    expect(invokesCanonTrailFinalize("Project checks passed.\n$ canontrail finalize .")).toBe(true);
    expect(invokesCanonTrailFinalize("CanonTrail's finalize command aggregates repository and documentation gates.")).toBe(false);
    expect(invokesCanonTrailFinalize("Run the focused suite for canontrail's context module before declaring finalize readiness.")).toBe(false);
    expect(invokesCanonTrailFinalize("See ARTIFACT_PROTOCOL.md for how finalize relates to CanonTrail.")).toBe(false);

    const root = await fixture();
    await writeFile(path.join(root, "package.json"), JSON.stringify({
      scripts: {
        "ct:finalize": "node dist/cli.js finalize .",
        verify: "npm run ct:finalize",
      },
    }));
    expect(await taskCheckInvokesCanonTrailFinalize(root, "npm run verify")).toBe(true);
    expect(await taskCheckInvokesCanonTrailFinalize(root, "pnpm run verify")).toBe(true);
    expect(await taskCheckInvokesCanonTrailFinalize(root, "yarn verify")).toBe(true);
    expect(await taskCheckInvokesCanonTrailFinalize(root, "bun run verify")).toBe(true);
    expect(await taskCheckInvokesCanonTrailFinalize(root, "The npm run verify result was recorded.")).toBe(false);
  });

  it("terminates cyclic package-script resolution without inventing a finalize invocation", async () => {
    const root = await fixture();
    await writeFile(path.join(root, "package.json"), JSON.stringify({
      scripts: {
        "cycle:a": "npm run cycle:b",
        "cycle:b": "pnpm run cycle:a",
      },
    }));

    expect(await taskCheckInvokesCanonTrailFinalize(root, "npm run cycle:a")).toBe(false);
    expect(await taskCheckInvokesCanonTrailFinalize(root, "yarn cycle:b")).toBe(false);
  });

  it("passes all repository, documentation, and completed-task gates without writes", async () => {
    const root = await fixture();
    const paths = [
      ".agent-context/context-index.json",
      `.agent-context/tasks/${taskId}/state.yaml`,
      `.agent-context/tasks/${taskId}/change.yaml`,
      `.agent-context/tasks/${taskId}/context.lock.json`,
    ];
    const before = await Promise.all(paths.map((entry) => readFile(path.join(root, ...entry.split("/")), "utf8")));

    const report = await finalizeRepository({ root, taskId, asOf: auditDate });

    expect(report.ok).toBe(true);
    expect(report.gates.map((gate) => [gate.id, gate.status])).toEqual([
      ["index-refresh", "skipped"],
      ["repository", "pass"],
      ["documentation", "pass"],
      ["task", "pass"],
    ]);
    expect(report.writes_performed).toBe(false);
    expect(formatFinalizeReport(report)).toContain(`CanonTrail finalize PASS for ${taskId}`);
    expect(await Promise.all(paths.map((entry) => readFile(path.join(root, ...entry.split("/")), "utf8")))).toEqual(before);
  });

  it("fails an incomplete task even when repository structure is valid", async () => {
    const root = await fixture(false);
    const report = await finalizeRepository({ root, taskId, asOf: auditDate });

    expect(report.repository.ok).toBe(true);
    expect(report.ok).toBe(false);
    expect(report.gates.find((gate) => gate.id === "task")).toMatchObject({ status: "fail" });
    expect(report.gates.find((gate) => gate.id === "task")?.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(["FINALIZE105", "FINALIZE106", "FINALIZE107", "FINALIZE110"]),
    );
  });

  it("requires project-owned and change verification checks instead of accepting empty arrays", async () => {
    const root = await fixture();
    const directory = path.join(root, ".agent-context", "tasks", taskId);
    const statePath = path.join(directory, "state.yaml");
    const changePath = path.join(directory, "change.yaml");
    const stateValue = parse(await readFile(statePath, "utf8")) as Record<string, unknown>;
    const changeValue = parse(await readFile(changePath, "utf8")) as Record<string, unknown>;
    stateValue.checks = [];
    (changeValue.verification as Record<string, unknown>).checks = [];
    await writeFile(statePath, stringify(stateValue));
    await writeFile(changePath, stringify(changeValue));
    await compileContext({
      root,
      taskId,
      totalTokens: 32_000,
      reservedOutputTokens: 8_000,
      createdAt: "2026-08-29T00:00:00+02:00",
      apply: true,
    });

    const report = await finalizeRepository({ root, taskId, asOf: auditDate });

    expect(report.repository.ok).toBe(true);
    expect(report.gates.find((gate) => gate.id === "task")?.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(["FINALIZE112", "FINALIZE113"]),
    );
  });

  it("rejects task checks that invoke finalize itself", async () => {
    const root = await fixture();
    const directory = path.join(root, ".agent-context", "tasks", taskId);
    const statePath = path.join(directory, "state.yaml");
    const stateValue = parse(await readFile(statePath, "utf8")) as Record<string, unknown>;
    stateValue.checks = [{
      id: "CHECK-CIRCULAR",
      command_or_observation: `npm run canontrail -- finalize . --task ${taskId}`,
      status: "pass",
      evidence_refs: [`.agent-context/tasks/${taskId}/brief.md`],
    }];
    await writeFile(statePath, stringify(stateValue));
    await compileContext({
      root,
      taskId,
      totalTokens: 32_000,
      reservedOutputTokens: 8_000,
      createdAt: "2026-08-29T00:00:00+02:00",
      apply: true,
    });

    const report = await finalizeRepository({ root, taskId, asOf: auditDate });

    expect(report.ok).toBe(false);
    expect(report.repository.diagnostics.some((diagnostic) => diagnostic.code === "TASK004")).toBe(true);
    expect(report.gates.find((gate) => gate.id === "task")?.findings.some((finding) => finding.code === "FINALIZE114")).toBe(true);
  });

  it("accepts narrative check observations but rejects package scripts that invoke finalize", async () => {
    const narrativeRoot = await fixture();
    const narrativeStatePath = path.join(narrativeRoot, ".agent-context", "tasks", taskId, "state.yaml");
    const narrativeState = parse(await readFile(narrativeStatePath, "utf8")) as Record<string, unknown>;
    narrativeState.checks = [{
      id: "CHECK-NARRATIVE",
      command_or_observation: "CanonTrail's finalize command aggregates repository and documentation gates.",
      status: "pass",
      evidence_refs: [`.agent-context/tasks/${taskId}/brief.md`],
    }];
    await writeFile(narrativeStatePath, stringify(narrativeState));
    await compileContext({
      root: narrativeRoot,
      taskId,
      totalTokens: 32_000,
      reservedOutputTokens: 8_000,
      createdAt: "2026-08-29T00:00:00+02:00",
      apply: true,
    });
    expect((await finalizeRepository({ root: narrativeRoot, taskId, asOf: auditDate })).ok).toBe(true);

    const scriptRoot = await fixture();
    await writeFile(path.join(scriptRoot, "package.json"), JSON.stringify({ scripts: { finalize: "canontrail finalize ." } }));
    const scriptStatePath = path.join(scriptRoot, ".agent-context", "tasks", taskId, "state.yaml");
    const scriptState = parse(await readFile(scriptStatePath, "utf8")) as Record<string, unknown>;
    scriptState.checks = [{
      id: "CHECK-INDIRECT",
      command_or_observation: "npm run finalize",
      status: "pass",
      evidence_refs: [`.agent-context/tasks/${taskId}/brief.md`],
    }];
    await writeFile(scriptStatePath, stringify(scriptState));
    await compileContext({
      root: scriptRoot,
      taskId,
      totalTokens: 32_000,
      reservedOutputTokens: 8_000,
      createdAt: "2026-08-29T00:00:00+02:00",
      apply: true,
    });
    const report = await finalizeRepository({ root: scriptRoot, taskId, asOf: auditDate });
    expect(report.ok).toBe(false);
    expect(report.repository.diagnostics.some((diagnostic) => diagnostic.code === "TASK004")).toBe(true);
    expect(report.gates.find((gate) => gate.id === "task")?.findings.some((finding) => finding.code === "FINALIZE114")).toBe(true);
  });

  it("fails a stale index without repairing it implicitly", async () => {
    const root = await fixture();
    const indexPath = path.join(root, ".agent-context", "context-index.json");
    const before = await readFile(indexPath, "utf8");
    const overviewPath = path.join(root, "docs", "canontrail", "project-overview.md");
    await writeFile(overviewPath, `${await readFile(overviewPath, "utf8")}\n<!-- index drift -->\n`);

    const report = await finalizeRepository({ root, asOf: auditDate });

    expect(report.ok).toBe(false);
    expect(report.repository.diagnostics.map((diagnostic) => diagnostic.code)).toContain("INDEX003");
    expect(report.writes_performed).toBe(false);
    expect(await readFile(indexPath, "utf8")).toBe(before);
  });

  it("keeps warnings advisory locally and blocks them under strict CI policy", async () => {
    const root = await fixture();
    const advisory = await finalizeRepository({ root, asOf: "2027-08-29" });
    const strict = await finalizeRepository({ root, asOf: "2027-08-29", failOnWarnings: true });

    expect(advisory.ok).toBe(true);
    expect(advisory.gates.find((gate) => gate.id === "documentation")?.status).toBe("warning");
    expect(strict.ok).toBe(false);
    expect(strict.gates.find((gate) => gate.id === "documentation")?.status).toBe("fail");
  });

  it("owns structural warnings in the repository gate without duplicating them in documentation", async () => {
    const root = await fixture();
    const lockPath = path.join(root, ".agent-context", "tasks", taskId, "context.lock.json");
    const lock = JSON.parse(await readFile(lockPath, "utf8")) as ContextLock;
    lock.raw_transcripts_included = true;
    const { lock_hash: _ignored, ...payload } = lock;
    lock.lock_hash = computeContextLockHash(payload);
    await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

    const advisory = await finalizeRepository({ root, asOf: auditDate });
    const strict = await finalizeRepository({ root, asOf: auditDate, failOnWarnings: true });

    expect(advisory.ok).toBe(true);
    expect(advisory.gates.find((gate) => gate.id === "repository")?.status).toBe("warning");
    expect(advisory.gates.find((gate) => gate.id === "documentation")?.status).toBe("pass");
    expect(strict.ok).toBe(false);
    expect(strict.gates.find((gate) => gate.id === "repository")?.status).toBe("fail");
    expect(strict.gates.find((gate) => gate.id === "documentation")?.status).toBe("pass");
    expect(strict.gates.flatMap((gate) => gate.findings).filter((finding) => finding.code === "LOCK006")).toHaveLength(1);
  });

  it("refreshes only the context index when explicitly requested", async () => {
    const root = await fixture();
    const overviewPath = path.join(root, "docs", "canontrail", "project-overview.md");
    await writeFile(overviewPath, `${await readFile(overviewPath, "utf8")}\n<!-- index drift -->\n`);

    const report = await finalizeRepository({ root, asOf: auditDate, refreshIndex: true });

    expect(report.ok).toBe(true);
    expect(report.writes_performed).toBe(true);
    expect(report.gates.find((gate) => gate.id === "index-refresh")?.status).toBe("pass");
    expect(report.repository.diagnostics.some((diagnostic) => diagnostic.code.startsWith("LOCK"))).toBe(false);
  });
});
