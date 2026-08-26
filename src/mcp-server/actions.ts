/**
 * `execute_action`: the server half of an http action. The request names a
 * BINDING (widget kind + dotted template path, or "load"); the definition
 * is resolved from the caller's composed catalog — never from the request —
 * then arguments are validated, secrets injected, the guarded fetch made,
 * the response validated and folded into the round-tripped payload, and
 * the payload re-rendered exactly as render_widget would. Every message
 * leaving here is scrubbed of the execution's secret values.
 */
import type { WidgetCatalog } from "../catalog/index.js";
import type { ActionBinding, ActionDefinition, ActionExecutionErrorCode, HttpActionDefinition } from "../actions/index.js";
import {
  applyOutput,
  buildRequest,
  collectSecretRefs,
  getAtPath,
  redactText,
  redactValue,
  setAtPath,
  validateActionDefinition,
  validateArgs
} from "../actions/index.js";
import { errorMessage } from "../shared/error-message.js";
import { isPlainObject } from "../shared/plain-object.js";
import type { McpToolResult } from "../mcp/index.js";
import type { ThemeRegistry } from "../theming/index.js";
import { guardedJsonFetch } from "./guarded-fetch.js";
import type { GuardedFetchDeps } from "./guarded-fetch.js";
import { handleRenderWidget } from "./handlers.js";

/** What the server needs from composition to act on binding identifiers. */
export interface ActionSourceLike {
  bindingAt(kind: string, id: string): ActionBinding | undefined;
  load(kind: string): ActionBinding | undefined;
  resolve(ref: string): ActionDefinition | undefined;
}

export type ExecuteActionErrorCode =
  | ActionExecutionErrorCode
  | "INVALID_TYPE"
  | "MISSING_FIELD"
  | "UNKNOWN_KIND"
  | "UNKNOWN_ACTION"
  | "ACTION_NOT_HTTP"
  | "FORBIDDEN_SCOPE"
  | "ACTION_FETCH_FAILED"
  | "RATE_LIMITED";

/** `at` names an item of a group render and nothing else. */
const ITEM_LOCATION = /^data\.items\.\d+$/;

/** The fixed text clients see when the secret store fails — the detail goes to the log. */
const SECRETS_UNAVAILABLE = "Secret store unavailable; try again later.";

/** Where a definition references a secret (`headers.X` / `query.k`), for error paths. */
function secretRefLocation(definition: HttpActionDefinition, name: string): string {
  for (const field of ["headers", "query"] as const) {
    for (const [key, value] of Object.entries(definition[field] ?? {})) {
      if (isPlainObject(value) && value.secret === name) return `${field}.${key}`;
    }
  }
  return "headers";
}

export interface ExecuteActionOptions {
  /** Composition's binding/definition source; absent means no widget binds anything. */
  actions?: ActionSourceLike | undefined;
  /** The caller's scopes; `execute` is required. */
  scopes?: readonly string[] | undefined;
  /** Execution-time secret resolution for the caller's principal. */
  secrets?: ((name: string) => Promise<string | undefined>) | undefined;
  /** Per-principal rate limit gate: `false` refuses with RATE_LIMITED. */
  rateLimit?: (() => boolean) | undefined;
  themes?: ThemeRegistry | undefined;
  fetchDeps?: GuardedFetchDeps | undefined;
}

/** Same `{ code, path, message }` shape as render_widget's errors (path "" = the input root). */
function errorResult(
  code: ExecuteActionErrorCode,
  message: string,
  path = "",
  secrets: readonly string[] = []
): McpToolResult {
  const error = { code, path, message: redactText(message, secrets) };
  return { isError: true, content: [{ type: "text", text: JSON.stringify(error) }] };
}

export interface TestActionOptions {
  secrets?: ((name: string) => Promise<string | undefined>) | undefined;
  fetchDeps?: GuardedFetchDeps | undefined;
}

export type TestActionResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; code: ExecuteActionErrorCode; message: string; path?: string };

/**
 * The designer's test call — the production execution path minus the
 * re-render: validate arguments, resolve secrets, guarded fetch, validate
 * the response against the output schema. The result is redacted of every
 * secret value before it leaves.
 */
