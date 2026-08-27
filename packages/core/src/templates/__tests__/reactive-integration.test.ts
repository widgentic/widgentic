// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
// Resolved through the package `exports` map (self-reference), confirming
// the `./templates` entry works for consumers.
import { registerTemplate } from "../index.js";
import { createCatalog } from "../../catalog/index.js";
import { mountWidget } from "../../reactive/index.js";

describe("template widgets update in place", () => {
  it("each-driven list patches with element identity preserved", () => {
    const catalog = createCatalog();
    registerTemplate(catalog, "tasklist", {
      tag: "ul",
      attrs: { class: "tasks" },
      children: [
        {
          each: "items",
          template: { tag: "li", children: [{ bind: "name" }] }
        }
      ]
    });

    const target = document.createElement("div");
    document.body.appendChild(target);
    const mount = mountWidget(
      { kind: "tasklist", data: { items: [{ name: "one" }, { name: "two" }] } },
      target,
      { catalog }
    );
    expect(mount.initial).toEqual({ ok: true });

    const before = [...target.querySelectorAll("li")];
    expect(before.map((li) => li.textContent)).toEqual(["one", "two"]);

    const result = mount.update({
      kind: "tasklist",
      data: { items: [{ name: "one" }, { name: "two" }, { name: "three" }] }
    });
    expect(result).toEqual({ ok: true });

    const after = [...target.querySelectorAll("li")];
    expect(after.map((li) => li.textContent)).toEqual(["one", "two", "three"]);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
  });
});
