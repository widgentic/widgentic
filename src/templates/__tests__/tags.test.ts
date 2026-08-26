import { describe, expect, it } from "vitest";
import { compileTemplate, validateTemplate, FORBIDDEN_TAGS } from "../index.js";
import type { WidgetTemplate } from "../index.js";
import { renderToHtml } from "../../catalog/index.js";
import { validateActionDefinition } from "../../actions/index.js";

describe("template tag policy", () => {
  it("rejects every active-content tag and renders nothing for it when bypassed", () => {
    for (const tag of FORBIDDEN_TAGS) {
      const template = { tag: "div", children: [{ tag, children: ["x"] }] };
      const result = validateTemplate(template);
      expect(result.ok, tag).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("FORBIDDEN_TAG");
        expect(result.error.path).toBe("children.0");
      }
      const html = renderToHtml(compileTemplate(template as WidgetTemplate)({ kind: "x", data: {} }));
      expect(html, tag).toBe("<div></div>");
    }
    expect(validateTemplate({ tag: "SCRIPT" }).ok).toBe(false);
  });

  it("forbids srcdoc and guards data/poster/ping like other URL attributes", () => {
    const srcdoc = validateTemplate({ tag: "div", attrs: { srcdoc: "<script>x</script>" } });
    expect(srcdoc.ok).toBe(false);
    if (!srcdoc.ok) expect(srcdoc.error.code).toBe("FORBIDDEN_ATTRIBUTE");
    const node = compileTemplate({ tag: "video", attrs: { data: { bind: "u" }, poster: { bind: "u" } } })({ kind: "x", data: { u: "javascript:alert(1)" } });
    expect(renderToHtml(node)).toBe("<video></video>");
    const ok = compileTemplate({ tag: "video", attrs: { poster: { bind: "u" } } })({ kind: "x", data: { u: "https://x.example/p.png" } });
    expect(renderToHtml(ok)).toBe('<video poster="https://x.example/p.png"></video>');
  });
});

describe("budget and prompt paths", () => {
  it("charges every each iteration, even ones that render nothing", () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({ i }));
    const node = compileTemplate({ tag: "div", children: [{ each: "rows", template: { when: "never", template: "x" } }] }, { maxNodes: 1000 })({ kind: "x", data: { rows } });
    expect((node as { attrs?: Record<string, string> }).attrs?.["data-truncated"]).toBe("true");
  });

  it("prompt bind paths face the path grammar", () => {
    const result = validateTemplate({ tag: "button", action: { definition: { kind: "prompt", text: ["Hi ", { bind: "a..b" }] } } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_ACTION");
      expect(result.error.path).toBe("action.definition.text.1");
    }
    expect(validateActionDefinition({ kind: "prompt", text: [{ bind: "a..b" }] }, "", { isPath: () => false })?.path).toBe("text.0");
    expect(validateActionDefinition({ kind: "prompt", text: [{ bind: "a..b" }] })).toBeUndefined(); // no grammar supplied: shape only
  });
});
