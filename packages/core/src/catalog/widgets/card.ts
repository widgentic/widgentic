import type { WidgetPayload } from "../../contract/types.js";
import type { WidgetNode } from "../node.js";
import { el } from "../node.js";
import { applyPattern, formatValue, isPlainObject, labelFor, linkOrText } from "./format.js";
import { imageNode, resolveImage } from "./images.js";

/**
 * `card` renderer.
 *
 * Uses `data.title`/`data.subtitle`/`data.fields` when present; other
 * plain-object entries become field key/value pairs; primitives and `null`
 * render as a single value line. `meta.title`/`meta.subtitle` fill in when
 * `data` does not provide them. `hints.fields`, an array of keys, chooses
 * the fields and their order (missing keys skipped, repeats rendered once);
 * without it fields follow data order. A field shows its `hints.labels`
 * entry, or its key; every other hint still addresses it by key. Total:
 * never throws.
 */
export function renderCard(payload: WidgetPayload): WidgetNode {
  const { data, meta } = payload;
  const fieldFormat = isPlainObject(payload.hints?.fieldFormat)
    ? payload.hints.fieldFormat
    : undefined;

  let title: unknown;
  let subtitle: unknown;
  let fieldEntries: [string, unknown][] = [];
  let value: string | undefined;

  if (isPlainObject(data)) {
    title = data.title;
    subtitle = data.subtitle;
    if (isPlainObject(data.fields)) {
      fieldEntries = Object.entries(data.fields);
    } else {
      fieldEntries = Object.entries(data).filter(
        ([key]) => key !== "title" && key !== "subtitle"
      );
    }
  } else {
    value = formatValue(data);
  }

  fieldEntries = orderFields(fieldEntries, payload.hints?.fields);

  if (title === undefined) title = meta?.title;
  if (subtitle === undefined) subtitle = meta?.subtitle;

  const children: WidgetNode[] = [];
  if (title !== undefined) {
    children.push(el("div", { class: "wg-card-title" }, [formatValue(title)]));
  }
  if (subtitle !== undefined) {
    children.push(
      el("div", { class: "wg-card-subtitle" }, [formatValue(subtitle)])
    );
  }
  if (value !== undefined) {
    children.push(el("div", { class: "wg-card-value" }, [value]));
  }
  if (fieldEntries.length > 0) {
    children.push(
      el(
        "dl",
        { class: "wg-card-fields" },
        fieldEntries.map(([key, fieldValue]) => {
          const label = labelFor(key, payload.hints);
          // Image treatment wins over fieldFormat for the same key.
          const image = resolveImage(key, fieldValue, payload.hints, "thumb");
          let display: WidgetNode;
          if (image) {
            display = imageNode(label, image.src, image.shape);
          } else {
            const raw = formatValue(fieldValue);
            const pattern = fieldFormat?.[key];
            const text =
              typeof pattern === "string" ? applyPattern(pattern, raw) : raw;
            display = linkOrText(key, fieldValue, payload.hints, text);
          }
          return el("div", { class: "wg-card-field" }, [
            el("dt", { class: "wg-card-field-key" }, [label]),
            el("dd", { class: "wg-card-field-value" }, [display])
          ]);
        })
      )
    );
  }
  return el("div", { class: "wg-card" }, children);
}

/**
 * The entries `order` lists, in its order: keys the data lacks are skipped
 * and a repeated key renders once. Object key order does not survive every
 * host's serializer, so an array is the only reliable order; anything else
 * leaves the data's own order.
 */
function orderFields(entries: [string, unknown][], order: unknown): [string, unknown][] {
  if (!Array.isArray(order) || !order.every((key): key is string => typeof key === "string")) return entries;
  const byKey = new Map(entries);
  const seen = new Set<string>();
  const ordered: [string, unknown][] = [];
  for (const key of order) {
    if (seen.has(key) || !byKey.has(key)) continue;
    seen.add(key);
    ordered.push([key, byKey.get(key)]);
  }
  return ordered;
}
