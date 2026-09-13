import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "../src/frontmatter.js";

const root = path.resolve(".");

async function text(relativePath: string): Promise<string> {
  return readFile(path.join(root, ...relativePath.split("/")), "utf8");
}

describe("GSD CanonTrail capability", () => {
  it("uses version-bounded official extension points and halt-on-error steps", async () => {
    const manifest = JSON.parse(await text("integrations/gsd/canontrail/capability.json")) as {
      id: string;
      role: string;
      engines: { gsd: string };
      runtimeCompat: { supported: string[] };
      skills: string[];
      steps: Array<{ point: string; ref: { skill: string }; onError: string }>;
      contributions: unknown[];
      gates: unknown[];
    };

    expect(manifest).toMatchObject({
      id: "canontrail",
      role: "feature",
      engines: { gsd: ">=1.11.0 <2.0.0" },
      runtimeCompat: { supported: ["*"] },
      contributions: [],
      gates: [],
    });
    expect(manifest.skills).toEqual(["canontrail-context", "canontrail-finalize"]);
    expect(manifest.steps).toEqual([
      expect.objectContaining({ point: "plan:pre", ref: { skill: "canontrail-context" }, onError: "halt" }),
      expect.objectContaining({ point: "verify:post", ref: { skill: "canontrail-finalize" }, onError: "halt" }),
    ]);

    for (const stem of manifest.skills) {
      const skill = parseFrontmatter(await text(`integrations/gsd/canontrail/skills/${stem}/SKILL.md`));
      expect(skill.header.name).toBe(stem);
      expect(skill.body).toContain("CanonTrail");
    }
  });
});

describe("Superpowers CanonTrail skill", () => {
  it("ships as a separate plugin skill and invokes the shared finalization gate", async () => {
    const plugin = JSON.parse(await text("integrations/superpowers/.claude-plugin/plugin.json")) as {
      name: string;
      version: string;
    };
    const skill = parseFrontmatter(await text("integrations/superpowers/skills/canontrail-feature-lifecycle/SKILL.md"));

    expect(plugin).toEqual(expect.objectContaining({ name: "canontrail-superpowers", version: "0.1.0" }));
    expect(skill.header.name).toBe("canontrail-feature-lifecycle");
    expect(skill.body).toContain("canontrail context compile");
    expect(skill.body).toContain("canontrail finalize . --task <task-id> --fail-on-warnings");
    expect(skill.body).toContain("Superpowers specs, plans, and review flow under Superpowers ownership");
  });
});

