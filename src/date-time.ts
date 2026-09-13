import { createRequire } from "node:module";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";

const require = createRequire(import.meta.url);
const addFormats = require("ajv-formats") as FormatsPlugin;
const ajv = new Ajv2020({ strict: true });
addFormats(ajv);
const validateDateTime = ajv.compile({ type: "string", format: "date-time" });

export function isIsoDateTime(value: string): boolean {
  return Boolean(validateDateTime(value));
}
