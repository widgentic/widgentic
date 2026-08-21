/** Shared helpers for the built-in renderers. */
import { isLinkableUrl } from "../../contract/urls.js";
import type { WidgetNode } from "../node.js";
import { el } from "../node.js";

/** Same plain-object definition as the contract validator. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Render any value as display text. Strings pass through; primitives
 * stringify; structured values fall back to compact JSON. Never throws.
 */
export function formatValue(value: unknown): string {
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

/** Apply a `fieldFormat` pattern: substitute `{value}`, or append when absent. */
export function applyPattern(pattern: string, value: string): string {
  return pattern.includes("{value}")
    ? pattern.split("{value}").join(value)
    : pattern + value;
}

/**
 * Wrap display text in an anchor when the caller opted this key into
 * `hints.links` AND the raw value is an explicitly-schemed safe URL.
 * Built-ins construct nodes directly (they never pass the template
 * compiler's URL guard), so the scheme check lives here — mirroring
 * `isSafeImageSrc` in the image path. Everything else stays plain text.
 */
export function linkOrText(
  key: string,
  raw: unknown,
  hints: unknown,
  display: string
): WidgetNode {
  const links =
    isPlainObject(hints) && isPlainObject(hints.links) ? hints.links : undefined;
  if (links?.[key] !== true || typeof raw !== "string" || !isLinkableUrl(raw)) {
    return display;
  }
  return el(
    "a",
    { class: "wg-link", href: raw, rel: "noopener noreferrer" },
    [display]
  );
}
