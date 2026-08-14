/**
 * The widgentic.dev app's request router: auth routes, the authoring
 * API, the static shell, and the health probe. Pure function of its
 * dependencies so tests drive it in-process; `http.ts` is the entry that
 * builds the bundle, wires env configuration, and listens.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { WritableWidgetStore } from "widgentic/store";
import { handleApiRequest } from "./api.js";
import type { Auth } from "./auth.js";
import { AuthError } from "./auth.js";

export interface StaticAsset {
  body: string | Buffer;
  contentType: string;
}

export interface WebAppDeps {
  store: WritableWidgetStore;
  auth: Auth;
  /** Path (e.g. "/") → asset. The router serves these verbatim. */
  assets: Record<string, StaticAsset>;
  /**
   * Explicit local-dev sign-in harness. NEVER enabled by default: the
   * entry turns it on only when WIDGENTIC_DEV_LOGIN=1 AND no issuer is
   * configured, so a production deployment (which has an issuer) cannot
   * carry it.
   */
  devLogin?: boolean;
  log?: (line: string) => void;
}

const DEV_LOGIN_PAGE = `<!doctype html>
<meta charset="utf-8"><title>widgentic dev sign-in</title>
<body style="font-family: system-ui; padding: 2rem">
<h1>Dev sign-in</h1>
<p>This harness exists only while no identity issuer is configured.</p>
<form method="POST" action="/auth/dev">
  <label>Subject <input name="subject" required placeholder="dev:alice"></label>
  <label>Label <input name="label" placeholder="Alice (dev)"></label>
  <button type="submit">Sign in</button>
</form>`;

export function createWebAppHandler(deps: WebAppDeps) {
  const log = deps.log ?? ((line: string) => console.error(line));

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (url.pathname === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
      return;
    }

    // ---- auth routes ---------------------------------------------------
    if (url.pathname === "/auth/login") {
      if (deps.devLogin === true) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(DEV_LOGIN_PAGE);
        return;
      }
      const begin = deps.auth.beginLogin();
      res.writeHead(302, { Location: begin.location, "Set-Cookie": begin.setCookie }).end();
      return;
    }

    if (url.pathname === "/auth/dev" && req.method === "POST") {
      if (deps.devLogin !== true) {
        res.writeHead(404).end();
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
      const subject = form.get("subject") ?? "";
      if (subject === "") {
        res.writeHead(400).end("subject required");
        return;
      }
      const label = form.get("label") ?? undefined;
      const cookie = deps.auth.mintSession({
        subject,
        ...(label === undefined || label === "" ? {} : { label })
      });
      res.writeHead(302, { Location: "/", "Set-Cookie": cookie }).end();
      return;
    }

    if (url.pathname === "/auth/github") {
      try {
        const begin = deps.auth.beginGitHubLogin();
        res.writeHead(302, { Location: begin.location, "Set-Cookie": begin.setCookie }).end();
      } catch {
        res.writeHead(404, { "Content-Type": "text/plain" }).end("GitHub sign-in not configured.");
      }
      return;
    }

    if (url.pathname === "/auth/github/callback") {
      try {
        const result = await deps.auth.handleGitHubCallback(url, req.headers.cookie);
        res.writeHead(302, { Location: "/", "Set-Cookie": result.setCookie }).end();
      } catch (error) {
        log(`github callback refused: ${error instanceof AuthError ? error.reason : "error"}`);
        res.writeHead(401, { "Content-Type": "text/plain" }).end("Sign-in failed.");
      }
      return;
    }

    if (url.pathname === "/auth/callback") {
      try {
        const result = await deps.auth.handleCallback(url, req.headers.cookie);
        res.writeHead(302, { Location: "/", "Set-Cookie": result.setCookie }).end();
      } catch (error) {
        // Refusals are terse on the wire and specific in the log.
        log(`auth callback refused: ${error instanceof AuthError ? error.reason : "error"}`);
        res.writeHead(401, { "Content-Type": "text/plain" }).end("Sign-in failed.");
      }
      return;
    }

    if (url.pathname === "/auth/logout") {
      res.writeHead(302, { Location: "/", "Set-Cookie": deps.auth.logoutCookie() }).end();
      return;
    }

    // ---- API -----------------------------------------------------------
    const handled = await handleApiRequest(req, res, {
      store: deps.store,
      readSession: (cookie) => deps.auth.readSession(cookie)
    });
    if (handled) return;

    // ---- static shell --------------------------------------------------
    const asset = deps.assets[url.pathname === "/" ? "/" : url.pathname];
    if (asset !== undefined && (req.method === "GET" || req.method === "HEAD")) {
      res.writeHead(200, {
        "Content-Type": asset.contentType,
        "Cache-Control": url.pathname === "/" ? "no-cache" : "public, max-age=300"
      });
      res.end(req.method === "HEAD" ? undefined : asset.body);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
  };
}
