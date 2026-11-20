/**
 * Where hosts sign in, from the deployment's public origins — the one piece
 * of configuration both services must agree on, so it lives in one module:
 *
 *   WIDGENTIC_PUBLIC_URL       the app's public origin (the issuer)
 *   WIDGENTIC_MCP_PUBLIC_URL   the MCP endpoint's public URL (the resource);
 *                              defaults to `<WIDGENTIC_PUBLIC_URL>/mcp`
 *
 * With neither set the stack is local: the app on its port, the MCP service
 * on its own.
 *
 * The signing secret seals client registrations and the consent form. It
 * comes from a mounted file (`WIDGENTIC_OAUTH_SECRET_FILE`, preferred) or
 * `WIDGENTIC_OAUTH_SECRET`; with neither it is derived from the deployment's
 * KEK, so connections survive a restart with no extra setting.
 */
import { hkdfSync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { positiveIntFromEnv } from "@widgentic/mcp";

type Env = Record<string, string | undefined>;

export interface OAuthOrigins {
  /** The authorization server: the app's origin. */
  issuer: string;
  /** The protected MCP endpoint, as hosts address it. */
  resource: string;
  /** The same service's endpoint that needs no credential. */
  publicResource: string;
}

function setting(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

export function oauthOrigins(env: Env): OAuthOrigins {
  const appUrl = setting(env.WIDGENTIC_PUBLIC_URL);
  const mcpUrl = setting(env.WIDGENTIC_MCP_PUBLIC_URL);
  const issuer =
    appUrl === undefined
      ? `http://localhost:${positiveIntFromEnv(env.WIDGENTIC_WEB_PORT, 8080)}`
      : new URL(appUrl).origin;
  const resource = (
    mcpUrl ??
    (appUrl === undefined ? `http://localhost:${positiveIntFromEnv(env.WIDGENTIC_MCP_PORT, 8081)}/mcp` : `${issuer}/mcp`)
  ).replace(/\/+$/, "");
  return { issuer, resource, publicResource: `${resource}/public` };
}

export function oauthSecret(env: Env, log: (line: string) => void = (line) => console.error(line)): string {
  const file = setting(env.WIDGENTIC_OAUTH_SECRET_FILE);
  const explicit = file === undefined ? setting(env.WIDGENTIC_OAUTH_SECRET) : readFileSync(file, "utf8").trim();
  if (explicit !== undefined && explicit !== "") {
    if (explicit.length < 32) throw new Error("widgentic web: the OAuth secret must be at least 32 characters.");
    return explicit;
  }
  const kekFile = setting(env.WIDGENTIC_KEK_FILE);
  const kek = kekFile === undefined ? setting(env.WIDGENTIC_KEK) : readFileSync(kekFile, "utf8").trim();
  if (kek !== undefined && kek !== "") {
    // A separate key for a separate purpose: nothing sealed with it helps
    // anyone toward the KEK, and the label keeps the two from ever colliding.
    return Buffer.from(hkdfSync("sha256", kek, "", "widgentic self-host oauth seal v1", 32)).toString("hex");
  }
  log("widgentic web: no OAuth secret and no KEK — using a per-boot secret; hosts sign in again after a restart");
  return randomBytes(32).toString("hex");
}
