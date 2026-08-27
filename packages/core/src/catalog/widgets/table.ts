import type { WidgetPayload } from "../../contract/types.js";
import type { WidgetNode } from "../node.js";
import { el } from "../node.js";
import { applyPattern, formatValue, isPlainObject, linkOrText } from "./format.js";
import { imageNode, resolveImage } from "./images.js";

/**
 * `table` renderer.
 *
 * One row per record; columns are the union of record keys in first-seen
 * order, overridable via `hints.columns`. Non-array data becomes a
 * single-record array; non-object rows are wrapped as `{ value }`. Missing
 * cells render empty. Total: never throws.
 */
export function renderTable(payload: WidgetPayload): WidgetNode {
  const rows = Array.isArray(payload.data) ? payload.data : [payload.data];
  const fieldFormat = isPlainObject(payload.hints?.fieldFormat)
    ? payload.hints.fieldFormat
    : undefined;
  const records: Record<string, unknown>[] = rows.map((row) =>
    isPlainObject(row) ? row : { value: row }
  );

  const hintColumns = payload.hints?.columns;
  let columns: string[];
  if (
    Array.isArray(hintColumns) &&
    hintColumns.every((column): column is string => typeof column === "string")
  ) {
    columns = hintColumns;
  } else {
    columns = [];
    const seen = new Set<string>();
    for (const record of records) {
      for (const key of Object.keys(record)) {
        if (!seen.has(key)) {
          seen.add(key);
          columns.push(key);
        }
      }
    }
  }

  // Caption chrome from meta — a table's data has no title slot, so meta
  // is the only source; absence means no caption. <caption> must be the
  // table's first child per the HTML content model.
  const chrome: WidgetNode[] = [];
  const title = payload.meta?.title;
  const subtitle = payload.meta?.subtitle;
  if (title !== undefined || subtitle !== undefined) {
    const parts: WidgetNode[] = [];
    if (title !== undefined) {
      parts.push(el("span", { class: "wg-table-title" }, [formatValue(title)]));
    }
    if (subtitle !== undefined) {
      parts.push(
        el("span", { class: "wg-table-subtitle" }, [formatValue(subtitle)])
      );
    }
    chrome.push(el("caption", { class: "wg-table-caption" }, parts));
  }

  return el("table", { class: "wg-table" }, [
    ...chrome,
    el("thead", { class: "wg-table-head" }, [
      el(
        "tr",
        undefined,
        columns.map((column) =>
          el("th", { class: "wg-table-header" }, [column])
        )
      )
    ]),
    el(
      "tbody",
      { class: "wg-table-body" },
      records.map((record) =>
        el(
          "tr",
          { class: "wg-table-row" },
          columns.map((column) => {
            if (!(column in record)) {
              return el("td", { class: "wg-table-cell" }, [""]);
            }
            const value = record[column];
            // Precedence per column: image > link > formatted text.
            const image = resolveImage(column, value, payload.hints, "avatar");
            let display: WidgetNode;
            if (image) {
              display = imageNode(column, image.src, image.shape);
            } else {
              const raw = formatValue(value);
              const pattern = fieldFormat?.[column];
              const text =
                typeof pattern === "string" ? applyPattern(pattern, raw) : raw;
              display = linkOrText(column, value, payload.hints, text);
            }
            return el("td", { class: "wg-table-cell" }, [display]);
          })
        )
      )
    )
  ]);
}
