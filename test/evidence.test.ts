import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import {
  computeProjectEvidenceHash,
  discoverEvidenceCandidates,
  linkExternalEvidence,
  recordProjectEvidence,
} from "../src/evidence.js";
import { validateRepository } from "../src/validator.js";

const temporaryRoots: string[] = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

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

function markdown(): string {
  return `---
topic_id: evidence-fixture
stand: "2026-07-15"
status: current
truth_level: canonical
verification:
  state: reviewed
  evidence: []
read_if_task_touches: [fixture]
primary_systems: [fixture]
safe_to_edit: [Keep valid.]
do_not_use_instead: []
---

# Evidence fixture
`;
}

function changeRecord(): Record<string, unknown> {
  return {
    change_id: "CHG-EVIDENCE-FIXTURE",
    revision: 1,
    title: "External evidence fixture",
    status: "implemented",
    risk: "medium",
    author: "fixture-author",
    canonical_source: "README.md",
    decision_rationale: "The fixture exercises reference-only external evidence linking.",
    acceptance_cases: [{
      id: "AC-001",
      given: "A detected external verification file.",
      expected: "Its hash and provenance can be linked without copying it.",
      failure_or_uncertainty: "Unknown files are rejected without writes.",
      counterexample: "A plan is not completion evidence.",
      oracle: "The byte-preservation test.",
      status: "pending",
      evidence_refs: [],
    }],
    impacts: impactAreas.map((area) => ({
      area,
      decision: "not-affected",
      rationale: `${area} is not affected by this isolated fixture.`,
      evidence_refs: [],
    })),
    verification: {
      checks: [{ name: "Fixture link", status: "pending", evidence_refs: [] }],
      terminology_search: { status: "not-applicable", terms: [], evidence_refs: [] },
      visual_review: { applicable: false, status: "not-applicable", evidence_refs: ["README.md"] },
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
    updated_at: "2026-07-15T19:00:00+02:00",
  };
}

async function fixtureRoot(): Promise<{ root: string; changePath: string; verificationPath: string; planPath: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "canontrail-evidence-test-"));
  temporaryRoots.push(root);
  await cp(path.resolve("schemas"), path.join(root, "schemas"), { recursive: true });
  await mkdir(path.join(root, ".agent-context", "tasks", "T-FIXTURE"), { recursive: true });
  await mkdir(path.join(root, ".planning", "phases", "01-foundation"), { recursive: true });
  await writeFile(path.join(root, ".agent-context", "config.yaml"), `version: 1
index_path: .agent-context/context-index.json
exclude_paths: [.git, node_modules, dist, .planning, docs/superpowers]
require_frontmatter_for_all_markdown: true
require_topic_id_for_canonical: true
allow_missing_references: []
`);
  await writeFile(path.join(root, "README.md"), markdown());
  const changePath = ".agent-context/tasks/T-FIXTURE/change.yaml";
  const verificationPath = ".planning/phases/01-foundation/01-VERIFICATION.md";
  const planPath = ".planning/phases/01-foundation/01-01-PLAN.md";
  await writeFile(path.join(root, ...changePath.split("/")), stringify(changeRecord()));
  await writeFile(path.join(root, ...verificationPath.split("/")), "# Verification\n\nstatus: passed\n");
  await writeFile(path.join(root, ...planPath.split("/")), "# Plan\n");
  return { root, changePath, verificationPath, planPath };
}

