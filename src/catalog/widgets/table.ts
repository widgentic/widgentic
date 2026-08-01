import type { WidgetPayload } from "../../contract/types.js";
import type { WidgetNode } from "../node.js";
import { el } from "../node.js";
import { formatValue, isPlainObject } from "./format.js";
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

  return el("table", { class: "wg-table" }, [
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
            const image = resolveImage(column, value, payload.hints, "avatar");
            return el("td", { class: "wg-table-cell" }, [
              image ? imageNode(column, image.src, image.shape) : formatValue(value)
            ]);
          })
        )
      )
    )
  ]);
}
