import { describe, it, expect } from "vitest";
import { compileTemplate, validateTemplate } from "../index.js";
import type { WidgetTemplate } from "../index.js";
import { renderToHtml } from "../../catalog/index.js";

function html(template: WidgetTemplate, data: unknown): string {
  return renderToHtml(compileTemplate(template)({ kind: "x", data }));
}

describe("untrusted-author safety", () => {
  it("rejects event handlers at validation and skips them at render", () => {
    const template = { tag: "button", attrs: { onclick: "x()", class: "ok" } };
    const validated = validateTemplate(template);
    expect(!validated.ok && validated.error.code).toBe("FORBIDDEN_ATTRIBUTE");

    // Bypass validation deliberately — the interpreter must still skip it.
    const output = html(template as WidgetTemplate, {});
    expect(output).toBe('<button class="ok"></button>');
    expect(output).not.toContain("onclick");
  });

  it("skips onload/onerror variants case-insensitively", () => {
    const output = html(
      { tag: "img", attrs: { OnErRoR: "x()", alt: "a" } } as WidgetTemplate,
      {}
    );
    expect(output).toBe('<img alt="a">');
  });

  it("drops javascript: URLs from bound href, keeps https", () => {
    const template: WidgetTemplate = {
      tag: "a",
      attrs: { href: { bind: "url" }, class: "link" }
    };
    expect(html(template, { url: "javascript:alert(1)" })).toBe(
      '<a class="link"></a>'
    );
    expect(html(template, { url: "https://example.com" })).toBe(
      '<a href="https://example.com" class="link"></a>'
    );
  });

  it("defeats scheme obfuscation with case and control characters", () => {
    const template: WidgetTemplate = { tag: "a", attrs: { href: { bind: "url" } } };
    for (const evil of [
      "JaVaScRiPt:alert(1)",
      " javascript:alert(1)",
      "java\nscript:alert(1)",
      "data:text/html,<script>x</script>"
    ]) {
      expect(html(template, { url: evil })).toBe("<a></a>");
    }
    expect(html(template, { url: "/relative/path" })).toBe(
      '<a href="/relative/path"></a>'
    );
    expect(html(template, { url: "mailto:a@b.c" })).toBe(
      '<a href="mailto:a@b.c"></a>'
    );
  });

  it("guards literal (non-bound) URL attributes too", () => {
    const output = html(
      { tag: "a", attrs: { href: "javascript:alert(1)" } },
      {}
    );
    expect(output).toBe("<a></a>");
  });

  it("allows data:image URIs on img src only", () => {
    const dataUri = "data:image/png;base64,iVBORw0KGgo=";
    expect(html({ tag: "img", attrs: { src: { bind: "pic" } } }, { pic: dataUri })).toBe(
      `<img src="${dataUri}">`
    );
    // The same value on any other URL attribute stays dropped.
    expect(html({ tag: "a", attrs: { href: { bind: "pic" } } }, { pic: dataUri })).toBe(
      "<a></a>"
    );
    // Non-image data URIs stay dropped even on img src.
    expect(
      html(
        { tag: "img", attrs: { src: { bind: "pic" } } },
        { pic: "data:text/html;base64,PHNjcmlwdD4=" }
      )
    ).toBe("<img>");
  });

  it("keeps bound markup inert", () => {
    const output = html({ bind: "payload" }, {
      payload: "<img onerror=x src=y>"
    });
    expect(output).toBe("&lt;img onerror=x src=y&gt;");
  });
});

describe("transforms face the URL guard", () => {
  it("mailto composition is kept; an authored javascript: prefix is dropped", () => {
    const good = compileTemplate({
      tag: "a",
      attrs: { href: { bind: "email", prefix: "mailto:" } }
    })({ kind: "x", data: { email: "ada@example.org" } });
    expect((good as { attrs?: { href?: string } }).attrs?.href).toBe(
      "mailto:ada@example.org"
    );

    const evil = compileTemplate({
      tag: "a",
      attrs: { href: { bind: "target", prefix: "javascript:" } }
    })({ kind: "x", data: { target: "alert(1)" } });
    expect((evil as { attrs?: { href?: string } }).attrs?.href).toBeUndefined();
  });

  it("a mapped url value is the author's literal, guard included", () => {
    const out = compileTemplate({
      tag: "a",
      attrs: { href: { bind: "kind", map: { docs: "https://example.org/docs" } } }
    })({ kind: "x", data: { kind: "docs" } });
    expect((out as { attrs?: { href?: string } }).attrs?.href).toBe(
      "https://example.org/docs"
    );
  });
});
