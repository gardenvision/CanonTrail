import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectCompatibility } from "../src/compatibility.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "canontrail-compat-test-"));
  temporaryRoots.push(root);
  return root;
}

describe("detectCompatibility", () => {
  it("maps Superpowers specs and plans without modifying them", async () => {
    const root = await temporaryRoot();
    const spec = path.join(root, "docs", "superpowers", "specs", "2026-07-13-garden-design.md");
    const plan = path.join(root, "docs", "superpowers", "plans", "2026-07-13-garden.md");
    await mkdir(path.dirname(spec), { recursive: true });
    await mkdir(path.dirname(plan), { recursive: true });
    await writeFile(spec, "# External design\n");
    await writeFile(plan, "# External plan\n");

    const report = await detectCompatibility(root);
    const integration = report.integrations.find((entry) => entry.id === "superpowers");

    expect(integration?.detected).toBe(true);
    expect(integration?.artifacts.map((artifact) => artifact.role)).toEqual(["plan", "specification"]);
    expect(integration?.artifacts.every((artifact) => artifact.canonical === false)).toBe(true);
    expect(await readFile(spec, "utf8")).toBe("# External design\n");
    expect(await readFile(plan, "utf8")).toBe("# External plan\n");
  });

  it("classifies common GSD Core planning artifacts", async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, ".planning", "phases", "01-foundation"), { recursive: true });
    await writeFile(path.join(root, ".planning", "PROJECT.md"), "# Project\n");
    await writeFile(path.join(root, ".planning", "REQUIREMENTS.md"), "# Requirements\n");
    await writeFile(path.join(root, ".planning", "STATE.md"), "# State\n");
    await writeFile(path.join(root, ".planning", "phases", "01-foundation", "01-PLAN.md"), "# Plan\n");
    await writeFile(path.join(root, ".planning", "phases", "01-foundation", "01-VERIFICATION.md"), "# Verification\n");

    const report = await detectCompatibility(root);
    const integration = report.integrations.find((entry) => entry.id === "gsd-core");

    expect(integration?.detected).toBe(true);
    expect(Object.fromEntries(integration?.artifacts.map((artifact) => [path.posix.basename(artifact.path), artifact.role]) ?? [])).toEqual({
      "01-PLAN.md": "plan",
      "01-VERIFICATION.md": "verification",
      "PROJECT.md": "specification",
      "REQUIREMENTS.md": "requirements",
      "STATE.md": "state",
    });
    expect(integration?.policy.canontrailWritesSource).toBe(false);
  });

  it("ignores opaque GSD Pi runtime files", async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, ".gsd"), { recursive: true });
    await writeFile(path.join(root, ".gsd", "STATE.md"), "# State\n");
    await writeFile(path.join(root, ".gsd", "runtime.db"), "opaque\n");
    await writeFile(path.join(root, ".gsd", "session.log"), "opaque\n");

    const report = await detectCompatibility(root);
    const integration = report.integrations.find((entry) => entry.id === "gsd-pi");

    expect(integration?.detected).toBe(true);
    expect(integration?.artifacts.map((artifact) => artifact.path)).toEqual([".gsd/STATE.md"]);
  });
});
