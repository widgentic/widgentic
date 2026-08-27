// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { buildAppTemplate, handleRenderWidget } from "../index.js";
import { createCatalog } from "@widgentic/core";
import { registerTemplate } from "@widgentic/core";

/** Same harness as app-template.test.ts: run the bridge against this document with a faked parent. */
function bootTemplate() {
  document.head.innerHTML = '<style id="wg-dynamic-css"></style>';
  document.body.innerHTML = '<div id="wg-root"></div>';
  const template = buildAppTemplate();
  const script = template.split("<script>")[1]?.split("</script>")[0];
  if (script === undefined) throw new Error("template has no inline script");
  const sent: Record<string, unknown>[] = [];
  const listeners: ((event: { data: unknown }) => void)[] = [];
  const fakeWindow = {
    parent: { postMessage: (m: Record<string, unknown>) => sent.push(m) },
    addEventListener: (_type: string, fn: (event: { data: unknown }) => void) => listeners.push(fn),
    innerWidth: 800
  };
  class ObserverStub {
    observe(): void {}
  }
  new Function("window", "document", "ResizeObserver", script)(fakeWindow, document, ObserverStub);
  const dispatch = (data: unknown) => listeners.forEach((fn) => fn({ data }));
  return {
    sent,
    dispatch,
    root: () => document.getElementById("wg-root") as HTMLElement,
    alert: () => document.querySelector(".wg-app-alert") as HTMLElement,
    /** Answer the bridge's initialize request with the given host capabilities. */
    initialize(hostCapabilities: Record<string, unknown>) {
      const init = sent.find((m) => m.method === "ui/initialize") as { id?: number };
      dispatch({ jsonrpc: "2.0", id: init.id, result: { hostCapabilities, hostContext: {} } });
    },
    lastRequest(method: string) {
      const matches = sent.filter((m) => m.method === method) as { id: number; params: Record<string, unknown> }[];
      const last = matches[matches.length - 1];
      if (last === undefined) throw new Error(`no ${method} request was sent`);
      return last;
    },
    count: (method: string) => sent.filter((m) => m.method === method).length
  };
}

