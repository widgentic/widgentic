/**
 * The authoring surface: widgets, themes, schemas, shared actions, secrets
 * and API keys over plain request values, authorized by the host's resolved
 * principal and nothing else (authoring-api spec).
 *
 * The trust rules this module exists to enforce:
 *   - An API key never authorizes authoring. A presented key — valid or not —
 *     is refused with `401 KEY_NOT_A_SESSION` before any store access: the
 *     pasted key travels into prompt-injectable hosts and must never persist
 *     templates that a victim's own agents will later render.
 *   - The principal is ALWAYS the context's. Nothing in the path, query, or
 *     body can name a different target; the path names the ENTRY.
 *   - Store rejections surface as structured `{ error: { code, message } }`
 *     with the rule's name; the store's state is untouched on failure.
 *   - Identity routes exist only when the host supplied a subject.
 *
 * A pure function of its inputs: no sockets, no `IncomingMessage`, no
 * cookies. `node.js` beside it adapts the standard server.
 */
import type { ThemeEntry } from "@widgentic/core";
import { testHttpAction } from "../server/index.js";
import { normalizeKeyScopes, principalIdForSubject, StoreRejectionError } from "../store/types.js";
import type { StoredAction, StoredSchema, StoredWidget } from "../store/types.js";
import type { AuthoringDeps, AuthoringRequest, AuthoringResponse, PrincipalContext } from "./types.js";

function ok(status: number, body: unknown): AuthoringResponse {
  return { status, body };
}

function refusal(status: number, code: string, message: string): AuthoringResponse {
  return { status, body: { error: { code, message } } };
}

