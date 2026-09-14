import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as docs from "../src/docs.js";
import { finalizeRepository, formatFinalizeReport } from "../src/finalize.js";
import { initializeProject } from "../src/initializer.js";

const roots: string[] = [];
const asOf = "2026-09-05";
afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const root of roots.splice(0)) {
    if (!path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error("Unexpected fixture root");
    await rm(root, { recursive: true, force: true });
  }
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ct-finalize-audit-"));
  roots.push(root);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(asOf + "T12:00:00Z"));
  try { await initializeProject(root); } finally { vi.useRealTimers(); }
  return root;
}

async function snapshot(root: string, prefix = ""): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(result, await snapshot(root, relative));
    else result[relative] = createHash("sha256").update(await readFile(path.join(root, relative))).digest("hex");
  }
  return result;
}

describe("structured documentation-audit failure", () => {
  it.each(["EACCES", "EPERM", "ENOENT", "EIO"])("reports %s without inventing audit data or modifying files", async (code) => {
    const root = await fixture();
    const before = await snapshot(root);
    vi.spyOn(docs, "auditDocumentation").mockRejectedValueOnce(Object.assign(new Error(code + ": scan unavailable"), { code }));
    const report = await finalizeRepository({ root, asOf });
    expect(report.ok).toBe(false);
    expect(report.repository.ok).toBe(true);
    expect(report.documentation).toBeNull();
    expect(report.gates.find(gate => gate.id === "documentation")).toMatchObject({
      status: "fail",
      findings: [{ code: "FINALIZE001", message: expect.stringContaining(code) }],
    });
    expect(report.gates.find(gate => gate.id === "repository")?.status).toBe("pass");
    expect(report.writes_performed).toBe(false);
    expect(formatFinalizeReport(report)).toContain("CanonTrail finalize FAIL");
    expect(formatFinalizeReport(report)).not.toContain("Documentation audit is healthy");
    expect(JSON.parse(JSON.stringify(report)).documentation).toBeNull();
    expect(await snapshot(root)).toEqual(before);
  });

  it.each([false, true])("fails independent of fail-on-warnings=%s", async (failOnWarnings) => {
    const root = await fixture();
    vi.spyOn(docs, "auditDocumentation").mockRejectedValueOnce(new Error("audit failed"));
    const report = await finalizeRepository({ root, asOf, failOnWarnings });
    expect(report.ok).toBe(false);
    expect(report.documentation).toBeNull();
    expect(report.gates.find(gate => gate.id === "documentation")?.status).toBe("fail");
  });

  it("preserves an unexpected non-Error rejection and still checks the requested task", async () => {
    const root = await fixture();
    vi.spyOn(docs, "auditDocumentation").mockRejectedValueOnce("unexpected audit rejection");
    const report = await finalizeRepository({ root, asOf, taskId: "T-MISSING" });
    expect(report.ok).toBe(false);
    expect(report.documentation).toBeNull();
    expect(report.gates.find(gate => gate.id === "documentation")?.findings[0]?.message).toContain("unexpected audit rejection");
    expect(report.gates.find(gate => gate.id === "task")?.status).toBe("fail");
  });

  it("handles a real malformed maintenance policy while standalone audit remains unchanged", async () => {
    const root = await fixture();
    await writeFile(path.join(root, ".agent-context/maintenance.yaml"), "version: [broken");
    const before = await snapshot(root);
    await expect(docs.auditDocumentation(root, { asOf })).rejects.toThrow("maintenance policy");
    const report = await finalizeRepository({ root, asOf, failOnWarnings: true });
    expect(report.ok).toBe(false);
    expect(report.documentation).toBeNull();
    expect(report.gates.find(gate => gate.id === "documentation")?.findings[0]).toMatchObject({
      code: "FINALIZE001", message: expect.stringContaining("maintenance policy"),
    });
    expect(await snapshot(root)).toEqual(before);
  });

  it("matches the worked JSON failure excerpt in the usage guide", async () => {
    const root = await fixture();
    vi.spyOn(docs, "auditDocumentation").mockRejectedValueOnce(new Error("EACCES: permission denied"));
    const report = await finalizeRepository({ root, asOf });
    const readme = await readFile(new URL("../docs/usage.md", import.meta.url), "utf8");
    const worked = readme.slice(readme.indexOf("Worked JSON excerpt for"));
    const json = worked.match(/```json\s+([\s\S]*?)```/)?.[1];
    expect(json).toBeDefined();
    const excerpt = JSON.parse(json!);
    expect(report.ok).toBe(excerpt.ok);
    expect(report.documentation).toBe(excerpt.documentation);
    expect(report.writes_performed).toBe(excerpt.writes_performed);
    expect(report.gates.find(gate => gate.id === "documentation")).toEqual(excerpt.gates[0]);
  });

  it("reports an explicitly requested index refresh even if the later audit fails", async () => {
    const root = await fixture();
    vi.spyOn(docs, "auditDocumentation").mockRejectedValueOnce(new Error("audit unavailable"));
    const report = await finalizeRepository({ root, asOf, refreshIndex: true });
    expect(report.ok).toBe(false);
    expect(report.documentation).toBeNull();
    expect(report.writes_performed).toBe(true);
    expect(report.gates.find(gate => gate.id === "index-refresh")?.status).toBe("pass");
    expect(formatFinalizeReport(report)).toContain("Writes performed: context index refreshed");
  });

  it("keeps the successful documentation report intact", async () => {
    const root = await fixture();
    const report = await finalizeRepository({ root, asOf, failOnWarnings: true });
    expect(report.ok).toBe(true);
    expect(report.documentation?.health).toBe("healthy");
    expect(report.documentation?.documents.total).toBeGreaterThan(0);
    expect(report.gates.flatMap(gate => gate.findings).some(finding => finding.code === "FINALIZE001")).toBe(false);
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)("returns a failure for an actually unreadable POSIX directory", async (context) => {
    const root = await fixture();
    const blocked = path.join(root, "docs", "unreadable");
    await mkdir(blocked, { recursive: true });
    await writeFile(path.join(blocked, "note.md"), "# Permission probe\n");
    const before = await snapshot(root);
    try {
      await chmod(blocked, 0o000);
      try {
        await readdir(blocked);
        context.skip(true, "Filesystem/user does not enforce directory read permission");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EACCES") throw error;
      }
      const report = await finalizeRepository({ root, asOf, failOnWarnings: true });
      expect(report.ok).toBe(false);
      expect(report.repository.ok).toBe(false);
      expect(report.documentation).toBeNull();
      expect(report.gates.find(gate => gate.id === "documentation")?.findings[0]).toMatchObject({
        code: "FINALIZE001", message: expect.stringContaining("EACCES"),
      });
      expect(report.writes_performed).toBe(false);
    } finally {
      await chmod(blocked, 0o755);
    }
    expect(await snapshot(root)).toEqual(before);
  });
});
