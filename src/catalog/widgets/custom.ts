import type { WidgetPayload } from "../../contract/types.js";
import type { WidgetNode } from "../node.js";
import { el } from "../node.js";

/**
 * Built-in `custom` renderer — the generic escape hatch.
 *
 * Renders `data` as pretty-printed JSON in a preformatted block, falling
 * back to `String(data)` when serialization fails (circular data, bigint).
 * Hosts register richer kinds via the catalog's registration API.
 */
export function renderCustom(payload: WidgetPayload): WidgetNode {
  let text: string;
  try {
    text = JSON.stringify(payload.data, null, 2) ?? String(payload.data);
  } catch {
    text = String(payload.data);
  }
  return el("pre", { class: "wg-custom" }, [text]);
}
