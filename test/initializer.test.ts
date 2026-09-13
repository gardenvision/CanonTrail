import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { formatInitReport, initializeProject, inventoryProject, inventoryWarnings } from "../src/initializer.js";
import type { ProjectInventory } from "../src/initializer.js";
import { validateRepository } from "../src/validator.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "canontrail-init-test-"));
  temporaryRoots.push(root);
  return root;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

describe("initializeProject", () => {
  it("initializes an empty project with provider bridges and a valid baseline index", async () => {
    const root = await temporaryRoot();

    const report = await initializeProject(root);

    expect(report.ok).toBe(true);
    expect(report.mode).toBe("new");
    expect(report.documentation).toBe("baseline");
    expect(await readFile(path.join(root, "CLAUDE.md"), "utf8")).toBe("@AGENTS.md\n");
    expect(await readFile(path.join(root, "GEMINI.md"), "utf8")).toBe("@AGENTS.md\n");
    expect(await pathExists(path.join(root, ".cursor", "rules", "canontrail.mdc"))).toBe(true);
    expect(await pathExists(path.join(root, ".agent-context", "context-index.json"))).toBe(true);
    expect(await pathExists(path.join(root, ".agent-context", "schemas", "change-record.schema.json"))).toBe(true);
    expect(await pathExists(path.join(root, ".agent-context", "schemas", "evidence-record.schema.json"))).toBe(true);
    expect(await pathExists(path.join(root, ".agent-context", "schemas", "maintenance.schema.json"))).toBe(true);
    expect(await pathExists(path.join(root, ".agent-context", "schemas", "migration-plan.schema.json"))).toBe(true);
    expect(await pathExists(path.join(root, ".agent-context", "schemas", "migration-execution.schema.json"))).toBe(true);
    expect(await pathExists(path.join(root, ".agent-context", "schemas", "migration-transaction.schema.json"))).toBe(true);
    expect(await pathExists(path.join(root, ".agent-context", "schemas", "resume-packet.schema.json"))).toBe(true);
    const shippedSchemas = (await readdir(path.resolve("schemas")))
      .filter((entry) => entry.endsWith(".schema.json"))
      .sort();
    const initializedSchemas = (await readdir(path.join(root, ".agent-context", "schemas")))
      .filter((entry) => entry.endsWith(".schema.json"))
      .sort();
    expect(initializedSchemas).toEqual(shippedSchemas);
    expect(initializedSchemas).toContain("context-inspection.schema.json");
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toContain("change.yaml");
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toContain("canontrail context compile");
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toContain("unrelated index updates alone do not require rewriting a valid lock");
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toContain("canontrail checkpoint create");
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toContain("latest_handoff to .agent-context/tasks/<task-id>/handoff.yaml");
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toContain("creation does not edit task state");
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toContain("must not read transcripts");
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toContain("canontrail docs audit");
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toContain("feature documentation is unchanged, updated, created, or structurally reassessed");
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toContain("independent reviewer");
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toContain("smallest sufficient, reproducible working view");
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toContain("new task, a resumed task with a handoff");
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toContain("unfinished documentation bootstrap");
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toContain("recompile the context lock instead of reading the complete repository");
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toContain("canontrail finalize . --task <task-id> --fail-on-warnings");
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toContain("Finalization never performs canonical promotion");
    expect(await readFile(path.join(root, ".agent-context", "maintenance.yaml"), "utf8")).toContain("stale_after_days");
    expect((await validateRepository(root)).ok).toBe(true);
  });

  it("adopts a Unity project locally without scanning generated directories or changing source", async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, "Assets", "Scripts", "Garden"), { recursive: true });
    await mkdir(path.join(root, "Packages"), { recursive: true });
    await mkdir(path.join(root, "ProjectSettings"), { recursive: true });
    await mkdir(path.join(root, "Library"), { recursive: true });
    const sourcePath = path.join(root, "Assets", "Scripts", "Garden", "Plant.cs");
    await writeFile(sourcePath, "public sealed class Plant {}\n");
    await writeFile(path.join(root, "Packages", "manifest.json"), "{}\n");
    await writeFile(path.join(root, "ProjectSettings", "ProjectVersion.txt"), "m_EditorVersion: 6000.1.0f1\n");
    await writeFile(path.join(root, "Library", "large.generated"), "not source\n");

    const report = await initializeProject(root, { adopt: true, localOnly: true });

    expect(report.ok).toBe(true);
    expect(report.profile).toBe("unity");
    expect(report.documentation).toBe("full");
    expect(report.inventory.totalFiles).toBe(3);
    expect(report.inventory.subsystemCandidates).toContain("Garden");
    expect(report.safety).toEqual({
      remoteOperationsPerformed: false,
      commitsCreated: false,
      hooksInstalled: false,
      existingFilesOverwritten: false,
    });
    expect(await readFile(sourcePath, "utf8")).toBe("public sealed class Plant {}\n");
    expect(await readFile(path.join(root, "Library", "large.generated"), "utf8")).toBe("not source\n");
    expect(await pathExists(path.join(root, "docs", "canontrail", "features", "README.md"))).toBe(true);
    expect(await readFile(path.join(root, "docs", "canontrail", "features", "README.md"), "utf8")).toContain("truth_level: draft");
    expect(await readFile(path.join(root, ".agent-context", "documentation-plan.yaml"), "utf8")).toContain("Product-feature boundary");
    expect((await validateRepository(root)).ok).toBe(true);
  });

  it("preserves an existing provider file and writes a merge proposal", async () => {
    const root = await temporaryRoot();
    await writeFile(path.join(root, "CLAUDE.md"), "# Existing Claude rules\n");

    const report = await initializeProject(root, { adopt: true });

    expect(report.conflicts).toContain("CLAUDE.md");
    expect(await readFile(path.join(root, "CLAUDE.md"), "utf8")).toBe("# Existing Claude rules\n");
    expect(await readFile(path.join(root, ".agent-context", "generated", "bridges", "CLAUDE.md.proposed"), "utf8")).toBe("@AGENTS.md\n");
  });

  it("does not impose CanonTrail frontmatter on pre-existing project documentation", async () => {
    const root = await temporaryRoot();
    await writeFile(path.join(root, "README.md"), "# Existing project documentation\n");

    const report = await initializeProject(root, { adopt: true });

    expect(report.documentation).toBe("baseline");
    expect(await readFile(path.join(root, "README.md"), "utf8")).toBe("# Existing project documentation\n");
    expect((await validateRepository(root)).ok).toBe(true);
  });

  it("detects external workflow artifacts without mistaking them for canonical project documentation", async () => {
    const root = await temporaryRoot();
    const externalSpec = path.join(root, "docs", "superpowers", "specs", "2026-07-13-garden-design.md");
    await mkdir(path.dirname(externalSpec), { recursive: true });
    await writeFile(externalSpec, "# Superpowers-owned design\n");

    const report = await initializeProject(root, { adopt: true });
    const manifest = parse(await readFile(path.join(root, ".agent-context", "compatibility.yaml"), "utf8")) as {
      integrations: Array<{ id: string; detected: boolean; artifact_count: number }>;
    };

    expect(report.documentation).toBe("full");
    expect(manifest.integrations.find((entry) => entry.id === "superpowers")).toMatchObject({
      detected: true,
      artifact_count: 1,
    });
    expect(await readFile(externalSpec, "utf8")).toBe("# Superpowers-owned design\n");
    expect((await validateRepository(root)).ok).toBe(true);
  });

  it("makes no filesystem changes during a dry run", async () => {
    const root = await temporaryRoot();

    const report = await initializeProject(root, { dryRun: true });

    expect(report.dryRun).toBe(true);
    expect(report.created).toEqual([]);
    expect(await pathExists(path.join(root, ".agent-context"))).toBe(false);
  });

  it("requires --adopt for a non-empty project", async () => {
    const root = await temporaryRoot();
    await writeFile(path.join(root, "source.txt"), "keep me\n");

    await expect(initializeProject(root)).rejects.toThrow("--adopt");
    expect(await readFile(path.join(root, "source.txt"), "utf8")).toBe("keep me\n");
    expect(await pathExists(path.join(root, ".agent-context"))).toBe(false);
  });

  it("excludes Built/ and Recordings/ like the other Unity-generated directories", async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, "Assets"), { recursive: true });
    await mkdir(path.join(root, "Packages"), { recursive: true });
    await mkdir(path.join(root, "ProjectSettings"), { recursive: true });
    await writeFile(path.join(root, "Packages", "manifest.json"), "{}\n");
    await writeFile(path.join(root, "ProjectSettings", "ProjectVersion.txt"), "m_EditorVersion: 6000.1.0f1\n");
    await mkdir(path.join(root, "Built"), { recursive: true });
    await writeFile(path.join(root, "Built", "player.exe.generated"), "binary\n");
    await mkdir(path.join(root, "Recordings"), { recursive: true });
    await writeFile(path.join(root, "Recordings", "capture.mp4.generated"), "binary\n");

    const inventory = await inventoryProject(root, "unity");

    expect(inventory.totalFiles).toBe(2);
    expect(inventory.excludedDirectories).toEqual(expect.arrayContaining(["Built", "Recordings"]));
  });

  it("excludes Unity/IDE-generated project files such as .csproj and .sln from the mechanical inventory", async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, "Assets"), { recursive: true });
    await mkdir(path.join(root, "Packages"), { recursive: true });
    await mkdir(path.join(root, "ProjectSettings"), { recursive: true });
    await writeFile(path.join(root, "Packages", "manifest.json"), "{}\n");
    await writeFile(path.join(root, "ProjectSettings", "ProjectVersion.txt"), "m_EditorVersion: 6000.1.0f1\n");
    await writeFile(path.join(root, "Assembly-CSharp.csproj"), "<Project />\n");
    await writeFile(path.join(root, "Project.slnx"), "<Solution />\n");

    const inventory = await inventoryProject(root, "unity");

    expect(inventory.totalFiles).toBe(2);
    expect(inventory.extensionCounts[".csproj"]).toBeUndefined();
    expect(inventory.extensionCounts[".slnx"]).toBeUndefined();
  });

  it("keeps checking every sibling directory for Unity exclusions even after the file budget is exhausted", async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, "Packages"), { recursive: true });
    await mkdir(path.join(root, "ProjectSettings"), { recursive: true });
    await writeFile(path.join(root, "Packages", "manifest.json"), "{}\n");
    await writeFile(path.join(root, "ProjectSettings", "ProjectVersion.txt"), "m_EditorVersion: 6000.1.0f1\n");
    // Assets/ alone exceeds the injected budget, so truncation trips while the walk is still deep
    // inside it -- before it has returned to look at any later top-level sibling by name.
    await mkdir(path.join(root, "Assets", "Scripts"), { recursive: true });
    for (let i = 0; i < 5; i += 1) {
      await writeFile(path.join(root, "Assets", "Scripts", `File${i}.cs`), "public sealed class C {}\n");
    }
    // Library/ sorts after Assets/ and must still be recognized and excluded even though the walk
    // never has budget left to actually enter and count its contents.
    await mkdir(path.join(root, "Library"), { recursive: true });
    await writeFile(path.join(root, "Library", "large.generated"), "not source\n");
    // Docs/ also sorts after Assets/ and is not excluded; it must be reported as unscanned rather
    // than silently dropped the way the pre-fix truncation abort dropped every later sibling.
    await mkdir(path.join(root, "Docs"), { recursive: true });
    await writeFile(path.join(root, "Docs", "notes.md"), "# notes\n");

    const inventory = await inventoryProject(root, "unity", { maxFiles: 2 });

    expect(inventory.truncated).toBe(true);
    expect(inventory.fileLimit).toBe(2);
    expect(inventory.totalFiles).toBe(2);
    expect(inventory.excludedDirectories).toContain("Library");
    expect(inventory.excludedDirectoryCount).toBe(1);
    expect(inventory.unscannedDirectories).toContain("Docs");
    expect(inventory.unscannedDirectoryCount).toBeGreaterThanOrEqual(1);
    expect(inventory.unscannedDirectories).not.toContain("Library");
  });

  it("scans documentation and owned source roots before repository fallback without double-counting", async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, "A-Huge"), { recursive: true });
    for (let index = 0; index < 5; index += 1) {
      await writeFile(path.join(root, "A-Huge", `generated-${index}.txt`), "large\n");
    }
    await mkdir(path.join(root, "Z-Docs"), { recursive: true });
    await writeFile(path.join(root, "Z-Docs", "guide.md"), "# Guide\n");
    await mkdir(path.join(root, "Z-Owned"), { recursive: true });
    await writeFile(path.join(root, "Z-Owned", "feature.cs"), "public sealed class Feature {}\n");

    const inventory = await inventoryProject(root, "generic", {
      maxFiles: 3,
      documentationRoots: ["Z-Docs"],
      ownedSourceRoots: ["Z-Owned"],
    });

    expect(inventory.totalFiles).toBe(3);
    expect(inventory.documentationFiles).toEqual(["Z-Docs/guide.md"]);
    expect(inventory.rootCoverage).toEqual([
      expect.objectContaining({ kind: "documentation", path: "Z-Docs", status: "complete", files: 1, documentationFiles: 1 }),
      expect.objectContaining({ kind: "owned-source", path: "Z-Owned", status: "complete", files: 1 }),
      expect.objectContaining({ kind: "repository-fallback", path: ".", status: "partial", files: 1 }),
    ]);
  });

  it("reports overlapping priority-root coverage without counting files twice globally", async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, "Project", "Documentation"), { recursive: true });
    await writeFile(path.join(root, "Project", "Documentation", "guide.md"), "# Guide\n");
    await writeFile(path.join(root, "Project", "feature.ts"), "export const feature = true;\n");

    const inventory = await inventoryProject(root, "generic", {
      documentationRoots: ["Project/Documentation"],
      ownedSourceRoots: ["Project"],
    });

    expect(inventory.totalFiles).toBe(2);
    expect(inventory.rootCoverage).toEqual([
      expect.objectContaining({ kind: "documentation", path: "Project/Documentation", files: 1, documentationFiles: 1 }),
      expect.objectContaining({ kind: "owned-source", path: "Project", files: 2, documentationFiles: 1 }),
      expect.objectContaining({ kind: "repository-fallback", path: ".", files: 0, documentationFiles: 0 }),
    ]);
  });

  it("distinguishes partial and fully unscanned requested roots under one global budget", async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, "Docs"), { recursive: true });
    await writeFile(path.join(root, "Docs", "a.md"), "# A\n");
    await writeFile(path.join(root, "Docs", "b.md"), "# B\n");
    await mkdir(path.join(root, "Source"), { recursive: true });
    await writeFile(path.join(root, "Source", "feature.ts"), "export const feature = true;\n");

    const inventory = await inventoryProject(root, "generic", {
      maxFiles: 1,
      documentationRoots: ["Docs"],
      ownedSourceRoots: ["Source"],
    });

    expect(inventory.rootCoverage).toEqual([
      expect.objectContaining({ kind: "documentation", path: "Docs", status: "partial", files: 1 }),
      expect.objectContaining({ kind: "owned-source", path: "Source", status: "unscanned", files: 0 }),
      expect.objectContaining({ kind: "repository-fallback", path: ".", status: "partial", files: 0 }),
    ]);
    expect(inventory.unscannedDirectories).toContain("Source");
  });

  it("discovers nested conventional documentation without treating arbitrary or external Markdown as project truth", async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, "Assets", "_Game", "Documentation", "Core"), { recursive: true });
    await mkdir(path.join(root, "Assets", "_Game", "Code"), { recursive: true });
    await mkdir(path.join(root, "docs", "superpowers", "specs"), { recursive: true });
    await writeFile(path.join(root, "Assets", "_Game", "Documentation", "Core", "INDEX.md"), "# Index\n");
    await writeFile(path.join(root, "Assets", "_Game", "Code", "README.md"), "# Code\n");
    await writeFile(path.join(root, "Assets", "_Game", "Code", "notes.md"), "# Notes\n");
    await writeFile(path.join(root, "docs", "superpowers", "specs", "plan.md"), "# External plan\n");

    const inventory = await inventoryProject(root, "generic");

    expect(inventory.documentationFiles).toEqual([
      "Assets/_Game/Code/README.md",
      "Assets/_Game/Documentation/Core/INDEX.md",
    ]);
    expect(inventory.documentationFileCount).toBe(2);
  });

  it("records accepted priority roots in generated configuration and the adoption manifest", async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, "Project", "Documentation"), { recursive: true });
    await writeFile(path.join(root, "Project", "Documentation", "guide.md"), "# Guide\n");
    await writeFile(path.join(root, "Project", "feature.ts"), "export const feature = true;\n");

    const report = await initializeProject(root, {
      adopt: true,
      documentationRoots: ["Project/Documentation"],
      ownedSourceRoots: ["Project"],
    });
    const config = parse(await readFile(path.join(root, ".agent-context", "config.yaml"), "utf8")) as {
      discovery: { documentation_roots: string[]; owned_source_roots: string[]; priority_order: string[] };
    };
    const manifest = JSON.parse(await readFile(path.join(root, ".agent-context", "adoption-manifest.json"), "utf8")) as {
      inventory: ProjectInventory;
    };

    expect(config.discovery).toEqual({
      documentation_roots: ["Project/Documentation"],
      owned_source_roots: ["Project"],
      priority_order: ["documentation_roots", "owned_source_roots", "repository_fallback"],
      inventory_file_limit: 100_000,
    });
    expect(manifest.inventory.rootCoverage).toEqual(report.inventory.rootCoverage);
    expect(report.documentation).toBe("baseline");
    expect(formatInitReport(report)).toContain(
      "Coverage documentation:Project/Documentation: complete; 1 file, 1 documentation candidate, 0 unscanned directories.",
    );
  });

  it("rejects unsafe, missing, file, and excluded priority roots before writing", async () => {
    const root = await temporaryRoot();
    await writeFile(path.join(root, "source.txt"), "source\n");
    await mkdir(path.join(root, "Library", "Docs"), { recursive: true });

    const invalidRoots = [
      path.join(root, "Library"),
      "../outside",
      "missing",
      "source.txt",
      "Library/Docs",
    ];
    for (const invalidRoot of invalidRoots) {
      await expect(initializeProject(root, {
        adopt: true,
        profile: "unity",
        documentationRoots: [invalidRoot],
      })).rejects.toThrow(/documentation root/);
    }
    expect(await pathExists(path.join(root, ".agent-context"))).toBe(false);
  });

  it("surfaces unscanned directories as an explicit, reviewable warning", () => {
    const baseInventory: ProjectInventory = {
      profile: "unity",
      fileLimit: 2,
      totalFiles: 2,
      totalBytes: 0,
      documentationFiles: [],
      documentationFileCount: 0,
      ownedSourceRoots: [],
      documentationRoots: [],
      rootCoverage: [],
      topLevelCounts: {},
      extensionCounts: {},
      subsystemCandidates: [],
      truncated: true,
      excludedDirectories: ["Library"],
      excludedDirectoryCount: 1,
      unscannedDirectories: ["Docs", "Packages", "ProjectSettings"],
      unscannedDirectoryCount: 3,
    };

    const warnings = inventoryWarnings(baseInventory);

    expect(warnings).toContain(
      "3 directories were never scanned because the inventory budget ran out before reaching them; verify manually whether they need exclusion: Docs, Packages, ProjectSettings",
    );
    // excluded (safely skipped by name) must never be conflated with unscanned (skipped only because
    // the budget ran out, not yet verified).
    expect(warnings.join(" ")).not.toContain("Library");
  });

  it("reports the complete unscanned count even when the path sample is bounded", () => {
    const sampledPaths = Array.from({ length: 12 }, (_, index) => `Area-${String(index + 1).padStart(2, "0")}`);
    const baseInventory: ProjectInventory = {
      profile: "unity",
      fileLimit: 100_000,
      totalFiles: 100_000,
      totalBytes: 0,
      documentationFiles: [],
      documentationFileCount: 0,
      ownedSourceRoots: [],
      documentationRoots: [],
      rootCoverage: [],
      topLevelCounts: {},
      extensionCounts: {},
      subsystemCandidates: [],
      truncated: true,
      excludedDirectories: [],
      excludedDirectoryCount: 0,
      unscannedDirectories: sampledPaths,
      unscannedDirectoryCount: 37,
    };

    expect(inventoryWarnings(baseInventory)).toEqual([
      "inventory stopped after 100000 files; split later discovery by subsystem",
      "37 directories were never scanned because the inventory budget ran out before reaching them; verify manually whether they need exclusion: Area-01, Area-02, Area-03, Area-04, Area-05, Area-06, Area-07, Area-08, Area-09, Area-10, +27 more",
    ]);
  });

  it("uses a singular warning for one reached but unscanned directory", () => {
    const baseInventory: ProjectInventory = {
      profile: "unity",
      fileLimit: 2,
      totalFiles: 2,
      totalBytes: 0,
      documentationFiles: [],
      documentationFileCount: 0,
      ownedSourceRoots: [],
      documentationRoots: [],
      rootCoverage: [],
      topLevelCounts: {},
      extensionCounts: {},
      subsystemCandidates: [],
      truncated: true,
      excludedDirectories: [],
      excludedDirectoryCount: 0,
      unscannedDirectories: ["Docs"],
      unscannedDirectoryCount: 1,
    };

    expect(inventoryWarnings(baseInventory)[1]).toBe(
      "1 directory was never scanned because the inventory budget ran out before reaching it; verify manually whether they need exclusion: Docs",
    );
  });

  it("stays silent when nothing was left unscanned", () => {
    const baseInventory: ProjectInventory = {
      profile: "unity",
      fileLimit: 2,
      totalFiles: 2,
      totalBytes: 0,
      documentationFiles: [],
      documentationFileCount: 0,
      ownedSourceRoots: [],
      documentationRoots: [],
      rootCoverage: [],
      topLevelCounts: {},
      extensionCounts: {},
      subsystemCandidates: [],
      truncated: false,
      excludedDirectories: ["Library"],
      excludedDirectoryCount: 1,
      unscannedDirectories: [],
      unscannedDirectoryCount: 0,
    };

    expect(inventoryWarnings(baseInventory)).toEqual([]);
  });
});
