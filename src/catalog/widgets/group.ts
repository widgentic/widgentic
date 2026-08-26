/**
 * `group` built-in — several widgets in one render.
 *
 * The renderer here only builds the layout container; item rendering is
 * the catalog dispatch's job (items re-enter `catalog.render`, so
 * registered and composed kinds participate and per-item errors keep
 * their structured codes with `data.items[<i>]`-prefixed paths).
 */
import type { WidgetContractError } from "../../contract/errors.js";
import type { WidgetNode } from "../node.js";
import { el } from "../node.js";
import { isPlainObject } from "./format.js";

/** Hard cap on `data.items` — bounds total render work per call. */
export const GROUP_MAX_ITEMS = 20;

export const GROUP_LAYOUTS = ["stack", "row", "grid"] as const;
export const GROUP_GAPS = ["none", "sm", "md", "lg"] as const;
/** `columns` is clamped into this range (grid only). */
export const GROUP_MAX_COLUMNS = 4;

export interface GroupItem {
  kind: string;
  data: unknown;
  hints?: unknown;
  meta?: unknown;
}

export type GroupEnvelopeResult =
  | { ok: true; items: GroupItem[] }
  | { ok: false; error: WidgetContractError };

/**
 * Validate the group envelope: `data.items` is an array of sub-widget
 * objects with string kinds, no nested groups, within the item cap.
 * Item *content* is not judged here — each item faces the full contract
 * and schema validation when it re-enters the catalog.
 */
export function checkGroupEnvelope(data: unknown): GroupEnvelopeResult {
  if (!isPlainObject(data) || data.items === undefined) {
    return {
      ok: false,
      error: {
        code: "MISSING_FIELD",
        path: "data.items",
        message: "'group' data must be an object with an 'items' array."
      }
    };
  }
  const items = data.items;
  if (!Array.isArray(items)) {
    return {
      ok: false,
      error: {
        code: "INVALID_TYPE",
        path: "data.items",
        message: "'items' must be an array of sub-widgets."
      }
    };
  }
  if (items.length > GROUP_MAX_ITEMS) {
    return {
      ok: false,
      error: {
        code: "INVALID_TYPE",
        path: "data.items",
        message: `'items' holds ${items.length} sub-widgets; a group renders at most ${GROUP_MAX_ITEMS}.`
      }
    };
  }
  const checked: GroupItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const item: unknown = items[i];
    if (!isPlainObject(item)) {
      return {
        ok: false,
        error: {
          code: "INVALID_TYPE",
          path: `data.items[${i}]`,
          message: "each item must be an object: { kind, data, hints?, meta? }."
        }
      };
    }
    if (typeof item.kind !== "string" || item.kind === "") {
      return {
        ok: false,
        error: {
          code: "INVALID_TYPE",
          path: `data.items[${i}].kind`,
          message: "each item needs a widget kind (non-empty string)."
        }
      };
    }
    if (item.kind === "group") {
      return {
        ok: false,
        error: {
          code: "INVALID_TYPE",
          path: `data.items[${i}].kind`,
          message: "a 'group' cannot contain another 'group'."
        }
      };
    }
    const entry: GroupItem = { kind: item.kind, data: item.data };
    if (item.hints !== undefined) entry.hints = item.hints;
    if (item.meta !== undefined) entry.meta = item.meta;
    checked.push(entry);
  }
  return { ok: true, items: checked };
}

/**
 * Build the layout container. Hints only ever SELECT from the fixed
 * class names below — no hint or data value contributes characters to
 * the class list. Unknown values fall back to the defaults (hint
 * diagnostics, not renderers, tell the caller).
 */
export function renderGroupContainer(
  hints: unknown,
  children: WidgetNode[]
): WidgetNode {
  const h = isPlainObject(hints) ? hints : {};
  const layout = GROUP_LAYOUTS.some((known) => known === h.layout)
    ? (h.layout as string)
    : "stack";
  const gap = GROUP_GAPS.some((known) => known === h.gap)
    ? (h.gap as string)
    : "md";
  const classes = [`wg-group`, `wg-group-${layout}`, `wg-gap-${gap}`];
  if (layout === "grid") {
    const raw = typeof h.columns === "number" && Number.isFinite(h.columns) ? h.columns : 2;
    const columns = Math.min(GROUP_MAX_COLUMNS, Math.max(1, Math.trunc(raw)));
    classes.push(`wg-cols-${columns}`);
  }
  return el("div", { class: classes.join(" ") }, children);
}