describe("GitHub completion gate", () => {
  const bash = process.platform === "win32" ? path.join(process.env.ProgramFiles ?? "C:/Program Files", "Git/bin/bash.exe") : "bash";
  it.skipIf(process.platform === "win32" && !existsSync(bash)).each([
    { global: 1, task: "T-123", taskExit: 0, expected: 1, calls: 1 },
    { global: 0, task: "T-123", taskExit: 0, expected: 0, calls: 2 },
    { global: 0, task: "T-123", taskExit: 2, expected: 2, calls: 2 },
    { global: 0, task: "", taskExit: 0, expected: 0, calls: 1 },
  ])("executes mandatory global CI before the optional task: %j", async (scenario) => {
    const action = parse(await text("action.yml"));
    const run = action.runs.steps.find((step: { run?: string }) => step.run?.includes("command=(node"))?.run;
    expect(typeof run).toBe("string");
    // Run the actual composite action shell body with only its node command
    // replaced by a fixture function. No project files or actual CLI are run.
    const probe = 'node() { printf "%s|%s|%s\\n" "$#" "$3" "$*"; if [[ " $* " == *" --task "* ]]; then return "$CT_TASK_EXIT"; fi; return "$CT_GLOBAL_EXIT"; };\n' + run;
    const result = spawnSync(bash, ["--noprofile", "--norc", "-c", probe], {
      encoding: "utf8", windowsHide: true, timeout: 15000,
      env: { ...process.env, GITHUB_ACTION_PATH: "/fixture/action runtime", CANONTRAIL_ROOT: "fixture root with spaces", CANONTRAIL_TASK: scenario.task, CANONTRAIL_FAIL_ON_WARNINGS: "true", CT_GLOBAL_EXIT: String(scenario.global), CT_TASK_EXIT: String(scenario.taskExit) },
    });
    expect(result.error).toBeUndefined(); expect(result.status, result.stderr).toBe(scenario.expected);
    const calls = result.stdout.trim().split(/\r?\n/);
    expect(calls).toHaveLength(scenario.calls);
    expect(calls[0]).toMatch(/^4\|fixture root with spaces\|/);
    expect(calls[0]).toContain("--fail-on-warnings"); expect(calls[0]).not.toContain("--task");
    if (scenario.calls === 2) expect(calls[1]).toMatch(/^6\|fixture root with spaces\|.*--task T-123$/);
  });
  it("provides a reusable no-repair action and a strict repository workflow", async () => {
    const action = parse(await text("action.yml")) as {
      runs: { using: string; steps: Array<{ run: string }> };
    };
    const workflow = await text(".github/workflows/canontrail.yml");
    const template = await text("templates/github-actions/canontrail.yml");

    expect(action.runs.using).toBe("composite");
    expect(action.runs.steps.some((step) => step.run.includes("finalize"))).toBe(true);
    expect(action.runs.steps.every((step) => !step.run.includes("--refresh-index"))).toBe(true);
    expect(workflow).toContain("node dist/cli.js finalize . --fail-on-warnings");
    expect(workflow).not.toContain("--refresh-index");
    expect(template).toContain("uses: gardenvision/CanonTrail@23d542302e7327931cb2c60b7a35ae60e6e47f16");
    expect(template).not.toMatch(/uses: gardenvision\/CanonTrail@(?:main|master|HEAD)\b/);
    expect(template).toContain('fail-on-warnings: "true"');
  });
});

describe("Cross-platform verification workflow", () => {
  it("requires every target OS, keeps failures visible and preserves the stable aggregate gate", async () => {
    const workflow = parse(await text(".github/workflows/validate.yml"));
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(Object.keys(workflow.on).sort()).toEqual(["pull_request", "push"]);
    const matrix = workflow.jobs["platform-tests"];
    expect(matrix.strategy["fail-fast"]).toBe(false);
    expect(matrix.strategy.matrix.os).toEqual(["ubuntu-latest", "windows-latest", "macos-latest"]);
    expect(matrix.strategy.matrix.node).toEqual(["24"]);
    expect(matrix.strategy.matrix.include).toEqual([{ os: "ubuntu-latest", node: "20.19" }]);
    expect(matrix["continue-on-error"]).toBeUndefined();
    expect(matrix["runs-on"]).toBe("${{ matrix.os }}");
    const runs = matrix.steps.flatMap((step: { run?: string }) => step.run ? [step.run] : []);
    expect(runs).toContain("npm run check");
    expect(runs).toContain("npm run build");
    expect(runs).toContain("node dist/cli.js validate .");
    expect(runs).toContain("node dist/cli.js finalize . --fail-on-warnings");
    expect(runs.some((run: string) => run.includes("--reporter=json"))).toBe(true);
    expect(runs.some((run: string) => run.includes("--refresh-index"))).toBe(false);
    const artifact = matrix.steps.find((step: { uses?: string }) => step.uses?.startsWith("actions/upload-artifact@"));
    expect(artifact.if).toBe("always()");
    expect(artifact.with.path).toContain("canontrail-capabilities.json");
    expect(artifact.with.path).toContain("canontrail-tests.json");
    expect(artifact.with.name).toContain("matrix.os");
    expect(workflow.jobs.validate).toMatchObject({
      needs: "platform-tests", if: "always()", "runs-on": "ubuntu-latest",
      steps: [{ env: { PLATFORM_RESULT: "${{ needs.platform-tests.result }}" }, run: 'test "$PLATFORM_RESULT" = success' }],
    });
    for (const step of matrix.steps) {
      expect(step["continue-on-error"]).toBeUndefined();
      if (step.uses) expect(step.uses).toMatch(/@[a-f0-9]{40}$/);
    }
  });
});