const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const descriptor = (d: Record<string, unknown>) => JSON.stringify(d);
const payload = { kind: "weather", data: { city: "Oslo", temp: 12 } };
function tree(temp: number, extra: Record<string, unknown> = {}) {
  return {
    tag: "div",
    children: [
      { tag: "span", attrs: { class: "wg-temp" }, children: [String(temp)] },
      { tag: "button", attrs: { "data-wg-action": descriptor({ id: "children.1", kind: "http", args: { city: "Oslo" }, ...extra }) }, children: ["Refresh"] },
      { tag: "button", attrs: { "data-wg-action": descriptor({ id: "children.2", kind: "prompt", text: "Explain Oslo" }) }, children: ["Explain"] }
    ]
  };
}
const toolResult = (structuredContent: Record<string, unknown>) => ({
  jsonrpc: "2.0",
  method: "ui/notifications/tool-result",
  params: { structuredContent }
});
const click = (el: Element) => {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("app template action layer", () => {
  it("a prompt proposes a message and stays enabled without the message flag", async () => {
    const t = bootTemplate();
    t.initialize({ openLinks: {} });
    await tick();
    t.dispatch(toolResult({ tree: tree(12), payload }));
    const explain = t.root().querySelectorAll("button")[1] as HTMLButtonElement;
    expect(explain.disabled).toBe(false);
    const event = click(explain);
    expect(event.defaultPrevented).toBe(true);
    const message = t.lastRequest("ui/message");
    expect(message.params).toEqual({ role: "user", content: [{ type: "text", text: "Explain Oslo" }] });
    t.dispatch({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } });
    await tick();
    expect(t.alert().hidden).toBe(false);
    expect(t.alert().textContent).toContain("does not support");
    expect(t.root().querySelector(".wg-temp")?.textContent).toBe("12");
  });

  it("an http action round-trips through execute_action and updates the model context", async () => {
    const t = bootTemplate();
    t.initialize({ serverTools: { listChanged: true } });
    await tick();
    t.dispatch(toolResult({ tree: tree(12), payload }));
    const refresh = t.root().querySelector("button") as HTMLButtonElement;
    expect(refresh.disabled).toBe(false);
    click(refresh);
    const call = t.lastRequest("tools/call");
    expect(call.params).toEqual({
      name: "execute_action",
      arguments: { widget: "weather", action: "children.1", args: { city: "Oslo" }, payload }
    });
    // In flight: busy root, disabled element, no re-entry.
    expect(t.root().getAttribute("aria-busy")).toBe("true");
    expect(t.root().classList.contains("wg-busy")).toBe(true);
    click(refresh);
    expect(t.count("tools/call")).toBe(1);
    // Success: patched in place, alert clear, one dual-modality context update.
    const newPayload = { kind: "weather", data: { city: "Oslo", temp: 18 } };
    t.dispatch({ jsonrpc: "2.0", id: call.id, result: { content: [], structuredContent: { tree: tree(18), payload: newPayload } } });
    await tick();
    expect(t.root().querySelector(".wg-temp")?.textContent).toBe("18");
    expect(t.root().getAttribute("aria-busy")).toBeNull();
    expect(t.alert().hidden).toBe(true);
    const context = t.lastRequest("ui/update-model-context");
    expect(context.params.structuredContent).toEqual(newPayload);
    const content = context.params.content as { type: string; text: string }[];
    expect(content[0]).toMatchObject({ type: "text" });
    expect(content[0]?.text ?? "").toContain("children.1");
    expect(content[0]?.text ?? "").toContain("18");
    // The next action sends the NEW payload.
    click(refresh);
    expect((t.lastRequest("tools/call").params.arguments as { payload: unknown }).payload).toEqual(newPayload);
  });

  it("a failed execution keeps the render, shows the alert, and sends no context", async () => {
    const t = bootTemplate();
    t.initialize({ serverTools: {} });
    await tick();
    t.dispatch(toolResult({ tree: tree(12), payload }));
    click(t.root().querySelector("button") as HTMLElement);
    const call = t.lastRequest("tools/call");
    t.dispatch({
      jsonrpc: "2.0",
      id: call.id,
      result: { isError: true, content: [{ type: "text", text: JSON.stringify({ code: "ACTION_FETCH_FAILED", message: "target answered 500" }) }] }
    });
    await tick();
    expect(t.root().querySelector(".wg-temp")?.textContent).toBe("12");
    expect(t.alert().hidden).toBe(false);
    expect(t.alert().textContent).toBe("target answered 500");
    expect(t.count("ui/update-model-context")).toBe(0);
    expect(t.root().getAttribute("aria-busy")).toBeNull();
  });

  it("without serverTools, http elements render disabled with a reason and prompts stay live", async () => {
    const t = bootTemplate();
    t.initialize({ openLinks: {} });
    await tick();
    t.dispatch(toolResult({ tree: tree(12), payload }));
    const [refresh, explain] = Array.from(t.root().querySelectorAll("button")) as HTMLButtonElement[];
    expect(refresh?.disabled).toBe(true);
    expect(refresh?.getAttribute("aria-disabled")).toBe("true");
    expect(refresh?.getAttribute("title")).toContain("cannot run widget actions");
    expect(explain?.disabled).toBe(false);
    click(refresh as HTMLElement);
    expect(t.count("tools/call")).toBe(0);
  });

  it("server-disabled descriptors render disabled with their reason", async () => {
    const t = bootTemplate();
    t.initialize({ serverTools: {} });
    await tick();
    t.dispatch(toolResult({ tree: tree(12, { disabled: "scope" }), payload }));
    const refresh = t.root().querySelector("button") as HTMLButtonElement;
    expect(refresh.disabled).toBe(true);
    expect(refresh.getAttribute("title")).toContain("execute scope");
  });

  it("load fires exactly once per instance, after the first complete result", async () => {
    const t = bootTemplate();
    t.initialize({ serverTools: {} });
    await tick();
    t.dispatch(toolResult({ tree: tree(12), payload, load: { id: "load", kind: "http", args: { city: "Oslo" }, widget: "weather" } }));
    expect(t.count("tools/call")).toBe(1);
    const call = t.lastRequest("tools/call");
    expect(call.params.arguments).toEqual({ widget: "weather", action: "load", args: { city: "Oslo" }, payload });
    t.dispatch({ jsonrpc: "2.0", id: call.id, result: { content: [], structuredContent: { tree: tree(3), payload: { kind: "weather", data: { city: "Oslo", temp: 3 } }, load: { id: "load", kind: "http", args: {} } } } });
    await tick();
    expect(t.root().querySelector(".wg-temp")?.textContent).toBe("3");
    expect(t.count("tools/call")).toBe(1);
    // A NEW tool call on a reused frame is a new instance.
    t.dispatch({ jsonrpc: "2.0", method: "ui/notifications/tool-input", params: { arguments: { widget: "weather" } } });
    t.dispatch(toolResult({ tree: tree(12), payload, load: { id: "load", kind: "http", args: {} } }));
    expect(t.count("tools/call")).toBe(2);
  });

  it("descriptors are inert before a complete result and during a new cycle", async () => {
    const t = bootTemplate();
    t.initialize({ serverTools: {} });
    await tick();
    t.dispatch(toolResult({ tree: tree(12), payload }));
    // A new call started on this frame: the old DOM lingers until the preview lands.
    t.dispatch({ jsonrpc: "2.0", method: "ui/notifications/tool-input", params: { arguments: { widget: "weather" } } });
    click(t.root().querySelector("button") as HTMLElement);
    expect(t.count("tools/call")).toBe(0);
  });
});

