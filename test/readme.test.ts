import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
// Documentation-only generator deliberately uses plain Node without a build.
// @ts-expect-error A declaration file is unnecessary for this source-only script.
import { renderReadme } from "../scripts/render-readme.js";

describe("GitHub landing-page projection", () => {
  it("matches the one governed source and omits only its technical header", async () => {
    const source = await readFile(new URL("../README.md", import.meta.url), "utf8");
    const projection = await readFile(new URL("../.github/README.md", import.meta.url), "utf8");
    expect(projection).toBe(renderReadme(source));
    expect(projection).not.toContain("topic_id:");
    expect(projection).toContain("CANONTRAIL_HOME =");
    expect(projection).toContain("--adopt --dry-run");
  });

  it("rebases local Markdown and picture links but preserves anchors and external URLs", () => {
    const result = renderReadme('---\nstatus: draft\n---\n[Guide](docs/usage.md) [Here](#start) [Web](https://example.com)\n<img src="docs/a.svg"><source srcset="docs/b.svg"><a href="docs/usage.md#safe-adoption">Guide</a>');
    expect(result).toContain("[Guide](../docs/usage.md)");
    expect(result).toContain('[Here](#start) [Web](https://example.com)');
    expect(result).toContain('src="../docs/a.svg"');
    expect(result).toContain('srcset="../docs/b.svg"');
    expect(result).toContain('href="../docs/usage.md#safe-adoption"');
  });

  it("fails instead of turning an ungoverned input into the public projection", () => {
    expect(() => renderReadme("# Missing header\n")).toThrow("frontmatter");
  });
});