export async function testHttpAction(
  definition: unknown,
  args: unknown,
  options: TestActionOptions = {}
): Promise<TestActionResult> {
  if (isPlainObject(definition) && definition.kind === "prompt") {
    return { ok: false, code: "ACTION_NOT_HTTP", message: "Only http actions can be tested." };
  }
  const problem = validateActionDefinition(definition, "definition");
  if (problem) {
    return { ok: false, code: "INVALID_ACTION_INPUT", message: problem.message, path: problem.path };
  }
  const http = definition as HttpActionDefinition;
  const argsError = validateArgs(http, isPlainObject(args) ? args : {});
  if (argsError) {
    return { ok: false, code: "INVALID_ACTION_INPUT", message: argsError.message, ...(argsError.path ? { path: argsError.path } : {}) };
  }
  const resolved = new Map<string, string>();
  for (const name of collectSecretRefs(http)) {
    let value: string | undefined;
    try {
      value = await options.secrets?.(name);
    } catch (error) {
      console.error(`widgentic: secret resolution failed: ${errorMessage(error)}`);
      return { ok: false, code: "ACTION_FETCH_FAILED", message: SECRETS_UNAVAILABLE };
    }
    if (value === undefined) {
      return { ok: false, code: "UNKNOWN_SECRET", message: `Unknown secret '${name}'.`, path: secretRefLocation(http, name) };
    }
    resolved.set(name, value);
  }
  const built = buildRequest(http, isPlainObject(args) ? args : {}, (name) => resolved.get(name));
  if ("code" in built) return { ok: false, code: built.code, message: built.message, ...(built.path ? { path: built.path } : {}) };
  const fetched = await guardedJsonFetch(built, options.fetchDeps);
  if (!fetched.ok) {
    return { ok: false, code: "ACTION_FETCH_FAILED", message: redactText(fetched.reason, built.secretValues) };
  }
  const folded = applyOutput(http, undefined, {}, fetched.body);
  if (!folded.ok) {
    return { ok: false, code: "INVALID_ACTION_OUTPUT", message: redactText(folded.error.message, built.secretValues), ...(folded.error.path ? { path: folded.error.path } : {}) };
  }
  return { ok: true, status: fetched.status, body: redactValue(fetched.body, built.secretValues) };
}

