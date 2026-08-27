/**
 * Demo server for the designer host page: bundles main.ts with esbuild
 * (dev-only dependency — the runtime stays zero-dep) and serves the two
 * static files. Port 8082; the rig exposes it at :9446.
 *
 * Run with: npm run designer
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8082);

await build({
  entryPoints: [join(here, "main.ts")],
  bundle: true,
  format: "esm",
  outfile: join(here, "designer.bundle.js"),
  logLevel: "info"
});

const FILES: Record<string, { path: string; type: string }> = {
  "/": { path: join(here, "index.html"), type: "text/html; charset=utf-8" },
  "/index.html": { path: join(here, "index.html"), type: "text/html; charset=utf-8" },
  "/designer.bundle.js": {
    path: join(here, "designer.bundle.js"),
    type: "text/javascript; charset=utf-8"
  },
  // Script-tag hosting: the published single-file bundle (`npm run build`
  // produces it) drives standalone.html with nothing but custom elements.
  "/standalone.html": { path: join(here, "standalone.html"), type: "text/html; charset=utf-8" },
  "/widgentic-designer.js": {
    path: join(here, "..", "..", "packages", "designer", "dist", "browser", "widgentic-designer.js"),
    type: "text/javascript; charset=utf-8"
  }
};

createServer(async (req, res) => {
  const entry = FILES[req.url ?? "/"];
  if (entry === undefined) {
    res.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(entry.path);
    res.writeHead(200, { "Content-Type": entry.type }).end(body);
  } catch {
    res.writeHead(500).end();
  }
}).listen(PORT, () => {
  console.error(`widgentic designer demo on http://localhost:${PORT}/`);
});
