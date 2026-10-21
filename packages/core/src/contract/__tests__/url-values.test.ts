import { describe, expect, it } from "vitest";
import { composePrefixedUrl } from "../url-values.js";

describe("composePrefixedUrl", () => {
  it("encodes a value behind a query or path prefix as one component", () => {
    const seed = "https://api.dicebear.com/9.x/initials/svg?seed=";
    expect(composePrefixedUrl(seed, "Ada & Lin?x=1#y")).toBe(`${seed}Ada%20%26%20Lin%3Fx%3D1%23y`);
    expect(composePrefixedUrl("https://cdn.example.com/u/", "a/b%c")).toBe("https://cdn.example.com/u/a%2Fb%25c");
    expect(composePrefixedUrl("https://example.com/?q=", "-_.!~*'()")).toBe("https://example.com/?q=-_.!~*'()");
    expect(composePrefixedUrl("", "javascript:alert(1)")).toBe("javascript%3Aalert(1)");
  });

  it("keeps an address behind a bare scheme and encodes what would restructure it", () => {
    expect(composePrefixedUrl("mailto:", "ada@example.org")).toBe("mailto:ada@example.org");
    expect(composePrefixedUrl("mailto:", "ada@example.org?subject=hi#x")).toBe("mailto:ada@example.org%3Fsubject=hi%23x");
    expect(composePrefixedUrl("MAILTO:", "a&b@example.org")).toBe("MAILTO:a%26b@example.org");
    expect(composePrefixedUrl("tel:", "+1 555-0100")).toBe("tel:+1%20555-0100");
    expect(composePrefixedUrl("tel:", "+15551234;ext=12")).toBe("tel:+15551234;ext=12");
    expect(composePrefixedUrl("sms:", "100%[x]")).toBe("sms:100%25%5Bx%5D");
  });

  it("reads the value behind a web scheme, with or without //, as the rest of a URL", () => {
    expect(composePrefixedUrl("https://", "example.com/a/b?c=1&d=2#e")).toBe("https://example.com/a/b?c=1&d=2#e");
    expect(composePrefixedUrl("HTTP://", "example.com/a b")).toBe("HTTP://example.com/a%20b");
    expect(composePrefixedUrl("https:", "//cdn.example.com/a.png?w=1&h=2#f")).toBe("https://cdn.example.com/a.png?w=1&h=2#f");
    expect(composePrefixedUrl("HTTP:", "//cdn.example.com/a b.png")).toBe("HTTP://cdn.example.com/a%20b.png");
    expect(composePrefixedUrl("https:", "//x.example/?q=a%20b")).toBe("https://x.example/?q=a%20b");
    expect(composePrefixedUrl("https:", '//x.example/<"`{|}^\\>')).toBe("https://x.example/%3C%22%60%7B%7C%7D%5E%5C%3E");
    expect(composePrefixedUrl("https:", "//x.example/\n\t\u007f")).toBe("https://x.example/%0A%09%7F");
  });

  it("encodes non-ASCII as UTF-8, astral characters whole, a lone surrogate as U+FFFD", () => {
    expect(composePrefixedUrl("https://example.com/u?n=", "José")).toBe("https://example.com/u?n=Jos%C3%A9");
    expect(composePrefixedUrl("https:", "//x.example/ü")).toBe("https://x.example/%C3%BC");
    expect(composePrefixedUrl("mailto:", "zoë@example.org")).toBe("mailto:zo%C3%AB@example.org");
    expect(composePrefixedUrl("https://example.com/?q=", "😀")).toBe("https://example.com/?q=%F0%9F%98%80");
    expect(composePrefixedUrl("https://example.com/?q=", "a\ud800b")).toBe("https://example.com/?q=a%EF%BF%BDb");
  });

  it("keeps a value behind a data: prefix as written, for the image guard to judge", () => {
    expect(composePrefixedUrl("data:image/png;base64,", "iVBORw0KGgo+/AAA=")).toBe("data:image/png;base64,iVBORw0KGgo+/AAA=");
    expect(composePrefixedUrl("DATA:", "text/html,<b>")).toBe("DATA:text/html,<b>");
  });

  it("classifies only the exact web prefixes as web: a longer one is a component prefix", () => {
    expect(composePrefixedUrl("https:///", "a/b")).toBe("https:///a%2Fb");
    expect(composePrefixedUrl("ftp:", "a b?c")).toBe("ftp:a%20b%3Fc");
  });

  it("composes an empty value to the prefix alone (callers never emit it)", () => {
    expect(composePrefixedUrl("mailto:", "")).toBe("mailto:");
  });
});
