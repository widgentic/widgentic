// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { compileTemplate, registerTemplate, validateTemplate } from "../index.js";
import type { WidgetTemplate } from "../index.js";
import { createCatalog, renderToHtml } from "../../catalog/index.js";
import type { WidgetNode } from "../../catalog/index.js";
import { mountWidget } from "../../reactive/index.js";

function render(template: WidgetTemplate, data: unknown): WidgetNode {
  return compileTemplate(template)({ kind: "t", data });
}

function children(node: WidgetNode): WidgetNode[] {
  return typeof node === "string" ? [] : node.children ?? [];
}

const keysOf = (nodes: WidgetNode[]) =>
  nodes.map((node) => (typeof node === "string" ? "text" : node.key));

const lines = { lines: [{ sku: "A1", name: "Bolt" }, { sku: 42, name: "Nut" }] };

describe("keyed each", () => {
  it("keys each iteration's element with the item's key", () => {
    const tree = render(
      { tag: "ul", children: [{ each: "lines", key: "sku", template: { tag: "li", children: [{ bind: "name" }] } }] },
      lines
    );
    expect(keysOf(children(tree))).toEqual(["A1", "42"]);
  });

  it("resolves the key with the bind escapes inside the each", () => {
    const tree = render(
      { tag: "ul", children: [{ each: "lines", key: "$index", template: { tag: "li", children: [{ bind: "name" }] } }] },
      lines
    );
    expect(keysOf(children(tree))).toEqual(["0", "1"]);
  });

  it("leaves an iteration rendering two sibling elements unkeyed", () => {
    // A multi-node item template: an each whose template is itself an each
    // over a two-element array renders two elements per outer item.
    const tree = render(
      {
        tag: "dl",
        children: [
          {
            each: "rows",
            key: "id",
            template: { each: "pair", template: { tag: "dd", children: [{ bind: "." }] } }
          }
        ]
      },
      { rows: [{ id: 1, pair: ["a", "b"] }, { id: 2, pair: ["c", "d"] }] }
    );
    expect(keysOf(children(tree))).toEqual([undefined, undefined, undefined, undefined]);
  });

  it("leaves an iteration unkeyed when its key resolves to a non-scalar", () => {
    const tree = render(
      { tag: "ul", children: [{ each: "rows", key: "id", template: { tag: "li", children: ["x"] } }] },
      { rows: [{ id: { a: 1 } }, { id: null }, { id: Number.POSITIVE_INFINITY }, {}] }
    );
    expect(keysOf(children(tree))).toEqual([undefined, undefined, undefined, undefined]);
  });

  it("never keys the empty branch", () => {
    const tree = render(
      {
        tag: "ul",
        children: [{ each: "rows", key: "id", template: { tag: "li", children: ["x"] }, empty: { tag: "li", children: ["none"] } }]
      },
      { rows: [] }
    );
    expect(keysOf(children(tree))).toEqual([undefined]);
  });

  it("does not change the HTML", () => {
    const keyed: WidgetTemplate = {
      tag: "ul",
      children: [{ each: "lines", key: "sku", template: { tag: "li", children: [{ bind: "name" }] } }]
    };
    const plain: WidgetTemplate = {
      tag: "ul",
      children: [{ each: "lines", template: { tag: "li", children: [{ bind: "name" }] } }]
    };
    expect(renderToHtml(render(keyed, lines))).toBe(renderToHtml(render(plain, lines)));
  });
});

describe("keyed each validation", () => {
  it("accepts a string path", () => {
    expect(validateTemplate({ each: "lines", key: "sku", template: "x" }).ok).toBe(true);
  });

  it("refuses a non-string key at the node's path", () => {
    const result = validateTemplate({ tag: "ul", children: [{ each: "lines", key: 5, template: "x" }] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_TEMPLATE_NODE");
      expect(result.error.path).toBe("children.0");
    }
  });

  it("refuses a malformed key path at the node's path", () => {
    const result = validateTemplate({ tag: "ul", children: [{ each: "lines", key: "a..b", template: "x" }] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_PATH");
      expect(result.error.path).toBe("children.0");
    }
  });
});

describe("keyed template widgets patch by identity", () => {
  it("keeps each item's element through a reorder", () => {
    const catalog = createCatalog();
    registerTemplate(
      catalog,
      "orders",
      { tag: "ul", children: [{ each: "lines", key: "sku", template: { tag: "li", children: [{ bind: "name" }] } }] },
      { description: "orders", dataShape: "{ lines }" }
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    const mount = mountWidget({ kind: "orders", data: lines }, container, { catalog });
    expect(mount.initial).toEqual({ ok: true });
    const before = new Map([...container.querySelectorAll("li")].map((li) => [li.textContent, li]));
    const reversed = { lines: [...lines.lines].reverse() };
    expect(mount.update({ kind: "orders", data: reversed })).toEqual({ ok: true });
    const after = [...container.querySelectorAll("li")];
    expect(after.map((li) => li.textContent)).toEqual(["Nut", "Bolt"]);
    for (const li of after) expect(before.get(li.textContent)).toBe(li);
  });
});

