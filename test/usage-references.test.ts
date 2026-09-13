import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { generateContextIndex } from "../src/indexer.js";
import { validateRepository } from "../src/validator.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith("ct-usage-")) {
      throw new Error("Refuse cleanup outside the exact temporary fixture boundary");
    }
    await rm(root, { recursive: true, force: true });
  }
});

async function fixture(usage: string[], evidence: string[] = [], supersedes: string[] = []) {
  const root = await mkdtemp(path.join(path.resolve(tmpdir()), "ct-usage-"));
  roots.push(root);
  await cp(path.resolve("schemas"), path.join(root, "schemas"), { recursive: true });
  await mkdir(path.join(root, ".agent-context"));
  await mkdir(path.join(root, "docs"));
  await writeFile(path.join(root, ".agent-context/config.yaml"), stringify({
    version: 1, schema_path: "schemas", governed_paths: ["docs/usage.md"],
    exclude_paths: [], allow_missing_references: [], require_frontmatter_for_all_markdown: true,
  }));
  const source = "---\n" + stringify({
    topic_id: "usage-fixture", stand: "2026-09-06", status: "current", truth_level: "canonical",
    verification: { state: "unverified", evidence }, read_if_task_touches: ["usage fixture"],
    primary_systems: ["testing"], safe_to_edit: ["Fixture only."], do_not_use_instead: usage, supersedes,
  }) + "---\n\n# Usage fixture\n\nBody remains unchanged.\n";
  await writeFile(path.join(root, "docs/usage.md"), source);
  return { root, source };
}

async function inspect(root: string) {
  return validateRepository(root, { checkIndex: false, checkContextLocks: false });
}

describe("usage guidance reference boundary", () => {
  it.each([
    "`../Environment/DOCS_GREENHOUSE_QUALITY_ZONE.md` fuer die genaue Pflanzenbonus-Logik",
    "`DOCS_GREENHOUSE_QUALITY_ZONE.md` fuer den Home-/Gewaechshaus-Bonus ohne Ventilator",
    "`Plantingtable/WACHSTUMSSYSTEM.md` fuer den Gesamtvertrag der Quality-Berechnung",
    "`DOCS_GREENHOUSE_BUILDINGS.md` fuer den konkreten Greenhouse4-Vertrag",
    "Never substitute the home/scope lifecycle description.",
    "Use [the old overview](missing.md) only as a narrative example.",
    "[Old overview](missing.md)",
    "Read `missing.md` before editing",
    "Not a contract\nfor a/b.md",
    "`docs/Missing.md` is an example, not declared evidence.",
  ])("preserves narrative without interpreting it as a filename: %s", async (entry) => {
    const { root, source } = await fixture([entry]);
    expect((await inspect(root)).diagnostics).toEqual([]);
    expect(await readFile(path.join(root, "docs/usage.md"), "utf8")).toBe(source);
  });

  it.each([
    "Missing.md", "docs/Missing.md", "Missing/", "docs/Missing Name.md",
    "Missing folder/", "`Missing.md`", "`docs/Missing Name.md`", "`docs/[missing].md`",
    "docs/Missing.md#heading", "`docs/Missing.md#heading`",
  ])("still rejects a missing standalone reference: %s", async (entry) => {
    const { root } = await fixture([entry]);
    const result = await inspect(root);
    expect(result.diagnostics.some(d => d.code === "REF001")).toBe(true);
  });

  it.each([
    ["docs/target.md", "docs/target.md"],
    ["`docs/target.md`", "docs/target.md"],
    ["docs/Name With Spaces.md", "docs/Name With Spaces.md"],
    ["`docs/Name With Spaces.md`", "docs/Name With Spaces.md"],
    ["`docs/[entry].md`", "docs/[entry].md"],
    ["docs/Grün-植物.md#section", "docs/Grün-植物.md"],
  ])("accepts an existing root-relative reference %s", async (entry, target) => {
    const { root } = await fixture([entry]);
    await writeFile(path.join(root, target), "Supporting text\n");
    expect((await inspect(root)).diagnostics).toEqual([]);
  });

  it("checks a directory with spaces and preserves its existing bare syntax", async () => {
    const { root } = await fixture(["Folder With Spaces/"]);
    await mkdir(path.join(root, "Folder With Spaces"));
    expect((await inspect(root)).diagnostics).toEqual([]);
  });

  it("does not guess a document-relative target when the metadata path is root-relative", async () => {
    const { root } = await fixture(["target.md"]);
    await writeFile(path.join(root, "docs/target.md"), "Exists beside the document only.\n");
    expect((await inspect(root)).diagnostics.some(d => d.code === "REF001")).toBe(true);
  });

  it.each(["../outside.md", "`../outside.md`", "`docs/../../outside.md`"])("retains containment rejection for %s", async entry => {
    const { root } = await fixture([entry]);
    expect((await inspect(root)).diagnostics.some(d => d.code === "REF001" && d.message.includes("escapes"))).toBe(true);
  });

  it.each(["docs\\Missing.md", "`docs\\Missing.md`"])("retains portable separator rejection for %s", async entry => {
    const { root } = await fixture([entry]);
    expect((await inspect(root)).diagnostics.some(d => d.code === "REF002")).toBe(true);
  });

  it.each(["evidence", "supersedes"])("does not relax the %s field to usage prose", async field => {
    const entry = "`docs/Missing.md` is not a valid evidence path";
    const { root } = await fixture([], field === "evidence" ? [entry] : [], field === "supersedes" ? [entry] : []);
    expect((await inspect(root)).diagnostics.some(d => d.code === "REF001")).toBe(true);
  });

  it.each(["`Missing`", "`Missing.txt`"])("checks explicitly declared paths without a legacy extension: %s", async entry => {
    const { root } = await fixture([entry]);
    expect((await inspect(root)).diagnostics.some(d => d.code === "REF001")).toBe(true);
  });

  it("accepts an explicitly declared extensionless existing file", async () => {
    const { root } = await fixture(["`LICENSE`"]);
    await writeFile(path.join(root, "LICENSE"), "Fixture only.\n");
    expect((await inspect(root)).diagnostics).toEqual([]);
  });

  it.each(["/docs/usage.md", "`/docs/usage.md`", "C:/docs/usage.md", "`C:/docs/usage.md`"])("does not reinterpret an absolute usage reference as a local path: %s", async entry => {
    const { root } = await fixture([entry]);
    expect((await inspect(root)).diagnostics.some(d => d.code === "REF001" && d.message.includes("repository-relative"))).toBe(true);
  });

  it("retains every usage phrase verbatim in the real deterministic index", async () => {
    const values = ["`../Environment/quality.md` fuer den Home-/Gewaechshaus-Bonus", "Never use this as a/b guidance."];
    const { root, source } = await fixture(values);
    expect((await inspect(root)).ok).toBe(true);
    const { index } = await generateContextIndex(root);
    expect(index.documents.find(d => d.path === "docs/usage.md")?.do_not_use_instead).toEqual(values);
    expect(await readFile(path.join(root, "docs/usage.md"), "utf8")).toBe(source);
  });
});
