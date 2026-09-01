import type { WidgetPayload } from "../contract/types.js";
import type {
  WidgetCatalog,
  WidgetDescriptorInput,
  WidgetElementNode,
  WidgetNode,
  WidgetNodeAttrs,
  WidgetRenderer
} from "../catalog/index.js";
import type {
  ActionBinding,
  ActionDefinition,
  ActionDescriptor,
  ActionDisabledReason
} from "../actions/types.js";
import { PROMPT_TEXT_MAX } from "../actions/types.js";
import type { WidgetTemplate } from "./types.js";
import {
  FORBIDDEN_ATTR,
  FORBIDDEN_TAGS,
  RESERVED_ATTR,
  URL_ATTRS,
  isSafeImageSrc,
  isSafeUrl
} from "./guards.js";
import { parsePath } from "./paths.js";
import { InvalidTemplateError, validateTemplate } from "./validate.js";
import { formatValue } from "../catalog/widgets/format.js";
import { formatBoundValue } from "../catalog/widgets/value-format.js";
import { isPlainObject } from "../shared/plain-object.js";

function join(path: string, segment: string): string {
  return path === "" ? segment : `${path}.${segment}`;
}

/**
 * One scope frame: the root frame holds `payload.data`; every `each`
 * pushes the current item with its position. `$parent` walks the stack,
 * `$root` reads the bottom, `$index` reads the top's position.
 */
interface Frame {
  scope: unknown;
  index?: number;
}

/**
 * Resolve a path against the scope chain (see paths.ts for the grammar).
 * Missing, non-traversable or malformed paths resolve to `undefined` —
 * never throws.
 */