describe("descriptors on script-free surfaces", () => {
  it("format app pages and the tree carry the descriptor as data only", () => {
    const catalog = createCatalog();
    registerTemplate(catalog, "bound", { tag: "button", action: { definition: { kind: "prompt", text: ["Hi"] } }, children: ["Hi"] }, { description: "b", dataShape: "{}" });
    const result = handleRenderWidget(catalog, { widget: "bound", data: {}, format: "app" });
    const resource = result.content.find((block) => block.type === "resource") as { resource: { text: string } };
    expect(resource.resource.text).toContain("data-wg-action=");
    expect(resource.resource.text).not.toContain("<script");
    expect(resource.resource.text).not.toMatch(/ on[a-z]+=/i);
  });
});

describe("group items in the frame", () => {
  it("sends at/item for item descriptors and runs group loads one after another", async () => {
    const t = bootTemplate();
    t.initialize({ serverTools: {} });
    await tick();
    const groupPayload = { kind: "group", data: { items: [{ kind: "weather", data: { city: "Oslo" } }, { kind: "weather", data: { city: "Bergen" } }] } };
    const itemTree = (city: string, index: number) => ({
      tag: "div",
      children: [{ tag: "button", attrs: { "data-wg-action": descriptor({ id: "children.0", kind: "http", args: { city }, widget: "weather", at: `data.items.${index}` }) }, children: ["Refresh"] }]
    });
    const groupTree = { tag: "div", attrs: { class: "wg-group" }, children: [itemTree("Oslo", 0), itemTree("Bergen", 1)] };
    t.dispatch(toolResult({
      tree: groupTree,
      payload: groupPayload,
      loads: [
        { id: "load", kind: "http", args: { city: "Oslo" }, widget: "weather", at: "data.items.0" },
        { id: "load", kind: "http", args: { city: "Bergen" }, widget: "weather", at: "data.items.1" }
      ]
    }));
    // First load in flight; the second waits for it.
    expect(t.count("tools/call")).toBe(1);
    const first = t.lastRequest("tools/call");
    expect(first.params.arguments).toEqual({ widget: "group", action: "load", args: { city: "Oslo" }, payload: groupPayload, at: "data.items.0", item: "weather" });
    t.dispatch({ jsonrpc: "2.0", id: first.id, result: { content: [], structuredContent: { tree: groupTree, payload: groupPayload } } });
    await tick();
    await tick();
    expect(t.count("tools/call")).toBe(2);
    const second = t.lastRequest("tools/call");
    expect((second.params.arguments as { at: string; item: string }).at).toBe("data.items.1");
    t.dispatch({ jsonrpc: "2.0", id: second.id, result: { content: [], structuredContent: { tree: groupTree, payload: groupPayload } } });
    await tick();
    await tick();
    // A click on the second item's Refresh names that item.
    const buttons = t.root().querySelectorAll("button");
    click(buttons[1] as HTMLElement);
    const call = t.lastRequest("tools/call");
    expect(call.params.arguments).toMatchObject({ widget: "group", action: "children.0", at: "data.items.1", item: "weather", args: { city: "Bergen" } });
  });
});

