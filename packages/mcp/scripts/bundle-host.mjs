// Runtime-neutral host bundle: `@widgentic/mcp/host` for embedded engines.
// One ES module with no imports, needing nothing beyond ECMAScript and Intl.
// The exported helpers serve the bare-realm test, which builds the same
// bundle in memory; run directly, this writes dist/host.
import { build, transform } from "esbuild";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");

/**
 * core-js keeps internal state on the global object even in its pure build;
 * resolving its shared store to a module-local object keeps the bundle from
 * touching the realm (the bare-realm test compares the global names).
 */
const localCoreJsStore = {
  name: "local-core-js-store",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /(^|\/)shared-store(\.js)?$/ }, (args) =>
      args.importer.includes("core-js-pure") ? { path: join(here, "host-core-js-store.cjs") } : undefined
    );
  }
};

/** The esbuild options of the host bundle; `overrides` win (`write: false` for in-memory builds). */
export function hostBundleOptions(overrides = {}) {
  const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  return {
    entryPoints: [join(packageRoot, "src", "host", "index.ts")],
    outfile: join(packageRoot, "dist", "host", "widgentic-host.js"),
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    mainFields: ["module", "main"],
    minify: true,
    legalComments: "none",
    inject: [join(here, "host-url-shim.mjs")],
    plugins: [localCoreJsStore],
    define: { WIDGENTIC_HOST_VERSION: JSON.stringify(manifest.version) },
    metafile: true,
    logLevel: "warning",
    ...overrides
  };
}

/**
 * Problems that make a bundle unfit for an embedded engine: a surviving
 * import, a Node module among the inputs, or esbuild's runtime require shim.
 */
export function hostBundleProblems(result, text) {
  const problems = [];
  for (const [file, output] of Object.entries(result.metafile.outputs)) {
    if (!file.endsWith(".js")) continue;
    for (const imported of output.imports) problems.push(`the bundle still imports ${imported.path}`);
  }
  for (const input of Object.keys(result.metafile.inputs)) {
    if (input.startsWith("node:") || input.includes("(disabled):")) problems.push(`Node-only input ${input}`);
  }
  if (text.includes("Dynamic require of")) problems.push("the bundle carries a runtime require shim");
  return problems;
}

/** Build the bundle in memory (same options) and return its text; throws when it is not runtime-neutral. */
export async function buildHostBundleText() {
  const result = await build(hostBundleOptions({ write: false }));
  const output = result.outputFiles.find((file) => file.path.endsWith(".js"));
  if (output === undefined) throw new Error("esbuild produced no host bundle");
  const problems = hostBundleProblems(result, output.text);
  if (problems.length > 0) throw new Error(`host bundle is not runtime-neutral: ${problems.join("; ")}`);
  return output.text;
}

/**
 * The module as a classic script expression evaluating to its namespace, for
 * realms that cannot load modules. Only the export syntax is rewritten, and
 * the namespace binding stays local to the expression.
 */
export async function hostBundleAsExpression(moduleText) {
  const { code } = await transform(moduleText, { format: "iife", globalName: "widgenticHostModule", target: "es2022" });
  return `(() => {
${code}
return widgenticHostModule;
})()`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const options = hostBundleOptions();
  const result = await build(options);
  const problems = hostBundleProblems(result, readFileSync(options.outfile, "utf8"));
  if (problems.length > 0) {
    console.error(`host bundle is not runtime-neutral:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
}
