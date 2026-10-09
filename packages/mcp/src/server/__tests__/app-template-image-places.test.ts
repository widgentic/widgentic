// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createCatalog, renderToHtml } from "@widgentic/core";
import { bootTemplate, settle, tick, toolInputPartial, toolResult } from "./template-harness.js";

const catalog = createCatalog();
const PLACE = ".wg-img-pending";

const toolInput = (args: Record<string, unknown>) => ({
  jsonrpc: "2.0",
  method: "ui/notifications/tool-input",
  params: { arguments: args }
});

/** The image classes at each position, or null where the position is text. */
function realImages(payload: Record<string, unknown>, cells: string): (string | null)[] {
  const rendered = catalog.render(payload);
  if (!rendered.ok) throw new Error("fixture failed to render");
  const real = document.createElement("div");
  real.innerHTML = renderToHtml(rendered.node);
  return [...real.querySelectorAll(cells)].map((cell) => cell.querySelector("img")?.getAttribute("class") ?? null);
}
function previewImages(root: HTMLElement, cells: string): (string | null)[] {
  return [...root.querySelectorAll(cells)].map((cell) => {
    if (cell.querySelector("img") !== null) return "img";
    const place = cell.querySelector(PLACE);
    return place === null ? null : (place.getAttribute("class") ?? "").replace(" wg-img-pending", "");
  });
}

