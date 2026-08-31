/**
 * The `node:http` adapter for the authoring surface — the only module on
 * this side of the boundary that touches request and response objects. It
 * decodes (URL, method, size-capped JSON body, presented-credential
 * detection), asks the host who is calling, hands plain values to the core,
 * and writes the answer. It adds no behavior: the same operation through the
 * core and through this adapter yields the same status and body.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { BodyTooLargeError, readBodyText } from "../server/index.js";
import { handleAuthoringRequest } from "./handler.js";
import type { AuthoringDeps, ResolvePrincipalContext } from "./types.js";

/** Top-level body fields a credential travels in; a string value in any of them is a presented key. */
const KEY_BODY_FIELDS = ["key", "apiKey", "api_key", "x-api-key"] as const;

function bodyPresentsKey(body: unknown): boolean {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return false;
  return KEY_BODY_FIELDS.some((field) => typeof (body as Record<string, unknown>)[field] === "string");
}

export interface AuthoringHttpOptions {
  /** URL prefix the surface is mounted under. Default `/api`. */
  basePath?: string;
  /** Cap on a request body, in bytes. Default 256 KiB. */
  maxBodyBytes?: number;
}

/**
 * Mount the authoring surface on a standard server. The returned handler
 * answers `true` when the URL was an authoring route (response written) and
 * `false` when it was not, so the host falls through to its own routes.
 */
export function createAuthoringHttpHandler(
  deps: AuthoringDeps,
  resolveContext: ResolvePrincipalContext,
  options: AuthoringHttpOptions = {}
): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  const basePath = (options.basePath ?? "/api").replace(/\/+$/, "");
  const maxBodyBytes = options.maxBodyBytes ?? 256 * 1024;

  return async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`)) return false;

    let body: unknown;
    try {
      const text = await readBodyText(req, maxBodyBytes);
      body = text === "" ? undefined : (JSON.parse(text) as unknown);
    } catch (error) {
      const message = error instanceof BodyTooLargeError ? "Request body too large." : "Malformed JSON body.";
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: "INVALID_BODY", message } }));
      return true;
    }

    // Credential detection happens here, on the raw request — header, query,
    // and the body fields key-bearing automation reaches for; the refusal
    // itself is the core's, so no mount can forget it. When a key was
    // presented the host is not even asked who is calling: the request is
    // refused regardless.
    const presentedApiKey =
      req.headers["x-api-key"] !== undefined || url.searchParams.has("key") || bodyPresentsKey(body);

    const context = presentedApiKey ? undefined : await resolveContext(req);
    const response = await handleAuthoringRequest(
      {
        method: req.method ?? "GET",
        path: url.pathname.slice(basePath.length + 1),
        ...(body === undefined ? {} : { body }),
        ...(context === undefined ? {} : { context }),
        presentedApiKey
      },
      deps
    );
    res.writeHead(response.status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response.body));
    return true;
  };
}
