import { describe, expect, it } from "vitest";
import { isSafeImageSrc, isSafeUrl, looksLikeImageUrl } from "../urls.js";

describe("isSafeUrl", () => {
  it("allows the safe schemes and relative references", () => {
    expect(isSafeUrl("https://example.com/x")).toBe(true);
    expect(isSafeUrl("http://example.com/x")).toBe(true);
    expect(isSafeUrl("mailto:a@b.c")).toBe(true);
    expect(isSafeUrl("tel:+15550100")).toBe(true);
    expect(isSafeUrl("/relative/path")).toBe(true);
    expect(isSafeUrl("relative.png")).toBe(true);
  });

  it("rejects script-capable and data schemes", () => {
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("data:text/html,<script>x</script>")).toBe(false);
    expect(isSafeUrl("vbscript:x")).toBe(false);
  });

  it("defeats control-character obfuscation", () => {
    expect(isSafeUrl("java\nscript:alert(1)")).toBe(false);
    expect(isSafeUrl("java\tscript:alert(1)")).toBe(false);
    expect(isSafeUrl(" javascript:alert(1)")).toBe(false);
  });
});

describe("isSafeImageSrc", () => {
  it("allows absolute http(s) and base64 data-image URIs", () => {
    expect(isSafeImageSrc("https://cdn.example/a.png")).toBe(true);
    expect(isSafeImageSrc("http://cdn.example/a")).toBe(true);
    expect(isSafeImageSrc("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(isSafeImageSrc("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")).toBe(true);
  });

  it("rejects non-image data URIs, script schemes, and relative refs", () => {
    expect(isSafeImageSrc("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
    expect(isSafeImageSrc("data:image/png,rawnotbase64")).toBe(false);
    expect(isSafeImageSrc("javascript:alert(1)")).toBe(false);
    expect(isSafeImageSrc("relative/a.png")).toBe(false);
    expect(isSafeImageSrc("mailto:a@b.c")).toBe(false);
  });

  it("defeats control-character obfuscation", () => {
    expect(isSafeImageSrc("java\nscript:x")).toBe(false);
    // Cleaning mirrors browser parsing in both directions: a split-up
    // safe scheme is recognized as the safe scheme it resolves to.
    expect(isSafeImageSrc("ht\ntps://cdn.example/a.png")).toBe(true);
  });
});

describe("looksLikeImageUrl", () => {
  it("detects http(s) URLs with image extensions", () => {
    for (const ext of ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"]) {
      expect(looksLikeImageUrl(`https://cdn.example/pic.${ext}`)).toBe(true);
    }
    expect(looksLikeImageUrl("https://cdn.example/PIC.PNG")).toBe(true);
  });

  it("tolerates query strings via pathname inspection", () => {
    expect(looksLikeImageUrl("https://cdn.example/a.png?w=64&h=64")).toBe(true);
    expect(looksLikeImageUrl("https://cdn.example/a?format=.png")).toBe(false);
  });

  it("detects data-image URIs", () => {
    expect(looksLikeImageUrl("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
  });

  it("rejects extensionless, unsafe, and non-image values", () => {
    expect(looksLikeImageUrl("https://images.example/id/12345")).toBe(false);
    expect(looksLikeImageUrl("https://cdn.example/doc.pdf")).toBe(false);
    expect(looksLikeImageUrl("javascript:alert(1).png")).toBe(false);
    expect(looksLikeImageUrl("/local/a.png")).toBe(false);
    expect(looksLikeImageUrl("not a url")).toBe(false);
  });
});
