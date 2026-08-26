import type {
  ActionBinding,
  ActionDefinition,
  ActionError,
  HttpActionDefinition
} from "./types.js";
import {
  HTTP_METHODS,
  OUTPUT_MODES,
  PROMPT_TEXT_MAX,
  SECRET_NAME
} from "./types.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function join(path: string, segment: string): string {
  return path === "" ? segment : `${path}.${segment}`;
}

function fail(message: string, path: string): ActionError {
  return { code: "INVALID_ACTION", message, path };
}

/** A header/query value: literal string or `{ secret: name }`. */
function checkHeaderValue(value: unknown, path: string): ActionError | undefined {
  if (typeof value === "string") return undefined;
  if (isPlainObject(value) && typeof value.secret === "string") {
    if (!SECRET_NAME.test(value.secret)) {
      return fail(`Secret reference '${value.secret}' is not a valid secret name.`, path);
    }
    if (Object.keys(value).length !== 1) {
      return fail("A secret reference carries only 'secret'.", path);
    }
    return undefined;
  }
  return fail("Value must be a string or a { secret } reference.", path);
}

/** Does any nested value look like a secret reference? */
function containsSecretRef(value: unknown): boolean {
  if (!isPlainObject(value) && !Array.isArray(value)) return false;
  if (isPlainObject(value) && typeof value.secret === "string") return true;
  const entries = Array.isArray(value) ? value : Object.values(value);
  return entries.some(containsSecretRef);
}

function checkUrl(url: unknown, path: string): ActionError | undefined {
  if (typeof url !== "string" || url.length === 0) {
    return fail("'url' must be a non-empty string.", path);
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return fail(`'url' must be an absolute URL (got '${url}').`, path);
  }
  if (parsed.protocol !== "https:") return fail("'url' must use https.", path);
  if (parsed.username !== "" || parsed.password !== "") {
    return fail("'url' must not carry userinfo.", path);
  }
  if (parsed.hash !== "") return fail("'url' must not carry a fragment.", path);
  return undefined;
}

/**
 * Validate an action definition. `path` locates it for the caller (an
 * element's `action`, a stored action's `definition`). Never throws.
 */
export function validateActionDefinition(
  input: unknown,
  path = ""
): ActionError | undefined {
  if (!isPlainObject(input)) return fail("Action definition must be an object.", path);
  if (input.kind === "prompt") {
    if (!Array.isArray(input.text)) {
      return fail("'text' must be an array of literals and { bind } segments.", join(path, "text"));
    }
    let literal = 0;
    for (let i = 0; i < input.text.length; i++) {
      const segment = input.text[i];
      if (typeof segment === "string") {
        literal += segment.length;
        continue;
      }
      if (isPlainObject(segment) && typeof segment.bind === "string" && Object.keys(segment).length === 1) {
        continue;
      }
      return fail("Prompt segments are strings or { bind } objects.", join(path, `text.${i}`));
    }
    if (literal > PROMPT_TEXT_MAX) {
      return fail(`Prompt text exceeds ${PROMPT_TEXT_MAX} characters.`, join(path, "text"));
    }
    return undefined;
  }
  if (input.kind === "http") {
    if (!HTTP_METHODS.includes(input.method as never)) {
      return fail("'method' must be GET or POST.", join(path, "method"));
    }
    const urlError = checkUrl(input.url, join(path, "url"));
    if (urlError) return urlError;
    if (!isPlainObject(input.input) || input.input.type !== "object") {
      return fail("'input' must be a JSON Schema with type \"object\".", join(path, "input"));
    }
    if (containsSecretRef(input.input)) {
      return fail("Secret references are allowed only in headers and query.", join(path, "input"));
    }
    if (!isPlainObject(input.output)) {
      return fail("'output' must be a JSON Schema object.", join(path, "output"));
    }
    for (const field of ["headers", "query"] as const) {
      const map = input[field];
      if (map === undefined) continue;
      if (!isPlainObject(map)) return fail(`'${field}' must be an object.`, join(path, field));
      for (const [name, value] of Object.entries(map)) {
        const error = checkHeaderValue(value, join(path, `${field}.${name}`));
        if (error) return error;
      }
    }
    return undefined;
  }
  return fail("'kind' must be \"prompt\" or \"http\".", join(path, "kind"));
}

export interface BindingCheckOptions {
  /** Path-syntax check supplied by the template layer (owner of the grammar). */
  isPath?: (path: string) => boolean;
  /** Resolve a `ref` to its definition when the caller knows the catalog. */
  resolve?: (ref: string) => ActionDefinition | undefined;
  /** `load` bindings: http GET only. */
  loadOnly?: boolean;
}

