// @vitest-environment node
/**
 * The authorization surface's entry stands alone (package-distribution spec,
 * "The authorization surface has its own entry"): everything `./oauth`
 * reaches statically is the package's own source, `@widgentic/core` or a
 * `node:` builtin — no MCP SDK, no Azure client — and the base entry reaches
 * none of it.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = resolve(dirname(fileURLToPath(import.meta.url)), "..", "packages", "mcp", "src");
const IMPORT = /(?:import|export)\s+(?:type\s+)?(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/g;

/** Every source file reachable from `entry` through relative imports, and every other specifier met on the way. */
function closure(entry: string): { files: Set<string>; external: Set<string> } {
  const files = new Set<string>();
  const external = new Set<string>();
  const queue = [join(src, entry)];
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (files.has(file)) continue;
    files.add(file);
    for (const match of readFileSync(file, "utf8").matchAll(IMPORT)) {
      const specifier = match[1] ?? "";
      if (!specifier.startsWith(".")) {
        external.add(specifier);
        continue;
      }
      const target = resolve(dirname(file), specifier.replace(/\.js$/, ".ts"));
      expect(existsSync(target), `${relative(src, file)} imports ${specifier}`).toBe(true);
      queue.push(target);
    }
  }
  return { files, external };
}

describe("the ./oauth entry", () => {
  it("needs no MCP SDK and no Azure client", () => {
    const { files, external } = closure("oauth/index.ts");
    expect([...files].some((file) => file.endsWith(join("oauth", "handler.ts")))).toBe(true);
    for (const specifier of external) {
      expect(specifier === "@widgentic/core" || specifier.startsWith("node:"), specifier).toBe(true);
    }
  });

  it("is not loaded by the base entry", () => {
    const { files } = closure("index.ts");
    expect(files.size).toBeGreaterThan(5);
    expect([...files].filter((file) => relative(src, file).startsWith("oauth"))).toEqual([]);
  });
});
