/**
 * The rules every stored entry must satisfy — applied on write AND on
 * read. The second pass is not redundant: a store is editable out of band
 * (a file, another process, a future adapter), so loaded data is untrusted
 * input like any other.
 */
import { createCatalog } from "@widgentic/core";
import { countTemplateNodes, validateTemplate, parsePath } from "@widgentic/core";
import { ACTION_NAME, validateActionDefinition, validateLoadBinding } from "@widgentic/core";
import { createThemeRegistry, isSafeTokenValue, isStyleMap, validateTheme } from "@widgentic/core";
import type { ThemeEntry } from "@widgentic/core";
import type { StoredSchema, StoredWidget } from "./types.js";
import type { StoreLimits } from "./limits.js";
import { DEFAULT_LIMITS, SAFE_IDENTIFIER } from "./limits.js";
import { isPlainObject } from "@widgentic/core";

/** Kind names the built-ins own; a stored widget may never shadow them. */
const BUILTIN_KINDS: ReadonlySet<string> = new Set(createCatalog().kinds());

/**
 * Theme names the registry pre-registers. Derived, not restated, so the
 * two cannot drift. Without this check a theme named `dark` passed
 * validation, then failed `registry.register` during composition and was
 * swallowed into a diagnostic — the caller was told it saved while the
 * entry was unreachable everywhere (observed live at v24).
 */
const BUILTIN_THEMES: ReadonlySet<string> = new Set(
  createThemeRegistry()
    .list()
    .map((entry) => entry.name)
);

export interface EntryProblem {
  code:
    | "INVALID_SHAPE"
    | "INVALID_IDENTIFIER"
    | "RESERVED_KIND"
    | "RESERVED_THEME"
    | "INVALID_TEMPLATE"
    | "INVALID_THEME"
    | "INVALID_ACTION"
    | "TOO_LARGE"
    | "TOO_MANY_NODES";
  message: string;
}

export { SAFE_IDENTIFIER };

/**
 * UTF-8 length counted by code point, so the limit holds without Node's
 * `Buffer` (the host bundle runs these checks in engines that have none).
 * A lone surrogate counts 3, as its U+FFFD replacement encodes.
 */
function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

function serializedBytes(value: unknown): number {
  try {
    return utf8ByteLength(JSON.stringify(value) ?? "");
  } catch {
    return Number.POSITIVE_INFINITY; // unserializable is over any limit
  }
}

/** Check a widget entry. `undefined` means acceptable. */
export function checkStoredWidget(
  entry: unknown,
  limits: StoreLimits = DEFAULT_LIMITS
): EntryProblem | undefined {
  if (!isPlainObject(entry)) {
    return { code: "INVALID_SHAPE", message: "Widget entry must be an object." };
  }
  const kind = entry.kind;
  if (typeof kind !== "string" || kind.trim() === "") {
    return { code: "INVALID_SHAPE", message: "'kind' must be a non-empty string." };
  }
  if (!SAFE_IDENTIFIER.test(kind)) {
    return {
      code: "INVALID_IDENTIFIER",
      message: `'${kind}' is not a valid kind: use letters, digits, '.', '_' or '-'.`
    };
  }
  // Shadowing a built-in would let a stored template capture renders the
  // agent believes are going to the built-in kind.
  if (BUILTIN_KINDS.has(kind)) {
    return {
      code: "RESERVED_KIND",
      message: `'${kind}' is a built-in kind and cannot be overridden.`
    };
  }
  if (!isPlainObject(entry.descriptor) || typeof entry.descriptor.description !== "string") {
    return {
      code: "INVALID_SHAPE",
      message: "'descriptor.description' must be a string."
    };
  }
  // Shared-schema references: a ref REPLACES the inline schema. Both at
  // once would leave two sources of truth disagreeing silently.
  const ref = entry.descriptor.dataSchemaRef;
  if (ref !== undefined) {
    if (typeof ref !== "string" || !SAFE_IDENTIFIER.test(ref)) {
      return {
        code: "INVALID_SHAPE",
        message: "'descriptor.dataSchemaRef' must be a valid schema name."
      };
    }
    if (entry.descriptor.dataSchema !== undefined) {
      return {
        code: "INVALID_SHAPE",
        message:
          "A descriptor carries 'dataSchema' OR 'dataSchemaRef', never both."
      };
    }
  }
  const template = validateTemplate(entry.template);
  if (!template.ok) {
    return {
      code: "INVALID_TEMPLATE",
      message: `${template.error.code} — ${template.error.message}`
    };
  }
  // `load` is an http GET binding run once per widget instance; shared
  // refs are resolved at composition, so only the shape is checked here.
  if (entry.load !== undefined) {
    const loadError = validateLoadBinding(entry.load, "load", {
      isPath: (value) => parsePath(value) !== undefined
    });
    if (loadError) {
      return {
        code: "INVALID_TEMPLATE",
        message: `${loadError.code} — ${loadError.message} (at ${loadError.path})`
      };
    }
  }
  const bytes = serializedBytes(entry);
  if (bytes > limits.maxEntryBytes) {
    return {
      code: "TOO_LARGE",
      message: `entry is ${bytes} bytes, over the ${limits.maxEntryBytes} limit.`
    };
  }
  const nodes = countTemplateNodes(entry.template);
  if (nodes > limits.maxTemplateNodes) {
    return {
      code: "TOO_MANY_NODES",
      message: `template has ${nodes} nodes, over the ${limits.maxTemplateNodes} limit.`
    };
  }
  return undefined;
}

