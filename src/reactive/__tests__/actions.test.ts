// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mountWidget } from "../index.js";
import { createCatalog } from "../../catalog/index.js";
import { registerTemplate } from "../../templates/index.js";
import type { ActionDefinition } from "../../actions/index.js";

const refresh: ActionDefinition = {
  kind: "http",
  method: "GET",
  url: "https://api.example.com/weather",
  input: { type: "object", properties: { city: { type: "string" } } },
  output: { type: "object" }
};

function catalogWithBound() {
  const catalog = createCatalog();
  registerTemplate(
    catalog,
    "weather",
    {
      tag: "div",
      children: [
        { tag: "button", action: { ref: "refresh", input: { city: "city" } }, children: ["Refresh"] },
        { tag: "span", attrs: { tabindex: "0" }, action: { definition: { kind: "prompt", text: ["Explain ", { bind: "city" }] } }, children: ["Explain"] }
      ]
    },
    { description: "w", dataShape: "{ city }" },
    { actions: (ref) => (ref === "refresh" ? refresh : undefined) }
  );
  return catalog;
}

describe("mountWidget onAction", () => {
  it("forwards activations with the descriptor and the mounted payload, default prevented", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const seen: unknown[] = [];
    const payload = { kind: "weather", data: { city: "Oslo" } };
    const mount = mountWidget(payload, target, { catalog: catalogWithBound(), onAction: (a, p) => seen.push([a, p]) });
    expect(mount.initial).toEqual({ ok: true });
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    (target.querySelector("button") as HTMLElement).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(seen).toEqual([[{ id: "children.0", kind: "http", args: { city: "Oslo" }, widget: "weather" }, payload]]);
    // Keyboard on a non-button host.
    const key = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    (target.querySelector("span") as HTMLElement).dispatchEvent(key);
    expect(seen).toHaveLength(2);
    expect((seen[1] as unknown[])[0]).toEqual({ id: "children.1", kind: "prompt", text: "Explain Oslo", widget: "weather" });
    // Updates change what the callback receives.
    const next = { kind: "weather", data: { city: "Bergen" } };
    mount.update(next);
    (target.querySelector("button") as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect((seen[2] as unknown[])[1]).toEqual(next);
    expect((seen[2] as unknown[])[0]).toEqual({ id: "children.0", kind: "http", args: { city: "Bergen" }, widget: "weather" });
  });

  it("is inert without onAction and after dispose", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const mount = mountWidget({ kind: "weather", data: { city: "Oslo" } }, target, { catalog: catalogWithBound() });
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    (target.querySelector("button") as HTMLElement).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    mount.dispose();
    const seen: unknown[] = [];
    const again = mountWidget({ kind: "weather", data: { city: "Oslo" } }, target, { catalog: catalogWithBound(), onAction: (a) => seen.push(a) });
    const button = target.querySelector("button") as HTMLElement;
    again.dispose();
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(seen).toEqual([]);
  });
});
