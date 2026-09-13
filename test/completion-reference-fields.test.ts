import { mkdtemp, mkdir, writeFile, readFile, rm, link } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { resolveCompletionScope } from "../src/finalize-scope.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const fields = [
  ["state.yaml", "source_ref"], ["state.yaml", "latest_handoff"], ["state.yaml", "documentation_impact.0"],
  ["state.yaml", "checks.0.evidence_refs.0"], ["state.yaml", "file_intents.0"], ["state.yaml", "required_context_sources.0"],
  ["state.yaml", "context_sections.0.path"],
  ["context.lock.json", "sources.0.path"], ["context.lock.json", "omissions.0.candidate"],
  ["change.yaml", "canonical_source"], ["change.yaml", "acceptance_cases.0.evidence_refs.0"],
  ["change.yaml", "impacts.0.evidence_refs.0"], ["change.yaml", "verification.checks.0.evidence_refs.0"],
  ["change.yaml", "verification.terminology_search.evidence_refs.0"], ["change.yaml", "verification.visual_review.evidence_refs.0"],
  ["change.yaml", "independent_review.evidence_refs.0"], ["change.yaml", "documentation_structure.feature_documents.0.path"],
  ["change.yaml", "documentation_structure.feature_documents.0.evidence_refs.0"], ["change.yaml", "external_evidence.0.path"],
] as const;
function nested(parts: string[], value: string): unknown {
  const [first, ...rest] = parts;
  return first === undefined ? value : first === "0" ? [nested(rest, value)] : { [first]: nested(rest, value) };
}
async function minimalFixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ct-reference-fields-")); roots.push(root);
  for (const id of ["A", "B"]) {
    const dir = path.join(root, ".agent-context/tasks", id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "state.yaml"), JSON.stringify({ task_id: id, dependencies: [] }));
    await writeFile(path.join(dir, "result.txt"), "Existing peer evidence\n");
  }
  const dir = path.join(root, ".agent-context/tasks/A");
  await writeFile(path.join(dir, "context.lock.json"), JSON.stringify({ task_id: "A", sources: [], omissions: [] }));
  await writeFile(path.join(dir, "change.yaml"), "{}\n");
  return root;
}
async function setReference(root: string, file: string, field: string, value: string): Promise<void> {
  const target = path.join(root, ".agent-context/tasks/A", file);
  const artifact = JSON.parse(await readFile(target, "utf8")) as Record<string, unknown>;
  Object.assign(artifact, nested(field.split("."), value));
  await writeFile(target, JSON.stringify(artifact));
}

