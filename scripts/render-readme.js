// The governed root README is the only authored landing-page source.
// GitHub prefers .github/README.md; generate that projection without YAML UI.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function renderReadme(source) {
  const header = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(source);
  if (!header) throw new Error("Root README must retain governed frontmatter.");
  const rebase = (url) => /^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(url) ? url : `../${url}`;
  const body = source.slice(header[0].length).trimStart()
    .replace(/\]\(([^\s)]+)\)/g, (_, url) => `](${rebase(url)})`)
    .replace(/\b(href|src|srcset)="([^"\s]+)"/g, (_, attr, url) => `${attr}="${rebase(url)}"`);
  return "<!-- Generated from ../README.md by scripts/render-readme.js. Do not edit this projection. -->\n\n" + body;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && !["--check", "--write"].includes(args[0]))) {
    throw new Error("Usage: node scripts/render-readme.js [--check|--write]");
  }
  const root = fileURLToPath(new URL("../", import.meta.url));
  const output = path.join(root, ".github/README.md");
  const expected = renderReadme(await readFile(path.join(root, "README.md"), "utf8"));
  if (args[0] === "--write") {
    await writeFile(output, expected, "utf8");
    console.log("Generated .github/README.md from the governed root README.");
  } else {
    const actual = await readFile(output, "utf8");
    if (actual !== expected) throw new Error("GitHub README is stale; run node scripts/render-readme.js --write.");
    console.log("GitHub README matches its governed source.");
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
