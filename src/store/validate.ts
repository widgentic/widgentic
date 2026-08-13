/**
 * The rules every stored entry must satisfy — applied on write AND on
 * read. The second pass is not redundant: a store is editable out of band
 * (a file, another process, a future adapter), so loaded data is untrusted
 * input like any other.
 */
import { createCatalog } from "widgentic/catalog";
import { countTemplateNodes, validateTemplate } from "widgentic/templates";
import { validateTheme } from "widgentic/theming";
import type { ThemeEntry } from "widgentic/theming";
import type { StoreLimits, StoredWidget } from "./types.js";
import { DEFAULT_LIMITS } from "./types.js";

/** Kind names the built-ins own; a stored widget may never shadow them. */
const BUILTIN_KINDS: ReadonlySet<string> = new Set(createCatalog().kinds());

export interface EntryProblem {
  code:
    | "INVALID_SHAPE"
    | "RESERVED_KIND"
    | "INVALID_TEMPLATE"
    | "INVALID_THEME"
    | "TOO_LARGE"
    | "TOO_MANY_NODES";
  message: string;
}

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

export type { StoredWidget, ThemeEntry };
