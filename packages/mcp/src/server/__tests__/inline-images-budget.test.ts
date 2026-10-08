import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCatalog, renderToHtml } from "@widgentic/core";
import type { WidgetNode } from "@widgentic/core";
import { handleRenderWidget } from "../handlers.js";
import { clearInlineImageCache, inlineRenderResultImages } from "../inline-images.js";
import type { InlineImageDeps } from "../inline-images.js";

/** A fetch stub serving PNG bytes sized per URL, recording calls. */
function sizedPngFetch(sizeOf: (url: string) => number, calls: string[] = []): InlineImageDeps {
  return {
    lookupImpl: async () => ["93.184.216.34"],
    fetchImpl: (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      return new Response(new Uint8Array(sizeOf(url)), { status: 200, headers: { "content-type": "image/png" } });
    }) as unknown as NonNullable<InlineImageDeps["fetchImpl"]>
  };
}

const render = (input: Record<string, unknown>) => {
  const result = handleRenderWidget(createCatalog(), input);
  if (result.isError === true) throw new Error(JSON.stringify(result.content));
  return result;
};

const icon = (i: number) => `https://cdn.example/icons/${i}.png`;
const HERO = "https://cdn.example/hero.png";

function heroAfterIcons(iconCount: number) {
  return render({
    widget: "group",
    data: {
      items: [
        { kind: "tree", data: Array.from({ length: iconCount }, (_, i) => ({ id: i, label: `n${i}`, icon: icon(i) })) },
        { kind: "card", data: { title: "T", photo: HERO }, hints: { images: { photo: "hero" } } }
      ]
    }
  });
}

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  clearInlineImageCache();
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errors.mockRestore());

const treeOf = (result: { structuredContent?: Record<string, unknown> }) => result.structuredContent?.tree as WidgetNode;

describe("inlining priority and the substitution budget", () => {
  it("fetches a hero ahead of 30 earlier icons", async () => {
    const calls: string[] = [];
    const result = heroAfterIcons(30);
    await inlineRenderResultImages(result, sizedPngFetch(() => 64, calls));
    expect(calls).toHaveLength(24);
    expect(calls).toContain(HERO);
    expect(calls.filter((url) => url.includes("/icons/"))).toEqual(Array.from({ length: 23 }, (_, i) => icon(i)));
    const html = String(result.structuredContent?.html);
    expect(html).not.toContain(HERO);
    expect(html).toContain(icon(29));
  });

  it("charges a repeated source per occurrence and keeps a large repeat external", async () => {
    const folder = "https://cdn.example/folder.png";
    const result = render({
      widget: "group",
      data: {
        items: [
          { kind: "tree", data: Array.from({ length: 200 }, (_, i) => ({ id: i, label: `n${i}`, icon: folder })) },
          { kind: "card", data: { title: "T", photo: HERO }, hints: { images: { photo: "hero" } } }
        ]
      }
    });
    // 15,000 bytes base64-encode to a data URI just over 20,000 characters:
    // 200 copies exceed the 3 MiB budget; the 100 KB hero fits.
    await inlineRenderResultImages(result, sizedPngFetch((url) => (url === folder ? 15_000 : 100 * 1024)));
    const html = String(result.structuredContent?.html);
    expect(html.match(new RegExp(folder.replace(/[.]/g, "\\."), "g"))).toHaveLength(200);
    expect(html).not.toContain(HERO);
    expect(renderToHtml(treeOf(result))).toBe(html);
  });

  it("admits a smaller later source after skipping one that does not fit", async () => {
    const big = "https://cdn.example/big.png";
    const small = "https://cdn.example/small.png";
    const result = render({
      widget: "group",
      data: {
        items: [
          { kind: "card", data: { title: "A", photo: big }, hints: { images: { photo: "hero" } } },
          { kind: "card", data: { title: "B", photo: big }, hints: { images: { photo: "hero" } } },
          { kind: "card", data: { title: "C", photo: big }, hints: { images: { photo: "hero" } } },
          { kind: "card", data: { title: "D", thumb: small }, hints: { images: { thumb: "thumb" } } }
        ]
      }
    });
    // 3 × ~1.37 MB exceeds 3 MiB; the small thumb still fits after it.
    await inlineRenderResultImages(result, sizedPngFetch((url) => (url === big ? 1024 * 1024 : 512)));
    const html = String(result.structuredContent?.html);
    expect(html).toContain(big);
    expect(html).not.toContain(small);
  });

  it("notes overflow on stderr with counts and no URL", async () => {
    await inlineRenderResultImages(heroAfterIcons(30), sizedPngFetch(() => 64));
    expect(errors).toHaveBeenCalledTimes(1);
    const note = String(errors.mock.calls[0]?.[0]);
    expect(note).toBe("widgentic: 7 image source(s) left external (fetch cap: 7, byte budget: 0)");
    expect(note).not.toContain("https://");
  });

  it("writes nothing to stderr when every source is admitted, and adds nothing model-facing", async () => {
    const result = heroAfterIcons(3);
    const textBefore = JSON.stringify(result.content.filter((block) => block.type === "text"));
    await inlineRenderResultImages(result, sizedPngFetch(() => 64));
    expect(errors).not.toHaveBeenCalled();
    expect(JSON.stringify(result.content.filter((block) => block.type === "text"))).toBe(textBefore);
    expect(result.structuredContent).not.toHaveProperty("diagnostics");
  });
});
