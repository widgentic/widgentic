// @vitest-environment happy-dom
/**
 * One fixture table drives BOTH in-place patchers — core's (through the
 * public mountWidget with a pass-through kind) and the app template's
 * inline one (through the bridge) — and requires the same DOM and the same
 * preserved elements after every step. The keyed-list rule is implemented
 * twice, in two languages; this is what keeps the two in step.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createCatalog, mountWidget } from "@widgentic/core";
import type { WidgetElementNode, WidgetNode } from "@widgentic/core";
import { bootTemplate, toolResult } from "./template-harness.js";

const li = (key: string | undefined, text: string, tag = "li"): WidgetElementNode => ({
  tag,
  children: [text],
  ...(key === undefined ? {} : { key })
});
const ul = (children: WidgetNode[]): WidgetElementNode => ({ tag: "ul", attrs: { class: "list" }, children });
const branch = (key: string, label: string, kids: WidgetNode[]): WidgetElementNode => ({
  tag: "li",
  key,
  children: [{ tag: "span", children: [label] }, ul(kids)]
});

const FIXTURES: [string, WidgetNode[]][] = [
  ["keyed reverse", [ul([li("a", "A"), li("b", "B"), li("c", "C")]), ul([li("c", "C"), li("b", "B"), li("a", "A")])]],
  ["add and remove by key", [ul([li("a", "A"), li("b", "B"), li("c", "C")]), ul([li("c", "C"), li("d", "D"), li("a", "A")])]],
  ["insertion", [ul([li("a", "A"), li("c", "C")]), ul([li("a", "A"), li("b", "B"), li("c", "C")])]],
  ["removal", [ul([li("a", "A"), li("b", "B"), li("c", "C")]), ul([li("a", "A"), li("c", "C")])]],
  ["content change under a moved key", [ul([li("a", "A"), li("b", "B")]), ul([li("b", "B2"), li("a", "A2")])]],
  ["duplicate keys", [ul([li("a", "A"), li("a", "B")]), ul([li("a", "B"), li("a", "A")])]],
  ["an unkeyed element", [ul([li("a", "A"), li(undefined, "B")]), ul([li(undefined, "B"), li("a", "A")])]],
  ["text children", [ul(["x", li("a", "A")]), ul([li("a", "A"), "x"])]],
  ["tag change under a key", [ul([li("a", "A"), li("b", "B")]), ul([li("b", "B"), li("a", "A", "p")])]],
  ["keyed to unkeyed", [ul([li("a", "A"), li("b", "B")]), ul([li(undefined, "B"), li(undefined, "A")])]],
  ["unkeyed to keyed", [ul([li(undefined, "A"), li(undefined, "B")]), ul([li("b", "B"), li("a", "A")])]],
  [
    "nested keyed lists",
    [
      ul([branch("x", "X", [li("1", "x1"), li("2", "x2")]), branch("y", "Y", [li("1", "y1")])]),
      ul([branch("y", "Y", [li("1", "y1")]), branch("x", "X", [li("2", "x2"), li("1", "x1")])]),
      ul([branch("x", "X", [li("2", "x2")])])
    ]
  ]
];

/**
 * Label every element in document order (keeping labels already given),
 * so identity can be compared across two DOMs: after a step, an element
 * that survived reads its old label and a new one reads "new".
 */
function labeller() {
  const labels = new WeakMap<Element, string>();
  let next = 0;
  return {
    stamp(root: Element) {
      for (const el of root.querySelectorAll("*")) {
        if (!labels.has(el)) labels.set(el, `e${next++}`);
      }
    },
    read(root: Element) {
      return [...root.querySelectorAll("*")].map((el) => labels.get(el) ?? "new");
    }
  };
}

function coreSteps(steps: WidgetNode[]) {
  const catalog = createCatalog();
  catalog.register("fixture", (payload) => payload.data as WidgetNode);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const [first, ...rest] = steps;
  const mount = mountWidget({ kind: "fixture", data: first }, container, { catalog });
  expect(mount.initial).toEqual({ ok: true });
  const ids = labeller();
  return rest.map((tree) => {
    ids.stamp(container);
    expect(mount.update({ kind: "fixture", data: tree })).toEqual({ ok: true });
    return { html: container.innerHTML, identity: ids.read(container) };
  });
}

function bridgeSteps(steps: WidgetNode[]) {
  const t = bootTemplate();
  const [first, ...rest] = steps;
  t.dispatch(toolResult({ tree: first, css: "" }));
  const ids = labeller();
  return rest.map((tree) => {
    ids.stamp(t.root());
    t.dispatch(toolResult({ tree, css: "" }));
    return { html: t.root().innerHTML, identity: ids.read(t.root()) };
  });
}

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("the template's patcher agrees with the core patcher", () => {
  it.each(FIXTURES)("%s", (_name, steps) => {
    const core = coreSteps(steps);
    document.body.innerHTML = "";
    const bridge = bridgeSteps(steps);
    expect(bridge).toEqual(core);
    // The fixture must exercise identity: at least one element survives.
    expect(core.some((step) => step.identity.some((label) => label !== "new"))).toBe(true);
  });
});
