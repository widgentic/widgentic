/**
 * The `node:http` adapter for the authorization surface — the only module
 * here that touches request and response objects. It decodes the URL and a
 * size-capped body, asks the host who is signed in (only for the two routes
 * that need it), hands plain values to the core and writes the answer. It
 * adds no behavior, and it contains the host's callback: a failure there is
 * answered as the surface answers its own, never thrown into the server.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { BodyTooLargeError, readBodyText } from "../server/index.js";
import { createAuthorizationSurface } from "./handler.js";
import type { AuthorizationDeps, AuthorizationRequest, AuthorizationResponse, ResolveSignedIn, SignedInPrincipal } from "./types.js";

export interface AuthorizationHttpOptions {
  /** Cap on a request body, in bytes. Default 64 KiB. */
  maxBodyBytes?: number;
}

function write(res: ServerResponse, response: AuthorizationResponse): void {
  res.writeHead(response.status, response.headers);
  res.end(response.body);
}

/**
 * Mount the authorization surface on a standard server. The returned handler
 * answers `true` when the URL was one of the surface's routes (response
 * written) and `false` when it was not.
 */
export function createAuthorizationHttpHandler(
  deps: AuthorizationDeps,
  resolveSignedIn: ResolveSignedIn,
  options: AuthorizationHttpOptions = {}
): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  const surface = createAuthorizationSurface(deps);
  const maxBodyBytes = options.maxBodyBytes ?? 64 * 1024;
  const log = deps.log ?? ((line: string) => console.error(line));

  return async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!surface.owns(url.pathname)) return false;
    const method = req.method ?? "GET";
    const request: AuthorizationRequest = {
      method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams)
    };

    if (method === "POST") {
      let text: string;
      try {
        text = await readBodyText(req, maxBodyBytes);
      } catch (error) {
        const tooLarge = error instanceof BodyTooLargeError;
        res.writeHead(tooLarge ? 413 : 400, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ error: "invalid_request", error_description: tooLarge ? "Request body too large." : "Unreadable body." }));
        return true;
      }
      const type = (req.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase();
      if (type === "application/json") {
        try {
          request.json = text === "" ? undefined : (JSON.parse(text) as unknown);
        } catch {
          // Left absent: the core refuses a registration with no object.
        }
      } else {
        request.form = Object.fromEntries(new URLSearchParams(text));
      }
    }

    if (surface.needsPrincipal(url.pathname)) {
      let principal: SignedInPrincipal | undefined;
      try {
        principal = await resolveSignedIn(req);
      } catch (error) {
        log(`widgentic oauth: resolving the signed-in principal failed on ${method} ${url.pathname} — ${String(error)}`);
        write(res, surface.failure(url.pathname));
        return true;
      }
      if (principal !== undefined) request.principal = principal;
    }

    const response = await surface.handle(request);
    if (response === undefined) return false;
    write(res, response);
    return true;
  };
}
