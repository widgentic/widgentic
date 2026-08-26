/**
 * The widgentic.dev app's request router: auth routes, the authoring
 * API, the static shell, and the health probe. Pure function of its
 * dependencies so tests drive it in-process; `http.ts` is the entry that
 * builds the bundle, wires env configuration, and listens.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { WritableWidgetStore } from "widgentic/store";
import { handleApiRequest } from "./api.js";
import type { Auth, AuthCallbackResult } from "./auth.js";
import { AuthError } from "./auth.js";
import { StoreRejectionError } from "widgentic/store";

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
  /** Whether the store holds a secret cipher (Secrets section enabled). */
  secretsEnabled?: boolean;
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

    // Link the OTHER method to the signed-in account: same provider flows,
    // with a session-bound intent sealed into the flow cookie.
    if (url.pathname === "/auth/link/github" || url.pathname === "/auth/link/email") {
      const session = deps.auth.readSession(req.headers.cookie);
      if (session === undefined) {
        res.writeHead(302, { Location: "/" }).end();
        return;
      }
      try {
        const begin =
          url.pathname === "/auth/link/github"
            ? deps.auth.beginGitHubLogin(session.subject)
            : deps.auth.beginLogin(session.subject);
        res.writeHead(302, { Location: begin.location, "Set-Cookie": begin.setCookie }).end();
      } catch {
        res.writeHead(404, { "Content-Type": "text/plain" }).end("That sign-in method is not configured.");
      }
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

    /**
     * Complete a callback result: a link intent attaches the new subject
     * to the LIVE session's account (re-verified here — the sealed intent
     * alone is not enough, the session must still be the same identity);
     * a sign-in result mints the session as before. Linking never sets a
     * cookie: identity does not switch.
     */
    async function completeCallback(result: AuthCallbackResult): Promise<void> {
      if (result.link !== undefined) {
        const session = deps.auth.readSession(req.headers.cookie);
        if (session === undefined || session.subject !== result.link.forSubject) {
          res.writeHead(401, { "Content-Type": "text/plain" }).end("Link refused: session changed.");
          return;
        }
        try {
          const principal = await deps.store.ensurePrincipal(session.subject, session.label);
          await deps.store.linkSubject(
            principal.id,
            result.link.newSubject,
            result.link.label
          );
          res.writeHead(302, { Location: "/?linked=1" }).end();
        } catch (error) {
          const code =
            error instanceof StoreRejectionError ? error.code : "LINK_FAILED";
          res.writeHead(302, { Location: `/?link_error=${encodeURIComponent(code)}` }).end();
        }
        return;
      }
      res.writeHead(302, { Location: "/", "Set-Cookie": result.setCookie ?? "" }).end();
    }

    if (url.pathname === "/auth/github/callback") {
      try {
        const result = await deps.auth.handleGitHubCallback(url, req.headers.cookie);
        await completeCallback(result);
      } catch (error) {
        log(`github callback refused: ${error instanceof AuthError ? error.reason : "error"}`);
        res.writeHead(401, { "Content-Type": "text/plain" }).end("Sign-in failed.");
      }
      return;
    }

    if (url.pathname === "/auth/callback") {
      try {
        const result = await deps.auth.handleCallback(url, req.headers.cookie);
        await completeCallback(result);
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
      readSession: (cookie) => deps.auth.readSession(cookie),
      ...(deps.secretsEnabled === undefined ? {} : { secretsEnabled: deps.secretsEnabled })
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
