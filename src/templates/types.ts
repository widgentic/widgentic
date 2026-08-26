/**
 * The widget template DSL: JSON-serializable structure + data placeholders.
 *
 * Templates are data, not code — storable, transmittable, and safe to
 * evaluate for untrusted authors (see guards.ts). Directive nodes are
 * discriminated by their unique key (`bind` / `each` / `when`).
 */
import type { ActionBinding } from "../actions/types.js";

/**
 * Attribute value: literal string, a data binding, or a bind carrying one
 * attr-level transform. `map` lets a bound value SELECT an author-written
 * literal (data chooses, it never contributes characters — the safe route
 * to status→class styling); `prefix` glues an author literal in front of
 * the bound value (`mailto:`/`tel:` links), emitted only when the value
 * is non-empty. One transform per value — never both.
 */
export type TemplateAttrValue =
  | string
  | { bind: string }
  | { bind: string; map: Record<string, string>; default?: string }
  | { bind: string; prefix: string };

/** Renders the value at `bind` as text. */
export interface TemplateBind {
  bind: string;
}

/**
 * A structural element; attrs and children may contain bindings. An
 * `action` binding makes the element activatable: at render time it is
 * resolved into a `data-wg-action` descriptor (never a handler).
 */
export interface TemplateElement {
  tag: string;
  attrs?: Record<string, TemplateAttrValue>;
  children?: TemplateNode[];
  action?: ActionBinding;
}

/** Repeats `template` for each element of the array at `each`. */
export interface TemplateEach {
  each: string;
  template: TemplateNode;
  empty?: TemplateNode;
}

/** Renders `template` when the value at `when` is truthy, else `else`. */
export interface TemplateWhen {
  when: string;
  template: TemplateNode;
  else?: TemplateNode;
}

export type TemplateNode =
  | string
  | TemplateBind
  | TemplateElement
  | TemplateEach
  | TemplateWhen;

/** A widget template is a single root template node. */
export type WidgetTemplate = TemplateNode;

export type TemplateErrorCode =
  | "INVALID_TEMPLATE_NODE"
  | "INVALID_PATH"
  | "FORBIDDEN_ATTRIBUTE"
  | "TEMPLATE_TOO_DEEP"
  | "INVALID_ACTION"
  | "CONFLICTING_ATTRIBUTES";

/**
 * Structured validation error. `path` is the dotted location of the
 * offending node within the template ("" for the root), suitable for
 * inline highlighting in a designer UI.
 */
export interface TemplateError {
  code: TemplateErrorCode;
  message: string;
  path: string;
}
