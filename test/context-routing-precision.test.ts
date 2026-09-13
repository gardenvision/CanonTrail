import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { compileContext, serializeContextLock } from "../src/context.js";
import { generateContextIndex } from "../src/indexer.js";

const roots: string[] = [];
const taskId = "T-PRECISION";
const createdAt = "2026-09-06T00:00:00Z";
interface Doc { name: string; routes: string[]; systems: string[]; truth?: string; }
const owner: Doc = { name: "totals", routes: ["invoice calculation"], systems: ["InvoiceTotalsCalculator"] };
const sibling: Doc = { name: "export", routes: ["CSV output", "file downloads"], systems: ["InvoiceTotalsExporter"] };
const objective = "Inspect InvoiceTotalsCalculator subtotal and roundLineAmount.";

afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

function markdown(doc: Doc, body = "Fixture owner; no live project claim."): string {
  return `---\n${stringify({ topic_id: doc.name, stand: "2026-09-06", status: "current", truth_level: doc.truth ?? "canonical", verification: { state: "reviewed", evidence: [] }, read_if_task_touches: doc.routes, primary_systems: doc.systems, safe_to_edit: ["Fixture only."], do_not_use_instead: [] })}---\n\n# ${doc.name}\n\n${body}\n`;
}

async function fixture(docs: Doc[], text = objective, acceptance: string[] = [], required: string[] = []) {
  const root = await mkdtemp(path.join(tmpdir(), "canontrail-routing-precision-")); roots.push(root);
  await cp(path.resolve("schemas"), path.join(root, "schemas"), { recursive: true });
  await mkdir(path.join(root, ".agent-context", "tasks", taskId), { recursive: true });
  await mkdir(path.join(root, "docs"));
  await writeFile(path.join(root, ".agent-context", "config.yaml"), stringify({ version: 1, index_path: ".agent-context/context-index.json", schema_path: "schemas", governed_paths: ["."], exclude_paths: [".git"], require_frontmatter_for_all_markdown: true, require_topic_id_for_canonical: true, allow_missing_references: [] }));
  await writeFile(path.join(root, "AGENTS.md"), markdown({ name: "instructions", routes: [], systems: [] }, "Use exact evidence and retain required sources."));
  for (const doc of docs) await writeFile(path.join(root, "docs", doc.name + ".md"), markdown(doc));
  const state = { task_id: taskId, status: "ready", objective: text, acceptance_criteria: acceptance.map((statement, i) => ({ id: `AC-${i}`, statement, verification: "Fixture oracle.", status: "pending" })), dependencies: [], file_intents: [], required_context_sources: required, checks: [] };
  const statePath = path.join(root, ".agent-context", "tasks", taskId, "state.yaml");
  await writeFile(statePath, stringify(state));
  await generateContextIndex(root);
  return { root, state, statePath, output: path.join(root, ".agent-context", "tasks", taskId, "context.lock.json") };
}
const compile = (root: string, extra = {}) => compileContext({ root, taskId, createdAt, totalTokens: 20_000, reservedOutputTokens: 0, inputSafetyTokens: 0, ...extra });

async function expectRequired(root: string, names: string[]) {
  const generous = await compile(root);
  const wanted = new Set(names.map(name => `docs/${name}.md`));
  const requiredTokens = generous.lock.sources.filter(source => source.level === "L0" || wanted.has(source.path)).reduce((sum, source) => sum + source.estimated_tokens, 0);
  const minimal = await compile(root, { totalTokens: requiredTokens });
  expect(minimal.lock.sources.filter(source => source.path.startsWith("docs/")).map(source => source.path).sort()).toEqual([...wanted].sort());
  for (const source of generous.lock.sources.filter(source => source.path.startsWith("docs/") && !wanted.has(source.path))) {
    expect(minimal.lock.omissions).toContainEqual(expect.objectContaining({ candidate: source.path, required: false }));
  }
  return { generous, minimal };
}