describe("completion reference-field inventory", () => {
  // Resolver unit fixtures deliberately avoid compilation, Git and lifecycle
  // setup. End-to-end validity/deferral is covered in task-scoped-finalize.test.
  it.each(fields)("includes the declared peer in %s:%s", async (file, field) => {
    const root = await minimalFixture();
    await setReference(root, file, field, ".agent-context/tasks/B/result.txt");
    expect(await resolveCompletionScope(root, "A")).toMatchObject({ mode: "task", relevant_task_ids: ["A", "B"], fallback_reason: null });
  });
  it.each(["source_ref", "latest_handoff", "documentation_impact.0", "file_intents.0", "required_context_sources.0"])("uses producer trimming for %s", async (field) => {
    const root = await minimalFixture();
    await setReference(root, "state.yaml", field, "  .agent-context/tasks/B/result.txt  ");
    expect((await resolveCompletionScope(root, "A")).relevant_task_ids).toEqual(["A", "B"]);
  });
  it.for([
    ["source_ref", "peer#source.txt"], ["latest_handoff", "handoff#latest.yaml"], ["planned-feature", "feature#planned.md"],
    ["extensionless", "REQUIREMENTS"], ["literal-control", "safe"], ["pure-fragment-control", "#L1"],
  ] as const)("preserves field-specific identity for %s", async ([kind, filename], context) => {
    const root = await minimalFixture();
    try { await link(path.join(root, ".agent-context/tasks/B/result.txt"), path.join(root, filename)); }
    catch (error) { if (["EPERM", "EACCES", "ENOTSUP", "EOPNOTSUPP", "ENOSYS"].includes((error as NodeJS.ErrnoException).code ?? "")) { context.skip(true, "Native hardlink capability unavailable"); return; } throw error; }
    if (kind === "source_ref" || kind === "latest_handoff") await setReference(root, "state.yaml", kind, filename);
    else if (kind === "planned-feature") await writeFile(path.join(root, ".agent-context/tasks/A/change.yaml"), JSON.stringify({ documentation_structure: { feature_documents: [{ action: "create", status: "planned", path: filename }] } }));
    else if (kind === "extensionless") await setReference(root, "change.yaml", "canonical_source", "./" + filename);
    else if (kind === "pure-fragment-control") await setReference(root, "change.yaml", "canonical_source", "#L1");
    else {
      await writeFile(path.join(root, "safe#part.ts"), "A regular, independent literal source\n");
      await setReference(root, "context.lock.json", "sources.0.path", "safe#part.ts");
    }
    const result = await resolveCompletionScope(root, "A");
    expect(result.mode).toBe(kind.endsWith("control") ? "task" : "repository");
    if (kind.endsWith("control")) expect(result.relevant_task_ids).toEqual(["A"]);
    else expect(result.fallback_reason).toContain("Aliased documentary reference");
  });
  it("fails closed instead of silently ignoring control characters in actual references", async () => {
    const root = await minimalFixture();
    await setReference(root, "context.lock.json", "sources.0.path", "peer\nsource.md");
    const result = await resolveCompletionScope(root, "A");
    expect(result.mode).toBe("repository"); expect(result.fallback_reason).toContain("control character");
  });
  it.for(["state.yaml", "change.yaml", "change.yml"])("checks exact compiler evidence identities only for consumed %s", async (file, context) => {
    const root = await minimalFixture();
    const literal = ".agent-context/tasks/A/evidence/check#result.md";
    await mkdir(path.dirname(path.join(root, literal)), { recursive: true });
    try { await link(path.join(root, ".agent-context/tasks/B/result.txt"), path.join(root, literal)); }
    catch (error) { if (["EPERM", "EACCES", "ENOTSUP", "EOPNOTSUPP", "ENOSYS"].includes((error as NodeJS.ErrnoException).code ?? "")) { context.skip(true, "Native hardlink capability unavailable"); return; } throw error; }
    // The documentary target is an independent ordinary file; only the exact
    // compiler evidence filename identifies the peer hardlink in this case.
    await writeFile(path.join(root, ".agent-context/tasks/A/evidence/check"), "Documentary target\n");
    if (file === "change.yml") await writeFile(path.join(root, ".agent-context/tasks/A/change.yml"), "{}");
    await setReference(root, file, file === "state.yaml" ? "checks.0.evidence_refs.0" : "acceptance_cases.0.evidence_refs.0", literal);
    const result = await resolveCompletionScope(root, "A");
    expect(result.mode).toBe(file === "change.yml" ? "task" : "repository");
  });
  it("does not skip a URI-looking literal POSIX source path", async (context) => {
    if (process.platform === "win32") { context.skip(true, "Colon-containing POSIX filename is unavailable on Windows"); return; }
    const root = await minimalFixture();
    await mkdir(path.join(root, "https:"));
    try { await link(path.join(root, ".agent-context/tasks/B/result.txt"), path.join(root, "https:/peer.md")); }
    catch (error) { if (["EPERM", "EACCES", "ENOTSUP", "EOPNOTSUPP", "ENOSYS"].includes((error as NodeJS.ErrnoException).code ?? "")) { context.skip(true, "Native hardlink capability unavailable"); return; } throw error; }
    await setReference(root, "context.lock.json", "sources.0.path", "https://peer.md");
    expect((await resolveCompletionScope(root, "A")).mode).toBe("repository");
  });

  const inventory = [
    ["task-state", "properties", "task_id,feature_id,source_system,source_ref,status,objective,non_goals,acceptance_criteria,dependencies,documentation_impact,file_intents,required_context_sources,parallel_safety,owner,worktree,checks,latest_handoff,updated_at,context_sections"],
    ["task-state", "properties.checks.items.properties", "id,command_or_observation,status,evidence_refs"],
    ["context-lock", "properties", "task_id,agent_run_id,created_at,context_index_hash,base_revision,budget,sources,omissions,raw_transcripts_included,lock_hash"],
    ["context-lock", "properties.sources.items.properties", "path,content_hash,git_blob,truth_level,level,priority,selection_reason,selector,estimated_tokens,ownership,source_system,line_ranges,selection_hash"],
    ["context-lock", "properties.omissions.items.properties", "candidate,reason,required"],
    ["change-record", "properties", "version,change_id,revision,title,status,risk,author,canonical_source,decision_rationale,documentation_structure,acceptance_cases,impacts,verification,independent_review,external_evidence,supersedes,superseded_by,updated_at"],
    ["change-record", "properties.acceptance_cases.items.properties", "id,given,expected,failure_or_uncertainty,counterexample,oracle,status,evidence_refs"],
    ["change-record", "properties.impacts.items.properties", "area,decision,rationale,evidence_refs"],
    ["change-record", "properties.verification.properties", "checks,terminology_search,visual_review,unverifiable_items"],
    ["change-record", "properties.verification.properties.checks.items.properties", "name,status,evidence_refs"],
    ["change-record", "properties.independent_review.properties", "status,reviewer,findings,evidence_refs,waiver"],
    ["change-record", "properties.documentation_structure.properties.feature_documents.items.properties", "feature_id,action,status,path,evidence_refs"],
    ["change-record", "properties.external_evidence.items.properties", "source_system,path,artifact_kind,authority,content_hash,recorded_at"],
  ] as const;
  // Adding a schema field requires explicitly deciding whether it carries a
  // reference and extending the collector/behavioral cases where appropriate.
  it.each(inventory)("requires a reference-inventory review for %s:%s", async (schema, pointer, expected) => {
    let value = JSON.parse(await readFile(new URL("../schemas/" + schema + ".schema.json", import.meta.url), "utf8")) as Record<string, unknown>;
    for (const part of pointer.split(".")) value = value[part] as Record<string, unknown>;
    expect(Object.keys(value).sort()).toEqual(expected.split(",").sort());
  });
});
