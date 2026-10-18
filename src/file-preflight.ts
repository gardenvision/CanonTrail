import { lstat, open } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";
import { parseDocument } from "yaml";
import { parseConfigText } from "./config.js";
import { decodeContinuityText, resolveContinuityFile } from "./continuity-files.js";
import { safeRepositoryFile } from "./context-source-path.js";
import { parseFrontmatter } from "./frontmatter.js";
import { isGovernedPath, normalizePath, sha256 } from "./indexer.js";
import { formatSchemaErrors } from "./schema-diagnostics.js";
import { governedMetadataReferences, schemaForArtifact, validateMetadataReferences } from "./validator.js";
import type { Diagnostic, DocumentRecord } from "./types.js";

const require = createRequire(import.meta.url);
const MAX_BYTES = 8 * 1024 * 1024;
const boundary = "File structure only: repository validity, canonical uniqueness, self-hashes, cross-artifact ownership/provenance, current sources, task completion and CI are NOT approved. Run the relevant strict checks separately. Stable local inputs required; not an atomic snapshot.";

export interface FilePreflightReport {
  version: 1;
  purpose: "single-file-preflight";
  validation_scope: "file-structure";
  root: string;
  path: string;
  kind: "markdown" | "structured" | "unknown";
  ok: boolean;
  writes_performed: false;
  repository_validation_performed: false;
  continuity_validation: "not-performed";
  self_hash_validation: "not-performed";
  completion_approval: false;
  source: { bytes: number; content_hash: string } | null;
  schema: { name: string; shipped: "pass" | "fail" | "not-run"; installed: "pass" | "fail" | "not-run" } | null;
  diagnostics: Diagnostic[];
  boundary: string;
}

function noGitPath(relative: string): void {
  if (relative.split("/").some(part => part.toLowerCase() === ".git")) throw new Error("Git control paths cannot be checked as project artifacts.");
}

/** Bounded even when a concurrently growing file exceeds its initial stat.
 * Exact local identity is checked before/after, not a hostile-race guarantee. */
async function readInput(root: string, relative: string): Promise<Buffer> {
  noGitPath(relative);
  const absolute = await resolveContinuityFile(root, relative, true);
  const handle = await open(absolute, "r");
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1 || before.size > MAX_BYTES) throw new Error(`Input must be an unlinked regular file of at most 8 MiB: ${relative}`);
    const bytes = Buffer.alloc(before.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await handle.read(bytes, length, bytes.length - length, length);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    const after = await handle.stat();
    const current = await lstat(await resolveContinuityFile(root, relative, true));
    if (length !== before.size || length !== after.size || before.mtimeMs !== after.mtimeMs
        || before.ctimeMs !== after.ctimeMs || after.dev !== current.dev || after.ino !== current.ino) {
      throw new Error(`Input changed while reading: ${relative}`);
    }
    const captured = bytes.subarray(0, length);
    if (decodeContinuityText(captured, relative).includes("\0")) throw new Error(`Input contains NUL text: ${relative}`);
    return captured;
  } finally { await handle.close(); }
}

/** Single selected file and required schemas only. Never calls repository
 * validation, discovery, Git or an index writer. Failed inputs stay failed. */
