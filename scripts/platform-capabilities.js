import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, rm, stat, statfs, symlink, writeFile } from "node:fs/promises";
import { tmpdir, release } from "node:os";
import path from "node:path";

// Probe only disposable files. Environment capability evidence is not a test PASS.
const root = await mkdtemp(path.join(tmpdir(), "ct-capabilities-"));
const report = {
  schema_version: 1,
  observed_at: new Date().toISOString(),
  platform: process.platform, architecture: process.arch, os_release: release(), node: process.version,
  fixture_filesystem_type: String((await statfs(root)).type),
  case_sensitive: false, unicode_form_sensitive: false, unicode_nfc_preserved: false,
  directory_link: "not-run", file_symlink: "not-run", posix_mode_bits: "not-applicable",
  windows_short_names: "not-applicable",
};
async function createDistinct(first, second) {
  await writeFile(path.join(root, first), "first", { flag: "wx" });
  try { await writeFile(path.join(root, second), "second", { flag: "wx" }); return true; }
  catch (error) { if (error.code === "EEXIST") return false; throw error; }
}
async function probeLink(source, destination, type) {
  try { await symlink(source, destination, type); return "available"; }
  catch (error) {
    if (!["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) throw error;
    return "unavailable:" + error.code;
  }
}
try {
  report.case_sensitive = await createDistinct("CaseProbe", "caseprobe");
  report.unicode_form_sensitive = await createDistinct("café", "cafe\u0301");
  report.unicode_nfc_preserved = (await readdir(root)).includes("café");
  await mkdir(path.join(root, "link-target"));
  report.directory_link = await probeLink(path.join(root, "link-target"), path.join(root, "directory-link"),
    process.platform === "win32" ? "junction" : "dir");
  report.file_symlink = await probeLink(path.join(root, "CaseProbe"), path.join(root, "file-link"), "file");
  if (process.platform !== "win32") {
    await chmod(path.join(root, "CaseProbe"), 0o640);
    report.posix_mode_bits = ((await stat(path.join(root, "CaseProbe"))).mode & 0o777) === 0o640 ? "available" : "unavailable";
  } else {
    await mkdir(path.join(root, "LongDocumentation"));
    const short = execFileSync(process.env.ComSpec ?? "cmd.exe",
      ["/d", "/c", "for %I in (LongDocumentation) do @echo %~sI"],
      { cwd: root, windowsHide: true, encoding: "utf8" }).trim();
    report.windows_short_names = path.basename(short).toLowerCase() === "longdocumentation" ? "unavailable" : "available";
  }
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
}
const serialized = JSON.stringify(report, null, 2) + "\n";
if (process.argv[2]) await writeFile(path.resolve(process.argv[2]), serialized, { flag: "wx" });
process.stdout.write(serialized);
