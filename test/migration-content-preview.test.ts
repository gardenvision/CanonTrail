import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { afterEach, describe, expect, it } from "vitest";
import { createMigrationContentView, formatMigrationContentPreview } from "../src/migration-content-preview.js";
import {
  executeMigrationTransaction, formatMigrationTransformationReport, planMigration,
  prepareMigrationTransformation, rollbackMigrationTransaction,
  type MigrationDecisionSet, type MigrationTargetHeader,
} from "../src/migration.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (!path.basename(root).startsWith("canontrail-content-") || path.dirname(root) !== path.resolve(tmpdir())) {
      throw new Error("Refuse cleanup outside explicitly created temporary fixture");
    }
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  }
});
const stamp = "2026-09-05T17:00:00.000Z";
const legacy = "# Example\n\nStand: 2026-09-05\nStatus: current\nTruth level: source-of-truth\nVerification: manual check pending\nRead if task touches: example\nPrimary systems: Example\nSafe to edit: Preserve words.\nDo not use instead: Old.md\n\n## Contract\n\nGrün 🌱 — unchanged.\n";
const header: MigrationTargetHeader = {
  topic_id: "example", stand: "2026-09-05", status: "current", truth_level: "draft",
  verification: { state: "unverified", evidence: [] }, read_if_task_touches: ["example"],
  primary_systems: ["Example"], safe_to_edit: ["Preserve words."], do_not_use_instead: ["Old.md"],
};
async function fixture(source: string | Buffer = legacy) {
  const root = await mkdtemp(path.join(path.resolve(tmpdir()), "canontrail-content-"));
  roots.push(root);
  await mkdir(path.join(root, "docs"));
  await writeFile(path.join(root, "docs", "example.md"), source);
  await writeFile(path.join(root, "docs", "example.md.meta"), "Unity metadata unchanged");
  return root;
}
function options(root: string) {
  return { root, migrationId: "MIG-CONTENT-001", transactionId: "MTX-CONTENT-001", documentationRoots: ["docs"], createdAt: stamp };
}
async function decisions(root: string): Promise<MigrationDecisionSet> {
  const plan = await planMigration(options(root));
  return {
    version: 1, migration_id: plan.plan.migration_id, plan_hash: plan.plan.plan_hash,
    reviewed_by: "test-fixture-only-NOT-independent-approval", reviewed_at: stamp,
    decisions: plan.plan.documents.map((document) => ({
      path: document.path, decision: "execute", action: "normalize-header", target_path: document.path,
      reason: "Synthetic test input, not approval of any real document.", target_header: header,
    })),
  };
}
const hash = (data: Buffer | string) => "sha256:" + createHash("sha256").update(data).digest("hex");
async function snapshot(root: string, prefix = ""): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? prefix + "/" + entry.name : entry.name;
    if (entry.isDirectory()) Object.assign(result, await snapshot(root, relative));
    else result[relative] = hash(await readFile(path.join(root, relative)));
  }
  return result;
}