export async function checkFile(rootInput: string, relative: string): Promise<FilePreflightReport> {
  const root = path.resolve(rootInput);
  const report: FilePreflightReport = {
    version: 1, purpose: "single-file-preflight", validation_scope: "file-structure", root, path: relative,
    kind: "unknown", ok: false, writes_performed: false, repository_validation_performed: false,
    continuity_validation: "not-performed", self_hash_validation: "not-performed", completion_approval: false,
    source: null, schema: null, diagnostics: [], boundary,
  };
  let code = "CHECK001", inputPath = relative;
  const fail = (diagnosticCode: string, message: string, artifactPath: string, detail?: string) => {
    report.diagnostics.push({ severity: "error", code: diagnosticCode, message, path: artifactPath, ...(detail ? { detail } : {}) });
  };
  try {
    noGitPath(relative);
    // Reject lexical escapes and aliases before reading even the configuration.
    await resolveContinuityFile(root, relative);
    code = "CFG001"; inputPath = ".agent-context/config.yaml";
    const config = parseConfigText(decodeContinuityText(await readInput(root, inputPath), inputPath));
    code = "CHECK002"; inputPath = relative;
    if (!isGovernedPath(relative, config) || config.excludePaths.some(value => {
      const prefix = normalizePath(value).replace(/\/$/, "");
      return prefix === "." || relative === prefix || relative.startsWith(prefix + "/");
    })) throw new Error("Selected file is excluded or outside configured governance; no file approval was produced.");
    const markdown = /\.md$/i.test(relative);
    const artifactSchema = schemaForArtifact(relative);
    const isIndex = relative === normalizePath(config.indexPath);
    if (isIndex && (markdown || artifactSchema)) {
      code = "CFG001"; inputPath = ".agent-context/config.yaml";
      throw new Error("Configured index_path collides with governed Markdown or a recognized control artifact; file kind cannot be reassigned by configuration.");
    }
    const schemaName = markdown ? "artifact-header"
      : isIndex ? "context-index" : artifactSchema;
    if (!schemaName) throw new Error("Unsupported file kind: choose governed Markdown or a schema-recognized CanonTrail artifact. Arbitrary source/config files are not a syntax-lint mode.");
    report.kind = markdown ? "markdown" : "structured";
    const bytes = await readInput(root, relative);
    report.source = { bytes: bytes.length, content_hash: sha256(bytes) };
    const raw = decodeContinuityText(bytes, relative);
    code = markdown ? "DOC002" : "ART001";
    let payload: unknown, document: DocumentRecord | undefined;
    if (markdown) {
      const parsed = parseFrontmatter(raw);
      payload = parsed.header;
      document = { path: relative, absolutePath: path.join(root, relative), source: raw, ...parsed };
    } else if (/\.json$/i.test(relative)) payload = JSON.parse(raw);
    else {
      const parsed = parseDocument(raw);
      if (parsed.errors.length) throw new Error(parsed.errors.map(error => error.message).join("; "));
      payload = parsed.toJS({ maxAliasCount: 100 });
    }
    report.schema = { name: schemaName, shipped: "not-run", installed: "not-run" };
    const schemaRoot = normalizePath(config.schemaPath).replace(/\/$/, "");
    const schemaPath = (schemaRoot === "." ? "" : schemaRoot + "/") + schemaName + ".schema.json";
    const validations = new Map<string, { valid: boolean; detail: string }>();
    for (const label of ["shipped", "installed"] as const) {
      code = "SCHEMA002"; inputPath = schemaPath;
      try {
        const schemaBytes = label === "shipped"
          ? await readInput(fileURLToPath(new URL("../", import.meta.url)), `schemas/${schemaName}.schema.json`)
          : await readInput(root, schemaPath);
        if (schemaBytes.length > MAX_BYTES) throw new Error("Schema exceeds 8 MiB.");
        const schemaText = decodeContinuityText(schemaBytes, `${label} schema`);
        if (schemaText.includes("\0")) throw new Error("Schema contains NUL text.");
        const key = sha256(schemaBytes);
        let outcome = validations.get(key);
        if (!outcome) {
          const schema = JSON.parse(schemaText);
          const ajv = new Ajv2020({ allErrors: true, strict: true });
          (require("ajv-formats") as FormatsPlugin)(ajv);
          const validate = ajv.compile(schema);
          const valid = !!validate(payload);
          outcome = { valid, detail: formatSchemaErrors(validate.errors) };
          validations.set(key, outcome);
          if (!valid) fail("SCHEMA005", "Selected file does not conform to the required schema", relative, outcome.detail);
        }
        report.schema[label] = outcome.valid ? "pass" : "fail";
      } catch (error) {
        report.schema[label] = "fail";
        fail("SCHEMA002", `${label} schema cannot be used`, schemaPath, (error as Error).message);
      }
    }
    if (report.schema.shipped === "pass" && report.schema.installed === "pass" && document) {
      code = "REF002"; inputPath = relative;
      const references = [...new Set(governedMetadataReferences(document))];
      if (references.length > 1024) throw new Error("Single-file preflight supports at most 1024 distinct local metadata references; use a reviewed narrower document.");
      for (const reference of references) {
        const target = (reference.split("#", 1)[0] ?? "").replace(/^\.\//, "").replace(/\/$/, "");
        if (!target) continue;
        noGitPath(target);
        const absolute = await safeRepositoryFile(root, target);
        const directory = absolute !== undefined && (await lstat(absolute)).isDirectory();
        await resolveContinuityFile(root, directory ? target + "/__file_preflight_probe__" : target);
      }
      validateMetadataReferences(report.diagnostics, root, config, [document]);
    }
  } catch (error) { fail(code, "Single-file preflight could not validate the selected input", inputPath, (error as Error).message); }
  report.ok = !report.diagnostics.some(diagnostic => diagnostic.severity === "error");
  return report;
}

export function formatFilePreflight(report: FilePreflightReport): string {
  return [
    `File preflight ${report.ok ? "PASS" : "FAIL"}: ${JSON.stringify(report.path)} (${report.validation_scope})`,
    ...report.diagnostics.map(diagnostic => `${diagnostic.severity.toUpperCase()} ${diagnostic.code} ${JSON.stringify(diagnostic.path ?? report.path)}: ${JSON.stringify(diagnostic.message)}${diagnostic.detail ? "\n  " + JSON.stringify(diagnostic.detail) : ""}`),
    report.boundary,
  ].join("\n");
}