describe("external workflow evidence", () => {
  it("classifies durable GSD evidence while excluding plans", async () => {
    const { root, verificationPath, planPath } = await fixtureRoot();
    const phase = path.join(root, ".planning", "phases", "01-foundation");
    const superpowersSpec = path.join(root, "docs", "superpowers", "specs", "2026-07-15-feature-design.md");
    const superpowersPlan = path.join(root, "docs", "superpowers", "plans", "2026-07-15-feature.md");
    await mkdir(path.dirname(superpowersSpec), { recursive: true });
    await mkdir(path.dirname(superpowersPlan), { recursive: true });
    await writeFile(superpowersSpec, "# External design\n");
    await writeFile(superpowersPlan, "# External plan\n");
    await writeFile(path.join(phase, "01-01-SUMMARY.md"), "# Summary\n");
    await writeFile(path.join(phase, "01-UAT.md"), "# UAT\n");
    await writeFile(path.join(phase, "01-UI-REVIEW.md"), "# Review\n");

    const report = await discoverEvidenceCandidates(root);

    expect(Object.fromEntries(report.candidates.map((candidate) => [candidate.path, candidate.artifact_kind]))).toEqual({
      ".planning/phases/01-foundation/01-01-SUMMARY.md": "execution-summary",
      ".planning/phases/01-foundation/01-UI-REVIEW.md": "review",
      ".planning/phases/01-foundation/01-UAT.md": "human-acceptance",
      [verificationPath]: "verification",
    });
    expect(report.candidates.some((candidate) => candidate.path === planPath)).toBe(false);
    expect(report.candidates.some((candidate) => candidate.source_system === "superpowers")).toBe(false);
    expect(report.notices).toContain(
      "Superpowers specs/plans were detected, but its default layout contains no standard durable code-review artifact to link.",
    );
  });

  it("defaults to dry-run and applies a hashed reference without modifying the source", async () => {
    const { root, changePath, verificationPath } = await fixtureRoot();
    const absoluteChange = path.join(root, ...changePath.split("/"));
    const absoluteSource = path.join(root, ...verificationPath.split("/"));
    const changeBefore = await readFile(absoluteChange, "utf8");
    const sourceBefore = await readFile(absoluteSource);

    const dryRun = await linkExternalEvidence({ root, changePath, sources: [verificationPath], recordedAt: "2026-07-15T19:05:00+02:00" });

    expect(dryRun.mode).toBe("dry-run");
    expect(dryRun.change_record_modified).toBe(false);
    expect(await readFile(absoluteChange, "utf8")).toBe(changeBefore);
    expect(await readFile(absoluteSource)).toEqual(sourceBefore);

    const applied = await linkExternalEvidence({
      root,
      changePath,
      sources: [verificationPath],
      apply: true,
      recordedAt: "2026-07-15T19:05:00+02:00",
    });
    const parsed = parse(await readFile(absoluteChange, "utf8")) as { external_evidence: Array<Record<string, unknown>> };

    expect(applied.change_record_modified).toBe(true);
    expect(parsed.external_evidence).toEqual([{
      source_system: "gsd-core",
      path: verificationPath,
      artifact_kind: "verification",
      authority: "external-operational",
      content_hash: applied.additions[0]!.content_hash,
      recorded_at: "2026-07-15T19:05:00+02:00",
    }]);
    expect(await readFile(absoluteSource)).toEqual(sourceBefore);
    expect((await validateRepository(root, { checkIndex: false })).diagnostics).toEqual([]);

    const linkedChange = await readFile(absoluteChange, "utf8");
    const duplicate = await linkExternalEvidence({ root, changePath, sources: [verificationPath], apply: true });
    expect(duplicate.change_record_modified).toBe(false);
    expect(duplicate.already_linked).toEqual([verificationPath]);
    expect(await readFile(absoluteChange, "utf8")).toBe(linkedChange);
  });

  it("rejects a plan and detects later external evidence drift", async () => {
    const { root, changePath, verificationPath, planPath } = await fixtureRoot();
    const absoluteChange = path.join(root, ...changePath.split("/"));
    const changeBefore = await readFile(absoluteChange, "utf8");

    await expect(linkExternalEvidence({ root, changePath, sources: [planPath], apply: true })).rejects.toThrow(
      "not a detected durable evidence candidate",
    );
    expect(await readFile(absoluteChange, "utf8")).toBe(changeBefore);

    await linkExternalEvidence({ root, changePath, sources: [verificationPath], apply: true });
    await writeFile(path.join(root, ...verificationPath.split("/")), "# Verification changed\n");
    const validation = await validateRepository(root, { checkIndex: false });
    expect(validation.diagnostics.some((diagnostic) => diagnostic.code === "CHANGE011")).toBe(true);
  });

  it("detects duplicate hand-authored external evidence references", async () => {
    const { root, changePath, verificationPath } = await fixtureRoot();
    const absoluteChange = path.join(root, ...changePath.split("/"));
    await linkExternalEvidence({ root, changePath, sources: [verificationPath], apply: true });
    const change = parse(await readFile(absoluteChange, "utf8")) as { external_evidence: Array<Record<string, unknown>> };
    change.external_evidence.push({ ...change.external_evidence[0] });
    await writeFile(absoluteChange, stringify(change));

    const validation = await validateRepository(root, { checkIndex: false });

    expect(validation.diagnostics.some((diagnostic) => diagnostic.code === "CHANGE009")).toBe(true);
  });

  it("rejects hand-authored source-system and evidence-kind misclassification", async () => {
    const { root, changePath, verificationPath } = await fixtureRoot();
    const absoluteChange = path.join(root, ...changePath.split("/"));
    await linkExternalEvidence({ root, changePath, sources: [verificationPath], apply: true });
    const change = parse(await readFile(absoluteChange, "utf8")) as { external_evidence: Array<Record<string, unknown>> };
    change.external_evidence[0]!.artifact_kind = "execution-summary";
    change.external_evidence.push({
      ...change.external_evidence[0],
      source_system: "gsd-pi",
      artifact_kind: "verification",
    });
    await writeFile(absoluteChange, stringify(change));

    const validation = await validateRepository(root, { checkIndex: false });

    expect(validation.diagnostics.some((diagnostic) => diagnostic.code === "CHANGE012")).toBe(true);
    expect(validation.diagnostics.some((diagnostic) => diagnostic.code === "CHANGE013")).toBe(true);
  });
});