describe("context updates and keyboard activation", () => {
  it("truncates oversized context updates with a marker instead of dropping them", async () => {
    const t = bootTemplate();
    t.initialize({ serverTools: {} });
    await tick();
    t.dispatch(toolResult({ tree: tree(12), payload }));
    click(t.root().querySelector("button") as HTMLElement);
    const call = t.lastRequest("tools/call");
    const bigPayload = { kind: "weather", data: { city: "Oslo", temp: 18, notes: "x".repeat(20_000) } };
    t.dispatch({ jsonrpc: "2.0", id: call.id, result: { content: [], structuredContent: { tree: tree(18), payload: bigPayload } } });
    await tick();
    const context = t.lastRequest("ui/update-model-context");
    const text = (context.params.content as { text: string }[])[0]?.text ?? "";
    expect(text.length).toBeLessThanOrEqual(8192);
    expect(text).toContain("[truncated]");
    expect(context.params.structuredContent).toMatchObject({ kind: "weather", truncated: true });
    expect(JSON.stringify(context.params.structuredContent).length).toBeLessThan(9000);
  });

  it("Enter and Space activate non-button hosts; native buttons are left to their own click", async () => {
    const t = bootTemplate();
    t.initialize({ serverTools: {} });
    await tick();
    const spanTree = { tag: "div", children: [{ tag: "span", attrs: { tabindex: "0", "data-wg-action": descriptor({ id: "children.0", kind: "prompt", text: "Hi" }) }, children: ["Hi"] }] };
    t.dispatch(toolResult({ tree: spanTree, payload }));
    const span = t.root().querySelector("span") as HTMLElement;
    span.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(t.count("ui/message")).toBe(1);
    const message = t.lastRequest("ui/message");
    t.dispatch({ jsonrpc: "2.0", id: message.id, result: {} });
    await tick();
    span.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    expect(t.count("ui/message")).toBe(2);
  });
});

import { vi } from "vitest";

