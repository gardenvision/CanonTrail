import { cp, mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import {
  auditDocumentation,
  documentationStatus,
  formatDocumentationAudit,
  formatDocumentationStatus,
} from "../src/docs.js";
import { generateContextIndex } from "../src/indexer.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function markdown(options: {
  topic: string;
  stand?: string;
  status?: string;
  truth?: string;
  verification?: string;
  evidence?: string[];
  supersedes?: string[];
  body?: string;
}): string {
  return `---
topic_id: ${options.topic}
stand: "${options.stand ?? "2026-08-27"}"
status: ${options.status ?? "current"}
truth_level: ${options.truth ?? "canonical"}
verification:
  state: ${options.verification ?? "reviewed"}
  evidence: ${JSON.stringify(options.evidence ?? [])}
read_if_task_touches:
  - documentation audit fixture
primary_systems:
  - documentation audit fixture
safe_to_edit:
  - Keep the fixture deterministic.
do_not_use_instead: []
${options.supersedes ? `supersedes:\n${options.supersedes.map((entry) => `  - ${entry}`).join("\n")}\n` : ""}---

${options.body ?? "# Fixture document\n"}`;
}

function maintenance(overrides = ""): string {
  return `version: 1
created: 2026-08-27
cadence: weekly
mode: report-first
remote_required: false
stale_after_days:
  canonical: 180
  design-target: 90
  active-snapshot: 30
  draft: 30
  historical: null
future_date_tolerance_days: 1
checks:
  - stale documents
  - contradiction candidates
mutation_policy: Never delete, rewrite, merge, archive, or promote documentation without review.
${overrides}`;
}

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

function activeChange(options: {
  id: string;
  status?: "decided" | "implemented" | "verified";
  version?: 1;
  documentationStructure?: Record<string, unknown>;
}): string {
  const status = options.status ?? "decided";
  const verified = status === "verified";
  return stringify({
    ...(options.version ? { version: options.version } : {}),
    change_id: options.id,
    revision: 1,
    title: "Documentation structure audit fixture",
    status,
    risk: "medium",
    author: "fixture-author",
    canonical_source: "README.md",
    decision_rationale: "The fixture exercises documentation structure maintenance.",
    ...(options.documentationStructure ? { documentation_structure: options.documentationStructure } : {}),
    acceptance_cases: [{
      id: "AC-001",
      given: "An active change record.",
      expected: "The audit reports its structure state.",
      failure_or_uncertainty: "Invalid records remain validator diagnostics.",
      counterexample: null,
      oracle: "The deterministic audit fixture.",
      status: verified ? "pass" : "pending",
      evidence_refs: verified ? ["README.md"] : [],
    }],
    impacts: impactAreas.map((area) => ({
      area,
      decision: "not-affected",
      rationale: `${area} is not changed by this fixture.`,
      evidence_refs: [],
    })),
    verification: {
      checks: [{ name: "Audit fixture", status: verified ? "pass" : "pending", evidence_refs: verified ? ["README.md"] : [] }],
      terminology_search: { status: "not-applicable", terms: [], evidence_refs: [] },
      visual_review: { applicable: false, status: "not-applicable", evidence_refs: [] },
      unverifiable_items: [],
    },
    independent_review: { status: "not-required", reviewer: null, findings: [], evidence_refs: [], waiver: null },
    supersedes: [],
    superseded_by: null,
    updated_at: "2026-08-28T00:00:00+02:00",
  });
}

async function cleanFixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "canontrail-docs-test-"));
  roots.push(root);
  await cp(path.resolve("schemas"), path.join(root, "schemas"), { recursive: true });
  await mkdir(path.join(root, ".agent-context", "tasks", "T-CLEAN-001"), { recursive: true });
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
  await writeFile(path.join(root, ".agent-context", "maintenance.yaml"), maintenance());
  await writeFile(path.join(root, "README.md"), markdown({ topic: "fixture-overview" }));
  await writeFile(
    path.join(root, ".agent-context", "tasks", "T-CLEAN-001", "brief.md"),
    markdown({ topic: "fixture-clean-task", truth: "active-snapshot", status: "in-progress" }),
  );
  await writeFile(
    path.join(root, ".agent-context", "tasks", "T-CLEAN-001", "state.yaml"),
    stringify({
      task_id: "T-CLEAN-001",
      source_system: "canontrail",
      source_ref: ".agent-context/tasks/T-CLEAN-001/brief.md",
      status: "in-progress",
      objective: "Keep the documentation audit fixture healthy.",
      acceptance_criteria: [{
        id: "AC-001",
        statement: "The fixture remains healthy.",
        verification: "Run docs status.",
        status: "pending",
      }],
      dependencies: [],
      file_intents: ["README.md"],
      checks: [],
      latest_handoff: null,
    }),
  );
  await generateContextIndex(root);
  return root;
}

