// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mountWidget } from "../index.js";
import { createCatalog } from "../../catalog/index.js";
import type { WidgetElementNode, WidgetNode } from "../../catalog/index.js";

/** A catalog whose `fixture` kind renders its data verbatim as the tree. */
function fixtureCatalog() {
  const catalog = createCatalog();
  catalog.register("fixture", (payload) => payload.data as WidgetNode);
  return catalog;
}

const item = (key: string | undefined, text: string, tag = "li"): WidgetElementNode => ({
  tag,
  attrs: { class: "item" },
  children: [text],
  ...(key === undefined ? {} : { key })
});
const list = (children: WidgetNode[]): WidgetElementNode => ({ tag: "ul", children });

function mountFixture(tree: WidgetNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const mount = mountWidget({ kind: "fixture", data: tree }, container, { catalog: fixtureCatalog() });
  expect(mount.initial).toEqual({ ok: true });
  return {
    items: () => [...container.querySelectorAll("ul > *")],
    update: (next: WidgetNode) => expect(mount.update({ kind: "fixture", data: next })).toEqual({ ok: true }),
    container
  };
}

function ulOf(container: Element): Element {
  const ul = container.querySelector("ul");
  if (ul === null) throw new Error("no list mounted");
  return ul;
}

function mount(payload: unknown) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const handle = mountWidget(payload, container);
  expect(handle.initial).toEqual({ ok: true });
  return { container, handle };
}

describe("keyed reconciliation", () => {
  it("moves keyed table rows with their records through a reorder", () => {
    const records = [
      { id: 1, name: "Ada" },
      { id: 2, name: "Grace" },
      { id: 3, name: "Linus" }
    ];
    const { container, handle } = mount({ kind: "table", data: records });
    const before = new Map(
      [...container.querySelectorAll("tbody tr")].map((row) => [row.textContent, row])
    );
    expect(handle.update({ kind: "table", data: [...records].reverse() })).toEqual({ ok: true });
    const after = [...container.querySelectorAll("tbody tr")];
    expect(after.map((row) => row.textContent)).toEqual(["3Linus", "2Grace", "1Ada"]);
    for (const row of after) expect(before.get(row.textContent)).toBe(row);
  });

  it("keeps a visitor's open branch on its node when siblings swap", () => {
    const node = (id: string) => ({ id, label: id.toUpperCase(), children: [{ label: `${id}1` }] });
    const { container, handle } = mount({ kind: "tree", data: [node("a"), node("b")], hints: { expandDepth: 0 } });
    const branchFor = (label: string) =>
      [...container.querySelectorAll("details")].find((d) => d.querySelector("summary")?.textContent === label);
    branchFor("B")?.setAttribute("open", "");
    expect(handle.update({ kind: "tree", data: [node("b"), node("a")], hints: { expandDepth: 0 } })).toEqual({ ok: true });
    expect(branchFor("B")?.hasAttribute("open")).toBe(true);
    expect(branchFor("A")?.hasAttribute("open")).toBe(false);
    expect([...container.querySelectorAll("summary")].map((s) => s.textContent)).toEqual(["B", "A"]);
  });

  it("adds and removes by key", () => {
    const view = mountFixture(list([item("a", "A"), item("b", "B"), item("c", "C")]));
    const [a, , c] = view.items();
    view.update(list([item("c", "C"), item("d", "D"), item("a", "A")]));
    const after = view.items();
    expect(after.map((el) => el.textContent)).toEqual(["C", "D", "A"]);
    expect(after[0]).toBe(c);
    expect(after[2]).toBe(a);
    expect(view.container.textContent).not.toContain("B");
  });

  it("patches a moved keyed element's content in place", () => {
    const view = mountFixture(list([item("a", "A"), item("b", "B")]));
    const [a] = view.items();
    view.update(list([item("b", "B"), item("a", "A2")]));
    expect(view.items()[1]).toBe(a);
    expect(a?.textContent).toBe("A2");
  });

  it("rebuilds only the keyed element whose tag changed", () => {
    const view = mountFixture(list([item("a", "A"), item("b", "B")]));
    const [, b] = view.items();
    view.update(list([item("b", "B"), item("a", "A", "p")]));
    const after = view.items();
    expect(after[0]).toBe(b);
    expect(after[1]?.tagName).toBe("P");
  });

  it.each([
    ["an unkeyed element", [item("a", "A"), item(undefined, "B")], [item(undefined, "B"), item("a", "A")]],
    ["a text child", [item("a", "A"), "text"], ["text", item("a", "A")]],
    ["a duplicate key", [item("a", "A"), item("a", "B")], [item("a", "B"), item("a", "A")]]
  ])("pairs by position when a list holds %s", (_label, first, second) => {
    const view = mountFixture(list(first as WidgetNode[]));
    const before = [...ulOf(view.container).childNodes];
    view.update(list(second as WidgetNode[]));
    const after = [...ulOf(view.container).childNodes];
    // Positional pairing keeps each slot's node when the node type matches.
    after.forEach((node, i) => {
      const prev = before[i];
      if (prev && prev.nodeType === node.nodeType) expect(node).toBe(prev);
    });
    expect(ulOf(view.container).textContent).toBe(
      (second as WidgetNode[]).map((n) => (typeof n === "string" ? n : (n.children?.[0] as string))).join("")
    );
  });

  it("never puts a key on the DOM", () => {
    const view = mountFixture(list([item("a", "A"), item("b", "B")]));
    view.update(list([item("b", "B"), item("a", "A")]));
    for (const el of view.container.querySelectorAll("*")) {
      expect(el.hasAttribute("key")).toBe(false);
      expect([...el.attributes].some((attribute) => attribute.value === "a" || attribute.value === "b")).toBe(false);
    }
  });
});
