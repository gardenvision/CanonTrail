import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectCompatibility } from "../src/compatibility.js";
import { sha256 } from "../src/indexer.js";
import { observeGsdReadiness } from "../src/readiness.js";

const roots: string[] = [];
const fixtureRoot = path.resolve("test", "fixtures", "gsd-readiness-v1");
const readinessPath = ".planning/phases/03-feature/03-READINESS.md";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function projectFixture(): Promise<{ root: string; readiness: string; requirements: string; plan: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "canontrail-readiness-test-"));
  roots.push(root);
  const phaseDirectory = path.join(root, ".planning", "phases", "03-feature");
  await mkdir(phaseDirectory, { recursive: true });

  const requirementsContent = await readFile(path.join(fixtureRoot, "REQUIREMENTS.md.fixture"), "utf8");
  const planContent = await readFile(path.join(fixtureRoot, "03-01-PLAN.md.fixture"), "utf8");
  const requirements = path.join(root, ".planning", "REQUIREMENTS.md");
  const plan = path.join(phaseDirectory, "03-01-PLAN.md");
  const readiness = path.join(phaseDirectory, "03-READINESS.md");
  await writeFile(requirements, requirementsContent);
  await writeFile(plan, planContent);

  const template = await readFile(path.join(fixtureRoot, "03-READINESS.md.fixture"), "utf8");
  await writeFile(
    readiness,
    template
      .replace("__REQUIREMENTS_HASH__", sha256(requirementsContent))
      .replace("__PLAN_HASH__", sha256(planContent)),
  );
  return { root, readiness, requirements, plan };
}

describe("observeGsdReadiness", () => {
  it("reports a current version-1 projection without changing external bytes", async () => {
    const fixture = await projectFixture();
    const before = await Promise.all([
      readFile(fixture.readiness),
      readFile(fixture.requirements),
      readFile(fixture.plan),
    ]);

    const observation = await observeGsdReadiness(fixture.root, readinessPath);
    const compatibility = await detectCompatibility(fixture.root);
    const readinessArtifact = compatibility.integrations
      .find((entry) => entry.id === "gsd-core")
      ?.artifacts.find((entry) => entry.path === readinessPath);

    expect(observation).toMatchObject({
      contract: "project-policy/gsd-phase-readiness",
      schema_version: 1,
      contract_owner: "project-policy",
      workflow_owner: "gsd-core",
      declared_status: "ready",
      state: "current",
      findings: [],
    });
    expect(observation.sources).toHaveLength(2);
    expect(observation.sources.every((source) => source.current)).toBe(true);
    expect(readinessArtifact).toMatchObject({ role: "other", canonical: false });
    expect(await Promise.all([
      readFile(fixture.readiness),
      readFile(fixture.requirements),
      readFile(fixture.plan),
    ])).toEqual(before);
  });

  it("reports stale provenance when a referenced source changes", async () => {
    const fixture = await projectFixture();
    const readinessBefore = await readFile(fixture.readiness);
    await writeFile(fixture.requirements, "# Changed requirements\n");

    const observation = await observeGsdReadiness(fixture.root, readinessPath);

    expect(observation.state).toBe("stale");
    expect(observation.findings).toContainEqual(expect.objectContaining({
      code: "RDY_SOURCE_HASH",
      source_path: ".planning/REQUIREMENTS.md",
    }));
    expect(await readFile(fixture.readiness)).toEqual(readinessBefore);
  });

  it("rejects ready when required checks fail or blockers remain", async () => {
    const fixture = await projectFixture();
    const source = await readFile(fixture.readiness, "utf8");
    await writeFile(
      fixture.readiness,
      source
        .replace("status: pass", "status: fail")
        .replace("blockers: []", "blockers:\n  - Human approval is still required."),
    );

    const observation = await observeGsdReadiness(fixture.root, readinessPath);

    expect(observation.state).toBe("invalid");
    expect(observation.findings.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "RDY_READY_CHECK",
      "RDY_READY_BLOCKER",
    ]));
  });

  it("allows a not-ready projection to describe failed required checks", async () => {
    const fixture = await projectFixture();
    const source = await readFile(fixture.readiness, "utf8");
    await writeFile(
      fixture.readiness,
      source.replace("status: ready", "status: not-ready").replace("status: pass", "status: fail"),
    );

    const observation = await observeGsdReadiness(fixture.root, readinessPath);

    expect(observation.state).toBe("current");
    expect(observation.declared_status).toBe("not-ready");
  });

  it("rejects ready when the policy declares no required checks", async () => {
    const fixture = await projectFixture();
    const source = await readFile(fixture.readiness, "utf8");
    await writeFile(fixture.readiness, source.replaceAll("required: true", "required: false"));

    const observation = await observeGsdReadiness(fixture.root, readinessPath);

    expect(observation.state).toBe("invalid");
    expect(observation.findings).toContainEqual(expect.objectContaining({ code: "RDY_READY_NO_REQUIRED" }));
  });

  it("leaves unknown versions unsupported and unwired from adapter semantics", async () => {
    const fixture = await projectFixture();
    const source = await readFile(fixture.readiness, "utf8");
    await writeFile(fixture.readiness, source.replace("schema_version: 1", "schema_version: 2"));

    const observation = await observeGsdReadiness(fixture.root, readinessPath);
    const compatibility = await detectCompatibility(fixture.root);
    const readinessArtifact = compatibility.integrations
      .find((entry) => entry.id === "gsd-core")
      ?.artifacts.find((entry) => entry.path === readinessPath);

    expect(observation.state).toBe("unsupported");
    expect(observation.findings).toContainEqual(expect.objectContaining({ code: "RDY005" }));
    expect(readinessArtifact).toMatchObject({ role: "other", canonical: false });
  });

  it("rejects paths outside the local GSD projection boundary", async () => {
    const fixture = await projectFixture();
    const observation = await observeGsdReadiness(fixture.root, "../03-READINESS.md");
    expect(observation.state).toBe("invalid");
    expect(observation.findings).toContainEqual(expect.objectContaining({ code: "RDY001" }));
  });
});
