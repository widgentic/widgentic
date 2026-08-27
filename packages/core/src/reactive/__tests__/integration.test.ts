// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
// Resolved through the package `exports` map (self-reference), confirming
// the `./reactive` entry works for consumers.
import { mountWidget } from "../index.js";
import { mapToWidget } from "../../mapper/index.js";

describe("streaming updates through package entries", () => {
  it("agent-style incremental table updates patch in place", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    const batch1 = [{ id: 1, status: "running" }];
    const mount = mountWidget(mapToWidget({ data: batch1 }), target);
    expect(mount.initial).toEqual({ ok: true });
    const table = target.querySelector("table");
    const firstRow = target.querySelector("tr.wg-table-row");

    // Stream two more records and a status change.
    const batch2 = [
      { id: 1, status: "done" },
      { id: 2, status: "running" },
      { id: 3, status: "queued" }
    ];
    const result = mount.update(mapToWidget({ data: batch2 }));
    expect(result).toEqual({ ok: true });

    expect(target.querySelector("table")).toBe(table);
    const rowsAfter = [...target.querySelectorAll("tr.wg-table-row")];
    expect(rowsAfter).toHaveLength(3);
    expect(rowsAfter[0]).toBe(firstRow);
    expect(rowsAfter[0]?.textContent).toContain("done");

    mount.dispose();
    expect(target.childNodes).toHaveLength(0);
  });
});
