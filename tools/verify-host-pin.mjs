// Release gate for the Widgentic.Mcp NuGet package: the host bundle it embeds must be
// byte-identical to the `./host` artifact in the registry tarball of the @widgentic/mcp
// version the .NET tree pins, so the package only ever ships a published, attested bundle.
// Usage: node tools/verify-host-pin.mjs <@widgentic/mcp version> <bundle the package embeds>
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

const [version, localBundle] = process.argv.slice(2);
if (!version || !localBundle) {
  console.error("usage: node tools/verify-host-pin.mjs <version> <bundle path>");
  process.exit(2);
}
// npm is a .cmd shim on Windows, which only a shell can start.
const SHELL = process.platform === "win32";
const BUNDLE = "package/dist/host/widgentic-host.js";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** One file's bytes from a .tgz (ustar headers), without depending on the platform's tar. */
function readFromTarball(tgz, wanted) {
  const tar = gunzipSync(readFileSync(tgz));
  const field = (block, start, length) => {
    const raw = block.subarray(start, start + length);
    const end = raw.indexOf(0);
    return raw.subarray(0, end === -1 ? raw.length : end).toString("utf8");
  };
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const header = tar.subarray(offset, offset + 512);
    const name = field(header, 0, 100);
    if (name === "") break;
    const prefix = field(header, 345, 155);
    const size = parseInt(field(header, 124, 12).trim() || "0", 8);
    const path = prefix === "" ? name : `${prefix}/${name}`;
    if (path === wanted) return tar.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return undefined;
}

const out = mkdtempSync(join(tmpdir(), "widgentic-pin-"));
try {
  let packed;
  try {
    packed = JSON.parse(
      execFileSync("npm", ["pack", `@widgentic/mcp@${version}`, "--json", "--pack-destination", out], { encoding: "utf8", shell: SHELL })
    );
  } catch {
    console.error(`@widgentic/mcp@${version} is not on the registry: release it before publishing Widgentic.Mcp, or pin a published version.`);
    process.exit(1);
  }
  const tarball = join(out, (Array.isArray(packed) ? packed[0] : Object.values(packed)[0]).filename);
  const registryBundle = readFromTarball(tarball, BUNDLE);
  if (registryBundle === undefined) {
    console.error(`@widgentic/mcp@${version} has no ${BUNDLE.slice("package/".length)}: it predates the host bundle. Pin a later release.`);
    process.exit(1);
  }
  const registry = sha256(registryBundle);
  const local = sha256(readFileSync(localBundle));
  if (registry !== local) {
    console.error(
      `The embedded bundle differs from @widgentic/mcp@${version} on the registry:\n` +
        `  registry ${registry}\n  embedded ${local}\n` +
        "Release @widgentic/mcp with these sources and pin that version, or build from the pinned release."
    );
    process.exit(1);
  }
  console.log(`host bundle matches @widgentic/mcp@${version} (sha256 ${local})`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
