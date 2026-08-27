/**
 * The pure half of executing an http action: validate arguments, build the
 * outbound request, and fold a validated response back into widget data.
 * No I/O here — the server owns the fetch — so every rule is unit-testable
 * and the same code serves production execution and the designer's test
 * call.
 */
import { validateDataAgainstSchema } from "../catalog/schema.js";
import { isPlainObject } from "../shared/plain-object.js";
import type { HttpActionDefinition, HttpMethod, OutputBinding } from "./types.js";

export type ActionExecutionErrorCode =
  | "INVALID_ACTION_INPUT"
  | "UNKNOWN_SECRET"
  | "INVALID_ACTION_OUTPUT";

export interface ActionExecutionError {
  code: ActionExecutionErrorCode;
  message: string;
  path?: string;
}

/**
 * Arguments must satisfy the action's input schema before any network
 * activity — and only DECLARED fields are arguments at all: the schema
 * validator ignores undeclared properties, so without this rule a
 * tampered frame could add query parameters or body fields (and override
 * an author-fixed, secret-bearing `query` entry) at will.
 */
export function validateArgs(
  definition: HttpActionDefinition,
  args: unknown
): ActionExecutionError | undefined {
  const value = args ?? {};
  if (!isPlainObject(value)) {
    return { code: "INVALID_ACTION_INPUT", message: "Arguments must be an object.", path: "args" };
  }
  const declared = isPlainObject(definition.input.properties) ? definition.input.properties : {};
  const fixedQuery = definition.query ?? {};
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(declared, key)) {
      return { code: "INVALID_ACTION_INPUT", message: `Argument '${key}' is not declared by the action's input schema.`, path: `args.${key}` };
    }
    if (Object.hasOwn(fixedQuery, key)) {
      return { code: "INVALID_ACTION_INPUT", message: `Argument '${key}' collides with a fixed query parameter.`, path: `args.${key}` };
    }
  }
  const violation = validateDataAgainstSchema(definition.input, value, "args");
  if (violation === undefined) return undefined;
  return {
    code: "INVALID_ACTION_INPUT",
    message: violation.message,
    ...(violation.path !== undefined ? { path: violation.path } : {})
  };
}

