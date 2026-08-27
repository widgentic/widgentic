// Publishability gate: pack every public package, refuse stray files, run publint and are-the-types-wrong.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PACKAGES = ["packages/core", "packages/designer", "packages/mcp"];
const ALLOWED = /^(dist\/|package\.json$|README\.md$|LICENSE$|CHANGELOG\.md$)/;
const out = mkdtempSync(join(tmpdir(), "widgentic-pack-"));
let failed = false;
try {
  for (const dir of PACKAGES) {
    // Under workspaces `npm pack --json` returns an object keyed by package name; a plain array otherwise.
    const raw = JSON.parse(execFileSync("npm", ["pack", "--json", "--pack-destination", out, "-w", dir], { encoding: "utf8" }));
    const info = Array.isArray(raw) ? raw[0] : Object.values(raw)[0];
    const stray = info.files.map((f) => f.path).filter((p) => !ALLOWED.test(p));
    if (stray.length > 0) { failed = true; console.error(`${info.name}: stray files in tarball:`, stray); }
    const tarball = join(out, info.filename);
    for (const [bin, args] of [["publint", [tarball, "--strict"]], ["attw", [tarball, "--profile", "esm-only"]]]) {
      try { execFileSync("npx", ["--no-install", bin, ...args], { stdio: "inherit" }); }
      catch { failed = true; console.error(`${info.name}: ${bin} failed`); }
    }
    console.log(`${info.name}@${info.version}: ${info.files.length} files, ${info.size} bytes packed`);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
