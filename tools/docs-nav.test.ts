/**
 * Navigation completeness for the docs site: every MDX page is reachable from
 * `docs.json` (or deliberately hidden) and every navigation entry resolves to
 * a page. `mint validate` checks the pages it is told about; it does not
 * flag orphans, so this is the repo's own gate.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DOCS_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "docs");

function navigationPages(node: unknown, out: Set<string>): void {
  if (typeof node === "string") {
    out.add(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) navigationPages(item, out);
    return;
  }
  if (typeof node === "object" && node !== null) {
    for (const [key, value] of Object.entries(node)) {
      if (key === "pages" || key === "groups" || key === "tabs" || key === "menu" || key === "anchors" || key === "dropdowns" || key === "navigation") {
        navigationPages(value, out);
      }
    }
  }
}

function mdxPages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : mdxPages(path);
    return entry.name.endsWith(".mdx") || entry.name.endsWith(".md") ? [path] : [];
  });
}

function isHidden(file: string): boolean {
  const head = readFileSync(file, "utf8").split("\n---")[0] ?? "";
  return /^hidden:\s*true\s*$/m.test(head);
}

describe("docs navigation", () => {
  const config = JSON.parse(readFileSync(join(DOCS_ROOT, "docs.json"), "utf8")) as { navigation: unknown };
  const listed = new Set<string>();
  navigationPages(config.navigation, listed);

  it("lists every page that exists, unless the page is hidden on purpose", () => {
    const orphans = mdxPages(DOCS_ROOT)
      .map((file) => relative(DOCS_ROOT, file).split("\\").join("/").replace(/\.mdx?$/, ""))
      .filter((slug) => !listed.has(slug) && !isHidden(join(DOCS_ROOT, `${slug}.mdx`)));
    expect(orphans).toEqual([]);
  });

  it("points only at pages that exist", () => {
    const missing = [...listed].filter(
      (slug) => !existsSync(join(DOCS_ROOT, `${slug}.mdx`)) && !existsSync(join(DOCS_ROOT, `${slug}.md`))
    );
    expect(missing).toEqual([]);
    expect(listed.size).toBeGreaterThan(40);
  });
});
