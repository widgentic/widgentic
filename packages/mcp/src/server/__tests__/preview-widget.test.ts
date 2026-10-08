// @vitest-environment node
import { describe, expect, it } from "vitest";
import { composeCatalog, composeThemes, createMemoryStore } from "../../store/index.js";
import type { StoredWidget } from "../../store/index.js";
import {
  createExecutionLimiter,
  DEFAULT_PREVIEWS_PER_MINUTE,
  handlePreviewWidget,
  handleRenderWidget,
  positiveIntFromEnv
} from "../index.js";
import { createCatalog, renderToHtml } from "@widgentic/core";
import type { WidgetNode } from "@widgentic/core";

const person: StoredWidget = {
  kind: "person",
  template: {
    tag: "div",
    attrs: { class: "wg-person" },
    children: [
      { tag: "strong", children: [{ bind: "name" }] },
      { tag: "span", children: [{ bind: "email" }] }
    ]
  },
  descriptor: {
    description: "A person",
    dataShape: "{ name, email }",
    dataSchema: {
      type: "object",
      required: ["name", "email"],
      properties: { name: { type: "string" }, email: { type: "string" } }
    },
    styles: { ".wg-person": { color: "var(--wg-accent)" } }
  }
};

async function aliceCatalog() {
  const store = createMemoryStore([
    { principal: { id: "alice", scopes: ["read"] }, widgets: [person] },
    { principal: { id: "bob", scopes: ["read"] } }
  ]);
  return {
    alice: (await composeCatalog(store, "alice")).value,
    bob: (await composeCatalog(store, "bob")).value,
    themes: (await composeThemes(store, "alice")).value
  };
}

const errorOf = (result: { content: { type: string; text?: string }[] }) =>
  JSON.parse(String(result.content[0]?.text)) as { code: string; path?: string };

const scOf = (result: { structuredContent?: Record<string, unknown> }) =>
  result.structuredContent as { tree: WidgetNode; css: string };

describe("preview_widget", () => {
  it("previews incomplete data of a stored kind that render_widget refuses", async () => {
    const { alice } = await aliceCatalog();
    const input = { widget: "person", data: { name: "Ada" } };
    const preview = handlePreviewWidget(alice, input);
    expect(preview.isError).toBeUndefined();
    const sc = scOf(preview);
    expect(renderToHtml(sc.tree)).toContain("Ada");
    expect(sc.css).toContain(".wg-person");
    expect(handleRenderWidget(alice, input).isError).toBe(true);
  });

  it("returns only the tree and css — no payload, diagnostics or load", async () => {
    const { alice } = await aliceCatalog();
    const preview = handlePreviewWidget(alice, { widget: "person", data: { name: "Ada" }, hints: { nope: true } });
    expect(Object.keys(preview.structuredContent ?? {}).sort()).toEqual(["css", "tree"]);
    expect(preview.content).toEqual([{ type: "text", text: "Preview of 'person'." }]);
  });

  it("previews a group whose custom item is still incomplete", async () => {
    const { alice } = await aliceCatalog();
    const preview = handlePreviewWidget(alice, {
      widget: "group",
      data: { items: [{ kind: "card", data: { title: "T" } }, { kind: "person", data: { name: "Ada" } }] }
    });
    expect(preview.isError).toBeUndefined();
    expect(renderToHtml(scOf(preview).tree)).toContain("Ada");
    expect(scOf(preview).css).toContain(".wg-person");
  });

  it("renders before any data has streamed", async () => {
    const { alice } = await aliceCatalog();
    expect(handlePreviewWidget(alice, { widget: "person" }).isError).toBeUndefined();
  });

  it("never fetches: image sources keep their URLs", () => {
    const url = "https://cdn.example.com/hero.png";
    const preview = handlePreviewWidget(createCatalog(), {
      widget: "card",
      data: { title: "T", image: url },
      hints: { images: { image: "hero" } }
    });
    expect(JSON.stringify(scOf(preview).tree)).toContain(url);
  });

  it("answers UNKNOWN_KIND for another principal's kind", async () => {
    const { bob } = await aliceCatalog();
    const error = errorOf(handlePreviewWidget(bob, { widget: "person", data: { name: "Ada" } }));
    expect(error.code).toBe("UNKNOWN_KIND");
    expect(error.path).toBe("widget");
  });

  it("refuses a missing widget id", () => {
    expect(errorOf(handlePreviewWidget(createCatalog(), { data: {} })).code).toBe("MISSING_FIELD");
  });

  it("resolves a theme name and ignores a theme that does not resolve", async () => {
    const { alice, themes } = await aliceCatalog();
    const named = handlePreviewWidget(alice, { widget: "person", data: {}, theme: "dark" }, { themes });
    expect(scOf(named).css).toContain("--wg-");
    for (const theme of ["no-such-theme", { accent: 5 }]) {
      const preview = handlePreviewWidget(alice, { widget: "person", data: {}, theme }, { themes });
      expect(preview.isError).toBeUndefined();
      expect(scOf(preview).css).not.toContain(":root, :root[data-theme");
    }
  });

  it("answers RATE_LIMITED without rendering when the gate refuses", () => {
    let rendered = false;
    const catalog = createCatalog();
    catalog.register("probe", () => {
      rendered = true;
      return "x";
    });
    const result = handlePreviewWidget(catalog, { widget: "probe", data: 1 }, { rateLimit: () => false });
    expect(errorOf(result).code).toBe("RATE_LIMITED");
    expect(rendered).toBe(false);
  });

  it("limits a principal past its per-minute budget and falls back from a garbage rate", () => {
    const rate = positiveIntFromEnv("garbage", DEFAULT_PREVIEWS_PER_MINUTE);
    expect(rate).toBe(240);
    const limiter = createExecutionLimiter(rate, () => 0);
    const gate = () => limiter.take("alice");
    const outcomes = Array.from({ length: 241 }, () =>
      handlePreviewWidget(createCatalog(), { widget: "card", data: { title: "T" } }, { rateLimit: gate })
    );
    expect(outcomes.slice(0, 240).every((result) => result.isError === undefined)).toBe(true);
    expect(errorOf(outcomes[240] ?? { content: [] }).code).toBe("RATE_LIMITED");
  });
});
