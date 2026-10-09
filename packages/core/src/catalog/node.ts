/**
 * Pure render tree produced by widget renderers.
 *
 * Plain, JSON-serializable data — no DOM or framework types — so renderers
 * are testable anywhere and the output layers (`renderToHtml`, `mountNode`)
 * stay thin and swappable. There is deliberately no raw-HTML node type: all
 * text is escaped at the output boundary. An element's optional `key` names
 * it among its siblings for keyed in-place patching; it is render-tree data
 * only, and no output layer emits it.
 */
import type { WidgetPayload } from "../contract/types.js";

/** Attribute map. Values are plain strings (escaped by output layers). */
export type WidgetNodeAttrs = Record<string, string>;

/** A tagged element in the render tree. */
export interface WidgetElementNode {
  tag: string;
  attrs?: WidgetNodeAttrs;
  children?: WidgetNode[];
  /** Identity among siblings for keyed patching; never serialized. */
  key?: string;
}

/** An element in the render tree: a text node or a tagged element. */
export type WidgetNode = string | WidgetElementNode;

/** A widget renderer: pure function from payload to render tree. */
export type WidgetRenderer = (payload: WidgetPayload) => WidgetNode;

/** Convenience node constructor (omits empty attrs/children and an absent key). */
export function el(
  tag: string,
  attrs?: WidgetNodeAttrs,
  children?: WidgetNode[],
  key?: string
): WidgetElementNode {
  const node: WidgetElementNode = { tag };
  if (attrs && Object.keys(attrs).length > 0) node.attrs = attrs;
  if (children && children.length > 0) node.children = children;
  if (key !== undefined) node.key = key;
  return node;
}
