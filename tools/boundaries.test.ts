/**
 * Package boundaries, enforced at the source (spec: package-distribution).
 *
 * Every import in packages/ and examples/ is classified and checked:
 *   - relative imports never leave their root (a package, an app, an example)
 *   - `@widgentic/<pkg>[/sub]` must be a declared `exports` entry and an
 *     allowed edge (core → nothing; designer, mcp → core; webmcp → core,
 *     designer; examples → any)
 *   - `node:` modules, `Buffer` and `process` stay out of core, designer and webmcp
 *   - third-party imports in package sources match the package's manifest
 *     (mcp: the MCP SDK and zod only from the `./sdk` assembly)
 * Tests (`__tests__`) may additionally use vitest, the SDK client, the
 * example fixtures package and the widgentic packages their own manifest
 * lists as devDependencies; nothing else is exempt.
 *
 * The host bundle's static import graph (from `@widgentic/mcp/host`) must
 * stay runtime-neutral at ANY depth, even where the bundler would drop the
 * import; and the .NET host under `dotnet/` may reach into `packages/`
 * only for the built bundle and the conformance corpus.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const PACKAGES: Record<string, string> = { core: "packages/core", designer: "packages/designer", webmcp: "packages/webmcp", mcp: "packages/mcp" };
const ALLOWED_EDGES: Record<string, string[]> = { core: [], designer: ["core"], webmcp: ["core", "designer"], mcp: ["core"] };
const BROWSER_SAFE = new Set(["core", "designer", "webmcp"]);
const EXTERNALS: Record<string, RegExp[]> = { core: [], designer: [], webmcp: [], mcp: [/^@azure\//] };
/** Runtime dependencies each package may declare — the spec's dependency direction, as data. */
const EXPECTED_DEPENDENCIES: Record<string, string[]> = {
  "@widgentic/designer": ["@widgentic/core"],
  "@widgentic/mcp": ["@widgentic/core"],
  "@widgentic/webmcp": ["@widgentic/core", "@widgentic/designer"]
};
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
/** Repository-relative path with `/` separators on every platform. */
/**
 * The superseded 1.x SDK stays installed through the docs tooling, so a stale
 * import would still resolve and typecheck: every source uses the 2.x packages.
 */
const SUPERSEDED_SDK = /^@modelcontextprotocol\/sdk(?:\/|$)/;
function supersededSdkImports(rel: string, source: string): string[] {
  return SPECIFIERS.flatMap((re) => [...source.matchAll(re)].map((m) => m[1] ?? ""))
    .filter((spec) => SUPERSEDED_SDK.test(spec))
    .map((spec) => `${rel}: imports the superseded 1.x SDK ${spec}; use @modelcontextprotocol/server, client or node`);
}
function repoPath(file: string): string {
  return relative(ROOT, file).split(sep).join("/");
}
function rootOf(file: string): string {
  const rel = repoPath(file).split("/");
  return rel[0] === "packages" || rel[0] === "examples" ? `${rel[0]}/${rel[1]}` : rel[0] ?? "";
}
function packageOf(file: string): string | undefined {
  return Object.entries(PACKAGES).find(([, dir]) => repoPath(file).startsWith(dir + "/"))?.[0];
}

