/**
 * The authoring API: widgets, themes, schemas, shared actions, secrets and
 * API keys over HTTP, authorized by a validated session and nothing else.
 *
 * The trust rules this file exists to enforce (design D7):
 *   - Only a session authenticates a write. A valid MCP API key presented
 *     here — header, query, anywhere — is refused with 401: the pasted key
 *     travels into prompt-injectable hosts and must never persist
 *     templates that a victim's own agents will later render.
 *   - The principal is ALWAYS the session's. Nothing in the path, query,
 *     or body can name a different target.
 *   - Store rejections surface as structured { error: { code, message } }
 *     with the rule's name; the store's state is untouched on failure.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ThemeEntry } from "@widgentic/core";
import { StoreRejectionError, normalizeKeyScopes, principalIdForSubject } from "@widgentic/mcp/store";
import type { StoredAction, StoredSchema, StoredWidget, WritableWidgetStore } from "@widgentic/mcp/store";
import { testHttpAction } from "@widgentic/mcp";
import type { ExecutionLimiter, GuardedFetchDeps } from "@widgentic/mcp";
import type { SessionClaims } from "./auth.js";

export interface ApiDeps {
  store: WritableWidgetStore;
  /** The session boundary; the API needs nothing else from auth. */
  readSession(cookieHeader: string | undefined): SessionClaims | undefined;
  /** Whether the store was built with a secret cipher (the Secrets section is disabled otherwise). */
  secretsEnabled?: boolean;
  /** Injectable transport for the action test call (tests). */
  fetchDeps?: GuardedFetchDeps;
  /** Execution budget shared with the MCP edge; test calls draw from the same bucket. */
  limiter?: ExecutionLimiter;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function sendError(res: ServerResponse, status: number, code: string, message: string): void {
  send(res, status, { error: { code, message } });
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 256 * 1024) throw new Error("body too large");
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function rejectionStatus(code: string): number {
  if (code === "UNKNOWN_PRINCIPAL" || code === "UNKNOWN_KEY") return 404;
  if (code === "TOO_MANY_WIDGETS" || code === "TOO_MANY_THEMES" || code === "TOO_MANY_SCHEMAS") return 409;
  if (code === "TOO_MANY_ACTIONS" || code === "TOO_MANY_SECRETS") return 409;
  if (code === "SCHEMA_IN_USE" || code === "ACTION_IN_USE" || code === "SECRET_IN_USE") return 409; // conflict: re-point first
  if (code === "NO_CIPHER") return 503; // the deployment cannot hold secrets
  if (code === "FORBIDDEN") return 403;
  if (code === "STORE_ERROR") return 502;
  return 422; // validation family: RESERVED_KIND, RESERVED_THEME, INVALID_TEMPLATE, ...
}

/**
 * Handle `/api/...` requests. Returns false when the URL is not an API
 * route, so the caller can fall through to static serving.
 */
