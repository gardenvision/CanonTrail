import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";
import { parse } from "yaml";
import { safeRepositoryFile } from "./context-source-path.js";
import type { CanonTrailConfig } from "./types.js";
import type { ContextLock } from "./context.js";

type RecordValue = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordValue => typeof value === "object" && value !== null && !Array.isArray(value);
const require = createRequire(import.meta.url);

/** Capability and actual payload checks are separate. A named-but-incompatible
 * field is not sufficient. Never rewrite installed project schemas implicitly. */
export async function assertSectionContextSchemas(root: string, config: CanonTrailConfig, lock?: ContextLock): Promise<void> {
  const loaded: Array<{ name: string; relative: string; schema: RecordValue }> = [];
  for (const name of ["context-lock", "task-state"]) {
    const relative = `${config.schemaPath.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "")}/${name}.schema.json`;
    const absolute = await safeRepositoryFile(root, relative);
    if (!absolute) throw new Error(`Section-aware schema is unavailable: ${relative}`);
    const schema: unknown = JSON.parse(await readFile(absolute, "utf8"));
    let properties: unknown = isRecord(schema) ? schema.properties : undefined;
    if (name === "context-lock") {
      const sources = isRecord(properties) ? properties.sources : undefined;
      const items = isRecord(sources) ? sources.items : undefined;
      properties = isRecord(items) ? items.properties : undefined;
    }
    const fields = name === "context-lock" ? ["line_ranges", "selection_hash"] : ["context_sections"];
    if (!isRecord(schema) || !isRecord(properties) || fields.some(field => !isRecord(properties[field]))) {
      throw new Error(`Project schema does not support context sections: ${relative}. Review and synchronize schemas explicitly; no config was rewritten.`);
    }
    loaded.push({ name, relative, schema });
  }
  if (!lock) return;
  const taskPath = await safeRepositoryFile(root, `.agent-context/tasks/${lock.task_id}/state.yaml`);
  if (!taskPath) throw new Error("Section task state is unavailable for schema preflight.");
  const state: unknown = parse(await readFile(taskPath, "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  (require("ajv-formats") as FormatsPlugin)(ajv);
  for (const { schema } of loaded) ajv.addSchema(schema);
  for (const { name, relative, schema } of loaded) {
    const validate = typeof schema.$id === "string" ? ajv.getSchema(schema.$id) : ajv.compile(schema);
    if (!validate || !validate(name === "context-lock" ? lock : state)) {
      throw new Error(`Section schema preflight failed for ${relative}: ${ajv.errorsText(validate?.errors)}. No output was written.`);
    }
  }
}
