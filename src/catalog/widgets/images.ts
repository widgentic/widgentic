import { isSafeImageSrc, looksLikeImageUrl } from "../../contract/urls.js";
import type { WidgetElementNode } from "../node.js";
import { el } from "../node.js";
import { isPlainObject } from "./format.js";

/** Image presentation variants; each maps to a `wg-img-<shape>` class. */
export type ImageShape = "avatar" | "thumb" | "hero";

const SHAPES = new Set<string>(["avatar", "thumb", "hero"]);

/**
 * Decide whether a card-field / table-cell value renders as an image.
 * `hints.images` (keyed by field/column name) overrides auto-detection:
 * a shape string forces that shape, `true` forces the context default,
 * `false` suppresses. Hints never bypass safety — an unsafe source always
 * renders as text (`null` here). Auto-detection requires the value to
 * self-identify as an image (`looksLikeImageUrl`).
 */
export function resolveImage(
  key: string,
  value: unknown,
  hints: Record<string, unknown> | undefined,
  defaultShape: ImageShape
): { src: string; shape: ImageShape } | null {
  if (typeof value !== "string") return null;
  const images = isPlainObject(hints?.images) ? hints.images : undefined;
  const hint = images?.[key];
  if (hint === false) return null;
  if (typeof hint === "string" && SHAPES.has(hint)) {
    return isSafeImageSrc(value)
      ? { src: value, shape: hint as ImageShape }
      : null;
  }
  if (hint === true) {
    return isSafeImageSrc(value) ? { src: value, shape: defaultShape } : null;
  }
  return looksLikeImageUrl(value) ? { src: value, shape: defaultShape } : null;
}

/** The standard image element: stable classes, key as alt, lazy loading. */
export function imageNode(
  key: string,
  src: string,
  shape: ImageShape
): WidgetElementNode {
  return el("img", {
    class: `wg-img wg-img-${shape}`,
    src,
    alt: key,
    loading: "lazy",
    decoding: "async"
  });
}
