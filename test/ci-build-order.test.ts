import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

function requireBuiltCli(runs: string[]): void {
  let installed = false, built = false, tested = false;
  for (const run of runs) {
    if (/^npm ci(?:\s|$)/m.test(run)) { installed = true; built = false; }
    if (/^npm run build(?:\s|$)/m.test(run)) {
      if (!installed) throw new Error("Build precedes dependency installation");
      built = true;
    }
    if (/^npm test(?:\s|$)/m.test(run)) {
      if (!built) throw new Error("CLI integration tests require a freshly built dist/cli.js");
      tested = true;
    }
  }
  if (!tested) throw new Error("No test step found");
}

describe("clean-checkout CI prerequisites", () => {
  it.each([".github/workflows/validate.yml", ".github/workflows/canontrail.yml"])("builds before CLI tests in %s", async file => {
    const workflow = parse(await readFile(file, "utf8")) as { jobs: Record<string, { steps: Array<{ run?: string }> }> };
    const jobs = Object.values(workflow.jobs).filter(job => job.steps.some(step => /^npm test(?:\s|$)/m.test(step.run ?? "")));
    expect(jobs.length).toBeGreaterThan(0);
    for (const job of jobs) requireBuiltCli(job.steps.map(step => step.run ?? ""));
  });
  it("rejects the original build-after-tests regression", () => {
    expect(() => requireBuiltCli(["npm ci --ignore-scripts", "npm test", "npm run build"])).toThrow("freshly built");
  });
  it("does not accept a prior build invalidated by a later dependency install", () => {
    expect(() => requireBuiltCli(["npm ci", "npm run build", "npm ci", "npm test"])).toThrow("freshly built");
  });
});
