import type { WidgetPayload } from "../contract/types.js";
import type {
  WidgetCatalog,
  WidgetDescriptorInput,
  WidgetElementNode,
  WidgetNode,
  WidgetNodeAttrs,
  WidgetRenderer
} from "../catalog/index.js";
import type { WidgetTemplate } from "./types.js";
import {
  FORBIDDEN_ATTR,
  URL_ATTRS,
  isSafeImageSrc,
  isSafeUrl
} from "./guards.js";
import { InvalidTemplateError, validateTemplate } from "./validate.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Same display-text discipline as the catalog's built-in renderers. */
function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Resolve a dot path. Scope is `payload.data` (or the current `each` item);
 * "." is the scope itself; a "$meta." prefix reads from `payload.meta`.
 * Missing or non-traversable paths resolve to `undefined` — never throws.
 */
function resolvePath(path: string, scope: unknown, meta: unknown): unknown {
  if (path === ".") return scope;
  let current: unknown;
  let body: string;
  if (path.startsWith("$meta.")) {
    current = meta;
    body = path.slice("$meta.".length);
  } else {
    current = scope;
    body = path;
  }
  for (const segment of body.split(".")) {
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

/**
 * Interpret a template node into zero or more render-tree nodes.
 * Lenient by design: validation is the strict layer, so unknown or
 * malformed forms render as nothing rather than throwing (defense in
 * depth for templates that bypassed validation).
 */
function interpretNode(node: unknown, scope: unknown, meta: unknown): WidgetNode[] {
  if (typeof node === "string") return [node];
  if (!isPlainObject(node)) return [];

  if (typeof node.bind === "string") {
    return [formatValue(resolvePath(node.bind, scope, meta))];
  }

  if (typeof node.each === "string") {
    const value = resolvePath(node.each, scope, meta);
    const items = Array.isArray(value) ? value : [];
    if (items.length === 0) {
      return node.empty === undefined
        ? []
        : interpretNode(node.empty, scope, meta);
    }
    return items.flatMap((item) => interpretNode(node.template, item, meta));
  }

  if (typeof node.when === "string") {
    const branch = resolvePath(node.when, scope, meta)
      ? node.template
      : node.else;
    return branch === undefined ? [] : interpretNode(branch, scope, meta);
  }

  if (typeof node.tag === "string" && node.tag.length > 0) {
    const attrs: WidgetNodeAttrs = {};
    if (isPlainObject(node.attrs)) {
      for (const [name, raw] of Object.entries(node.attrs)) {
        if (FORBIDDEN_ATTR.test(name)) continue;
        let value: string | undefined;
        if (typeof raw === "string") {
          value = raw;
        } else if (isPlainObject(raw) && typeof raw.bind === "string") {
          value = formatValue(resolvePath(raw.bind, scope, meta));
        }
        if (value === undefined) continue;
        const lower = name.toLowerCase();
        if (URL_ATTRS.has(lower)) {
          // Image sources additionally accept data:image/*; every other
          // URL attribute keeps the strict scheme set (data-URI
          // navigation is an XSS vector; data-URI images are not).
          const imageContext = lower === "src" && node.tag.toLowerCase() === "img";
          const allowed =
            isSafeUrl(value) || (imageContext && isSafeImageSrc(value));
          if (!allowed) continue;
        }
        attrs[name] = value;
      }
    }
    const children = Array.isArray(node.children)
      ? node.children.flatMap((child) => interpretNode(child, scope, meta))
      : [];
    const element: WidgetElementNode = { tag: node.tag };
    if (Object.keys(attrs).length > 0) element.attrs = attrs;
    if (children.length > 0) element.children = children;
    return [element];
  }

  return [];
}

/**
 * Compile a template into an ordinary widget renderer. The renderer is pure
 * and total; when the root interprets to anything other than exactly one
 * node, the output is wrapped in a `div.wg-template`.
 */
export function compileTemplate(template: WidgetTemplate): WidgetRenderer {
  return (payload: WidgetPayload): WidgetNode => {
    const nodes = interpretNode(template, payload.data, payload.meta);
    if (nodes.length === 1) {
      const only = nodes[0];
      if (only !== undefined) return only;
    }
    return { tag: "div", attrs: { class: "wg-template" }, children: nodes };
  };
}

/**
 * Validate, compile, and register a template as a widget kind. Throws
 * {@link InvalidTemplateError} on invalid templates and the catalog's
 * `DuplicateKindError` on duplicate kinds — registration is host setup.
 */
export function registerTemplate(
  catalog: WidgetCatalog,
  kind: string,
  template: unknown,
  descriptor?: WidgetDescriptorInput
): void {
  const validated = validateTemplate(template);
  if (!validated.ok) {
    throw new InvalidTemplateError(kind, validated.error);
  }
  catalog.register(kind, compileTemplate(validated.template), descriptor);
}
