// Publishability gate: pack every public package, refuse stray files, run publint and are-the-types-wrong;
// the mcp tarball must carry the host bundle as one self-contained module.
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PACKAGES = ["packages/core", "packages/designer", "packages/webmcp", "packages/mcp"];
const ALLOWED = /^(dist\/|package\.json$|README\.md$|LICENSE$|CHANGELOG\.md$)/;
const HOST_BUNDLE = "dist/host/widgentic-host.js";
// npm and npx are .cmd shims on Windows, which only a shell can start.
const SHELL = process.platform === "win32";

/** Bundling the host bundle again must pull in nothing: it has no imports left. */
async function hostBundleInputs(file) {
  const result = await build({ entryPoints: [file], bundle: true, write: false, format: "esm", platform: "neutral", metafile: true, logLevel: "silent" });
  return Object.keys(result.metafile.inputs);
}
const out = mkdtempSync(join(tmpdir(), "widgentic-pack-"));
let failed = false;
try {
  for (const dir of PACKAGES) {
    // Under workspaces `npm pack --json` returns an object keyed by package name; a plain array otherwise.
    const raw = JSON.parse(execFileSync("npm", ["pack", "--json", "--pack-destination", out, "-w", dir], { encoding: "utf8", shell: SHELL }));
    const info = Array.isArray(raw) ? raw[0] : Object.values(raw)[0];
    const stray = info.files.map((f) => f.path).filter((p) => !ALLOWED.test(p));
    if (stray.length > 0) { failed = true; console.error(`${info.name}: stray files in tarball:`, stray); }
    const tarball = join(out, info.filename);
    for (const [bin, args] of [["publint", [tarball, "--strict"]], ["attw", [tarball, "--profile", "esm-only"]]]) {
      try { execFileSync("npx", ["--no-install", bin, ...args], { stdio: "inherit", shell: SHELL }); }
      catch { failed = true; console.error(`${info.name}: ${bin} failed`); }
    }
    if (info.name === "@widgentic/mcp") {
      if (!info.files.some((f) => f.path === HOST_BUNDLE)) { failed = true; console.error(`${info.name}: ${HOST_BUNDLE} missing from the tarball`); }
      else {
        try {
          const inputs = await hostBundleInputs(join(dir, HOST_BUNDLE));
          if (inputs.length !== 1) { failed = true; console.error(`${info.name}: ${HOST_BUNDLE} still imports`, inputs.slice(1)); }
        } catch (error) { failed = true; console.error(`${info.name}: ${HOST_BUNDLE} does not bundle cleanly`, error); }
      }
    }
    console.log(`${info.name}@${info.version}: ${info.files.length} files, ${info.size} bytes packed`);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
