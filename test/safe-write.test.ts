import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { writeFileAtomic } from "../src/safe-write.js";

it("refuses an existing temporary destination without changing either file", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ct-atomic-"));
  const target = path.join(root, "receipt.json");
  const temporary = path.join(root, `.receipt.json.${process.pid}.123456789.tmp`);
  try {
    await writeFile(target, "original\n");
    await writeFile(temporary, "belongs to another writer\n");
    vi.spyOn(Date, "now").mockReturnValue(123456789);
    await expect(writeFileAtomic(target, Buffer.from("replacement\r\n"))).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(target, "utf8")).toBe("original\n");
    expect(await readFile(temporary, "utf8")).toBe("belongs to another writer\n");
  } finally {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  }
});
