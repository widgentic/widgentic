import { describe, it, expect } from "vitest";
import { compileTemplate, parsePath, validateTemplate } from "../index.js";
import type { WidgetTemplate } from "../index.js";
import { renderToHtml } from "../../catalog/index.js";

function render(template: WidgetTemplate, data: unknown): string {
  return renderToHtml(compileTemplate(template)({ kind: "x", data }));
}

describe("scope chain paths", () => {
  it("$root and $parent escape the each scope", () => {
    const html = render(
      {
        each: "groups",
        template: {
          each: "rows",
          template: {
            tag: "span",
            children: [{ bind: "$root.owner" }, "/", { bind: "$parent.name" }, "/", { bind: "id" }]
          }
        }
      },
      { owner: "ada", groups: [{ name: "g1", rows: [{ id: 7 }] }] }
    );
    expect(html).toContain("ada/g1/7");
  });

  it("$parent repeats and stops at the outermost scope", () => {
    const template: WidgetTemplate = {
      each: "a",
      template: {
        each: "b",
        template: {
          tag: "i",
          children: [{ bind: "$parent.$parent.top" }, "|", { bind: "$parent.$parent.$parent.top" }]
        }
      }
    };
    expect(render(template, { top: "T", a: [{ b: [1] }] })).toBe("<i>T|</i>");
  });

  it("$index is the position inside each, empty outside", () => {
    expect(render({ tag: "p", children: [{ each: "tags", template: { bind: "$index" } }] }, { tags: ["a", "b"] }))
      .toBe("<p>01</p>");
    expect(render({ tag: "p", children: [{ bind: "$index" }] }, {})).toBe("<p></p>");
  });

  it("$parent.$index reads the outer position and bare $parent/$root read whole scopes", () => {
    const html = render(
      {
        each: "a",
        template: {
          each: "b",
          template: { tag: "i", children: [{ bind: "$parent.$index" }, ":", { bind: "$index" }] }
        }
      },
      { a: [{ b: [0, 0] }, { b: [0] }] }
    );
    expect(html).toBe('<div class="wg-template"><i>0:0</i><i>0:1</i><i>1:0</i></div>');
    expect(render({ each: "a", template: { bind: "$parent" } }, { a: [1] })).toBe("{&quot;a&quot;:[1]}");
    expect(render({ bind: "$root" }, { z: 1 })).toBe("{&quot;z&quot;:1}");
  });

  it("existing paths behave exactly as before", () => {
    expect(render({ bind: "items.0.name" }, { items: [{ name: "first" }] })).toBe("first");
    expect(render({ tag: "p", children: [{ each: "tags", template: { bind: "." } }] }, { tags: ["a", "b"] })).toBe("<p>ab</p>");
    expect(renderToHtml(compileTemplate({ bind: "$meta.title" })({ kind: "x", data: {}, meta: { title: "T" } }))).toBe("T");
  });

  it("parsePath accepts the grammar and rejects misplaced reserved tokens", () => {
    expect(parsePath(".")).toEqual({ base: "scope", up: 0, index: false, segments: [] });
    expect(parsePath("$meta.a.b")).toEqual({ base: "meta", up: 0, index: false, segments: ["a", "b"] });
    expect(parsePath("$root")).toEqual({ base: "root", up: 0, index: false, segments: [] });
    expect(parsePath("$parent.$parent.x")).toEqual({ base: "scope", up: 2, index: false, segments: ["x"] });
    expect(parsePath("$parent.$index")).toEqual({ base: "scope", up: 1, index: true, segments: [] });
    for (const bad of ["", "a..b", "$meta", "$index.x", "a.$index", "$root.$index", "$meta.$parent.x", "a.$root"]) {
      expect(parsePath(bad), bad).toBeUndefined();
    }
  });

  it("validation rejects malformed helper use with INVALID_PATH", () => {
    for (const path of ["$meta", "$index.x", "$root.$index"]) {
      const result = validateTemplate({ bind: path });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_PATH");
    }
    expect(validateTemplate({ each: "rows", template: { bind: "$parent.$index" } }).ok).toBe(true);
  });
});