async function snapshot(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) result[path.relative(root, absolute).replace(/\\/g, "/")] = await readFile(absolute, "utf8");
    }
  }
  await visit(root);
  return result;
}

describe("documentation status", () => {
  it("is deterministic, healthy, and read-only for a current repository", async () => {
    const root = await cleanFixture();
    const before = await snapshot(root);
    const first = await documentationStatus(root, { asOf: "2026-08-27" });
    const second = await documentationStatus(root, { asOf: "2026-08-27" });

    expect(first).toEqual(second);
    expect(first.health).toBe("healthy");
    expect(first.documents).toMatchObject({
      total: 2,
      freshness: { current: 2, stale: 0, future: 0, exempt: 0, invalid: 0 },
    });
    expect(first.tasks).toMatchObject({ total: 1, orphaned: 0 });
    expect(first.index.state).toBe("current");
    expect(first.finding_counts).toEqual({ errors: 0, warnings: 0, total: 0 });
    expect(first.writes_performed).toBe(false);
    expect(formatDocumentationStatus(first)).toContain("Writes performed: no");
    expect(await snapshot(root)).toEqual(before);
  });

  it("reports real lifecycle drift while accepting equivalent task, brief, plan, and change states", async () => {
    const root = await cleanFixture();
    const briefPath = path.join(root, ".agent-context", "tasks", "T-CLEAN-001", "brief.md");
    const changePath = path.join(root, ".agent-context", "tasks", "T-CLEAN-001", "change.yaml");
    const planPath = path.join(root, ".agent-context", "documentation-plan.yaml");
    const structure = {
      decision: "no-feature-document-change",
      rationale: "The audit fixture does not change product documentation structure.",
      feature_documents: [],
    };
    await writeFile(briefPath, markdown({
      topic: "fixture-clean-task",
      truth: "active-snapshot",
      status: "planned",
    }));
    await writeFile(changePath, activeChange({
      id: "CHG-LIFECYCLE-001",
      status: "verified",
      version: 1,
      documentationStructure: structure,
    }));
    await writeFile(planPath, stringify({
      version: 1,
      status: "bootstrap-required",
      phases: [],
      subsystem_tasks: [{ id: "T-CLEAN-001", title: "Clean fixture", status: "completed" }],
    }));
    await generateContextIndex(root);
    const before = await snapshot(root);

    const drift = await auditDocumentation(root, { asOf: "2026-08-28" });
    expect(drift.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "DOCS601", path: ".agent-context/tasks/T-CLEAN-001/state.yaml" }),
      expect.objectContaining({ code: "DOCS602", path: ".agent-context/tasks/T-CLEAN-001/state.yaml" }),
      expect.objectContaining({ code: "DOCS603", path: ".agent-context/tasks/T-CLEAN-001/state.yaml" }),
    ]));
    expect(await snapshot(root)).toEqual(before);

    await writeFile(briefPath, markdown({
      topic: "fixture-clean-task",
      truth: "active-snapshot",
      status: "in-progress",
    }));
    await writeFile(changePath, activeChange({
      id: "CHG-LIFECYCLE-001",
      status: "implemented",
      version: 1,
      documentationStructure: structure,
    }));
    await writeFile(planPath, stringify({
      version: 1,
      status: "bootstrap-required",
      phases: [],
      subsystem_tasks: [{ id: "T-CLEAN-001", title: "Clean fixture", status: "in-progress" }],
    }));
    await generateContextIndex(root);

    const aligned = await auditDocumentation(root, { asOf: "2026-08-28" });
    expect(aligned.findings.some((finding) => ["DOCS601", "DOCS602", "DOCS603"].includes(finding.code))).toBe(false);
  });

  it("uses documented defaults when an older project has no maintenance policy", async () => {
    const root = await cleanFixture();
    await unlink(path.join(root, ".agent-context", "maintenance.yaml"));
    const report = await documentationStatus(root, { asOf: "2026-08-27" });

    expect(report.policy.source).toBe("defaults");
    expect(report.policy.defaults_applied).toBe(true);
    expect(report.policy.stale_after_days["active-snapshot"]).toBe(30);
    expect(report.health).toBe("healthy");
  });
});

