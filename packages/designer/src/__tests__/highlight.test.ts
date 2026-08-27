// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createDesigner } from "../index.js";
import { attachJsonHighlight, repaintHighlight, tokenizeJson } from "../highlight.js";

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

describe("json tokenizer", () => {
  it("classifies keys, strings, numbers, literals and punctuation", () => {
    const tokens = tokenizeJson('{"a": "x", "n": -1.5, "ok": true}');
    const byClass = (cls: string) =>
      tokens.filter((t) => t.cls === cls).map((t) => t.text);
    expect(byClass("k")).toEqual(['"a"', '"n"', '"ok"']);
    expect(byClass("s")).toEqual(['"x"']);
    expect(byClass("n")).toEqual(["-1.5"]);
    expect(byClass("b")).toEqual(["true"]);
    expect(byClass("p")).toContain("{");
  });

  it("round-trips the source text exactly", () => {
    const source = '{\n  "lines": [1, 2],\n  "s": "a\\"b"\n}\n';
    expect(tokenizeJson(source).map((t) => t.text).join("")).toBe(source);
  });

  it("still tokenizes mid-edit (invalid) JSON without throwing", () => {
    const tokens = tokenizeJson('{"a": "unclosed');
    expect(tokens.map((t) => t.text).join("")).toBe('{"a": "unclosed');
  });
});

describe("highlight layer", () => {
  function textarea(value: string): HTMLTextAreaElement {
    const area = document.createElement("textarea");
    area.className = "wgd-textarea";
    area.value = value;
    document.body.append(area);
    return area;
  }

  it("indents on Tab instead of moving focus; Shift+Tab and readonly keep defaults", () => {
    const area = textarea('{\n"a": 1\n}');
    attachJsonHighlight(area);
    area.selectionStart = area.selectionEnd = 2; // caret after '{\n'
    area.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
    );
    expect(area.value).toBe('{\n  "a": 1\n}');
    expect(area.selectionStart).toBe(4);
    // Shift+Tab stays the keyboard escape — no insertion.
    area.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
        cancelable: true
      })
    );
    expect(area.value).toBe('{\n  "a": 1\n}');
    // Readonly panes (the export output) never mutate.
    area.readOnly = true;
    area.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
    );
    expect(area.value).toBe('{\n  "a": 1\n}');
  });

  it("Tab replaces a selection with the indent and commits through input", () => {
    const area = textarea("abcdef");
    attachJsonHighlight(area);
    let inputs = 0;
    area.addEventListener("input", () => inputs++);
    area.selectionStart = 1;
    area.selectionEnd = 4; // 'bcd' selected
    area.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
    );
    expect(area.value).toBe("a  ef");
    expect(area.selectionStart).toBe(3);
    expect(inputs).toBe(1); // the store's commit path listens for input
  });

  it("wraps the textarea and mirrors its content, restoring on dispose", () => {
    const area = textarea('{"a": 1}');
    const dispose = attachJsonHighlight(area);
    const wrap = area.parentElement as HTMLElement;
    expect(wrap.className).toBe("wgd-hlwrap");
    const layer = wrap.querySelector(".wgd-hl") as HTMLElement;
    expect(layer.textContent).toContain('{"a": 1}');
    expect(layer.querySelector(".wgd-hl-k")?.textContent).toBe('"a"');
    expect(area.classList.contains("wgd-hl-input")).toBe(true);
    // The layer is decorative only.
    expect(layer.getAttribute("aria-hidden")).toBe("true");

    dispose();
    expect(area.parentElement).toBe(document.body);
    expect(area.classList.contains("wgd-hl-input")).toBe(false);
  });

  it("repaints on typing and on programmatic writes", () => {
    const area = textarea("{}");
    attachJsonHighlight(area);
    const layer = area.parentElement?.querySelector(".wgd-hl") as HTMLElement;

    area.value = '{"typed": true}';
    area.dispatchEvent(new Event("input", { bubbles: true }));
    expect(layer.textContent).toContain('"typed"');

    area.value = '{"programmatic": 2}';
    repaintHighlight(area); // no input event fires for store refreshes
    expect(layer.textContent).toContain('"programmatic"');
  });

  it("colors every JSON textarea in the designer", () => {
    const container = document.createElement("div");
    document.body.append(container);
    createDesigner(container);
    const areas = [...container.querySelectorAll("textarea")];
    expect(areas.length).toBeGreaterThan(3);
    for (const area of areas) {
      expect(area.classList.contains("wgd-hl-input"), area.className).toBe(true);
      expect(area.parentElement?.querySelector(".wgd-hl")).not.toBeNull();
    }
  });

  it("keeps the two layers metric-identical in the stylesheet", () => {
    const container = document.createElement("div");
    document.body.append(container);
    createDesigner(container);
    const chrome = document.head.querySelector(
      "style[data-widgentic-designer]"
    ) as HTMLStyleElement;
    // Shared rule for both layers — drift here misaligns the glyphs.
    expect(chrome.textContent).toMatch(/\.wgd-hl,\s*\.wgd-hl-input\s*\{/);
    expect(chrome.textContent).toMatch(
      /textarea\.wgd-hl-input\s*\{[^}]*color:\s*transparent/
    );
  });
});