describe("read-only migration content previews", () => {
  it.each(["lf", "crlf-bom", "mixed-no-final-newline"] as const)("preserves exact %s bytes and leaves transaction/source/sidecars unchanged", async (variant) => {
    const text = variant === "lf" ? legacy : variant === "crlf-bom"
      ? "\uFEFF" + legacy.replace(/\n/g, "\r\n")
      : legacy.trimEnd() + "\r\n\rMixed endings\n\nTail  ";
    const root = await fixture(text);
    const opts = { ...options(root), decisions: await decisions(root) };
    const before = await snapshot(root);
    const ordinary = await prepareMigrationTransformation(opts);
    const report = await prepareMigrationTransformation({ ...opts, showContent: true });
    expect(report.transaction).toEqual(ordinary.transaction);
    expect(ordinary).not.toHaveProperty("content_preview");
    expect(report.dry_run).toBe(true);
    expect(report.written).toBe(false);
    expect(report.content_preview?.views).toHaveLength(1);
    const view = report.content_preview!.views[0]!;
    expect(Buffer.from(view.before.content)).toEqual(Buffer.from(text));
    expect(hash(view.before.content)).toBe(view.before.content_hash);
    expect(view.before.content_hash).toBe(report.transaction.operations[0]!.source_hash);
    expect(view.before.bytes).toBe(Buffer.byteLength(text));
    expect(hash(view.after.content)).toBe(view.after.content_hash);
    expect(view.after.content_hash).toBe(report.transaction.operations[0]!.output_hash);
    expect(view.after.bytes).toBe(Buffer.byteLength(view.after.content));
    expect(view.after.bytes).toBe(report.transaction.operations[0]!.output_bytes);
    expect(view.after.content).toContain("manual check pending");
    expect(view.after.content).toContain("Grün 🌱 — unchanged.");
    expect(view.after.content).toContain("state: unverified");
    if (variant === "crlf-bom") {
      expect(view.after.content.startsWith("\uFEFF---\r\n")).toBe(true);
      expect(view.after.content.replace(/\r\n/g, "")).not.toContain("\n");
    }
    expect(await snapshot(root)).toEqual(before);
    expect(await readdir(root)).toEqual(["docs"]);
  });

  it("matches actual executor postimages and rollback only in a synthetic disposable fixture", async () => {
    const root = await fixture();
    const opts = { ...options(root), decisions: await decisions(root) };
    const report = await prepareMigrationTransformation({ ...opts, showContent: true });
    const appliedProposal = await prepareMigrationTransformation({ ...opts, apply: true });
    expect(appliedProposal.transaction).toEqual(report.transaction);
    await executeMigrationTransaction(root, appliedProposal.output_path, report.transaction.transaction_hash, stamp);
    expect(await readFile(path.join(root, "docs/example.md"))).toEqual(Buffer.from(report.content_preview!.views[0]!.after.content));
    await rollbackMigrationTransaction(root, appliedProposal.output_path, report.transaction.transaction_hash, stamp);
    expect(await readFile(path.join(root, "docs/example.md"), "utf8")).toBe(legacy);
  });

  it("refuses showContent+apply before reading even a nonexistent project", async () => {
    await expect(prepareMigrationTransformation({ ...options("/does-not-exist"), apply: true, showContent: true }))
      .rejects.toThrow("show-content is read-only");
  });

  it("keeps review blockers visible and does not invent content", async () => {
    const root = await fixture();
    const before = await snapshot(root);
    const report = await prepareMigrationTransformation({ ...options(root), showContent: true });
    expect(report.transaction.blockers.map((b) => b.code)).toEqual(["REVIEW_REQUIRED"]);
    expect(report.content_preview?.views).toEqual([]);
    expect(formatMigrationTransformationReport(report)).toContain("blockers: 1");
    expect(formatMigrationTransformationReport(report)).toContain("No generated operation content");
    expect(await snapshot(root)).toEqual(before);
  });

  it("keeps partial views aligned with operations rather than blockers or skipped files", async () => {
    const root = await fixture();
    await writeFile(path.join(root, "docs/b.md"), legacy);
    await writeFile(path.join(root, "docs/c.md"), legacy);
    const selected = await decisions(root);
    selected.decisions = selected.decisions.filter((d) => d.path !== "docs/c.md");
    selected.decisions.find((d) => d.path === "docs/b.md")!.decision = "skip";
    const report = await prepareMigrationTransformation({ ...options(root), decisions: selected, showContent: true });
    expect(report.transaction.summary).toEqual({ operations: 1, blockers: 1, skipped: 1 });
    expect(report.content_preview?.views.map((v) => v.source_path)).toEqual(["docs/example.md"]);
    expect(report.content_preview?.views[0]?.operation_id).toBe("OP-0001");
  });

  it("does not expose content for unsupported relocation or reserved targets", async () => {
    const root = await fixture();
    for (const target of ["docs/moved.md", ".agent-context/evil.md", "../escape.md"]) {
      const selected = await decisions(root);
      selected.decisions[0]!.target_path = target;
      const before = await snapshot(root);
      try {
        const report = await prepareMigrationTransformation({ ...options(root), decisions: selected, showContent: true });
        expect(report.transaction.blockers.length).toBeGreaterThan(0);
        expect(report.content_preview?.views).toEqual([]);
      } catch (error) {
        expect(String(error)).toMatch(/path|escape|relative/);
      }
      expect(await snapshot(root)).toEqual(before);
    }
  });

  it("fails closed on source/output mismatch and invalid UTF-8 in the pure view constructor", async () => {
    const root = await fixture();
    const report = await prepareMigrationTransformation({ ...options(root), decisions: await decisions(root), showContent: true });
    const op = report.transaction.operations[0]!;
    const after = Buffer.from(report.content_preview!.views[0]!.after.content);
    expect(() => createMigrationContentView(op, Buffer.from(legacy + "drift"), after)).toThrow("does not match");
    expect(() => createMigrationContentView(op, Buffer.from(legacy), Buffer.from("wrong"))).toThrow("does not match");
    expect(() => createMigrationContentView({ ...op, output_bytes: op.output_bytes + 1 }, Buffer.from(legacy), after)).toThrow("does not match");
    expect(() => createMigrationContentView(op, Buffer.from([0xff]), after)).toThrow();
  });

  it("renders readable full text with lossless escaped terminal/bidi controls and line boundaries", async () => {
    const root = await fixture(legacy + "\u001b[2J\u009b\u202e\u200f\u2028\u2029\uFEFF\rLAST\n");
    const report = await prepareMigrationTransformation({ ...options(root), decisions: await decisions(root), showContent: true });
    const formatted = formatMigrationTransformationReport(report);
    expect(formatted).not.toMatch(/[\u001b\u009b\u202e\u200f\u2028\u2029\uFEFF]/u);
    expect(formatted).toContain("\\u001b");
    expect(formatted).toContain("\\u202e");
    const quoted = formatted.split("\n").filter((l) => /^\d+ \| /.test(l)).map((l) => JSON.parse(l.replace(/^\d+ \| /, "")));
    const view = report.content_preview!.views[0]!;
    expect(quoted.join("")).toBe(view.before.content + view.after.content);
    expect(formatted).toContain("not execution, independent review or promotion");
  });

  it("does not truncate many lines or overflow a spread call", () => {
    const text = "line\n".repeat(140000) + "FINAL";
    const image = { content: text, content_hash: hash(text), bytes: Buffer.byteLength(text) };
    const formatted = formatMigrationContentPreview({ version: 1, encoding: "utf-8", views: [{ operation_id: "OP-0001", source_path: "docs/a.md", target_path: "docs/a.md", before: image, after: image }] });
    expect(formatted).toContain('140001 | "FINAL"');
    expect(formatted.split("\n").filter((l) => /^\d+ \| /.test(l))).toHaveLength(280002);
  });

  it("keeps the report-only schema and worked example byte-verifiable", async () => {
    const schema = JSON.parse(await readFile("schemas/migration-content-preview.schema.json", "utf8"));
    const example = JSON.parse(await readFile("examples/migration-transaction/content-preview.json", "utf8"));
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    expect(ajv.validate(schema, example), JSON.stringify(ajv.errors)).toBe(true);
    for (const view of example.views) for (const image of [view.before, view.after]) {
      expect(hash(image.content)).toBe(image.content_hash);
      expect(Buffer.byteLength(image.content)).toBe(image.bytes);
    }
    const root = await fixture(example.views[0].before.content);
    const actual = await prepareMigrationTransformation({ ...options(root), decisions: await decisions(root), showContent: true });
    expect(actual.content_preview).toEqual(example);
    expect(ajv.validate(schema, { ...example, approved: true })).toBe(false);
  });

  it("uses the real CLI JSON/text interface and rejects both apply flag orders without writes", async () => {
    const root = await fixture();
    const input = path.join(root, "decisions.json");
    await writeFile(input, JSON.stringify(await decisions(root)));
    const before = await snapshot(root);
    const args = ["--import", "tsx", path.resolve("src/cli.ts"), "migrate", "transform-preview", root,
      "--id", "MIG-CONTENT-001", "--transaction-id", "MTX-CONTENT-001", "--documentation-root", "docs",
      "--created-at", stamp, "--decisions", input];
    const run = (flags: string[]) => execFileSync(process.execPath, [...args, ...flags], { windowsHide: true, encoding: "utf8", stdio: "pipe", maxBuffer: 4 * 1024 * 1024 });
    const json = JSON.parse(run(["--show-content", "--json"]));
    expect(json.content_preview.views).toHaveLength(1);
    expect(run(["--show-content"])).toContain("BEFORE:");
    expect(JSON.parse(run(["--json"]))).not.toHaveProperty("content_preview");
    for (const flags of [["--apply", "--show-content"], ["--show-content", "--apply"]]) {
      try { run(flags); throw new Error("unexpected CLI success"); }
      catch (error) { expect(String((error as { stderr?: string }).stderr)).toMatch(/cannot be used with|conflict/); }
    }
    expect(await snapshot(root)).toEqual(before);
  });
});