/** The store's rule → the transport's word for it. */
export function rejectionStatus(code: string): number {
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
 * Handle one authoring request. Unknown routes answer `404 NOT_FOUND`; the
 * caller decides what a non-authoring URL even is (the adapter mounts this
 * under a base path).
 */
export async function handleAuthoringRequest(
  request: AuthoringRequest,
  deps: AuthoringDeps
): Promise<AuthoringResponse> {
  // A key is not a principal — refuse it explicitly, whether or not a
  // principal is also resolved, so key-bearing automation can never drift
  // into the write path. Uniform for valid and invalid keys.
  if (request.presentedApiKey === true) {
    return refusal(401, "KEY_NOT_A_SESSION", "API keys do not authorize this endpoint.");
  }
  const context = request.context;
  if (context === undefined) {
    return refusal(401, "NO_PRINCIPAL", "The host resolved no principal for this request.");
  }

  // A malformed percent-escape must answer like any other unknown route,
  // not escape as a URIError past the structured-refusal path.
  let segments: string[];
  try {
    segments = request.path.replace(/^\/+/, "").split("/").map(decodeURIComponent);
  } catch {
    return refusal(404, "NOT_FOUND", "No such authoring route.");
  }
  const [resource, id] = [segments[0] ?? "", segments.slice(1).join("/")];
  const method = request.method.toUpperCase();
  const body = request.body;
  const store = deps.store;
  const principalId = context.principalId;

  try {
    if (resource === "me" && method === "GET") {
      return ok(200, {
        principal: { id: principalId, ...(context.label === undefined ? {} : { label: context.label }) },
        secretsEnabled: deps.secretsEnabled === true
      });
    }

    if (resource === "widgets") {
      if (method === "GET" && id === "") {
        return ok(200, { widgets: await store.widgets(principalId) });
      }
      if (method === "PUT" && id !== "") {
        if (body === undefined || typeof body !== "object" || body === null) {
          return refusal(400, "INVALID_BODY", "Expected a widget JSON body.");
        }
        const given = body as Partial<StoredWidget>;
        // The path names the kind; the body cannot smuggle another, and
        // there is no principal field to smuggle at all.
        const widget: StoredWidget = {
          kind: id,
          template: given.template as StoredWidget["template"],
          descriptor: given.descriptor as StoredWidget["descriptor"],
          ...(given.load !== undefined ? { load: given.load } : {})
        };
        await store.putWidget(principalId, widget);
        return ok(200, { saved: id });
      }
      if (method === "DELETE" && id !== "") {
        await store.removeWidget(principalId, id);
        return ok(200, { removed: id });
      }
    }

    if (resource === "themes") {
      if (method === "GET" && id === "") {
        return ok(200, { themes: await store.themes(principalId) });
      }
      if (method === "PUT" && id !== "") {
        if (body === undefined || typeof body !== "object" || body === null) {
          return refusal(400, "INVALID_BODY", "Expected a theme JSON body.");
        }
        const theme = { ...(body as Partial<ThemeEntry>), name: id } as ThemeEntry;
        await store.putTheme(principalId, theme);
        return ok(200, { saved: id });
      }
      if (method === "DELETE" && id !== "") {
        await store.removeTheme(principalId, id);
        return ok(200, { removed: id });
      }
    }

    if (resource === "schemas") {
      if (method === "GET" && id === "") {
        return ok(200, { schemas: await store.schemas(principalId) });
      }
      if (method === "PUT" && id !== "") {
        if (body === undefined || typeof body !== "object" || body === null) {
          return refusal(400, "INVALID_BODY", "Expected a schema JSON body.");
        }
        // The path names the schema, exactly like widgets and themes.
        const entry = { ...(body as Partial<StoredSchema>), name: id } as StoredSchema;
        await store.putSchema(principalId, entry);
        return ok(200, { saved: id });
      }
      if (method === "DELETE" && id !== "") {
        // SCHEMA_IN_USE surfaces through the rejection path, naming the
        // referencing widgets — never a silent failure.
        await store.removeSchema(principalId, id);
        return ok(200, { removed: id });
      }
    }

    // The designer's test call: the production execution path (secrets,
    // SSRF guard, output validation), redacted — never a browser fetch. Its
    // own route, so an action may be named `test`; it spends the same
    // per-principal execution budget as execute_action.
    if (resource === "action-test" && method === "POST" && id === "") {
      if (deps.limiter !== undefined && !deps.limiter.take(principalId)) {
        return ok(200, { ok: false, code: "RATE_LIMITED", message: "Too many test calls; try again in a minute." });
      }
      const given = body as { definition?: unknown; args?: unknown } | undefined;
      const result = await testHttpAction(given?.definition, given?.args ?? {}, {
        secrets: (name) => store.secretValue(principalId, name),
        ...(deps.fetchDeps === undefined ? {} : { fetchDeps: deps.fetchDeps })
      });
      return ok(200, result);
    }

    if (resource === "actions") {
      if (method === "GET" && id === "") {
        return ok(200, { actions: await store.actions(principalId) });
      }
      if (method === "PUT" && id !== "") {
        if (body === undefined || typeof body !== "object" || body === null) {
          return refusal(400, "INVALID_BODY", "Expected an action JSON body.");
        }
        const entry = { ...(body as Partial<StoredAction>), name: id } as StoredAction;
        await store.putAction(principalId, entry);
        return ok(200, { saved: id });
      }
      if (method === "DELETE" && id !== "") {
        // ACTION_IN_USE surfaces through the rejection path, naming widgets.
        await store.removeAction(principalId, id);
        return ok(200, { removed: id });
      }
    }

    if (resource === "secrets") {
      if (method === "GET" && id === "") {
        return ok(200, {
          enabled: deps.secretsEnabled === true,
          secrets: deps.secretsEnabled === true ? await store.listSecrets(principalId) : []
        });
      }
      // Without a cipher there is nothing to write with — the same gate the
      // listing applies, so a deployment never half-supports secrets.
      if ((method === "PUT" || method === "DELETE") && id !== "" && deps.secretsEnabled !== true) {
        return refusal(503, "NO_CIPHER", "This deployment holds no secret cipher.");
      }
      if (method === "PUT" && id !== "") {
        const given = body as { value?: unknown } | undefined;
        if (typeof given?.value !== "string") {
          return refusal(400, "INVALID_BODY", "Expected { value: string }.");
        }
        // Write-only: the value goes in encrypted and never comes back out.
        await store.putSecret(principalId, id, given.value);
        return ok(200, { saved: id });
      }
      if (method === "DELETE" && id !== "") {
        await store.removeSecret(principalId, id);
        return ok(200, { removed: id });
      }
    }

    // Identity routes exist only when the host authenticated a subject: a
    // host with no identity concept (a fixed-principal deployment) never
    // exposes them, and their absence affects nothing else.
    if (resource === "identities" && context.subject !== undefined) {
      const subject = context.subject;
      if (method === "GET" && id === "") {
        const account = await ensureOwnAccount(deps, context, subject);
        if (account instanceof StoreRejectionError) throw account;
        const linked = await store.listLinkedSubjects(principalId);
        return ok(200, {
          current: subject,
          // The primary identity is the one the account id derives from;
          // the store exposes its canonical subject from ANY session.
          currentIsPrimary: principalIdForSubject(subject) === principalId,
          primary: {
            subject: account.subject ?? subject,
            ...(account.label === undefined ? {} : { label: account.label })
          },
          linked
        });
      }
      if (method === "DELETE" && id === "") {
        const given = body as { subject?: unknown } | undefined;
        const toUnlink = typeof given?.subject === "string" ? given.subject : "";
        if (toUnlink === "") {
          return refusal(400, "INVALID_SUBJECT", "Pass the linked subject to unlink.");
        }
        await store.unlinkSubject(principalId, toUnlink);
        return ok(200, { unlinked: toUnlink });
      }
    }

    if (resource === "keys") {
      if (method === "GET" && id === "") {
        return ok(200, { keys: await store.listKeys(principalId) });
      }
      if (method === "POST" && id === "") {
        const given = body as { name?: unknown; scopes?: unknown } | undefined;
        const name = typeof given?.name === "string" ? given.name : "";
        // Scopes are fixed at creation; `read` is always granted and only
        // key-grantable scopes are accepted (INVALID_SCOPES otherwise).
        const created = await store.createKey(principalId, name, normalizeKeyScopes(given?.scopes));
        // The raw key exists in this response and nowhere else, ever.
        return ok(201, {
          key: created.key,
          entry: created.entry,
          notice: "Store this key now — it cannot be shown again."
        });
      }
      if (method === "DELETE" && id !== "") {
        await store.revokeKey(principalId, id);
        return ok(200, { revoked: id });
      }
    }

    return refusal(404, "NOT_FOUND", "No such authoring route.");
  } catch (error) {
    if (error instanceof StoreRejectionError) {
      return refusal(rejectionStatus(error.code), error.code, error.detail);
    }
    // The client gets nothing but INTERNAL; the operator gets a trace.
    (deps.log ?? ((line: string) => console.error(line)))(
      `widgentic authoring: unexpected failure on ${method} ${resource} — ${String(error)}`
    );
    return refusal(500, "INTERNAL", "Unexpected error.");
  }
}

/**
 * The identity read needs the account's CANONICAL subject, which only the
 * store knows. `ensurePrincipal` is idempotent for the subject the host just
 * authenticated; a result that names a different account than the context's
 * is a host wiring fault and is refused rather than answered.
 */
async function ensureOwnAccount(
  deps: AuthoringDeps,
  context: PrincipalContext,
  subject: string
): Promise<{ subject?: string; label?: string } | StoreRejectionError> {
  const principal = await deps.store.ensurePrincipal(
    subject,
    ...(context.label === undefined ? [] : [context.label])
  );
  if (principal.id !== context.principalId) {
    return new StoreRejectionError("FORBIDDEN", "the authenticated subject belongs to a different account.");
  }
  return {
    ...(principal.subject === undefined ? {} : { subject: principal.subject }),
    ...(principal.label === undefined ? {} : { label: principal.label })
  };
}
