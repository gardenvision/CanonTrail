import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { safeRepositoryFile } from "./context-source-path.js";
import { sha256 } from "./indexer.js";
import type { Diagnostic, DocumentRecord } from "./types.js";

export interface FrozenExample {
  path: string;
  content_hash: string;
  rationale: string;
}

const policyPath = ".agent-context/maintenance.yaml";
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Explicit declarations only. A directory name alone never freezes a document. */
export function parseFrozenExamples(value: unknown): FrozenExample[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("maintenance frozen_examples must be an array");
  const seen = new Set<string>();
  return value.map((entry, index) => {
    const fail = (message: string): never => { throw new Error(`maintenance frozen_examples[${index}]: ${message}`); };
    if (!record(entry) || Object.keys(entry).some(k => !["path", "content_hash", "rationale"].includes(k))) fail("requires only path, content_hash and rationale");
    const v = entry as Record<string, unknown>;
    const p = v.path;
    if (typeof p !== "string" || !p.startsWith("examples/") || !/\.md$/i.test(p)
      || /[\\:\x00-\x1f\x7f<>|?*]/.test(p)
      || p.split("/").some(part => !part || part === "." || part === ".." || /[. ]$/.test(part) || part !== part.trim()
        || [".git", ".agent-context"].includes(part.toLowerCase()))) fail("path must name an exact Markdown file below examples/, outside control trees");
    if (seen.has(p as string)) fail("duplicate example path");
    seen.add(p as string);
    if (typeof v.content_hash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(v.content_hash)) fail("requires a lowercase raw SHA-256 content_hash");
    if (typeof v.rationale !== "string" || v.rationale.trim().length < 10) fail("requires a meaningful synthetic-example rationale");
    return { path: p as string, content_hash: v.content_hash as string, rationale: v.rationale as string };
  });
}

/** Only age is affected; consumers still run every normal integrity check. */
export async function assessFrozenExamples(root: string, entries: FrozenExample[], documents: DocumentRecord[]): Promise<{ examples: FrozenExample[]; diagnostics: Diagnostic[] }> {
  const diagnostics: Diagnostic[] = [];
  const valid: FrozenExample[] = [];
  for (const entry of entries) {
    try {
      const document = documents.find(d => d.path === entry.path);
      if (!document?.header || !["active-snapshot", "draft"].includes(document.header.truth_level)) {
        throw new Error("must be an indexed noncanonical active-snapshot or draft example");
      }
      const exact = await safeRepositoryFile(root, entry.path);
      if (!exact) throw new Error("example file is missing or its spelling differs");
      let component = await realpath(root);
      for (const part of entry.path.split("/")) {
        component = path.join(component, part);
        if ((await lstat(component)).isSymbolicLink()) throw new Error("linked example paths are not eligible");
      }
      const stat = await lstat(exact);
      if (!stat.isFile() || stat.nlink !== 1) throw new Error("example must be a regular, singly linked file");
      const bytes = await readFile(exact);
      if (!Buffer.from(document.source, "utf8").equals(bytes)) throw new Error("example bytes changed since document discovery or are not exact UTF-8");
      if (sha256(bytes) !== entry.content_hash) throw new Error("example content_hash does not match the unchanged source bytes");
      valid.push(entry);
    } catch (error) {
      diagnostics.push({ severity: "error", code: "MAINT002", path: policyPath, message: `Frozen example '${entry.path}' is ineligible: ${(error as Error).message}` });
    }
  }
  // A partly invalid policy does not silently grant the remaining exemptions.
  return { examples: diagnostics.length ? [] : valid, diagnostics };
}

/** Read the policy explicitly even if a project's artifact scan excludes it. */
export async function validateFrozenExamplePolicy(root: string, documents: DocumentRecord[]): Promise<Diagnostic[]> {
  try {
    let source: string;
    try { source = await readFile(path.join(root, policyPath), "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
    const policy: unknown = parse(source);
    if (!record(policy)) throw new Error("maintenance policy must be a mapping");
    return (await assessFrozenExamples(root, parseFrozenExamples(policy.frozen_examples), documents)).diagnostics;
  } catch (error) {
    return [{ severity: "error", code: "MAINT001", path: policyPath, message: `Frozen-example policy cannot be validated: ${(error as Error).message}` }];
  }
}