describe("documentation audit", () => {
  it("reports freshness, integrity, consistency, supersession, and continuity findings without writes", async () => {
    const root = await cleanFixture();
    const taskStatePath = path.join(root, ".agent-context", "tasks", "T-CLEAN-001", "state.yaml");
    const taskState = stringify({
      task_id: "T-CLEAN-001",
      source_system: "canontrail",
      source_ref: ".agent-context/tasks/T-CLEAN-001/brief.md",
      status: "in-progress",
      objective: "Keep the documentation audit fixture healthy.",
      acceptance_criteria: [{ id: "AC-001", statement: "The fixture remains healthy.", verification: "Run docs audit.", status: "pending" }],
      dependencies: [],
      file_intents: ["README.md"],
      checks: [],
      latest_handoff: ".agent-context/tasks/T-CLEAN-001/handoff.yaml",
    });
    await writeFile(taskStatePath, taskState);
    await writeFile(path.join(root, "stale.md"), markdown({
      topic: "shared-topic",
      stand: "2026-01-01",
      status: "proposal",
      truth: "draft",
    }));
    await writeFile(path.join(root, "target.md"), markdown({
      topic: "shared-topic",
      status: "current-target",
      truth: "design-target",
      verification: "structurally-reviewed",
    }));
    await writeFile(path.join(root, "replacement.md"), markdown({
      topic: "replacement-topic",
      truth: "canonical",
      evidence: ["missing-evidence.md"],
      supersedes: ["stale.md"],
    }));
    await writeFile(path.join(root, "future.md"), markdown({ topic: "future-topic", stand: "2026-09-10" }));
    await mkdir(path.join(root, ".agent-context", "tasks", "T-ORPHAN-001"), { recursive: true });
    await writeFile(
      path.join(root, ".agent-context", "tasks", "T-ORPHAN-001", "brief.md"),
      markdown({ topic: "orphan-task", truth: "active-snapshot" }),
    );
    await mkdir(path.join(root, ".agent-context", "tasks", "T-STATE-ONLY-001"), { recursive: true });
    await writeFile(
      path.join(root, ".agent-context", "tasks", "T-STATE-ONLY-001", "state.yaml"),
      stringify({
        task_id: "T-STATE-ONLY-001",
        status: "in-progress",
        objective: "Expose a task state without a durable brief or change record.",
        acceptance_criteria: [{ id: "AC-001", statement: "Audit reports the orphan.", verification: "Check DOCS302.", status: "pending" }],
        dependencies: [],
        file_intents: [],
        checks: [],
        latest_handoff: null,
      }),
    );
    await mkdir(path.join(root, ".agent-context", "tasks", "T-UNTRACKED-001"), { recursive: true });
    await writeFile(
      path.join(root, ".agent-context", "tasks", "T-UNTRACKED-001", "brief.md"),
      markdown({ topic: "untracked-handoff-task", truth: "active-snapshot" }),
    );
    await writeFile(
      path.join(root, ".agent-context", "tasks", "T-UNTRACKED-001", "state.yaml"),
      stringify({
        task_id: "T-UNTRACKED-001",
        source_ref: ".agent-context/tasks/T-UNTRACKED-001/brief.md",
        status: "in-progress",
        objective: "Expose an untracked latest handoff artifact.",
        acceptance_criteria: [{ id: "AC-001", statement: "Audit reports the handoff.", verification: "Check DOCS304.", status: "pending" }],
        dependencies: [],
        file_intents: [],
        checks: [],
        latest_handoff: null,
      }),
    );
    await writeFile(path.join(root, ".agent-context", "tasks", "T-UNTRACKED-001", "handoff.yaml"), "{}\n");
    await generateContextIndex(root);
    await writeFile(path.join(root, "README.md"), markdown({ topic: "fixture-overview", body: "# Changed after indexing\n" }));
    const before = await snapshot(root);

    const first = await auditDocumentation(root, { asOf: "2026-08-27" });
    const second = await auditDocumentation(root, { asOf: "2026-08-27" });
    const codes = new Set(first.findings.map((finding) => finding.code));

    expect(first).toEqual(second);
    expect(first.health).toBe("invalid");
    for (const code of [
      "DOCS101",
      "DOCS102",
      "DOCS201",
      "DOCS301",
      "DOCS302",
      "DOCS303",
      "DOCS304",
      "DOCS401",
      "INDEX003",
      "REF001",
    ]) {
      expect(codes).toContain(code);
    }
    expect(first.tasks.orphaned).toBe(4);
    expect(first.index.state).toBe("stale");
    expect(first.findings.find((finding) => finding.code === "DOCS201")?.message).toContain("review content");
    expect(formatDocumentationAudit(first)).toContain("DOCS401");
    expect(await snapshot(root)).toEqual(before);
  });

  it("exempts historical documents and rejects invalid policy or as-of input", async () => {
    const root = await cleanFixture();
    await writeFile(path.join(root, "history.md"), markdown({
      topic: "history-topic",
      stand: "2020-01-01",
      truth: "historical",
      status: "archived",
    }));
    await generateContextIndex(root);
    let report = await auditDocumentation(root, { asOf: "2026-08-27" });
    expect(report.documents.freshness.exempt).toBe(1);
    expect(report.findings.some((finding) => finding.path === "history.md" && finding.code === "DOCS101")).toBe(false);

    await writeFile(
      path.join(root, ".agent-context", "maintenance.yaml"),
      maintenance().replace("mode: report-first", "mode: mutate-first"),
    );
    await expect(auditDocumentation(root, { asOf: "2026-08-27" })).rejects.toThrow(/mode must be report-first/);
    await expect(auditDocumentation(root, { asOf: "27.08.2026" })).rejects.toThrow(/ISO date/);
  });

  it("reports active legacy and unresolved documentation-structure decisions without writes", async () => {
    const root = await cleanFixture();
    await writeFile(
      path.join(root, ".agent-context", "tasks", "T-CLEAN-001", "change.yaml"),
      activeChange({ id: "CHG-LEGACY-001" }),
    );
    await mkdir(path.join(root, ".agent-context", "tasks", "T-STRUCTURE-001"), { recursive: true });
    await writeFile(
      path.join(root, ".agent-context", "tasks", "T-STRUCTURE-001", "brief.md"),
      markdown({ topic: "structure-review-task", truth: "active-snapshot", status: "in-progress" }),
    );
    await writeFile(
      path.join(root, ".agent-context", "tasks", "T-STRUCTURE-001", "state.yaml"),
      stringify({
        task_id: "T-STRUCTURE-001",
        source_system: "canontrail",
        source_ref: ".agent-context/tasks/T-STRUCTURE-001/brief.md",
        status: "in-progress",
        objective: "Reassess documentation structure.",
        acceptance_criteria: [{ id: "AC-001", statement: "Resolve the structure decision.", verification: "Run docs audit.", status: "pending" }],
        dependencies: [],
        file_intents: [],
        checks: [],
        latest_handoff: null,
      }),
    );
    await writeFile(
      path.join(root, ".agent-context", "tasks", "T-STRUCTURE-001", "change.yaml"),
      activeChange({
        id: "CHG-STRUCTURE-001",
        version: 1,
        documentationStructure: {
          decision: "reassess-documentation-structure",
          rationale: "The product has grown beyond its original documentation boundary.",
          feature_documents: [],
        },
      }),
    );
    await mkdir(path.join(root, ".agent-context", "tasks", "T-LEGACY-DONE-001"), { recursive: true });
    await writeFile(
      path.join(root, ".agent-context", "tasks", "T-LEGACY-DONE-001", "brief.md"),
      markdown({ topic: "legacy-done-task", truth: "active-snapshot", status: "done" }),
    );
    await writeFile(
      path.join(root, ".agent-context", "tasks", "T-LEGACY-DONE-001", "state.yaml"),
      stringify({
        task_id: "T-LEGACY-DONE-001",
        source_system: "canontrail",
        source_ref: ".agent-context/tasks/T-LEGACY-DONE-001/brief.md",
        status: "done",
        objective: "Keep completed legacy records readable without migration noise.",
        acceptance_criteria: [{ id: "AC-001", statement: "The completed record stays quiet.", verification: "Run docs audit.", status: "pass" }],
        dependencies: [],
        file_intents: [],
        checks: [],
        latest_handoff: null,
      }),
    );
    await writeFile(
      path.join(root, ".agent-context", "tasks", "T-LEGACY-DONE-001", "change.yaml"),
      activeChange({ id: "CHG-LEGACY-DONE-001", status: "verified" }),
    );
    await generateContextIndex(root);
    const before = await snapshot(root);

    const first = await auditDocumentation(root, { asOf: "2026-08-28" });
    const second = await auditDocumentation(root, { asOf: "2026-08-28" });

    expect(first).toEqual(second);
    expect(first.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "DOCS501", path: ".agent-context/tasks/T-CLEAN-001/change.yaml" }),
      expect.objectContaining({ code: "DOCS502", path: ".agent-context/tasks/T-STRUCTURE-001/change.yaml" }),
    ]));
    expect(first.findings.some((finding) => finding.path === ".agent-context/tasks/T-LEGACY-DONE-001/change.yaml")).toBe(false);
    expect(first.health).toBe("attention");
    expect(await snapshot(root)).toEqual(before);
  });
});