function resolvePath(path: string, frames: Frame[], meta: unknown): unknown {
  const parsed = parsePath(path);
  if (parsed === undefined) return undefined;
  let current: unknown;
  if (parsed.base === "meta") {
    current = meta;
  } else if (parsed.base === "root") {
    current = frames[0]?.scope;
  } else {
    const depth = frames.length - 1 - parsed.up;
    if (depth < 0) return undefined;
    const frame = frames[depth];
    if (frame === undefined) return undefined;
    if (parsed.index) return frame.index;
    current = frame.scope;
  }
  for (const segment of parsed.segments) {
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
 * Interpretation budget. `each` multiplies template nodes by the length of
 * AGENT-supplied data, so template size bounds nothing on its own — a
 * stored template driven by a large payload could otherwise spend the
 * process. Counting work (nodes emitted, plus one unit per `each`
 * iteration so empty iterations are not free) rather than watching a
 * clock keeps the bound reproducible: the same template and data always
 * truncate at the same place.
 */
export const DEFAULT_MAX_NODES = 50_000;

interface Budget {
  remaining: number;
  truncated: boolean;
}

/** Render-time knowledge about actions the caller supplies. */
/** The compile options the action layer reads; the options object itself serves. */
type ActionContext = Pick<CompileOptions, "actions" | "httpDisabled" | "kind">;

/**
 * Resolve a binding into the descriptor an element carries. Everything the
 * bridge needs is decided here, in scope, at render time: the prompt's
 * text, the http arguments, and whether the action is available at all.
 */
function buildDescriptor(
  binding: ActionBinding,
  id: string,
  frames: Frame[],
  meta: unknown,
  ctx: ActionContext
): ActionDescriptor {
  const definition: ActionDefinition | undefined =
    "ref" in binding && typeof binding.ref === "string"
      ? ctx.actions?.(binding.ref)
      : "definition" in binding && isPlainObject(binding.definition)
        ? (binding.definition as ActionDefinition)
        : undefined;
  if (definition === undefined || (definition.kind !== "prompt" && definition.kind !== "http")) {
    const unresolved: ActionDescriptor = { id, disabled: "unresolved" };
    if (ctx.kind !== undefined) unresolved.widget = ctx.kind;
    return unresolved;
  }
  if (definition.kind === "prompt") {
    let text = "";
    const segments = Array.isArray(definition.text) ? definition.text : [];
    for (const segment of segments) {
      if (typeof segment === "string") text += segment;
      else if (isPlainObject(segment) && typeof segment.bind === "string") {
        text += formatValue(resolvePath(segment.bind, frames, meta));
      }
      if (text.length >= PROMPT_TEXT_MAX) break;
    }
    // Cap by code point so a surrogate pair is never split.
    const prompt: ActionDescriptor = { id, kind: "prompt", text: Array.from(text).slice(0, PROMPT_TEXT_MAX).join("") };
    if (ctx.kind !== undefined) prompt.widget = ctx.kind;
    return prompt;
  }
  const args: Record<string, unknown> = {};
  if (isPlainObject(binding.input)) {
    for (const [field, value] of Object.entries(binding.input)) {
      let resolved: unknown;
      if (typeof value === "string") resolved = resolvePath(value, frames, meta);
      else if (isPlainObject(value) && "const" in value) resolved = value.const;
      if (resolved !== undefined) args[field] = resolved;
    }
  }
  const descriptor: ActionDescriptor = { id, kind: "http", args };
  if (ctx.httpDisabled !== undefined) descriptor.disabled = ctx.httpDisabled;
  if (ctx.kind !== undefined) descriptor.widget = ctx.kind;
  return descriptor;
}

/**
 * Interpret a template node into zero or more render-tree nodes.
 * Lenient by design: validation is the strict layer, so unknown or
 * malformed forms render as nothing rather than throwing (defense in
 * depth for templates that bypassed validation). `tpath` is the node's
 * dotted position in the TEMPLATE (the validator's path convention) — the
 * identifier an action binding is known by.
 */
function interpretNode(
  node: unknown,
  frames: Frame[],
  meta: unknown,
  budget: Budget,
  tpath: string,
  ctx: ActionContext
): WidgetNode[] {
  if (budget.remaining <= 0) {
    budget.truncated = true;
    return [];
  }
  if (typeof node === "string") {
    budget.remaining--;
    return [node];
  }
  if (!isPlainObject(node)) return [];

  if (typeof node.bind === "string") {
    budget.remaining--;
    const resolved = resolvePath(node.bind, frames, meta);
    if (isPlainObject(node.map)) {
      // The value, as a string, SELECTS an authored label: a hit emits that
      // literal, a miss falls to `default` or empty text — data chooses
      // among the author's words and never contributes characters.
      const key = formatValue(resolved);
      const hit = Object.prototype.hasOwnProperty.call(node.map, key) ? node.map[key] : undefined;
      return [typeof hit === "string" ? hit : typeof node.default === "string" ? node.default : ""];
    }
    // The payload keeps the typed value; only the render gets the unit.
    // (`prefix` is an attribute-value transform and is ignored here.)
    return [formatBoundValue(resolved, node.format)];
  }

  if (typeof node.each === "string") {
    const value = resolvePath(node.each, frames, meta);
    const items = Array.isArray(value) ? value : [];
    if (items.length === 0) {
      return node.empty === undefined
        ? []
        : interpretNode(node.empty, frames, meta, budget, join(tpath, "empty"), ctx);
    }
    const out: WidgetNode[] = [];
    const itemPath = join(tpath, "template");
    for (let i = 0; i < items.length; i++) {
      if (budget.remaining <= 0) {
        budget.truncated = true;
        break;
      }
      budget.remaining--; // the iteration itself costs, even when it renders nothing
      frames.push({ scope: items[i], index: i });
      out.push(...interpretNode(node.template, frames, meta, budget, itemPath, ctx));
      frames.pop();
    }
    return out;
  }

  if (typeof node.when === "string") {
    const truthy = Boolean(resolvePath(node.when, frames, meta));
    const branch = truthy ? node.template : node.else;
    return branch === undefined
      ? []
      : interpretNode(branch, frames, meta, budget, join(tpath, truthy ? "template" : "else"), ctx);
  }

  if (typeof node.tag === "string" && node.tag.length > 0) {
    if (FORBIDDEN_TAGS.has(node.tag.toLowerCase())) return []; // active content never reaches a tree
    budget.remaining--;
    const attrs: WidgetNodeAttrs = {};
    if (isPlainObject(node.attrs)) {
      for (const [name, raw] of Object.entries(node.attrs)) {
        // Handlers are code; data-wg-* is the renderer's own vocabulary.
        if (FORBIDDEN_ATTR.test(name) || RESERVED_ATTR.test(name)) continue;
        let value: string | undefined;
        if (typeof raw === "string") {
          value = raw;
        } else if (isPlainObject(raw) && typeof raw.bind === "string") {
          const resolved = resolvePath(raw.bind, frames, meta);
          if (isPlainObject(raw.map)) {
            // The resolved value SELECTS a key; every emitted character
            // is an author-written literal. A miss falls to `default`,
            // or empty — an unanticipated status degrades, never breaks.
            const key = formatValue(resolved);
            const hit = Object.prototype.hasOwnProperty.call(raw.map, key)
              ? raw.map[key]
              : undefined;
            value =
              typeof hit === "string"
                ? hit
                : typeof raw.default === "string"
                  ? raw.default
                  : "";
          } else if (typeof raw.prefix === "string") {
            // The prefix is never emitted alone: no dead mailto: hrefs.
            // The composed value still faces the URL guard below.
            const text = formatValue(resolved);
            value = text === "" ? "" : raw.prefix + text;
          } else if (raw.format !== undefined) {
            // Formats produce TEXT; a URL attribute's scheme guard still
            // runs below, so a format can never build a scheme.
            value = formatBoundValue(resolved, raw.format);
          } else {
            value = formatValue(resolved);
          }
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
    if (isPlainObject(node.action)) {
      attrs["data-wg-action"] = JSON.stringify(
        buildDescriptor(node.action as ActionBinding, tpath, frames, meta, ctx)
      );
    }
    const children = Array.isArray(node.children)
      ? node.children.flatMap((child, i) =>
          interpretNode(child, frames, meta, budget, join(tpath, `children.${i}`), ctx)
        )
      : [];
    const element: WidgetElementNode = { tag: node.tag };
    if (Object.keys(attrs).length > 0) element.attrs = attrs;
    if (children.length > 0) element.children = children;
    return [element];
  }

  return [];
}

/** Count the nodes a template's STRUCTURE contains (not its output). */
export function countTemplateNodes(template: unknown): number {
  if (typeof template === "string") return 1;
  if (!isPlainObject(template)) return 0;
  if (typeof template.bind === "string") return 1;
  let total = 1;
  for (const key of ["template", "empty", "else"] as const) {
    if (template[key] !== undefined) total += countTemplateNodes(template[key]);
  }
  if (Array.isArray(template.children)) {
    for (const child of template.children) total += countTemplateNodes(child);
  }
  return total;
}

export interface CompileOptions {
  /** Node budget for one render (default {@link DEFAULT_MAX_NODES}). */
  maxNodes?: number;
  /**
   * Resolve `{ ref }` action bindings to their definitions (the
   * principal's shared actions). Unresolvable refs render disabled.
   */
  actions?: (ref: string) => ActionDefinition | undefined;
  /**
   * Render every http action disabled with this reason — the server sets
   * `"scope"` when the caller's key cannot execute.
   */
  httpDisabled?: ActionDisabledReason;
  /** The kind this template is registered as — stamped into descriptors. */
  kind?: string;
}

/**
 * Compile a template into an ordinary widget renderer. The renderer is pure
 * and total; when the root interprets to anything other than exactly one
 * node, the output is wrapped in a `div.wg-template`. Renders are bounded
 * by a node budget — an exhausted budget stops interpretation and marks
 * the output with `data-truncated`, so the outcome is visible rather than
 * silently short.
 */
export function compileTemplate(
  template: WidgetTemplate,
  options: CompileOptions = {}
): WidgetRenderer {
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const ctx: ActionContext = options;
  return (payload: WidgetPayload): WidgetNode => {
    const budget: Budget = { remaining: maxNodes, truncated: false };
    const frames: Frame[] = [{ scope: payload.data }];
    const nodes = interpretNode(template, frames, payload.meta, budget, "", ctx);
    if (!budget.truncated && nodes.length === 1) {
      const only = nodes[0];
      if (only !== undefined) return only;
    }
    const attrs: WidgetNodeAttrs = { class: "wg-template" };
    if (budget.truncated) attrs["data-truncated"] = "true";
    return { tag: "div", attrs, children: nodes };
  };
}

/**
 * Resolve a binding outside the tree — the widget-level `load` binding,
 * whose descriptor rides `structuredContent.load` rather than an element.
 * Resolved against the payload's root scope.
 */
export function resolveActionDescriptor(
  binding: ActionBinding,
  id: string,
  payload: WidgetPayload,
  options: Pick<CompileOptions, "actions" | "httpDisabled" | "kind"> = {}
): ActionDescriptor {
  const ctx: ActionContext = options;
  return buildDescriptor(binding, id, [{ scope: payload.data }], payload.meta, ctx);
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
  descriptor?: WidgetDescriptorInput,
  options?: CompileOptions
): void {
  const validated = validateTemplate(template);
  if (!validated.ok) {
    throw new InvalidTemplateError(kind, validated.error);
  }
  catalog.register(kind, compileTemplate(validated.template, { ...options, kind }), descriptor);
}
