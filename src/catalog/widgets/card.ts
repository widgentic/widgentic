import type { WidgetPayload } from "../../contract/types.js";
import type { WidgetNode } from "../node.js";
import { el } from "../node.js";
import { formatValue, isPlainObject } from "./format.js";

/**
 * `card` renderer.
 *
 * Uses `data.title`/`data.subtitle`/`data.fields` when present; other
 * plain-object entries become field key/value pairs; primitives and `null`
 * render as a single value line. `meta.title`/`meta.subtitle` fill in when
 * `data` does not provide them. Total: never throws.
 */
export function renderCard(payload: WidgetPayload): WidgetNode {
  const { data, meta } = payload;

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
        fieldEntries.map(([key, fieldValue]) =>
          el("div", { class: "wg-card-field" }, [
            el("dt", { class: "wg-card-field-key" }, [key]),
            el("dd", { class: "wg-card-field-value" }, [formatValue(fieldValue)])
          ])
        )
      )
    );
  }
  return el("div", { class: "wg-card" }, children);
}
