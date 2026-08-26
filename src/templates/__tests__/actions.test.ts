import { describe, it, expect } from "vitest";
import { compileTemplate, resolveActionDescriptor, validateTemplate } from "../index.js";
import type { WidgetTemplate } from "../index.js";
import type { ActionDefinition } from "../../actions/index.js";
import { renderToHtml } from "../../catalog/index.js";
import type { WidgetElementNode } from "../../catalog/index.js";

const refresh: ActionDefinition = {
  kind: "http",
  method: "GET",
  url: "https://api.example.com/weather",
  input: { type: "object", properties: { city: { type: "string" }, id: {}, owner: {} } },
  output: { type: "object" }
};
const shared = (ref: string) => (ref === "refresh" ? refresh : undefined);

function descriptorOf(node: unknown): Record<string, unknown> {
  const element = node as WidgetElementNode;
  return JSON.parse(element.attrs?.["data-wg-action"] ?? "{}") as Record<string, unknown>;
}

describe("action bindings: validation", () => {
  it("accepts a shared-ref binding with mapped input", () => {
    const template = { tag: "button", action: { ref: "refresh", input: { city: "location.city" } }, children: ["Refresh"] };
    expect(validateTemplate(template)).toEqual({ ok: true, template });
  });

  it("locates malformed bindings with INVALID_ACTION", () => {
    const cases: [unknown, string][] = [
      [{ tag: "b", action: { ref: "x", input: { city: 5 } } }, "action.input.city"],
      [{ tag: "b", action: { ref: "x", output: { mode: "patch" } } }, "action.output.path"],
      [{ tag: "b", action: { ref: "x", output: { mode: "upsert" } } }, "action.output.mode"],
      [{ tag: "b", action: { ref: "x", input: { city: "a..b" } } }, "action.input.city"],
      [{ tag: "b", action: { definition: { kind: "http", method: "PUT", url: "https://x.example", input: { type: "object" }, output: {} } } }, "action.definition.method"],
      [{ tag: "b", action: { definition: { kind: "prompt", text: "hi" } } }, "action.definition.text"],
      [{ tag: "b", action: { input: {} } }, "action"],
      [{ tag: "b", action: { ref: "" } }, "action.ref"]
    ];
    for (const [template, path] of cases) {
      const result = validateTemplate(template);
      expect(result.ok, JSON.stringify(template)).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_ACTION");
        expect(result.error.path).toBe(path);
      }
    }
  });

  it("refuses href and action on one element", () => {
    const result = validateTemplate({ tag: "a", attrs: { href: "https://x.example" }, action: { ref: "open" } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICTING_ATTRIBUTES");
  });

  it("rejects hand-written data-wg-* attributes and skips them at render time", () => {
    const template = { tag: "button", attrs: { "data-wg-action": "{}", class: "x" } };
    const result = validateTemplate(template);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN_ATTRIBUTE");
    const node = compileTemplate(template as WidgetTemplate)({ kind: "x", data: {} }) as WidgetElementNode;
    expect(node.attrs).toEqual({ class: "x" });
  });
});

describe("action bindings: compiled descriptors", () => {
  it("a bound root button carries its descriptor and nothing else", () => {
    const node = compileTemplate(
      { tag: "button", action: { ref: "refresh", input: { city: "city" } }, children: ["Refresh"] },
      { actions: shared }
    )({ kind: "x", data: { city: "Oslo" } }) as WidgetElementNode;
    expect(descriptorOf(node)).toEqual({ id: "", kind: "http", args: { city: "Oslo" } });
    expect(Object.keys(node.attrs ?? {})).toEqual(["data-wg-action"]);
    expect(node.children).toEqual(["Refresh"]);
  });

  it("row actions name their row via scope, with $root and $index available", () => {
    const node = compileTemplate(
      {
        tag: "ul",
        children: [
          { each: "rows", template: { tag: "button", action: { ref: "refresh", input: { id: "id", owner: "$root.owner", city: { const: "Oslo" } } } } }
        ]
      },
      { actions: shared }
    )({ kind: "x", data: { owner: "ada", rows: [{ id: 1 }, { id: 2 }] } }) as WidgetElementNode;
    const [first, second] = node.children as WidgetElementNode[];
    expect(descriptorOf(first)).toEqual({ id: "children.0.template", kind: "http", args: { id: 1, owner: "ada", city: "Oslo" } });
    expect(descriptorOf(second).args).toEqual({ id: 2, owner: "ada", city: "Oslo" });
  });

  it("a prompt resolves to plain text, capped", () => {
    const node = compileTemplate({
      tag: "button",
      action: { definition: { kind: "prompt", text: ["Show the 7-day forecast for ", { bind: "city" }] } }
    })({ kind: "x", data: { city: "Vancouver" } }) as WidgetElementNode;
    expect(descriptorOf(node)).toEqual({ id: "", kind: "prompt", text: "Show the 7-day forecast for Vancouver" });
    const markup = compileTemplate({ tag: "b", action: { definition: { kind: "prompt", text: [{ bind: "v" }] } } })({ kind: "x", data: { v: "<b>hi</b>" } }) as WidgetElementNode;
    expect(descriptorOf(markup).text).toBe("<b>hi</b>");
    const long = compileTemplate({ tag: "b", action: { definition: { kind: "prompt", text: [{ bind: "v" }] } } })({ kind: "x", data: { v: "x".repeat(5000) } }) as WidgetElementNode;
    expect((descriptorOf(long).text as string).length).toBe(2000);
  });

  it("unresolved refs and scope-less callers render disabled", () => {
    const unresolved = compileTemplate({ tag: "b", action: { ref: "nope" } }, { actions: shared })({ kind: "x", data: {} });
    expect(descriptorOf(unresolved)).toEqual({ id: "", disabled: "unresolved" });
    const scoped = compileTemplate({ tag: "b", action: { ref: "refresh" } }, { actions: shared, httpDisabled: "scope" })({ kind: "x", data: {} });
    expect(descriptorOf(scoped)).toEqual({ id: "", kind: "http", args: {}, disabled: "scope" });
  });

  it("descriptors survive serialization and stay data", () => {
    const node = compileTemplate({ tag: "button", action: { ref: "refresh", input: { city: "city" } } }, { actions: shared })({ kind: "x", data: { city: "Oslo" } });
    const html = renderToHtml(node);
    expect(html).toBe('<button data-wg-action="{&quot;id&quot;:&quot;&quot;,&quot;kind&quot;:&quot;http&quot;,&quot;args&quot;:{&quot;city&quot;:&quot;Oslo&quot;}}"></button>');
    expect(html).not.toMatch(/ on[a-z]+=/i);
  });

  it("resolveActionDescriptor resolves load bindings against the root scope", () => {
    const descriptor = resolveActionDescriptor({ ref: "refresh", input: { id: "record.id" } }, "load", { kind: "x", data: { record: { id: 42 } } }, { actions: shared });
    expect(descriptor).toEqual({ id: "load", kind: "http", args: { id: 42 } });
  });
});

describe("descriptors inside groups", () => {
  it("registered templates stamp their kind, and group composition stamps the item location", async () => {
    const { createCatalog } = await import("../../catalog/index.js");
    const { registerTemplate } = await import("../index.js");
    const catalog = createCatalog();
    registerTemplate(catalog, "weather", { tag: "button", action: { ref: "refresh", input: { city: "city" } } }, { description: "w", dataShape: "x" }, { actions: shared });
    registerTemplate(catalog, "wrap", { tag: "div", children: [{ tag: "b", action: { ref: "refresh" } }] }, { description: "wrap", dataShape: "x" }, { actions: shared });
    const single = catalog.render({ kind: "weather", data: { city: "Oslo" } });
    expect(single.ok && descriptorOf(single.node)).toEqual({ id: "", kind: "http", args: { city: "Oslo" }, widget: "weather" });
    const grouped = catalog.render({ kind: "group", data: { items: [{ kind: "card", data: { title: "t" } }, { kind: "weather", data: { city: "Oslo" } }] } });
    expect(grouped.ok).toBe(true);
    const html = grouped.ok ? renderToHtml(grouped.node) : "";
    expect(html).toContain("&quot;at&quot;:&quot;data.items.1&quot;");
    expect(html).toContain("&quot;widget&quot;:&quot;weather&quot;");
    // Plain items are untouched.
    const plain = catalog.render({ kind: "group", data: { items: [{ kind: "card", data: { title: "t" } }] } });
    expect(plain.ok ? renderToHtml(plain.node) : "").not.toContain("data-wg-action");
  });
});

describe("hardening: descriptor details", () => {
  it("unresolved descriptors still name their kind and prompt caps never split a surrogate pair", () => {
    const node = compileTemplate({ tag: "b", action: { ref: "nope" } }, { actions: shared, kind: "weather" })({ kind: "weather", data: {} });
    expect(descriptorOf(node)).toEqual({ id: "", disabled: "unresolved", widget: "weather" });
    const emoji = "😀".repeat(1500); // 3000 code units, 1500 code points
    const capped = compileTemplate({ tag: "b", action: { definition: { kind: "prompt", text: [{ bind: "v" }] } } })({ kind: "x", data: { v: emoji } }) as WidgetElementNode;
    const text = descriptorOf(capped).text as string;
    expect(Array.from(text).length).toBe(1500);
    expect(text.endsWith("😀")).toBe(true);
  });
});

describe("hardening: group stamping is a copy", () => {
  it("does not mutate the node a renderer returned", async () => {
    const { createCatalog } = await import("../../catalog/index.js");
    const catalog = createCatalog();
    const cached = { tag: "button", attrs: { "data-wg-action": JSON.stringify({ id: "", kind: "prompt", text: "hi", widget: "fixed" }) } };
    catalog.register("fixed", () => cached, { description: "cached renderer", dataShape: "any" });
    const first = catalog.render({ kind: "group", data: { items: [{ kind: "fixed", data: {} }] } });
    const second = catalog.render({ kind: "group", data: { items: [{ kind: "card", data: { title: "t" } }, { kind: "fixed", data: {} }] } });
    expect(first.ok && second.ok).toBe(true);
    expect(JSON.parse(cached.attrs["data-wg-action"]).at).toBeUndefined(); // the renderer's node is untouched
    const html = second.ok ? renderToHtml(second.node) : "";
    expect(html).toContain("&quot;at&quot;:&quot;data.items.1&quot;");
    expect(html).not.toContain("data.items.0.data.items");
  });
});
