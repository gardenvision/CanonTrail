import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { afterEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { formatSchemaErrors } from "../src/schema-diagnostics.js";
import { validateRepository, formatValidationReport } from "../src/validator.js";
import { generateContextIndex } from "../src/indexer.js";
import { documentFixture } from "./document-fixture.js";
import { createDocument } from "../src/document-authoring.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe("actual field-specific schema choices", () => {
  it("prints enums and constants from AJV without accepting an invalid value", () => {
    const validate = new Ajv2020({ allErrors: true }).compile({ type: "object", properties: { status: { enum: ["pass", "fail", "pending"] }, version: { const: 1 } } });
    expect(validate({ status: "not-run", version: 2 })).toBe(false);
    const text = formatSchemaErrors(validate.errors);
    expect(text).toContain('/status must be equal to one of the allowed values; allowed values: "pass", "fail", "pending"');
    expect(text).toContain("/version must be equal to constant; required value: 1");
    expect(validate({ status: "not-run", version: 2 })).toBe(false);
    expect(formatSchemaErrors(null)).toBe("");
  });

  it("JSON-quotes unusual allowed values and preserves non-enum errors", () => {
    const validate = new Ajv2020({ allErrors: true }).compile({ type: "object", required: ["required"], properties: { value: { enum: ["line\nnext", { nested: "value" }] } } });
    validate({ value: "other" }); const text = formatSchemaErrors(validate.errors);
    expect(text).toContain('"line\\nnext", {"nested":"value"}');
    expect(text).toContain("must have required property 'required'");
  });

  it("reports real task-check values and real documentary verification values separately", async () => {
    const f = await documentFixture(roots), statePath = path.join(f.root, `.agent-context/tasks/${f.taskId}/state.yaml`);
    const state = parse(await readFile(statePath, "utf8"));
    state.checks = [{ id: "CHECK-INVALID", command_or_observation: "not executed", status: "not-run", evidence_refs: [] }];
    await writeFile(statePath, stringify(state));
    const documentPath = "docs/canontrail/schema-probe.md";
    await createDocument({ root: f.root, path: documentPath, topicId: "schema-probe", title: "Schema probe", purpose: "Observe exact field contracts", routing: ["schema probe"], apply: true });
    const entry = path.join(f.root, documentPath);
    await writeFile(entry, (await readFile(entry, "utf8")).replace("state: unverified", "state: not-run"));
    await generateContextIndex(f.root);
    const report = await validateRepository(f.root), text = formatValidationReport(report);
    expect(report.ok).toBe(false);
    const schema = JSON.parse(await readFile(path.resolve("schemas/task-state.schema.json"), "utf8"));
    const allowed = schema.properties.checks.items.properties.status.enum as string[];
    expect(text).toContain('/checks/0/status must be equal to one of the allowed values; allowed values: ' + allowed.map(value => JSON.stringify(value)).join(", "));
    expect(text).toMatch(/\/verification\/state.*allowed values:.*"unverified".*"structurally-reviewed".*"internally-reviewed".*"reviewed".*"verified"/);
    expect(text).not.toMatch(/allowed values:.*"not-run"/);
  });
});
