// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
// Resolved through the package `exports` map (self-reference), confirming
// the `./theming` entry works for consumers.
import { injectBaseStyles, applyTheme, darkTheme } from "widgentic/theming";
import { mountWidget } from "widgentic/reactive";

describe("themed mounted widget", () => {
  it("base styles inject and the dark theme scopes to the container", () => {
    injectBaseStyles(document);
    expect(document.head.querySelector("style[data-widgentic]")).not.toBeNull();

    const target = document.createElement("div");
    document.body.appendChild(target);

    const mount = mountWidget(
      {
        kind: "card",
        data: { title: "Status", fields: { state: "ok" } }
      },
      target
    );
    expect(mount.initial).toEqual({ ok: true });

    applyTheme(target, darkTheme);
    expect(target.style.getPropertyValue("--wg-bg")).toBe(darkTheme.bg);
    expect(target.style.getPropertyValue("--wg-accent")).toBe(
      darkTheme.accent
    );
    // the widget markup is inside the themed scope
    expect(target.querySelector(".wg-card")).not.toBeNull();

    // switching back to the light defaults is just an empty theme
    applyTheme(target, {});
    expect(target.style.getPropertyValue("--wg-bg")).toBe("");
  });
});
