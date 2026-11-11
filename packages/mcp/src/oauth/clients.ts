/**
 * Clients, without a client table. A dynamically registered client's id
 * carries its own registration, sealed; a URL client id is a metadata
 * document fetched under the guarded-fetch policy. Both are public clients:
 * there is no client secret anywhere.
 */
import { createHash } from "node:crypto";
import { isPlainObject } from "@widgentic/core";
import { guardedJsonFetch } from "../server/index.js";
import type { GuardedFetchDeps } from "../server/index.js";
import { CLIENT_NAME_MAX_LENGTH } from "../store/index.js";
import { open, seal } from "./seal.js";

/** Marks a client id minted by registration. */
export const REGISTERED_CLIENT_PREFIX = "wgd_";
export const MAX_REDIRECT_URIS = 10;
const UNNAMED_CLIENT = "Unnamed application";

/** Never a redirect target, whatever else is allowed. */
const FORBIDDEN_SCHEMES = new Set(["javascript:", "data:", "file:", "blob:", "about:", "vbscript:"]);
/** Network schemes that are not private-use: only https (and loopback http) may be used. */
const NETWORK_SCHEMES = new Set(["http:", "ws:", "wss:", "ftp:"]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"]);

export interface Client {
  /** Display text supplied by the client — unverified. */
  name: string;
  redirectUris: string[];
}

function isLoopback(url: URL): boolean {
  return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
}

/** https, loopback http, or a private-use scheme; never a script-like one; no fragment. */
export function isAllowedRedirectUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2_000) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash !== "" || value.includes("#")) return false;
  if (FORBIDDEN_SCHEMES.has(url.protocol)) return false;
  if (url.protocol === "https:") return true;
  if (NETWORK_SCHEMES.has(url.protocol)) return isLoopback(url);
  return true;
}

/** Exact match, except that a loopback redirect may differ in port. */
export function redirectMatches(registered: string, presented: string): boolean {
  if (registered === presented) return true;
  try {
    const a = new URL(registered);
    const b = new URL(presented);
    if (!isLoopback(a) || !isLoopback(b)) return false;
    a.port = "";
    b.port = "";
    return a.toString() === b.toString();
  } catch {
    return false;
  }
}

function clientName(value: unknown): string {
  const name = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim() : "";
  return name === "" ? UNNAMED_CLIENT : name.slice(0, CLIENT_NAME_MAX_LENGTH);
}

export type Registration =
  | { ok: true; clientId: string; client: Client; issuedAt: number }
  | { ok: false; error: "invalid_redirect_uri" | "invalid_client_metadata"; description: string };

/** Validate a registration request and mint its self-describing client id. */
export function registerClient(secret: string, metadata: unknown, nowSeconds: number): Registration {
  if (!isPlainObject(metadata)) {
    return { ok: false, error: "invalid_client_metadata", description: "The registration must be a JSON object." };
  }
  const uris = metadata.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > MAX_REDIRECT_URIS) {
    return {
      ok: false,
      error: "invalid_redirect_uri",
      description: `redirect_uris must list between 1 and ${MAX_REDIRECT_URIS} redirect URIs.`
    };
  }
  if (!uris.every(isAllowedRedirectUri)) {
    return {
      ok: false,
      error: "invalid_redirect_uri",
      description: "Each redirect URI must be https, loopback http, or a private-use scheme, without a fragment."
    };
  }
  const client: Client = { name: clientName(metadata.client_name), redirectUris: [...uris] };
  const clientId = `${REGISTERED_CLIENT_PREFIX}${seal(secret, "client", { n: client.name, r: client.redirectUris, t: nowSeconds })}`;
  return { ok: true, clientId, client, issuedAt: nowSeconds };
}

function clientFrom(name: unknown, uris: unknown): Client | undefined {
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > MAX_REDIRECT_URIS) return undefined;
  if (!uris.every(isAllowedRedirectUri)) return undefined;
  return { name: clientName(name), redirectUris: [...uris] };
}

/** The client a `client_id` names, or `undefined` when it cannot be trusted. */
export async function resolveClient(
  secret: string,
  clientId: string,
  fetchDeps: GuardedFetchDeps | undefined
): Promise<Client | undefined> {
  if (clientId.startsWith(REGISTERED_CLIENT_PREFIX)) {
    const payload = open(secret, "client", clientId.slice(REGISTERED_CLIENT_PREFIX.length));
    return isPlainObject(payload) ? clientFrom(payload.n, payload.r) : undefined;
  }
  if (!clientId.startsWith("https://") || clientId.length > 2_000) return undefined;
  // A client metadata document: public https, pinned, no redirects, bounded.
  const fetched = await guardedJsonFetch({ method: "GET", url: clientId, headers: {}, secretValues: [] }, fetchDeps);
  if (!fetched.ok || fetched.status !== 200 || !isPlainObject(fetched.body)) return undefined;
  if (fetched.body.client_id !== clientId) return undefined;
  return clientFrom(fetched.body.client_name, fetched.body.redirect_uris);
}

/**
 * The short, stable form of a client id that grants and codes are bound to:
 * a sealed id is hundreds of characters, and records only need to compare it.
 */
export function clientKey(clientId: string): string {
  return `cid_${createHash("sha256").update(clientId, "utf8").digest("hex").slice(0, 32)}`;
}