function definitionOf(
  binding: Record<string, unknown>,
  options: BindingCheckOptions
): ActionDefinition | undefined {
  if (typeof binding.ref === "string") return options.resolve?.(binding.ref);
  return binding.definition as ActionDefinition | undefined;
}

/**
 * Validate a binding: `{ ref }` or an inline definition, plus `input` and
 * `output`. When the definition is known (inline, or resolved through
 * `options.resolve`), input keys are checked against its input schema and
 * `load` bindings are held to http GET. Never throws.
 */
export function validateActionBinding(
  input: unknown,
  path = "",
  options: BindingCheckOptions = {}
): ActionError | undefined {
  if (!isPlainObject(input)) return fail("Action binding must be an object.", path);
  const hasRef = "ref" in input;
  if (hasRef) {
    if (typeof input.ref !== "string" || input.ref.length === 0) {
      return fail("'ref' must name a shared action.", join(path, "ref"));
    }
    if ("definition" in input) return fail("A binding is either a { ref } or a { definition }, not both.", path);
    if (options.resolve && options.resolve(input.ref) === undefined) {
      return fail(`Unknown action '${input.ref}'.`, join(path, "ref"));
    }
  } else if ("definition" in input) {
    const definitionError = validateActionDefinition(input.definition, join(path, "definition"));
    if (definitionError) return definitionError;
  } else {
    return fail("A binding names a shared action ({ ref }) or carries an inline { definition }.", path);
  }
  const definition = definitionOf(input, options);

  if (options.loadOnly && definition !== undefined) {
    if (definition.kind !== "http" || definition.method !== "GET") {
      return fail("'load' accepts only http GET actions.", path);
    }
  }

  if (input.input !== undefined) {
    if (!isPlainObject(input.input)) return fail("'input' must be an object.", join(path, "input"));
    if (definition?.kind === "prompt") {
      return fail("Prompt actions take no input mapping.", join(path, "input"));
    }
    const declared = definition?.kind === "http" && isPlainObject((definition as HttpActionDefinition).input.properties)
      ? (definition as HttpActionDefinition).input.properties as Record<string, unknown>
      : undefined;
    for (const [field, value] of Object.entries(input.input)) {
      const fieldPath = join(path, `input.${field}`);
      if (declared !== undefined && !(field in declared)) {
        return fail(`Input field '${field}' is not declared by the action's input schema.`, fieldPath);
      }
      if (typeof value === "string") {
        if (options.isPath && !options.isPath(value)) {
          return fail(`Invalid data path '${value}'.`, fieldPath);
        }
        continue;
      }
      if (isPlainObject(value) && "const" in value && Object.keys(value).length === 1) {
        if (containsSecretRef(value.const)) {
          return fail("Secret references are allowed only in headers and query.", fieldPath);
        }
        continue;
      }
      return fail("Input values are data paths or { const } literals.", fieldPath);
    }
  }

  if (input.output !== undefined) {
    const outPath = join(path, "output");
    if (!isPlainObject(input.output)) return fail("'output' must be an object.", outPath);
    if (definition?.kind === "prompt") return fail("Prompt actions have no output.", outPath);
    const { mode, path: target, map } = input.output;
    if (mode !== undefined && !OUTPUT_MODES.includes(mode as never)) {
      return fail("'mode' must be replace, merge or patch.", join(outPath, "mode"));
    }
    if (mode === "patch" && (typeof target !== "string" || target.length === 0)) {
      return fail("'patch' requires a data 'path'.", join(outPath, "path"));
    }
    if (target !== undefined && typeof target !== "string") {
      return fail("'path' must be a string.", join(outPath, "path"));
    }
    if (map !== undefined) {
      if (!isPlainObject(map) || Object.values(map).some((v) => typeof v !== "string")) {
        return fail("'map' must be an object of string paths.", join(outPath, "map"));
      }
    }
  }
  return undefined;
}

/** A widget's `load` binding: http GET only (see `BindingCheckOptions.loadOnly`). */
export function validateLoadBinding(
  input: unknown,
  path = "load",
  options: Omit<BindingCheckOptions, "loadOnly"> = {}
): ActionError | undefined {
  return validateActionBinding(input, path, { ...options, loadOnly: true });
}

/** Secret names an http definition references in its headers and query. */
export function collectSecretRefs(definition: unknown): string[] {
  if (!isPlainObject(definition) || definition.kind !== "http") return [];
  const names = new Set<string>();
  for (const field of ["headers", "query"] as const) {
    const map = definition[field];
    if (!isPlainObject(map)) continue;
    for (const value of Object.values(map)) {
      if (isPlainObject(value) && typeof value.secret === "string") names.add(value.secret);
    }
  }
  return [...names];
}