async function addTaskState(root: string): Promise<void> {
  await writeFile(path.join(root, ".agent-context", "tasks", "T-FIXTURE", "state.yaml"), stringify({
    task_id: "T-FIXTURE",
    status: "in-progress",
    objective: "Record compact typed project evidence.",
    acceptance_criteria: [{
      id: "AC-001",
      statement: "Evidence kinds remain distinct.",
      verification: "Validate the evidence records.",
      status: "pending",
    }],
    dependencies: [],
    file_intents: [],
    checks: [],
    latest_handoff: null,
    updated_at: "2026-07-15T19:00:00+02:00",
  }));
}

describe("compact project evidence", () => {
  it("keeps the documented version-one evidence hash vector stable", () => {
    const payload = {
      version: 1 as const,
      evidence_id: "EVID-HASH-VECTOR",
      task_id: "T-FIXTURE",
      kind: "technical-test" as const,
      status: "pass" as const,
      claim: "The fixed vector passed.",
      summary: "One deterministic result.",
      observed_at: "2026-07-15T19:10:00+02:00",
      producer: { tool: "vitest", command: "npm test" },
      subjects: [{
        path: "test/fixed.test.ts",
        role: "test-source" as const,
        content_hash: `sha256:${"a".repeat(64)}`,
      }],
      references: ["docs/testing.md"],
    };

    expect(computeProjectEvidenceHash(payload)).toBe(
      "sha256:a9e5389a19d35619235625c7a8086ff0a7dba60d117edb4750fcb6891ce7dce3",
    );
  });

  it("rejects a subject symlink that resolves outside the project", async () => {
    const { root } = await fixtureRoot();
    await addTaskState(root);
    const outsideRoot = await mkdtemp(path.join(tmpdir(), "canontrail-evidence-outside-"));
    temporaryRoots.push(outsideRoot);
    const outsideFile = path.join(outsideRoot, "outside.txt");
    const linkedFile = path.join(root, "linked-subject.txt");
    await writeFile(outsideFile, "outside repository content\n");
    try {
      await symlink(outsideFile, linkedFile, "file");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes((error as NodeJS.ErrnoException).code ?? "")) return;
      throw error;
    }

    await expect(recordProjectEvidence({
      root,
      taskId: "T-FIXTURE",
      evidenceId: "EVID-SYMLINK-ESCAPE",
      kind: "technical-test",
      status: "pass",
      claim: "An external subject was observed.",
      summary: "The subject must remain inside the repository.",
      subjectPaths: ["linked-subject.txt"],
      observedAt: "2026-07-15T19:04:00+02:00",
    })).rejects.toThrow(/symbolic link/);
  });

  it("records a hashed technical result without copying its subject source", async () => {
    const { root, verificationPath } = await fixtureRoot();
    await addTaskState(root);
    const sourceText = await readFile(path.join(root, ...verificationPath.split("/")), "utf8");

    const dryRun = await recordProjectEvidence({
      root,
      taskId: "T-FIXTURE",
      evidenceId: "EVID-TECHNICAL-TEST",
      kind: "technical-test",
      status: "pass",
      claim: "The focused repository test passed.",
      summary: "One test suite passed with no skipped tests.",
      subjectPaths: [verificationPath],
      subjectRole: "test-source",
      tool: "vitest",
      command: "npm test -- focused",
      observedAt: "2026-07-15T19:05:00+02:00",
    });
    expect(dryRun.mode).toBe("dry-run");
    await expect(readFile(path.join(root, ...dryRun.output_path.split("/")), "utf8")).rejects.toMatchObject({ code: "ENOENT" });

    const applied = await recordProjectEvidence({
      root,
      taskId: "T-FIXTURE",
      evidenceId: "EVID-TECHNICAL-TEST",
      kind: "technical-test",
      status: "pass",
      claim: "The focused repository test passed.",
      summary: "One test suite passed with no skipped tests.",
      subjectPaths: [verificationPath],
      subjectRole: "test-source",
      tool: "vitest",
      command: "npm test -- focused",
      observedAt: "2026-07-15T19:05:00+02:00",
      apply: true,
    });
    const raw = await readFile(path.join(root, ...applied.output_path.split("/")), "utf8");
    expect(raw).not.toContain(sourceText.trim());
    expect(applied.record.subjects[0]?.content_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect((await validateRepository(root, { checkIndex: false })).diagnostics).toEqual([]);
  });

  it("keeps semantic success and inconclusive visual evidence independent", async () => {
    const { root, verificationPath } = await fixtureRoot();
    await addTaskState(root);
    const semantic = await recordProjectEvidence({
      root,
      taskId: "T-FIXTURE",
      evidenceId: "EVID-SEMANTIC-RUNTIME",
      kind: "semantic-runtime",
      status: "pass",
      claim: "The interaction lifecycle completed.",
      summary: "Create, edit, archive, and restore were observed.",
      subjectPaths: [verificationPath],
      observedAt: "2026-07-15T19:06:00+02:00",
      apply: true,
    });
    const visual = await recordProjectEvidence({
      root,
      taskId: "T-FIXTURE",
      evidenceId: "EVID-VISUAL-RENDER",
      kind: "visual-render",
      status: "inconclusive",
      claim: "Rendered layout quality was inspectable.",
      summary: "The captured output was black and cannot support a visual claim.",
      subjectPaths: [verificationPath],
      observedAt: "2026-07-15T19:07:00+02:00",
      apply: true,
    });

    expect(semantic.record.status).toBe("pass");
    expect(visual.record.status).toBe("inconclusive");
    expect((await validateRepository(root, { checkIndex: false })).diagnostics).toEqual([]);
  });

  it("detects evidence payload tampering", async () => {
    const { root, verificationPath } = await fixtureRoot();
    await addTaskState(root);
    const report = await recordProjectEvidence({
      root,
      taskId: "T-FIXTURE",
      evidenceId: "EVID-TAMPER",
      kind: "technical-build",
      status: "pass",
      claim: "The build passed.",
      summary: "Build output completed successfully.",
      subjectPaths: [verificationPath],
      observedAt: "2026-07-15T19:08:00+02:00",
      apply: true,
    });
    const evidencePath = path.join(root, ...report.output_path.split("/"));
    const value = parse(await readFile(evidencePath, "utf8")) as Record<string, unknown>;
    value.summary = "Tampered later.";
    await writeFile(evidencePath, stringify(value));

    const validation = await validateRepository(root, { checkIndex: false });
    expect(validation.diagnostics.some((diagnostic) => diagnostic.code === "EVIDENCE003")).toBe(true);
  });

  it("keeps applied evidence immutable and rejects a conflicting replacement", async () => {
    const { root, verificationPath } = await fixtureRoot();
    await addTaskState(root);
    const base = {
      root,
      taskId: "T-FIXTURE",
      evidenceId: "EVID-IMMUTABLE",
      kind: "technical-test" as const,
      status: "pass" as const,
      claim: "The focused test passed.",
      summary: "One test passed.",
      subjectPaths: [verificationPath],
      observedAt: "2026-07-15T19:09:00+02:00",
      apply: true,
    };
    const first = await recordProjectEvidence(base);
    const repeated = await recordProjectEvidence(base);
    expect(first.output_modified).toBe(true);
    expect(repeated.output_modified).toBe(false);
    await expect(recordProjectEvidence({ ...base, summary: "A conflicting later claim." })).rejects.toThrow(/already exists/);
  });

  it("honors --apply through the evidence record CLI subcommand", async () => {
    const { root, verificationPath } = await fixtureRoot();
    await addTaskState(root);
    const tsxCli = path.resolve("node_modules", "tsx", "dist", "cli.mjs");
    const canontrailCli = path.resolve("src", "cli.ts");
    await execFileAsync(process.execPath, [
      tsxCli,
      canontrailCli,
      "evidence",
      "record",
      root,
      "--task", "T-FIXTURE",
      "--id", "EVID-CLI-APPLY",
      "--kind", "technical-test",
      "--status", "pass",
      "--claim", "The CLI applies compact evidence.",
      "--summary", "The task-owned YAML record was written.",
      "--subject", verificationPath,
      "--observed-at", "2026-07-15T19:10:00+02:00",
      "--apply",
    ], { cwd: path.resolve("."), windowsHide: true });

    const output = path.join(root, ".agent-context", "tasks", "T-FIXTURE", "evidence", "EVID-CLI-APPLY.evidence.yaml");
    expect((parse(await readFile(output, "utf8")) as Record<string, unknown>).evidence_id).toBe("EVID-CLI-APPLY");
  }, 15_000);
});
