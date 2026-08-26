/**
 * The pure half of executing an http action: validate arguments, build the
 * outbound request, and fold a validated response back into widget data.
 * No I/O here — the server owns the fetch — so every rule is unit-testable
 * and the same code serves production execution and the designer's test
 * call.
 */
import { validateDataAgainstSchema } from "../catalog/index.js";
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Arguments must satisfy the action's input schema before any network activity. */
export function validateArgs(
  definition: HttpActionDefinition,
  args: unknown
): ActionExecutionError | undefined {
  const violation = validateDataAgainstSchema(definition.input, args ?? {}, "args");
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

  let body: string | undefined;
  if (definition.method === "GET") {
    for (const [name, value] of Object.entries(args)) {
      const text = coerce(value);
      if (text !== undefined) url.searchParams.set(name, text);
    }
  } else {
    body = JSON.stringify(args);
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

/** Read a dotted path (`.` = the value itself); arrays by index. */
export function getAtPath(value: unknown, path: string): unknown {
  return getPath(value, path);
}

/** Copy-on-write set at a dotted path; intermediate objects are created. */
export function setAtPath(target: unknown, path: string, value: unknown): unknown {
  return setPath(target, path, value);
}

function getPath(value: unknown, path: string): unknown {
  if (path === ".") return value;
  let current = value;
  for (const segment of path.split(".")) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      current = Number.isInteger(index) ? current[index] : undefined;
    } else if (isPlainObject(current)) {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

/** Copy-on-write set at a dotted path; intermediate objects are created. */
function setPath(target: unknown, path: string, value: unknown): unknown {
  if (path === ".") return value;
  const segments = path.split(".");
  const copyOf = (node: unknown): Record<string, unknown> | unknown[] =>
    Array.isArray(node) ? [...node] : isPlainObject(node) ? { ...node } : {};
  const assign = (holder: Record<string, unknown> | unknown[], key: string, entry: unknown): void => {
    if (Array.isArray(holder)) holder[Number(key)] = entry;
    else holder[key] = entry;
  };
  const read = (holder: Record<string, unknown> | unknown[], key: string): unknown =>
    Array.isArray(holder) ? holder[Number(key)] : holder[key];
  const root = copyOf(target);
  let cursor = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i] as string;
    const copy = copyOf(read(cursor, key));
    assign(cursor, key, copy);
    cursor = copy;
  }
  assign(cursor, segments[segments.length - 1] as string, value);
  return root;
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
    // common "take this sub-object" case); other targets build an object.
    const whole = output.map["."];
    if (whole !== undefined && Object.keys(output.map).length === 1) {
      projected = getPath(response, whole);
    } else {
      let built: unknown = {};
      for (const [target, source] of Object.entries(output.map)) {
        built = target === "." ? getPath(response, source) : setPath(built, target, getPath(response, source));
      }
      projected = built;
    }
  }
  const mode = output?.mode ?? "merge";
  if (mode === "replace") return { ok: true, data: projected };
  if (mode === "patch") {
    const path = output?.path ?? "";
    if (path === "") return { ok: true, data: projected };
    return { ok: true, data: setPath(data, path, projected) };
  }
  if (isPlainObject(data) && isPlainObject(projected)) {
    return { ok: true, data: { ...data, ...projected } };
  }
  return { ok: true, data: projected };
}
