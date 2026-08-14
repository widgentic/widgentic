/**
 * HTTP entry for the widgentic.dev app.
 *
 * Run with: npm run web   (PORT env, default 3002)
 *
 * Configuration:
 *   WIDGENTIC_COSMOS_ENDPOINT   Cosmos account; managed identity (or a
 *                               developer credential) authenticates —
 *                               there is no key/connection-string path.
 *   WIDGENTIC_AUTH_ISSUER       Entra External ID issuer URL.
 *   WIDGENTIC_AUTH_CLIENT_ID    App registration client id.
 *   WIDGENTIC_AUTH_REDIRECT_URI Callback URL (…/auth/callback).
 *   WIDGENTIC_AUTH_CLIENT_SECRET Optional confidential-client secret.
 *   WIDGENTIC_SESSION_SECRET    Session-cookie HMAC secret (random per
 *                               boot when unset — fine for one replica).
 *   WIDGENTIC_DEV_LOGIN=1       Local-dev sign-in harness; only honored
 *                               when NO issuer is configured.
 *
 * Without Cosmos configuration the store is in-memory (local dev): real
 * flows, disposable data.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { build } from "esbuild";
import { createMemoryStore } from "widgentic/store";
import type { WritableWidgetStore } from "widgentic/store";
import { createWebAppHandler } from "./app.js";
import type { StaticAsset } from "./app.js";
import { createAuth } from "./auth.js";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3002);

// ---- store ---------------------------------------------------------------
const COSMOS_ENDPOINT = process.env.WIDGENTIC_COSMOS_ENDPOINT;
let store: WritableWidgetStore;
if (COSMOS_ENDPOINT !== undefined) {
  const { createCosmosStore } = await import("widgentic/store/cosmos");
  const { DefaultAzureCredential } = await import("@azure/identity");
  store = createCosmosStore({
    endpoint: COSMOS_ENDPOINT,
    credential: new DefaultAzureCredential()
  });
  console.error(`widgentic web: Cosmos store at ${COSMOS_ENDPOINT}`);
} else {
  store = createMemoryStore();
  console.error("widgentic web: in-memory store (local dev; data is disposable)");
}

// ---- auth ----------------------------------------------------------------
const ISSUER = process.env.WIDGENTIC_AUTH_ISSUER;
const devLogin = ISSUER === undefined && process.env.WIDGENTIC_DEV_LOGIN === "1";
const auth = createAuth({
  issuer: ISSUER ?? "https://unconfigured.invalid/v2.0",
  clientId: process.env.WIDGENTIC_AUTH_CLIENT_ID ?? "unconfigured",
  redirectUri:
    process.env.WIDGENTIC_AUTH_REDIRECT_URI ?? `http://localhost:${PORT}/auth/callback`,
  ...(process.env.WIDGENTIC_AUTH_CLIENT_SECRET === undefined
    ? {}
    : { clientSecret: process.env.WIDGENTIC_AUTH_CLIENT_SECRET }),
  ...(process.env.WIDGENTIC_SESSION_SECRET === undefined
    ? {}
    : { sessionSecret: process.env.WIDGENTIC_SESSION_SECRET }),
  ...(process.env.WIDGENTIC_GITHUB_CLIENT_ID === undefined ||
  process.env.WIDGENTIC_GITHUB_CLIENT_SECRET === undefined
    ? {}
    : {
        github: {
          clientId: process.env.WIDGENTIC_GITHUB_CLIENT_ID,
          clientSecret: process.env.WIDGENTIC_GITHUB_CLIENT_SECRET,
          redirectUri:
            process.env.WIDGENTIC_GITHUB_REDIRECT_URI ??
            `http://localhost:${PORT}/auth/github/callback`
        }
      })
});
if (ISSUER === undefined && !devLogin) {
  console.error(
    "widgentic web: no WIDGENTIC_AUTH_ISSUER and no WIDGENTIC_DEV_LOGIN — sign-in will refuse."
  );
}
if (devLogin) console.error("widgentic web: DEV LOGIN ENABLED (no issuer configured)");

// ---- static shell ----------------------------------------------------------
const bundle = await build({
  entryPoints: [join(here, "main.ts")],
  bundle: true,
  format: "esm",
  write: false,
  logLevel: "warning"
});
const assets: Record<string, StaticAsset> = {
  "/": {
    body: await readFile(join(here, "index.html"), "utf8"),
    contentType: "text/html; charset=utf-8"
  },
  "/app.bundle.js": {
    body: bundle.outputFiles[0]?.text ?? "",
    contentType: "text/javascript; charset=utf-8"
  }
};

const handle = createWebAppHandler({ store, auth, assets, devLogin });

createServer((req, res) => {
  void handle(req, res).catch(() => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
}).listen(PORT, () => {
  console.error(`widgentic web app on http://localhost:${PORT}/`);
});