/** Query-parameter coercion: scalars as text, structures as JSON. */
function coerce(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export interface BuiltRequest {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body?: string;
  /** Every secret value substituted — the redaction set for this execution. */
  secretValues: string[];
}

/**
 * Build the outbound request from the definition, the validated arguments
 * and the principal's secrets. GET sends arguments as query parameters;
 * POST sends a JSON body. Fixed `query`/`headers` values are literals or
 * secret references resolved here — an unknown secret stops the build.
 */
export function buildRequest(
  definition: HttpActionDefinition,
  args: Record<string, unknown>,
  resolveSecret: (name: string) => string | undefined
): BuiltRequest | ActionExecutionError {
  const url = new URL(definition.url);
  const headers: Record<string, string> = {};
  const secretValues: string[] = [];

  const resolve = (
    value: string | { secret: string },
    path: string
  ): string | ActionExecutionError => {
    if (typeof value === "string") return value;
    const resolved = resolveSecret(value.secret);
    if (resolved === undefined) {
      return { code: "UNKNOWN_SECRET", message: `Unknown secret '${value.secret}'.`, path };
    }
    secretValues.push(resolved);
    return resolved;
  };

  // Arguments first, the author's fixed values LAST: whatever the frame
  // sends, a fixed query parameter or header is never overridden.
  let body: string | undefined;
  if (definition.method === "GET") {
    for (const [name, value] of Object.entries(args)) {
      const text = coerce(value);
      if (text !== undefined) url.searchParams.set(name, text);
    }
  } else {
    body = JSON.stringify(args);
  }
  for (const [name, value] of Object.entries(definition.query ?? {})) {
    const resolved = resolve(value, `query.${name}`);
    if (typeof resolved !== "string") return resolved;
    url.searchParams.set(name, resolved);
  }
  for (const [name, value] of Object.entries(definition.headers ?? {})) {
    const resolved = resolve(value, `headers.${name}`);
    if (typeof resolved !== "string") return resolved;
    headers[name] = resolved;
  }
  if (body !== undefined) {
    const hasContentType = Object.keys(headers).some(
      (name) => name.toLowerCase() === "content-type"
    );
    if (!hasContentType) headers["Content-Type"] = "application/json";
  }

  return {
    url: url.toString(),
    method: definition.method,
    headers,
    ...(body !== undefined ? { body } : {}),
    secretValues
  };
}

const INDEX = /^\d+$/;

/** Read a dotted path (`.` = the value itself). Own properties only; arrays by index only. */
export function getAtPath(value: unknown, path: string): unknown {
  if (path === ".") return value;
  let current = value;
  for (const segment of path.split(".")) {
    if (Array.isArray(current)) {
      current = INDEX.test(segment) ? current[Number(segment)] : undefined;
    } else if (isPlainObject(current) && Object.hasOwn(current, segment)) {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Copy-on-write set at a dotted path; intermediate objects are created.
 * Arrays accept index segments only — a named key on an array holder
 * leaves the target untouched rather than inventing a property.
 */
export function setAtPath(target: unknown, path: string, value: unknown): unknown {
  if (path === ".") return value;
  const segments = path.split(".");
  const copyOf = (node: unknown): Record<string, unknown> | unknown[] =>
    Array.isArray(node) ? [...node] : isPlainObject(node) ? { ...node } : {};
  const read = (holder: Record<string, unknown> | unknown[], key: string): unknown =>
    Array.isArray(holder) ? (INDEX.test(key) ? holder[Number(key)] : undefined) : Object.hasOwn(holder, key) ? holder[key] : undefined;
  const assign = (holder: Record<string, unknown> | unknown[], key: string, entry: unknown): boolean => {
    if (Array.isArray(holder)) {
      if (!INDEX.test(key)) return false;
      holder[Number(key)] = entry;
      return true;
    }
    Object.defineProperty(holder, key, { value: entry, enumerable: true, writable: true, configurable: true });
    return true;
  };
  const root = copyOf(target);
  let cursor = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i] as string;
    const copy = copyOf(read(cursor, key));
    if (!assign(cursor, key, copy)) return target;
    cursor = copy;
  }
  return assign(cursor, segments[segments.length - 1] as string, value) ? root : target;
}

/**
 * Fold a response into widget data: validate it against the output schema,
 * project it through `map` when present, then apply the mode — `replace`,
 * `merge` (shallow, the default) or `patch` at `path`. The caller
 * re-validates the resulting payload as a whole.
 */
export function applyOutput(
  definition: HttpActionDefinition,
  output: OutputBinding | undefined,
  data: unknown,
  response: unknown
): { ok: true; data: unknown } | { ok: false; error: ActionExecutionError } {
  const violation = validateDataAgainstSchema(definition.output, response, "response");
  if (violation !== undefined) {
    return {
      ok: false,
      error: {
        code: "INVALID_ACTION_OUTPUT",
        message: violation.message,
        ...(violation.path !== undefined ? { path: violation.path } : {})
      }
    };
  }
  let projected: unknown = response;
  if (output?.map !== undefined) {
    // "." as the target means the projection IS that source value (the
    // common "take this sub-object" case) and is valid only alone —
    // validation enforces it; other targets build an object.
    const whole = output.map["."];
    if (whole !== undefined) {
      projected = getAtPath(response, whole);
    } else {
      let built: unknown = {};
      for (const [target, source] of Object.entries(output.map)) {
        built = setAtPath(built, target, getAtPath(response, source));
      }
      projected = built;
    }
  }
  const mode = output?.mode ?? "merge";
  if (mode === "replace") return { ok: true, data: projected };
  if (mode === "patch") {
    const path = output?.path ?? "";
    if (path === "") return { ok: true, data: projected };
    return { ok: true, data: setAtPath(data, path, projected) };
  }
  // merge is a shallow object merge; anything else is an output failure,
  // not a silent replace.
  if (!isPlainObject(data) || !isPlainObject(projected)) {
    return {
      ok: false,
      error: {
        code: "INVALID_ACTION_OUTPUT",
        message: "merge needs an object response and object data (use replace or patch otherwise).",
        path: "response"
      }
    };
  }
  return { ok: true, data: { ...data, ...projected } };
}
