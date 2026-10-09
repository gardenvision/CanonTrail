import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { initializeProject } from "../src/initializer.js";
import { createTask } from "../src/task-create.js";
import { sha256 } from "../src/indexer.js";

export async function documentFixture(roots: string[]) {
  const root = await mkdtemp(path.join(tmpdir(), "ct-doc-authoring-")); roots.push(root);
  await initializeProject(root, { documentation: "none", profile: "generic" });
  const taskId = "T-DOCUMENT-001";
  await createTask({ root, taskId, changeId: "CHG-DOCUMENT-001", objective: "Inspect a bounded source revision",
    acceptance: ["Keep its source unchanged"], author: "Fixture author", risk: "medium", createdAt: "2026-10-08T12:00:00Z", apply: true });
  return { root, taskId };
}

export async function documentManifest(root: string) {
  const result: Record<string, string> = {};
  async function walk(relative: string) {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      const name = relative ? relative + "/" + entry.name : entry.name;
      if (entry.isSymbolicLink()) result[name] = "link";
      else if (entry.isDirectory()) { result[name + "/"] = "directory"; await walk(name); }
      else result[name] = sha256(await readFile(path.join(root, name)));
    }
  }
  await walk(""); return result;
}
