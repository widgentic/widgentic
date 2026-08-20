/**
 * The rules every stored entry must satisfy — applied on write AND on
 * read. The second pass is not redundant: a store is editable out of band
 * (a file, another process, a future adapter), so loaded data is untrusted
 * input like any other.
 */
import { createCatalog } from "widgentic/catalog";
import { countTemplateNodes, validateTemplate } from "widgentic/templates";
import { createThemeRegistry, validateTheme } from "widgentic/theming";
import type { ThemeEntry } from "widgentic/theming";
import type { StoreLimits, StoredSchema, StoredWidget } from "./types.js";
import { DEFAULT_LIMITS } from "./types.js";

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
    | "UNKNOWN_SCHEMA"
    | "SCHEMA_IN_USE"
    | "TOO_LARGE"
    | "TOO_MANY_NODES";
  message: string;
}

/**
 * One identifier charset for every adapter: the file store's path guard.
 * Backends encode identifiers differently (the Cosmos adapter embeds them
 * in document ids, where `/ \ # ?` are illegal); enforcing the rule at the
 * port means memory, file, and Cosmos accept and reject identically.
 */
export const SAFE_IDENTIFIER = /^[a-zA-Z0-9._-]+$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function serializedBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
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