export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: ApiDeps
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/")) return false;

  // An MCP API key is not a session — refuse it explicitly, whether or
  // not a session is also present, so key-bearing automation can never
  // drift into the write path.
  if (req.headers["x-api-key"] !== undefined || url.searchParams.has("key")) {
    sendError(res, 401, "KEY_NOT_A_SESSION", "API keys do not authorize this endpoint; sign in.");
    return true;
  }

  const session = deps.readSession(req.headers.cookie);
  if (session === undefined) {
    sendError(res, 401, "NO_SESSION", "A signed-in session is required.");
    return true;
  }

  // The one and only principal this request can touch.
  const principal = await deps.store.ensurePrincipal(session.subject, session.label);

  const segments = url.pathname.slice("/api/".length).split("/").map(decodeURIComponent);
  const [resource, id] = [segments[0], segments.slice(1).join("/")];
  const method = req.method ?? "GET";

  try {
    if (resource === "me" && method === "GET") {
      send(res, 200, { principal: { id: principal.id, label: principal.label } });
      return true;
    }

    if (resource === "widgets") {
      if (method === "GET" && id === "") {
        send(res, 200, { widgets: await deps.store.widgets(principal.id) });
        return true;
      }
      if (method === "PUT" && id !== "") {
        const body = (await readBody(req)) as Partial<StoredWidget> | undefined;
        if (body === undefined || typeof body !== "object") {
          sendError(res, 400, "INVALID_BODY", "Expected a widget JSON body.");
          return true;
        }
        // The path names the kind; the body cannot smuggle another, and
        // there is no principal field to smuggle at all.
        const widget: StoredWidget = {
          kind: id,
          template: body.template as StoredWidget["template"],
          descriptor: body.descriptor as StoredWidget["descriptor"],
          ...(body.load !== undefined ? { load: body.load } : {})
        };
        await deps.store.putWidget(principal.id, widget);
        send(res, 200, { saved: id });
        return true;
      }
      if (method === "DELETE" && id !== "") {
        await deps.store.removeWidget(principal.id, id);
        send(res, 200, { removed: id });
        return true;
      }
    }

    if (resource === "themes") {
      if (method === "GET" && id === "") {
        send(res, 200, { themes: await deps.store.themes(principal.id) });
        return true;
      }
      if (method === "PUT" && id !== "") {
        const body = (await readBody(req)) as Partial<ThemeEntry> | undefined;
        if (body === undefined || typeof body !== "object") {
          sendError(res, 400, "INVALID_BODY", "Expected a theme JSON body.");
          return true;
        }
        const theme = { ...body, name: id } as ThemeEntry;
        await deps.store.putTheme(principal.id, theme);
        send(res, 200, { saved: id });
        return true;
      }
      if (method === "DELETE" && id !== "") {
        await deps.store.removeTheme(principal.id, id);
        send(res, 200, { removed: id });
        return true;
      }
    }

    if (resource === "schemas") {
      if (method === "GET" && id === "") {
        send(res, 200, { schemas: await deps.store.schemas(principal.id) });
        return true;
      }
      if (method === "PUT" && id !== "") {
        const body = (await readBody(req)) as Partial<StoredSchema> | undefined;
        if (body === undefined || typeof body !== "object") {
          sendError(res, 400, "INVALID_BODY", "Expected a schema JSON body.");
          return true;
        }
        // The path names the schema, exactly like widgets and themes.
        const entry = { ...body, name: id } as StoredSchema;
        await deps.store.putSchema(principal.id, entry);
        send(res, 200, { saved: id });
        return true;
      }
      if (method === "DELETE" && id !== "") {
        // SCHEMA_IN_USE surfaces through the rejection path, naming the
        // referencing widgets — never a silent failure.
        await deps.store.removeSchema(principal.id, id);
        send(res, 200, { removed: id });
        return true;
      }
    }

    // The designer's test call: the production execution path (secrets,
    // SSRF guard, output validation), redacted — never a browser fetch. Its
    // own route, so an action may be named `test`; it spends the same
    // per-principal execution budget as execute_action.
    if (resource === "action-test" && method === "POST" && id === "") {
      if (deps.limiter !== undefined && !deps.limiter.take(principal.id)) {
        send(res, 200, { ok: false, code: "RATE_LIMITED", message: "Too many test calls; try again in a minute." });
        return true;
      }
      const body = (await readBody(req)) as { definition?: unknown; args?: unknown } | undefined;
      const result = await testHttpAction(body?.definition, body?.args ?? {}, {
        secrets: (name) => deps.store.secretValue(principal.id, name),
        fetchDeps: deps.fetchDeps
      });
      send(res, 200, result);
      return true;
    }

    if (resource === "actions") {
      if (method === "GET" && id === "") {
        send(res, 200, { actions: await deps.store.actions(principal.id) });
        return true;
      }
      if (method === "PUT" && id !== "") {
        const body = (await readBody(req)) as Partial<StoredAction> | undefined;
        if (body === undefined || typeof body !== "object") {
          sendError(res, 400, "INVALID_BODY", "Expected an action JSON body.");
          return true;
        }
        const entry = { ...body, name: id } as StoredAction;
        await deps.store.putAction(principal.id, entry);
        send(res, 200, { saved: id });
        return true;
      }
      if (method === "DELETE" && id !== "") {
        // ACTION_IN_USE surfaces through the rejection path, naming widgets.
        await deps.store.removeAction(principal.id, id);
        send(res, 200, { removed: id });
        return true;
      }
    }

    if (resource === "secrets") {
      if (method === "GET" && id === "") {
        send(res, 200, {
          enabled: deps.secretsEnabled === true,
          secrets: deps.secretsEnabled === true ? await deps.store.listSecrets(principal.id) : []
        });
        return true;
      }
      // Without a cipher there is nothing to write with — the same gate the
      // listing applies, so a deployment never half-supports secrets.
      if ((method === "PUT" || method === "DELETE") && id !== "" && deps.secretsEnabled !== true) {
        sendError(res, 503, "NO_CIPHER", "This deployment holds no secret cipher.");
        return true;
      }
      if (method === "PUT" && id !== "") {
        const body = (await readBody(req)) as { value?: unknown } | undefined;
        if (typeof body?.value !== "string") {
          sendError(res, 400, "INVALID_BODY", "Expected { value: string }.");
          return true;
        }
        // Write-only: the value goes in encrypted and never comes back out.
        await deps.store.putSecret(principal.id, id, body.value);
        send(res, 200, { saved: id });
        return true;
      }
      if (method === "DELETE" && id !== "") {
        await deps.store.removeSecret(principal.id, id);
        send(res, 200, { removed: id });
        return true;
      }
    }

    if (resource === "identities") {
      if (method === "GET" && id === "") {
        const linked = await deps.store.listLinkedSubjects(principal.id);
        send(res, 200, {
          current: session.subject,
          // The primary identity is the one the account id derives from;
          // the store exposes its canonical subject from ANY session.
          currentIsPrimary: principalIdForSubject(session.subject) === principal.id,
          primary: {
            subject: principal.subject ?? session.subject,
            ...(principal.label === undefined ? {} : { label: principal.label })
          },
          linked
        });
        return true;
      }
      if (method === "DELETE" && id === "") {
        const body = (await readBody(req)) as { subject?: unknown } | undefined;
        const subject = typeof body?.subject === "string" ? body.subject : "";
        if (subject === "") {
          sendError(res, 400, "INVALID_SUBJECT", "Pass the linked subject to unlink.");
          return true;
        }
        await deps.store.unlinkSubject(principal.id, subject);
        send(res, 200, { unlinked: subject });
        return true;
      }
    }

    if (resource === "keys") {
      if (method === "GET" && id === "") {
        send(res, 200, { keys: await deps.store.listKeys(principal.id) });
        return true;
      }
      if (method === "POST" && id === "") {
        const body = (await readBody(req)) as { name?: unknown; scopes?: unknown } | undefined;
        const name = typeof body?.name === "string" ? body.name : "";
        // Scopes are fixed at creation; `read` is always granted and only
        // key-grantable scopes are accepted (INVALID_SCOPES otherwise).
        const created = await deps.store.createKey(principal.id, name, normalizeKeyScopes(body?.scopes));
        // The raw key exists in this response and nowhere else, ever.
        send(res, 201, {
          key: created.key,
          entry: created.entry,
          notice: "Store this key now — it cannot be shown again."
        });
        return true;
      }
      if (method === "DELETE" && id !== "") {
        await deps.store.revokeKey(principal.id, id);
        send(res, 200, { revoked: id });
        return true;
      }
    }

    sendError(res, 404, "NOT_FOUND", "No such API route.");
    return true;
  } catch (error) {
    if (error instanceof StoreRejectionError) {
      sendError(res, rejectionStatus(error.code), error.code, error.detail);
      return true;
    }
    if (error instanceof SyntaxError) {
      sendError(res, 400, "INVALID_BODY", "Malformed JSON body.");
      return true;
    }
    if (error instanceof Error && error.message === "body too large") {
      sendError(res, 400, "INVALID_BODY", "Request body too large.");
      return true;
    }
    sendError(res, 500, "INTERNAL", "Unexpected error.");
    return true;
  }
}
