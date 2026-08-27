/**
 * Package boundaries, enforced at the source (spec: package-distribution).
 *
 * Every import in packages/, apps/ and examples/ is classified and checked:
 *   - relative imports never leave their root (a package, an app, an example)
 *   - `@widgentic/<pkg>[/sub]` must be a declared `exports` entry and an
 *     allowed edge (core → nothing; designer, mcp → core; apps/examples → any)
 *   - `node:` modules, `Buffer` and `process` stay out of core and designer
 *   - third-party imports in package sources match the package's manifest
 *     (mcp: the MCP SDK and zod only from the `./sdk` assembly)
 * Tests (`__tests__`) may additionally use vitest, the SDK client, the
 * example fixtures package and the widgentic packages their own manifest
 * lists as devDependencies; nothing else is exempt.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const PACKAGES: Record<string, string> = { core: "packages/core", designer: "packages/designer", mcp: "packages/mcp" };
const ALLOWED_EDGES: Record<string, string[]> = { core: [], designer: ["core"], mcp: ["core"] };
const BROWSER_SAFE = new Set(["core", "designer"]);
const EXTERNALS: Record<string, RegExp[]> = { core: [], designer: [], mcp: [/^@azure\//] };
/** The one file in mcp allowed to import the MCP SDK and zod: the official-SDK assembly. */
const SDK_ONLY = new Set(["packages/mcp/src/server/server.ts"]);
const SDK = [/^@modelcontextprotocol\//, /^zod$/];
const TEST_EXTERNALS = [/^vitest/, /^@modelcontextprotocol\//, /^zod$/, /^@widgentic-examples\//, /^happy-dom$/];

interface Manifest { name: string; exports?: Record<string, unknown>; devDependencies?: Record<string, string> }
/** A package's tests may also import the widgentic packages its manifest lists as devDependencies. */
function testEdges(pkg: string): string[] {
  const dev = Object.keys(manifests.get(`@widgentic/${pkg}`)?.devDependencies ?? {});
  return dev.filter((d) => d.startsWith("@widgentic/")).map((d) => d.slice("@widgentic/".length));
}
const manifests = new Map<string, Manifest>();
for (const dir of Object.values(PACKAGES)) {
  const m = JSON.parse(readFileSync(join(ROOT, dir, "package.json"), "utf8")) as Manifest;
  manifests.set(m.name, m);
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === "scripts") continue; // build scripts are tooling, not shipped source
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (entry.endsWith(".ts") || entry.endsWith(".mjs")) yield full;
  }
}
/** Import specifiers: static `import … from "x"` / `export … from "x"`, side-effect `import "x"`, dynamic `import("x")`. */
const SPECIFIERS = [/^\s*(?:import|export)\b[^;"']*?\bfrom\s+"([^"]+)"/gm, /^\s*import\s+"([^"]+)"/gm, /\bimport\(\s*"([^"]+)"\s*\)/g];
/** Source without comments, so prose never trips the Node-only checks. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/[^\n]*/g, "$1");
}
function rootOf(file: string): string {
  const rel = relative(ROOT, file).split("/");
  return rel[0] === "packages" || rel[0] === "apps" || rel[0] === "examples" ? `${rel[0]}/${rel[1]}` : rel[0] ?? "";
}
function packageOf(file: string): string | undefined {
  return Object.entries(PACKAGES).find(([, dir]) => relative(ROOT, file).startsWith(dir + "/"))?.[0];
}

const files = [...walk(join(ROOT, "packages")), ...walk(join(ROOT, "apps")), ...walk(join(ROOT, "examples"))];
const violations: string[] = [];
for (const file of files) {
  const rel = relative(ROOT, file);
  const isTest = rel.includes("/__tests__/");
  const pkg = packageOf(file);
  const source = readFileSync(file, "utf8");
  const specs = SPECIFIERS.flatMap((re) => [...source.matchAll(re)].map((m) => m[1] ?? ""));
  for (const spec of specs) {
    if (spec.startsWith(".")) {
      const target = resolve(dirname(file), spec);
      if (rootOf(target) !== rootOf(file)) violations.push(`${rel}: relative import leaves its root: ${spec}`);
      continue;
    }
    if (spec.startsWith("@widgentic/")) {
      const [, name, ...sub] = spec.split("/");
      const manifest = manifests.get(`@widgentic/${name}`);
      const entry = sub.length === 0 ? "." : `./${sub.join("/")}`;
      if (manifest === undefined || manifest.exports?.[entry] === undefined) violations.push(`${rel}: no exports entry for ${spec}`);
      const edges = pkg === undefined ? [] : [...(ALLOWED_EDGES[pkg] ?? []), ...(isTest ? testEdges(pkg) : [])];
      if (pkg !== undefined && name !== undefined && name !== pkg && !edges.includes(name)) violations.push(`${rel}: ${pkg} may not depend on @widgentic/${name}`);
      continue;
    }
    if (spec.startsWith("node:")) {
      if (pkg !== undefined && BROWSER_SAFE.has(pkg) && !isTest) violations.push(`${rel}: ${pkg} is browser-safe, no ${spec}`);
      continue;
    }
    if (spec.startsWith("@widgentic-examples/") || spec.startsWith("@widgentic-apps/")) {
      if (pkg !== undefined && !isTest) violations.push(`${rel}: package sources may not import ${spec}`);
      continue;
    }
    // bare third-party specifier
    if (pkg === undefined) continue; // apps and examples choose their own dependencies
    if (isTest && TEST_EXTERNALS.some((re) => re.test(spec))) continue;
    if (SDK.some((re) => re.test(spec))) {
      if (!SDK_ONLY.has(rel)) violations.push(`${rel}: only the sdk assembly may import ${spec}`);
      continue;
    }
    if (!(EXTERNALS[pkg] ?? []).some((re) => re.test(spec))) violations.push(`${rel}: undeclared third-party import ${spec}`);
  }
  if (pkg !== undefined && BROWSER_SAFE.has(pkg) && !isTest) {
    const code = stripComments(source);
    if (/\bBuffer\./.test(code)) violations.push(`${rel}: Buffer is Node-only`);
    if (/\bprocess\./.test(code)) violations.push(`${rel}: process is Node-only`);
  }
}

describe("package boundaries", () => {
  it("scans every source and test file", () => {
    expect(files.length).toBeGreaterThan(100);
  });
  it("finds no boundary violation", () => {
    if (violations.length > 0) console.error(violations.join("\n"));
    expect(violations).toEqual([]);
  });
  it("declares dependencies honestly", () => {
    const core = manifests.get("@widgentic/core") as Manifest & { dependencies?: unknown; peerDependencies?: unknown };
    expect(core.dependencies).toBeUndefined();
    expect(core.peerDependencies).toBeUndefined();
    for (const name of ["@widgentic/designer", "@widgentic/mcp"]) {
      const m = manifests.get(name) as Manifest & { dependencies?: Record<string, string> };
      expect(Object.keys(m.dependencies ?? {})).toEqual(["@widgentic/core"]);
    }
    const mcp = manifests.get("@widgentic/mcp") as Manifest & { peerDependencies?: Record<string, string>; peerDependenciesMeta?: Record<string, { optional?: boolean }> };
    for (const peer of Object.keys(mcp.peerDependencies ?? {})) {
      expect(mcp.peerDependenciesMeta?.[peer]?.optional, peer).toBe(true);
    }
  });
});