export async function handleExecuteAction(
  catalog: WidgetCatalog,
  input: unknown,
  options: ExecuteActionOptions = {}
): Promise<McpToolResult> {
  if (!isPlainObject(input)) {
    return errorResult("INVALID_TYPE", "Input must be an object with 'widget', 'action' and 'payload'.", "");
  }
  const widget = input.widget;
  if (typeof widget !== "string" || widget.length === 0) {
    return errorResult("MISSING_FIELD", "'widget' must be the rendered widget's kind.", "widget");
  }
  const id = input.action;
  if (typeof id !== "string" || id.length === 0) {
    return errorResult("MISSING_FIELD", "'action' must be a binding identifier (a template path or \"load\").", "action");
  }
  if (!isPlainObject(input.payload) || input.payload.kind !== widget) {
    return errorResult("INVALID_TYPE", "'payload' must be the widget's current payload (kind must match 'widget').", "payload");
  }
  const payload = input.payload;
  const args = isPlainObject(input.args) ? input.args : {};
  // Inside a group render the bound element belongs to an ITEM: `at`
  // locates its payload within the root payload and `item` names its kind.
  // The binding resolves on the item's kind; the result folds into the
  // item's data and the WHOLE root payload re-renders.
  const at = typeof input.at === "string" && input.at.length > 0 ? input.at : undefined;
  let target: Record<string, unknown> = payload;
  let bindingKind = widget;
  if (at !== undefined) {
    if (!ITEM_LOCATION.test(at)) {
      return errorResult("INVALID_TYPE", "'at' must locate a group item (data.items.<index>).", "at");
    }
    const located = getAtPath(payload, at);
    if (!isPlainObject(located) || typeof located.kind !== "string" || (typeof input.item === "string" && located.kind !== input.item)) {
      return errorResult("INVALID_TYPE", "'at' must locate an item payload of kind 'item' within 'payload'.", "at");
    }
    target = located;
    bindingKind = located.kind;
  }

  // Scope is checked before any binding lookup or network activity (the
  // shape checks above only read the request): the anonymous principal
  // never executes.
  if (!(options.scopes ?? []).includes("execute")) {
    return errorResult("FORBIDDEN_SCOPE", "This key cannot execute widget actions (missing the 'execute' scope).");
  }
  if (options.rateLimit !== undefined && !options.rateLimit()) {
    return errorResult("RATE_LIMITED", "Too many action executions; try again shortly.");
  }
  for (const kind of new Set([widget, bindingKind])) {
    if (!catalog.has(kind)) {
      return errorResult(
        "UNKNOWN_KIND",
        `Unknown widget '${kind}'. Available widgets: ${catalog.kinds().sort().join(", ")}.`,
        kind === widget ? "widget" : "item"
      );
    }
  }

  // The binding comes from the STORED template — the request only names it.
  const binding = id === "load" ? options.actions?.load(bindingKind) : options.actions?.bindingAt(bindingKind, id);
  if (binding === undefined) {
    return errorResult("UNKNOWN_ACTION", `Widget '${bindingKind}' has no action binding '${id}'.`, "action");
  }
  const definition: ActionDefinition | undefined =
    "ref" in binding && typeof binding.ref === "string"
      ? options.actions?.resolve(binding.ref)
      : "definition" in binding
        ? binding.definition
        : undefined;
  if (definition === undefined) {
    return errorResult("UNKNOWN_ACTION", `Binding '${id}' references an action that does not exist.`, "action");
  }
  if (definition.kind !== "http") {
    return errorResult("ACTION_NOT_HTTP", `Binding '${id}' is a ${definition.kind} action; only http actions execute server-side.`, "action");
  }
  if (id === "load" && definition.method !== "GET") {
    return errorResult("ACTION_NOT_HTTP", "'load' bindings execute only http GET actions.", "action");
  }

  const argsError = validateArgs(definition, args);
  if (argsError) return errorResult("INVALID_ACTION_INPUT", argsError.message, argsError.path ?? "args");

  // Resolve every referenced secret up front (async), then build.
  const resolved = new Map<string, string>();
  for (const name of collectSecretRefs(definition)) {
    let value: string | undefined;
    try {
      value = await options.secrets?.(name);
    } catch (error) {
      console.error(`widgentic: secret resolution failed: ${errorMessage(error)}`);
      return errorResult("ACTION_FETCH_FAILED", SECRETS_UNAVAILABLE);
    }
    if (value === undefined) {
      return errorResult("UNKNOWN_SECRET", `Unknown secret '${name}'.`, secretRefLocation(definition, name));
    }
    resolved.set(name, value);
  }
  const built = buildRequest(definition, args, (name) => resolved.get(name));
  if ("code" in built) return errorResult(built.code, built.message, built.path ?? "");
  const secretValues = built.secretValues;

  const fetched = await guardedJsonFetch(built, options.fetchDeps);
  if (!fetched.ok) {
    return errorResult("ACTION_FETCH_FAILED", `Action '${id}' failed: ${fetched.reason}`, "", secretValues);
  }

  const folded = applyOutput(definition, binding.output, target.data, fetched.body);
  if (!folded.ok) {
    return errorResult("INVALID_ACTION_OUTPUT", folded.error.message, folded.error.path ?? "response", secretValues);
  }
  const rootData = at === undefined ? folded.data : (setAtPath(payload, `${at}.data`, folded.data) as Record<string, unknown>).data;

  // Re-render through the same pipeline as render_widget: contract +
  // schema validation, hints, styles, theme, structuredContent.
  const renderInput: Record<string, unknown> = { widget, data: rootData };
  if (payload.hints !== undefined) renderInput.hints = payload.hints;
  if (payload.meta !== undefined) renderInput.meta = payload.meta;
  if (payload.theme !== undefined) renderInput.theme = payload.theme;
  const rendered = handleRenderWidget(catalog, renderInput, {
    slim: true,
    themes: options.themes,
    actions: options.actions === undefined ? undefined : { load: options.actions.load, resolve: options.actions.resolve, executeAllowed: true }
  });
  if (rendered.isError === true) {
    // A response the widget's own schema refuses is an output failure.
    const text = rendered.content.find((block) => block.type === "text");
    const detail = text !== undefined && "text" in text ? String(text.text) : "render failed";
    return errorResult("INVALID_ACTION_OUTPUT", `Merged data failed the widget's validation: ${detail}`, "", secretValues);
  }
  return secretValues.length === 0 ? rendered : redactValue(rendered, secretValues);
}
