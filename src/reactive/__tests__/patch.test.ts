// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { mountWidget } from "../index.js";

function container(): Element {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `row${i}`, value: i }));

describe("in-place patching", () => {
  it("cell text change preserves table and sibling identity", () => {
    const target = container();
    const mount = mountWidget(
      { kind: "table", data: [{ name: "Ada", role: "eng" }, { name: "Lin", role: "ops" }] },
      target
    );
    const table = target.querySelector("table");
    const cells = [...target.querySelectorAll("td")];
    expect(cells.map((c) => c.textContent)).toEqual(["Ada", "eng", "Lin", "ops"]);

    mount.update({
      kind: "table",
      data: [{ name: "Ada", role: "eng" }, { name: "Lin", role: "sre" }]
    });

    expect(target.querySelector("table")).toBe(table);
    const cellsAfter = [...target.querySelectorAll("td")];
    expect(cellsAfter.map((c) => c.textContent)).toEqual(["Ada", "eng", "Lin", "sre"]);
    // every td kept its DOM identity — only a text node's value changed
    cells.forEach((cell, i) => expect(cellsAfter[i]).toBe(cell));
  });

  it("appended records extend the DOM keeping existing row identity", () => {
    const target = container();
    const mount = mountWidget({ kind: "table", data: rows(2) }, target);
    const before = [...target.querySelectorAll("tr.wg-table-row")];
    expect(before).toHaveLength(2);

    mount.update({ kind: "table", data: rows(3) });

    const after = [...target.querySelectorAll("tr.wg-table-row")];
    expect(after).toHaveLength(3);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    expect(after[2]?.textContent).toContain("row2");
  });

  it("attribute change patches in place", () => {
    const target = container();
    const data = {
      label: "root",
      children: [
        { label: "season", children: [{ label: "episode", children: [] }] }
      ]
    };
    const mount = mountWidget({ kind: "tree", data }, target);
    const nodes = [...target.querySelectorAll("li.wg-tree-node")];
    // branches carry the attribute; the leaf episode does not
    expect(nodes.map((n) => n.getAttribute("data-expanded"))).toEqual([
      "true",
      "true",
      null
    ]);

    mount.update({ kind: "tree", data, hints: { expandDepth: 1 } });

    const nodesAfter = [...target.querySelectorAll("li.wg-tree-node")];
    expect(nodesAfter.map((n) => n.getAttribute("data-expanded"))).toEqual([
      "true",
      "false",
      null
    ]);
    nodes.forEach((node, i) => expect(nodesAfter[i]).toBe(node));
  });

  it("kind change replaces the root subtree", () => {
    const target = container();
    const mount = mountWidget({ kind: "card", data: { a: 1 } }, target);
    expect(target.firstElementChild?.tagName.toLowerCase()).toBe("div");

    mount.update({ kind: "table", data: [{ a: 1 }] });

    expect(target.firstElementChild?.tagName.toLowerCase()).toBe("table");
    expect(target.querySelectorAll(":scope > *")).toHaveLength(1);
  });

  it("patched text stays inert", () => {
    const target = container();
    const mount = mountWidget(
      { kind: "table", data: [{ note: "plain" }] },
      target
    );
    mount.update({ kind: "table", data: [{ note: "<b>markup</b>" }] });

    expect(target.querySelector("b")).toBeNull();
    expect(target.querySelector("td")?.textContent).toBe("<b>markup</b>");
  });
});