// Every branch of the renderer's decision: auto-detection by extension and
// data:image, a shape hint on an extensionless URL, `true`, `false`, an
// unsafe source under a shape hint, a non-hintable hint string, a link, a
// number.
const values = {
  photo: "https://x.example/p.jpg",
  cover: "https://x.example/cover",
  badge: "https://x.example/b.webp?w=64",
  logo: "https://x.example/l.png",
  site: "https://acme.example",
  inline: "data:image/png;base64,iVBORw0KGgo=",
  bad: "javascript:alert(1).png",
  odd: "https://x.example/w.gif",
  count: 3
};
const hints = { images: { cover: "hero", badge: true, logo: false, bad: "hero", odd: "icon" } };

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("previews hold image places", () => {
  it("a tree icon previews as an icon place; an emoji icon stays text", async () => {
    const t = bootTemplate();
    t.dispatch(toolInputPartial({
      widget: "tree",
      data: [
        { label: "Engineering", icon: "https://example.com/a.png", children: [] },
        { label: "Design", icon: "\u{1F3A8}", children: [] }
      ]
    }));
    await settle();
    const labels = [...t.root().querySelectorAll(".wg-tree-label")];
    expect(labels[0]?.querySelector("span.wg-img.wg-img-icon.wg-img-pending")).not.toBeNull();
    expect(labels[0]?.textContent).toBe("Engineering");
    expect(labels[1]?.querySelector(".wg-tree-icon")?.textContent).toBe("\u{1F3A8}");
    expect(t.root().textContent).not.toContain("example.com");
    expect(t.root().querySelector("img")).toBeNull();
  });

  it("card fields place images exactly where the renderer draws them", async () => {
    const payload = { kind: "card", data: { title: "T", fields: values }, hints };
    const expected = realImages(payload, "dd.wg-card-field-value");
    const t = bootTemplate();
    t.dispatch(toolInput({ widget: "card", data: payload.data, hints }));
    await settle();
    expect(previewImages(t.root(), "dd.wg-card-field-value")).toEqual(expected);
    expect(expected.filter((c) => c !== null)).toEqual([
      "wg-img wg-img-thumb", "wg-img wg-img-hero", "wg-img wg-img-thumb", "wg-img wg-img-thumb", "wg-img wg-img-thumb"
    ]);
  });

  it("table cells place images exactly where the renderer draws them", async () => {
    const payload = { kind: "table", data: [values, { ...values, photo: "Ada" }], hints };
    const expected = realImages(payload, "td.wg-table-cell");
    const t = bootTemplate();
    t.dispatch(toolInput({ widget: "table", data: payload.data, hints }));
    await settle();
    expect(previewImages(t.root(), "td.wg-table-cell")).toEqual(expected);
    expect(expected).toContain("wg-img wg-img-avatar");
    expect(expected).toContain("wg-img wg-img-hero");
  });

  it("holds back a URL still arriving, then places it once another value follows", async () => {
    const t = bootTemplate();
    t.dispatch(toolInputPartial({
      widget: "card",
      data: { title: "Hub", fields: { city: "Medellín", cover: "https://images.example.com/pho" } }
    }));
    await settle();
    const keys = () => [...t.root().querySelectorAll("dt")].map((dt) => dt.textContent);
    expect(keys()).toEqual(["city"]);
    expect(t.root().textContent).not.toContain("images.example.com");

    t.dispatch(toolInputPartial({
      widget: "card",
      data: { title: "Hub", fields: { city: "Medellín", cover: "https://images.example.com/photo.jpg", capacity: 2 } }
    }));
    await settle();
    expect(keys()).toEqual(["city", "cover", "capacity"]);
    expect(t.root().querySelector(`dd ${PLACE}`)?.getAttribute("class")).toBe("wg-img wg-img-thumb wg-img-pending");
  });

  it.each(["h", "htt", "https:/", "da", "data:image/png;base64,iVB"])(
    "holds back the trailing prefix %s",
    async (tail) => {
      const t = bootTemplate();
      t.dispatch(toolInputPartial({ widget: "card", data: { title: "Hub", fields: { city: "Cali", link: tail } } }));
      await settle();
      expect([...t.root().querySelectorAll("dt")].map((dt) => dt.textContent)).toEqual(["city"]);
    }
  );

  it("keeps a trailing URL in the complete input", async () => {
    const t = bootTemplate();
    t.dispatch(toolInput({ widget: "card", data: { title: "Hub", fields: { site: "https://acme.example" } } }));
    await settle();
    expect(t.root().querySelector("dd")?.textContent).toBe("https://acme.example");
  });

  it("leaves a URL still arriving out of the preview_widget request", async () => {
    const t = bootTemplate();
    t.initialize({ serverTools: {} });
    await tick();
    t.dispatch(toolInputPartial({ widget: "person", data: { name: "Ada", photo: "https://images.example.com/a" } }));
    await settle();
    expect(t.requests("tools/call")[0]?.params.arguments).toEqual({ widget: "person", data: { name: "Ada" } });
  });

  it("text keeps streaming", async () => {
    const t = bootTemplate();
    t.dispatch(toolInputPartial({ widget: "card", data: { title: "Medellín Tech" } }));
    await settle();
    expect(t.root().querySelector(".wg-card-title")?.textContent).toBe("Medellín Tech");
  });

  it("server previews mount external sources as places and keep data: sources", async () => {
    const t = bootTemplate();
    t.initialize({ serverTools: {} });
    await tick();
    t.dispatch(toolInputPartial({ widget: "person", data: { name: "Ada" }, format: "both" }));
    await settle();
    const inline = "data:image/png;base64,iVBORw0KGgo=";
    t.answer(t.requests("tools/call")[0]?.id ?? -1, {
      result: { structuredContent: { css: "", tree: { tag: "div", attrs: { class: "wg-person" }, children: [
        { tag: "img", attrs: { class: "wg-img wg-img-hero", src: "https://images.example.com/a.jpg", alt: "photo" } },
        { tag: "img", attrs: { class: "wg-img wg-img-avatar", src: inline, alt: "" } }
      ] } } }
    });
    await tick();
    const place = t.root().querySelector(PLACE);
    expect(place?.tagName).toBe("SPAN");
    expect(place?.getAttribute("class")).toBe("wg-img wg-img-hero wg-img-pending");
    expect(t.root().textContent).not.toContain("photo");
    const imgs = [...t.root().querySelectorAll("img")];
    expect(imgs.map((img) => img.getAttribute("src"))).toEqual([inline]);
  });

  it("the result replaces the places with its images", async () => {
    const data = [{ label: "Engineering", icon: "https://example.com/a.png", children: [] }];
    const t = bootTemplate();
    t.dispatch(toolInputPartial({ widget: "tree", data }));
    await settle();
    expect(t.root().querySelectorAll(PLACE)).toHaveLength(1);
    const rendered = catalog.render({ kind: "tree", data });
    if (!rendered.ok) throw new Error("fixture failed to render");
    t.dispatch(toolResult({ tree: rendered.node as unknown as Record<string, unknown>, css: "" }));
    expect(t.root().querySelectorAll(PLACE)).toHaveLength(0);
    expect(t.root().querySelector("img.wg-img-icon")?.getAttribute("src")).toBe("https://example.com/a.png");
  });
});