/** A raw theme entry's name for a diagnostic, whatever shape it arrived in. */
export function themeName(entry: unknown): string {
  return isPlainObject(entry) && typeof entry.name === "string" ? entry.name : "(unnamed)";
}

/**
 * Read-side seam for themes stored under looser token rules: a token value
 * today's guard refuses (a comment, a backslash, an unclosed bracket, a
 * URL-carrying call) is dropped from the entry with a report naming it,
 * instead of the whole theme vanishing from lists, renders and defaults.
 * Writes still refuse such values; the stored document is left as it is.
 */
export function normalizeStoredTheme(entry: unknown, report: (line: string) => void): unknown {
  if (!isPlainObject(entry) || !isPlainObject(entry.tokens)) return entry;
  let tokens: Record<string, unknown> | undefined;
  for (const [token, value] of Object.entries(entry.tokens)) {
    if (typeof value === "string" && !isSafeTokenValue(value)) {
      tokens ??= { ...entry.tokens };
      delete tokens[token];
      report(`theme '${themeName(entry)}': token '${token}' dropped on read; its stored value breaks the token rules.`);
    }
  }
  return tokens === undefined ? entry : { ...entry, tokens };
}

/** Check a theme entry. `undefined` means acceptable. */
export function checkStoredTheme(
  entry: unknown,
  limits: StoreLimits = DEFAULT_LIMITS
): EntryProblem | undefined {
  if (!isPlainObject(entry)) {
    return { code: "INVALID_SHAPE", message: "Theme entry must be an object." };
  }
  if (typeof entry.name !== "string" || entry.name.trim() === "") {
    return { code: "INVALID_SHAPE", message: "'name' must be a non-empty string." };
  }
  if (!SAFE_IDENTIFIER.test(entry.name)) {
    return {
      code: "INVALID_IDENTIFIER",
      message: `'${entry.name}' is not a valid theme name: use letters, digits, '.', '_' or '-'.`
    };
  }
  if (BUILTIN_THEMES.has(entry.name)) {
    return {
      code: "RESERVED_THEME",
      message: `'${entry.name}' is a built-in theme and cannot be overridden.`
    };
  }
  const theme = validateTheme(entry.tokens ?? {});
  if (!theme.ok) {
    return {
      code: "INVALID_THEME",
      message: `${theme.error.code} — ${theme.error.message}`
    };
  }
  // Shape only, as for a widget's styles: unsafe entries inside a
  // well-shaped map are stored and dropped when CSS is generated.
  if (entry.styles !== undefined && !isStyleMap(entry.styles)) {
    return {
      code: "INVALID_THEME",
      message: "'styles' must map selectors to objects of property/value strings."
    };
  }
  const bytes = serializedBytes(entry);
  if (bytes > limits.maxEntryBytes) {
    return {
      code: "TOO_LARGE",
      message: `entry is ${bytes} bytes, over the ${limits.maxEntryBytes} limit.`
    };
  }
  return undefined;
}

/**
 * Check a shared-schema entry. `undefined` means acceptable. Deliberately
 * shallow on the schema body: the JSON-Schema subset is lenient downstream
 * (unknown keywords ignored), and a stricter gate here would make the
 * store the only place rejecting what the renderer tolerates.
 */
export function checkStoredSchema(
  entry: unknown,
  limits: StoreLimits = DEFAULT_LIMITS
): EntryProblem | undefined {
  if (!isPlainObject(entry)) {
    return { code: "INVALID_SHAPE", message: "Schema entry must be an object." };
  }
  if (typeof entry.name !== "string" || entry.name.trim() === "") {
    return { code: "INVALID_SHAPE", message: "'name' must be a non-empty string." };
  }
  if (!SAFE_IDENTIFIER.test(entry.name)) {
    return {
      code: "INVALID_IDENTIFIER",
      message: `'${entry.name}' is not a valid schema name: use letters, digits, '.', '_' or '-'.`
    };
  }
  if (!isPlainObject(entry.schema)) {
    return { code: "INVALID_SHAPE", message: "'schema' must be a plain object." };
  }
  const bytes = serializedBytes(entry);
  if (bytes > limits.maxEntryBytes) {
    return {
      code: "TOO_LARGE",
      message: `entry is ${bytes} bytes, over the ${limits.maxEntryBytes} limit.`
    };
  }
  return undefined;
}

export type { StoredSchema, StoredWidget, ThemeEntry };

/** Check a shared action entry. `undefined` means acceptable. */
export function checkStoredAction(
  entry: unknown,
  limits: StoreLimits = DEFAULT_LIMITS
): EntryProblem | undefined {
  if (!isPlainObject(entry)) {
    return { code: "INVALID_SHAPE", message: "Action entry must be an object." };
  }
  const name = entry.name;
  if (typeof name !== "string" || !ACTION_NAME.test(name)) {
    return {
      code: "INVALID_IDENTIFIER",
      message: "'name' must be lowercase letters, digits and dashes, starting with a letter (max 64)."
    };
  }
  for (const field of ["label", "description"] as const) {
    if (entry[field] !== undefined && typeof entry[field] !== "string") {
      return { code: "INVALID_SHAPE", message: `'${field}' must be a string when present.` };
    }
  }
  const problem = validateActionDefinition(entry.definition, "definition", {
    isPath: (value) => parsePath(value) !== undefined
  });
  if (problem) {
    return { code: "INVALID_ACTION", message: `${problem.message} (at ${problem.path})` };
  }
  const bytes = serializedBytes(entry);
  if (bytes > limits.maxEntryBytes) {
    return {
      code: "TOO_LARGE",
      message: `entry is ${bytes} bytes, over the ${limits.maxEntryBytes} limit.`
    };
  }
  return undefined;
}
