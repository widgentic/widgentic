// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createCatalog, mountNode, renderToHtml } from "../index.js";
import type { WidgetElementNode, WidgetNode } from "../index.js";

const catalog = createCatalog();

function render(payload: unknown): WidgetNode {
  const result = catalog.render(payload);
  if (!result.ok) throw new Error(result.error.message);
  return result.node;
}

function isElement(node: WidgetNode | undefined): node is WidgetElementNode {
  return typeof node === "object" && node !== null;
}

function find(node: WidgetNode, predicate: (el: WidgetElementNode) => boolean): WidgetElementNode[] {
  if (!isElement(node)) return [];
  const own = predicate(node) ? [node] : [];
  return own.concat((node.children ?? []).flatMap((child) => find(child, predicate)));
}

const bodyRows = (tree: WidgetNode) =>
  find(tree, (el) => el.tag === "tr" && el.attrs?.class === "wg-table-row");

function stripKeys(node: WidgetNode): WidgetNode {
  if (!isElement(node)) return node;
  const { key: _key, ...rest } = node;
  return { ...rest, ...(node.children ? { children: node.children.map(stripKeys) } : {}) };
}

describe("table rows keyed by record id", () => {
  it("keys each body row with its record id's string form", () => {
    const tree = render({ kind: "table", data: [{ id: 7, name: "A" }, { id: "x9", name: "B" }] });
    expect(bodyRows(tree).map((row) => row.key)).toEqual(["7", "x9"]);
  });

  it("leaves every row unkeyed when one record lacks an id", () => {
    const tree = render({ kind: "table", data: [{ id: 1, name: "A" }, { name: "B" }] });
    expect(bodyRows(tree).map((row) => row.key)).toEqual([undefined, undefined]);
  });

  it("leaves every row unkeyed when ids collide as strings", () => {
    const tree = render({ kind: "table", data: [{ id: 1 }, { id: "1" }] });
    expect(bodyRows(tree).every((row) => row.key === undefined)).toBe(true);
  });

  it("keys nothing for non-finite or non-scalar ids", () => {
    for (const id of [Number.NaN, Infinity, null, { n: 1 }, true]) {
      const tree = render({ kind: "table", data: [{ id }, { id: "b" }] });
      expect(bodyRows(tree).every((row) => row.key === undefined)).toBe(true);
    }
  });

  it("never keys the header row", () => {
    const tree = render({ kind: "table", data: [{ id: 1 }, { id: 2 }] });
    const header = find(tree, (el) => el.tag === "thead")[0];
    expect(header && find(header, (el) => el.key !== undefined)).toEqual([]);
  });
});

describe("tree siblings keyed list by list", () => {
  const data = [
    { id: "a", label: "A", children: [{ label: "a1" }, { label: "a2" }] },
    { id: "b", label: "B" }
  ];

  it("keys a root list whose nodes carry distinct ids and leaves an id-less child list unkeyed", () => {
    const tree = render({ kind: "tree", data });
    const nodes = find(tree, (el) => el.tag === "li");
    const keyed = nodes.filter((node) => node.key !== undefined).map((node) => node.key);
    expect(keyed).toEqual(["a", "b"]);
    expect(nodes.filter((node) => node.key === undefined)).toHaveLength(2);
  });

  it("keys a child list independently of its parent list", () => {
    const tree = render({
      kind: "tree",
      data: [{ label: "root", children: [{ id: 1, label: "x" }, { id: 2, label: "y" }] }]
    });
    const keys = find(tree, (el) => el.tag === "li").map((node) => node.key);
    expect(keys).toEqual([undefined, "1", "2"]);
  });
});

describe("keys are invisible to readers", () => {
  const keyedTable = render({ kind: "table", data: [{ id: 1, name: "A" }, { id: 2, name: "B" }] });
  const keyedTree = render({ kind: "tree", data: [{ id: "a", label: "A" }, { id: "b", label: "B" }] });

  it("serializes identically to the same tree without keys", () => {
    for (const tree of [keyedTable, keyedTree]) {
      expect(find(tree, (el) => el.key !== undefined).length).toBeGreaterThan(0);
      expect(renderToHtml(tree)).toBe(renderToHtml(stripKeys(tree)));
      expect(renderToHtml(tree)).not.toMatch(/\skey=/);
    }
  });

  it("mounts no attribute carrying a key", () => {
    const container = document.createElement("div");
    mountNode(keyedTree, container);
    const attributes = [...container.querySelectorAll("*")].flatMap((element) =>
      [...element.attributes].map((attribute) => `${attribute.name}=${attribute.value}`)
    );
    expect(attributes.some((attribute) => attribute.startsWith("key="))).toBe(false);
    expect(attributes.some((attribute) => /=(a|b)$/.test(attribute))).toBe(false);
  });
});
