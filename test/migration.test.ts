import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { computeMigrationPlanHash, planMigration } from "../src/migration.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "canontrail-migration-"));
  roots.push(root);
  await mkdir(path.join(root, "docs", "_Archive"), { recursive: true });
  await mkdir(path.join(root, "docs", "_Review"), { recursive: true });
  await mkdir(path.join(root, "docs", "ThirdParty"), { recursive: true });
  await writeFile(path.join(root, "docs", "canonical.md"), `---
topic_id: fixture
stand: "2026-09-03"
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
# Canonical
`);
  await writeFile(path.join(root, "docs", "legacy.md"), `# Legacy

**Stand:** 2026-09-03
**Status:** current
**Truth level:** source-of-truth
**Verification:** reviewed
**Read if task touches:** plants, locations
**Primary classes/systems:** PlantService, LocationService
**Safe to edit:** preserve behavior
**Do not use instead:** OldGuide.md

## Body
Truth.
`);
  await writeFile(path.join(root, "docs", "plain.md"), "# Plain\n\nCanonical is only prose here.\n");
  await writeFile(path.join(root, "docs", "foreign-frontmatter.md"), `---
layout: post
title: Ordinary Jekyll article
date: 2026-09-03
tags: [migration]
---
# Foreign frontmatter
`);
  await writeFile(path.join(root, "docs", "partial-canontrail.md"), `---
truth_level: canonical
status: current
---
# Incomplete CanonTrail metadata
`);
  await writeFile(path.join(root, "docs", "_Archive", "old.md"), "# Old\n");
  await writeFile(path.join(root, "docs", "_Review", "notes.md"), "# Notes\n");
  await writeFile(path.join(root, "docs", "ThirdParty", "vendor.md"), "# Vendor\n");
  await writeFile(path.join(root, "docs", "asset.png"), "not-an-image");
  return root;
}

describe("migration planning", () => {
  it("detects supported formats and conservative document roles", async () => {
    const root = await fixture();
    const report = await planMigration({
      root,
      migrationId: "MIG-FIXTURE-001",
      documentationRoots: ["docs"],
      createdAt: "2026-09-03T12:00:00.000Z",
    });

    expect(report.written).toBe(false);
    expect(report.plan.summary.documents).toBe(8);
    expect(report.plan.summary.source_formats).toEqual({
      "canontrail-frontmatter": 2,
      "legacy-header-v1": 1,
      "plain-markdown": 5,
    });
    expect(report.plan.summary.ignored_by_extension).toEqual({ ".png": 1 });
    expect(report.plan.documents.find((item) => item.path.endsWith("canonical.md"))).toMatchObject({
      role: "canonical", proposed_action: "keep", requires_review: false,
    });
    expect(report.plan.documents.find((item) => item.path.endsWith("legacy.md"))).toMatchObject({
      source_format: "legacy-header-v1", role: "canonical", proposed_action: "normalize-header", requires_review: true,
    });
    expect(report.plan.documents.find((item) => item.path.endsWith("plain.md"))).toMatchObject({
      role: "unknown", proposed_action: "classify-and-normalize", confidence: "low",
    });
    expect(report.plan.documents.find((item) => item.path.endsWith("foreign-frontmatter.md"))).toMatchObject({
      source_format: "plain-markdown", role: "unknown", proposed_action: "classify-and-normalize", confidence: "low", requires_review: true,
    });
    expect(report.plan.documents.find((item) => item.path.endsWith("partial-canontrail.md"))).toMatchObject({
      source_format: "canontrail-frontmatter", role: "unknown", proposed_action: "review-metadata", confidence: "low", requires_review: true,
    });
    expect(report.plan.documents.find((item) => item.path.includes("_Archive"))).toMatchObject({ role: "historical", proposed_action: "preserve-historical" });
    expect(report.plan.documents.find((item) => item.path.includes("_Review"))).toMatchObject({ role: "review", proposed_action: "preserve-review" });
    expect(report.plan.documents.find((item) => item.path.includes("ThirdParty"))).toMatchObject({ role: "third-party", proposed_action: "exclude-external" });
  });

  it("is deterministic for fixed inputs and performs no dry-run writes", async () => {
    const root = await fixture();
    const canonicalBefore = await readFile(path.join(root, "docs", "canonical.md"));
    const options = {
      root,
      migrationId: "MIG-FIXTURE-002",
      documentationRoots: ["docs"],
      createdAt: "2026-09-03T12:00:00.000Z",
    } as const;
    const first = await planMigration(options);
    const second = await planMigration(options);
    const { plan_hash: _ignored, ...payload } = first.plan;

    expect(second.plan).toEqual(first.plan);
    expect(first.plan.plan_hash).toBe(computeMigrationPlanHash(payload));
    await expect(readFile(path.join(root, first.output_path))).rejects.toThrow();
    expect(await readFile(path.join(root, "docs", "canonical.md"))).toEqual(canonicalBefore);
  });

  it("applies only a new plan and refuses to overwrite it", async () => {
    const root = await fixture();
    const sourceBefore = await readFile(path.join(root, "docs", "legacy.md"));
    const options = {
      root,
      migrationId: "MIG-FIXTURE-003",
      documentationRoots: ["docs"],
      createdAt: "2026-09-03T12:00:00.000Z",
      apply: true,
    } as const;
    const report = await planMigration(options);

    expect(report.written).toBe(true);
    expect(JSON.parse(await readFile(path.join(root, ...report.output_path.split("/")), "utf8"))).toEqual(report.plan);
    expect(await readFile(path.join(root, "docs", "legacy.md"))).toEqual(sourceBefore);
    await expect(planMigration(options)).rejects.toThrow(/exist/i);
  });

  it("rejects missing and escaping documentation roots", async () => {
    const root = await fixture();
    await expect(planMigration({ root, migrationId: "MIG-FIXTURE-004", documentationRoots: ["missing"] })).rejects.toThrow(/does not exist/);
    await expect(planMigration({ root, migrationId: "MIG-FIXTURE-004", documentationRoots: [".."] })).rejects.toThrow(/outside/);
    await expect(planMigration({ root, migrationId: "MIG-FIXTURE-004", documentationRoots: ["docs"], createdAt: "2026-09-03" })).rejects.toThrow(/ISO date-time/);
  });

  it("rejects explicit control roots and reports reserved control subtrees under a broad root", async () => {
    const root = await fixture();
    await mkdir(path.join(root, ".agent-context"));
    await mkdir(path.join(root, ".git"));
    await writeFile(path.join(root, ".agent-context", "internal.md"), "# Internal\n");
    await writeFile(path.join(root, ".git", "internal.md"), "# Git internals\n");

    await expect(planMigration({ root, migrationId: "MIG-FIXTURE-005", documentationRoots: [".agent-context"] })).rejects.toThrow(/must not use reserved/);
    await expect(planMigration({ root, migrationId: "MIG-FIXTURE-005", documentationRoots: [".git"] })).rejects.toThrow(/must not use reserved/);

    const report = await planMigration({
      root,
      migrationId: "MIG-FIXTURE-005",
      documentationRoots: ["."],
      createdAt: "2026-09-05T08:00:00.000Z",
    });
    expect(report.plan.documents.some((document) => document.path.startsWith(".agent-context/") || document.path.startsWith(".git/"))).toBe(false);
    expect(report.plan.unprocessed).toEqual(expect.arrayContaining([
      { path: ".agent-context", reason: expect.stringMatching(/reserved/) },
      { path: ".git", reason: expect.stringMatching(/reserved/) },
    ]));
  });
});
