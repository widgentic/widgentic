// Single-file browser bundle: `@widgentic/designer/browser` for script-tag hosts.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [join(here, "..", "src", "browser.ts")],
  outfile: join(here, "..", "dist", "browser", "widgentic-designer.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  sourcemap: true,
  minify: true,
  logLevel: "warning"
});
