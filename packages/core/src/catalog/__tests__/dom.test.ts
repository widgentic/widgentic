// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { createCatalog, mountNode, el } from "../index.js";

function container(): Element {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

describe("mountNode", () => {
  it("builds real DOM with expected structure and text", () => {
    const target = container();
    const result = createCatalog().render({
      kind: "card",
      data: { title: "T", fields: { k: "v" } }
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    mountNode(result.node, target);

    const card = target.querySelector(".wg-card");
    expect(card).not.toBeNull();
    expect(target.querySelector(".wg-card-title")?.textContent).toBe("T");
    expect(target.querySelector(".wg-card-field-key")?.textContent).toBe("k");
    expect(target.querySelector(".wg-card-field-value")?.textContent).toBe(
      "v"
    );
  });

  it("sets text via text nodes, not HTML parsing", () => {
    const target = container();
    mountNode(el("div", undefined, ["<b>bold?</b>"]), target);
    expect(target.querySelector("b")).toBeNull();
    expect(target.textContent).toBe("<b>bold?</b>");
  });

  it("re-mount replaces previous content", () => {
    const target = container();
    mountNode(el("div", { class: "first" }), target);
    mountNode(el("span", { class: "second" }), target);
    expect(target.querySelector(".first")).toBeNull();
    expect(target.querySelector("span.second")).not.toBeNull();
    expect(target.children).toHaveLength(1);
  });
});