describe("coherent context routing", () => {
  it("keeps the complete invoice system required and a different compound sibling optional", async () => {
    const { root } = await fixture([owner, sibling]);
    const { generous } = await expectRequired(root, ["totals"]);
    expect(generous.lock.sources.find(source => source.path === "docs/export.md")?.selection_reason).toMatch(/^Weak/);
  });

  it("does not assemble a strong route from unrelated metadata entries", async () => {
    const { root } = await fixture([owner, { name: "scattered", routes: ["invoice layout", "network totals"], systems: [] }]);
    await expectRequired(root, ["totals"]);
  });

  it("does not assemble a strong route by combining two different metadata fields", async () => {
    const { root } = await fixture([owner, { name: "cross-field", routes: ["invoice layout"], systems: ["RevenueTotalsExporter"] }]);
    await expectRequired(root, ["totals"]);
  });

  it.each([
    ["natural phrase", "Inspect invoice totals calculator subtotal."],
    ["case variation", "Inspect INVOICE TOTALS CALCULATOR subtotal."],
    ["separator variation", "Inspect invoice_totals_calculator subtotal."],
  ])("recognizes the complete system with %s", async (_label, text) => {
    const { root } = await fixture([owner, sibling], text);
    await expectRequired(root, ["totals"]);
  });

  it("does not combine separated words into a complete primary system name", async () => {
    const { root } = await fixture([owner], "Inspect invoice placement and totals exports with a calculator display.");
    await expectRequired(root, []);
  });

  it("does not join the end of an objective to the beginning of an acceptance criterion", async () => {
    const { root } = await fixture([owner], "Inspect invoice totals.", ["Calculator details are separate."]);
    await expectRequired(root, []);
  });

  it.each([
    "Inspect InvoiceTotalsCalculatorProxy subtotal.",
    "Inspect AuditInvoiceTotalsCalculator subtotal.",
    "Inspect invoice totals. Calculator notes follow.",
    "Inspect invoice totals; calculator notes follow.",
  ])("does not invent a complete system mention from %s", async text => {
    const { root } = await fixture([owner], text);
    await expectRequired(root, []);
  });

  it("retains flexible multi-term matching inside one natural-language routing entry", async () => {
    const { root } = await fixture([{ name: "rules", routes: ["invoice totals rounding behavior"], systems: [] }], "Inspect rounding of invoice amounts.");
    await expectRequired(root, ["rules"]);
  });

  it("keeps every complete declared system match, not just one preferred owner", async () => {
    const { root } = await fixture([owner, { ...owner, name: "overview" }, sibling]);
    await expectRequired(root, ["totals", "overview"]);
  });

  it("does not claim to interpret a negated complete system mention", async () => {
    const { root } = await fixture([owner], "Do not change InvoiceTotalsCalculator.");
    await expectRequired(root, ["totals"]);
  });

  it("leaves a single-term system match weak and optional", async () => {
    const { root } = await fixture([{ name: "storage", routes: [], systems: ["storage"] }], "Inspect storage behavior.");
    await expectRequired(root, []);
  });

  it("never makes a design-target mandatory solely because its complete system matches", async () => {
    const { root } = await fixture([{ ...owner, truth: "design-target" }]);
    await expectRequired(root, []);
  });

  it("matches a complete qualified system while distinguishing its sibling", async () => {
    const { root } = await fixture([{ ...owner, systems: ["Billing.InvoiceTotalsCalculator"] }, { ...sibling, systems: ["Billing.InvoiceTotalsExporter"] }], "Inspect Billing.InvoiceTotalsCalculator rounding.");
    await expectRequired(root, ["totals"]);
  });

  it("mirrors the unchanged Unity task without treating fan and quality fragments as mandatory airflow", async () => {
    const zone: Doc = { name: "zone", routes: ["Quality-Awards"], systems: ["GreenhouseQualityZone"] };
    const building: Doc = { name: "buildings", routes: ["Building-Collider"], systems: ["GreenhouseQualityZone", "AirflowQualityZone", "GreenhouseFanHub"] };
    const airflow: Doc = { name: "airflow", routes: ["Fan-Slots", "Quality-Awards"], systems: ["AirflowQualityZone", "GreenhouseFanSlot", "GreenhouseFanHub"] };
    const { root } = await fixture([zone, building, airflow], "Inspect GreenhouseQualityZone boundsSourceRoot and autoFitToRendererBounds. Read-only zone-authoring question.", ["Require the exact greenhouse-zone owner without loading fan installation by default."], ["docs/zone.md"]);
    await expectRequired(root, ["zone", "buildings"]);
  });

  it("preserves explicit required and CLI override sources even when routing considers them weak", async () => {
    const { root } = await fixture([owner, sibling], objective, [], ["docs/export.md"]);
    const report = await compile(root);
    expect(report.required_context_breakdown.find(part => part.category === "explicit-required")?.source_count).toBe(1);
    await expectRequired(root, ["totals", "export"]);
    const override = await compile(root, { includePaths: ["docs/export.md"] });
    expect(override.lock.sources.find(source => source.path === "docs/export.md")?.selector).toContain("explicit-include");
  });

  it("preserves an accepted lock on missing or over-budget explicit required context", async () => {
    const { root, output, state, statePath } = await fixture([owner, sibling], objective, [], ["docs/export.md"]);
    const accepted = await compile(root, { apply: true });
    const bytes = await readFile(output);
    const required = accepted.required_context_breakdown.reduce((sum, part) => sum + part.estimated_tokens, 0);
    await expect(compile(root, { totalTokens: required - 1, apply: true })).rejects.toThrow(/required context needs/);
    expect(await readFile(output)).toEqual(bytes);
    state.required_context_sources = ["docs/missing.md"];
    await writeFile(statePath, stringify(state));
    await expect(compile(root, { apply: true })).rejects.toThrow(/required context source does not exist/);
    expect(await readFile(output)).toEqual(bytes);
  });

  it("keeps deterministic output for a fixed input without hidden optional suppression", async () => {
    const { root } = await fixture([owner, sibling]);
    const first = await compile(root);
    expect(serializeContextLock(await compile(root).then(report => report.lock))).toBe(serializeContextLock(first.lock));
    expect(first.lock.sources.some(source => source.path === "docs/export.md")).toBe(true);
  });
});
