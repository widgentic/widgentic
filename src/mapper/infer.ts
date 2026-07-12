/**
 * Shape inference for the widget mapper.
 *
 * Pure, synchronous, and total: every input maps to some widget kind. Only
 * the top level of `data` is inspected — a nested tree's root node already
 * carries `children`, and everything deeper is the renderer's concern.
 *
 * Precedence: tree → table → card (plain object) → card (fallback).
 */
import type { WidgetKind } from "../contract/types.js";

/** Same plain-object definition as the contract validator. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A tree node is a plain object with an array-valued `children` property. */
function isTreeNode(value: unknown): boolean {
  return isPlainObject(value) && Array.isArray(value.children);
}

/**
 * A records array maps to `table` when every element is a plain object and
 * either there is a single element or all elements share at least one key
 * (tolerates optional fields). Single pass; exits early once the shared-key
 * intersection empties.
 */
function isRecordsArray(items: readonly unknown[]): boolean {
  let shared: Set<string> | undefined;
  for (const item of items) {
    if (!isPlainObject(item)) return false;
    if (shared === undefined) {
      shared = new Set(Object.keys(item));
    } else {
      for (const key of shared) {
        if (!(key in item)) shared.delete(key);
      }
    }
    if (items.length > 1 && shared.size === 0) return false;
  }
  return true;
}

/**
 * Choose a default widget kind from the shape of `data`.
 *
 * - tree: a tree node, or a non-empty array in which every element is one
 * - table: a non-empty records array (see {@link isRecordsArray})
 * - card: plain objects and every ambiguous shape (primitives, `null`,
 *   empty arrays, mixed arrays, ...)
 */
export function inferKind(data: unknown): WidgetKind {
  if (isTreeNode(data)) return "tree";
  if (Array.isArray(data) && data.length > 0) {
    if (data.every(isTreeNode)) return "tree";
    if (isRecordsArray(data)) return "table";
  }
  return "card";
}