describe("hardening: bridge state machine", () => {
  const promptTree = { tag: "div", children: [{ tag: "a", attrs: { "data-wg-action": descriptor({ id: "children.0", kind: "prompt", text: "Hi" }) }, children: ["Hi"] }] };

  it("action anchors are focusable, role=button, and Enter/Space activate them", async () => {
    const t = bootTemplate();
    t.initialize({ serverTools: {} });
    await tick();
    t.dispatch(toolResult({ tree: promptTree, payload }));
    const anchor = t.root().querySelector("a") as HTMLElement;
    expect(anchor.getAttribute("tabindex")).toBe("0");
    expect(anchor.getAttribute("role")).toBe("button");
    anchor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(t.count("ui/message")).toBe(1);
  });

  it("drops an in-flight result whose cycle was reset by tool-input", async () => {
    const t = bootTemplate();
    t.initialize({ serverTools: {} });
    await tick();
    t.dispatch(toolResult({ tree: tree(12), payload }));
    click(t.root().querySelector("button") as HTMLElement);
    const call = t.lastRequest("tools/call");
    t.dispatch({ jsonrpc: "2.0", method: "ui/notifications/tool-input", params: { arguments: { widget: "weather" } } });
    t.dispatch({ jsonrpc: "2.0", id: call.id, result: { content: [], structuredContent: { tree: tree(99), payload: { kind: "weather", data: { temp: 99 } } } } });
    await tick();
    expect(t.root().querySelector(".wg-temp")?.textContent).not.toBe("99");
    expect(t.count("ui/update-model-context")).toBe(0);
  });

  it("a silent host times out into the alert and clears the busy state", async () => {
    vi.useFakeTimers();
    try {
      const t = bootTemplate();
      t.initialize({ serverTools: {} });
      await Promise.resolve(); await Promise.resolve();
      t.dispatch(toolResult({ tree: tree(12), payload }));
      click(t.root().querySelector("button") as HTMLElement);
      expect(t.root().getAttribute("aria-busy")).toBe("true");
      vi.advanceTimersByTime(30_001);
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      expect(t.root().getAttribute("aria-busy")).toBeNull();
      expect(t.alert().hidden).toBe(false);
      expect(t.alert().textContent).toContain("did not answer");
    } finally {
      vi.useRealTimers();
    }
  });

  it("a result that beats initialize still loads once capabilities arrive", async () => {
    const t = bootTemplate();
    t.dispatch(toolResult({ tree: tree(12), payload, load: { id: "load", kind: "http", args: { city: "Oslo" }, widget: "weather" } }));
    expect(t.count("tools/call")).toBe(0);
    t.initialize({ serverTools: {} });
    await tick();
    expect(t.count("tools/call")).toBe(1);
    expect((t.lastRequest("tools/call").params.arguments as { action: string }).action).toBe("load");
  });

  it("a load chain updates the model context once", async () => {
    const t = bootTemplate();
    t.initialize({ serverTools: {} });
    await tick();
    const groupPayload = { kind: "group", data: { items: [{ kind: "weather", data: {} }, { kind: "weather", data: {} }] } };
    t.dispatch(toolResult({ tree: tree(1), payload: groupPayload, loads: [
      { id: "load", kind: "http", args: {}, widget: "weather", at: "data.items.0" },
      { id: "load", kind: "http", args: {}, widget: "weather", at: "data.items.1" }
    ] }));
    const first = t.lastRequest("tools/call");
    t.dispatch({ jsonrpc: "2.0", id: first.id, result: { content: [], structuredContent: { tree: tree(2), payload: groupPayload } } });
    await tick(); await tick();
    expect(t.count("ui/update-model-context")).toBe(0);
    const second = t.lastRequest("tools/call");
    t.dispatch({ jsonrpc: "2.0", id: second.id, result: { content: [], structuredContent: { tree: tree(3), payload: groupPayload } } });
    await tick(); await tick();
    expect(t.count("ui/update-model-context")).toBe(1);
  });

  it("alerts clear on a new cycle; author titles survive a disabled spell", async () => {
    const t = bootTemplate();
    t.initialize({ serverTools: {} });
    await tick();
    t.dispatch(toolResult({ tree: tree(12), payload }));
    click(t.root().querySelector("button") as HTMLElement);
    const call = t.lastRequest("tools/call");
    t.dispatch({ jsonrpc: "2.0", id: call.id, result: { isError: true, content: [{ type: "text", text: JSON.stringify({ code: "X", message: "boom" }) }] } });
    await tick();
    expect(t.alert().hidden).toBe(false);
    t.dispatch({ jsonrpc: "2.0", method: "ui/notifications/tool-input", params: { arguments: {} } });
    expect(t.alert().hidden).toBe(true);
    // Title: disabled reason replaces it, re-enabling restores it.
    const titled = (extra: Record<string, unknown>) => ({ tag: "div", children: [{ tag: "button", attrs: { title: "Author tip", "data-wg-action": descriptor({ id: "children.0", kind: "http", args: {}, ...extra }) }, children: ["Go"] }] });
    t.dispatch(toolResult({ tree: titled({ disabled: "scope" }), payload }));
    expect(t.root().querySelector("button")?.getAttribute("title")).toContain("execute scope");
    t.dispatch(toolResult({ tree: titled({}), payload }));
    expect(t.root().querySelector("button")?.getAttribute("title")).toBe("Author tip");
  });

  it("an action inside a link does not also open the link", async () => {
    const t = bootTemplate();
    t.initialize({ serverTools: {} });
    await tick();
    t.dispatch(toolResult({ tree: { tag: "a", attrs: { href: "https://x.example" }, children: [{ tag: "button", attrs: { "data-wg-action": descriptor({ id: "children.0", kind: "prompt", text: "Hi" }) }, children: ["Hi"] }] }, payload }));
    click(t.root().querySelector("button") as HTMLElement);
    expect(t.count("ui/message")).toBe(1);
    expect(t.count("ui/open-link")).toBe(0);
  });
});