const files = [...walk(join(ROOT, "packages")), ...walk(join(ROOT, "examples"))];
const violations: string[] = [];
for (const file of files) {
  const rel = repoPath(file);
  const isTest = rel.includes("/__tests__/");
  const pkg = packageOf(file);
  const source = readFileSync(file, "utf8");
  const specs = SPECIFIERS.flatMap((re) => [...source.matchAll(re)].map((m) => m[1] ?? ""));
  violations.push(...supersededSdkImports(rel, source));
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
    if (spec.startsWith("@widgentic-examples/")) {
      if (pkg !== undefined && !isTest) violations.push(`${rel}: package sources may not import ${spec}`);
      continue;
    }
    // bare third-party specifier
    if (pkg === undefined) continue; // examples choose their own dependencies
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

/** Import edges that survive compilation: `import type` / `export type` are erased. */
const RUNTIME_SPECIFIERS = [/^\s*(?:import|export)\s+(?!type\b)[^;"']*?\bfrom\s+"([^"]+)"/gm, /^\s*import\s+"([^"]+)"/gm];

/** A relative `.js` specifier as the TypeScript source it names. */
function sourceFile(from: string, spec: string): string | undefined {
  const target = resolve(dirname(from), spec);
  for (const candidate of [target.replace(/\.js$/, ".ts"), target, join(target, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return undefined;
}

/**
 * Walk the static import graph from `entry` and report every Node-only or
 * third-party edge with the chain that reaches it. `@widgentic/core` (and its
 * subpaths) resolve to the core sources under `root`; nothing else outside
 * the entry's own relative graph may be reached.
 */
function hostGraphViolations(entry: string, root: string = ROOT): string[] {
  const found: string[] = [];
  const parents = new Map<string, string | undefined>([[entry, undefined]]);
  const queue = [entry];
  const chain = (file: string): string => {
    const names: string[] = [];
    for (let at: string | undefined = file; at !== undefined; at = parents.get(at)) {
      names.unshift(relative(root, at).split(sep).join("/"));
    }
    return names.join(" → ");
  };
  while (queue.length > 0) {
    const file = queue.shift() as string;
    const code = stripComments(readFileSync(file, "utf8"));
    if (/\bBuffer\./.test(code)) found.push(`${chain(file)}: uses Buffer`);
    if (/\bprocess\./.test(code)) found.push(`${chain(file)}: uses process`);
    if (/\brequire\(/.test(code)) found.push(`${chain(file)}: uses require`);
    const specs = RUNTIME_SPECIFIERS.flatMap((re) => [...code.matchAll(re)].map((m) => m[1] ?? ""));
    for (const spec of specs) {
      let next: string | undefined;
      if (spec.startsWith(".")) {
        next = sourceFile(file, spec);
        if (next === undefined) found.push(`${chain(file)} → ${spec}: unresolved`);
      } else if (spec === "@widgentic/core" || spec.startsWith("@widgentic/core/")) {
        const sub = spec.slice("@widgentic/core".length);
        next = join(root, "packages", "core", "src", sub === "" ? "index.ts" : `${sub.slice(1)}/index.ts`);
      } else {
        found.push(`${chain(file)} → ${spec}: ${spec.startsWith("node:") ? "Node-only module" : "not bundled source"}`);
      }
      if (next !== undefined && !parents.has(next)) {
        parents.set(next, file);
        queue.push(next);
      }
    }
  }
  return found;
}

/** Paths into `packages/` the .NET host may reference: the built bundle and the corpus. */
const DOTNET_ALLOWED = new Set([
  "packages/mcp/dist/host/widgentic-host.js",
  "packages/mcp/src/host/__tests__/conformance.json"
]);
function* dotnetFiles(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (entry === "bin" || entry === "obj" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* dotnetFiles(full);
    else if (/\.(csproj|props|targets|cs|slnx)$/.test(entry)) yield full;
  }
}
const dotnetViolations: string[] = [];
for (const file of dotnetFiles(join(ROOT, "dotnet"))) {
  for (const match of readFileSync(file, "utf8").matchAll(/packages[\\/][^"'<>\s;)]*/g)) {
    const target = match[0].replaceAll("\\", "/");
    if (!DOTNET_ALLOWED.has(target)) dotnetViolations.push(`${repoPath(file)}: references ${target}`);
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
  it("refuses the superseded 1.x SDK in any source, naming the file", () => {
    const stale = 'import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";\n';
    expect(supersededSdkImports("examples/any/main.ts", stale)).toEqual([
      "examples/any/main.ts: imports the superseded 1.x SDK @modelcontextprotocol/sdk/server/stdio.js; use @modelcontextprotocol/server, client or node"
    ]);
    expect(supersededSdkImports("examples/any/main.ts", 'import { McpServer } from "@modelcontextprotocol/server";\n')).toEqual([]);
  });
  it("keeps the host bundle's import graph runtime-neutral at any depth", () => {
    expect(hostGraphViolations(join(ROOT, "packages/mcp/src/host/index.ts"))).toEqual([]);
  });
  it("catches a Node-only import behind a tree-shakeable re-export", () => {
    const dir = mkdtempSync(join(tmpdir(), "wg-host-graph-"));
    try {
      writeFileSync(join(dir, "entry.ts"), 'import { a } from "./barrel.js";\nimport type { T } from "./typed.js";\nexport const v: T = a;\n');
      writeFileSync(join(dir, "barrel.ts"), 'export { a } from "./a.js";\nexport { b } from "./uses-node.js";\n');
      writeFileSync(join(dir, "a.ts"), "export const a = 1;\n");
      writeFileSync(join(dir, "typed.ts"), 'import { createHash } from "node:crypto";\nexport type T = number;\nexport const h = createHash;\n');
      writeFileSync(join(dir, "uses-node.ts"), 'import { randomBytes } from "node:crypto";\nexport const b = randomBytes;\n');
      expect(hostGraphViolations(join(dir, "entry.ts"), dir)).toEqual([
        "entry.ts → barrel.ts → uses-node.ts → node:crypto: Node-only module"
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("lets the .NET host reach only the built bundle and the corpus", () => {
    expect(dotnetViolations).toEqual([]);
  });
  it("declares dependencies honestly", () => {
    const core = manifests.get("@widgentic/core") as Manifest & { dependencies?: unknown; peerDependencies?: unknown };
    expect(core.dependencies).toBeUndefined();
    expect(core.peerDependencies).toBeUndefined();
    for (const [name, expected] of Object.entries(EXPECTED_DEPENDENCIES)) {
      const m = manifests.get(name) as Manifest & { dependencies?: Record<string, string> };
      expect(Object.keys(m.dependencies ?? {}).sort(), name).toEqual(expected);
    }
    const webmcp = manifests.get("@widgentic/webmcp") as Manifest & { peerDependencies?: unknown; description?: string };
    expect(webmcp.peerDependencies).toBeUndefined();
    // Beta is stated where installers read: the manifest description and the README.
    expect(webmcp.description).toMatch(/beta/i);
    expect(readFileSync(join(ROOT, "packages/webmcp/README.md"), "utf8")).toMatch(/\*\*Beta\.\*\*/);
    const mcp = manifests.get("@widgentic/mcp") as Manifest & { peerDependencies?: Record<string, string>; peerDependenciesMeta?: Record<string, { optional?: boolean }> };
    for (const peer of Object.keys(mcp.peerDependencies ?? {})) {
      expect(mcp.peerDependenciesMeta?.[peer]?.optional, peer).toBe(true);
    }
    // The ./sdk entry is built on SDK 2.x: its server package, ext-apps 2 and
    // a zod with Standard JSON Schema; never the superseded 1.x package.
    expect(mcp.peerDependencies).toMatchObject({
      "@modelcontextprotocol/server": "^2.3.0",
      "@modelcontextprotocol/ext-apps": "^2",
      zod: "^4.2.0"
    });
    expect(mcp.peerDependencies).not.toHaveProperty(["@modelcontextprotocol/sdk"]);
  });
});
