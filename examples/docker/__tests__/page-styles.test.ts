/**
 * The example pages' own styles stay out of the designers' preview
 * (self-host example spec): the preview renders widgets in the page's DOM,
 * so a page rule like `header { border-bottom … }` would dress a widget's
 * <header> that no MCP Apps host dresses. Every element-led rule carries the
 * fence `:where(:not(.wgd-preview *))`. A structural check: happy-dom
 * matches `:not(.wgd-preview *)` on descendants too, so the computed proof
 * runs in headless Chrome (TESTING.md).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const FENCE = ":where(:not(.wgd-preview *))";
const ELEMENT_LED = /^(header|nav|button|input|select|textarea|label|table|th|td|a|p|h[1-6]|ul|ol|li|img|code|pre|main|footer|article|aside|span|div)(?![\w-])/;

describe.each([
  ["the self-host app", join(here, "..", "index.html")],
  ["the designer demo", join(here, "..", "..", "designer", "index.html")],
  ["the standalone demo", join(here, "..", "..", "designer", "standalone.html")]
])("%s's page styles", (_label, file) => {
  it("fence every element-led rule out of the preview", () => {
    const css = [...readFileSync(file, "utf8").matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
      .map((m) => m[1] ?? "")
      .join("\n")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const parts = [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)]
      .flatMap((m) => (m[1] ?? "").split(","))
      .map((part) => part.trim())
      .filter((part) => ELEMENT_LED.test(part) && !part.startsWith("section[hidden]"));
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) expect(part, part).toContain(FENCE);
  });
});
