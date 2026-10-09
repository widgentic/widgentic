// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createCatalog } from "@widgentic/core";
import { handleRenderWidget } from "../index.js";
import { bootTemplate, settle, tick, toolInputPartial, toolResult } from "./template-harness.js";

const personTree = (name: string) => ({
  tag: "div",
  attrs: { class: "wg-person" },
  children: [{ tag: "strong", children: [name] }]
});
const previewAnswer = (name: string) => ({
  result: {
    content: [{ type: "text", text: "Preview of 'person'." }],
    structuredContent: { tree: personTree(name), css: ".wg-person { color: red }" }
  }
});

function serverHost() {
  const t = bootTemplate();
  t.initialize({ serverTools: {} });
  return t;
}

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("server previews for custom kinds", () => {
  it("previews a stored kind through preview_widget, then yields to the result", async () => {
    const t = serverHost();
    await tick();
    t.dispatch(toolInputPartial({ widget: "person", data: { name: "Ada" }, format: "both" }));
    await settle();
    const [call] = t.requests("tools/call");
    expect(call?.params).toEqual({ name: "preview_widget", arguments: { widget: "person", data: { name: "Ada" } } });
    expect(t.root().textContent).toContain("Generating 'person'");

    t.answer(call?.id ?? -1, previewAnswer("Ada"));
    await tick();
    expect(t.root().getAttribute("data-wgd-preview")).toBe("true");
    expect(t.root().querySelector(".wg-person")?.textContent).toBe("Ada");
    expect(t.css()).toContain(".wg-person");

    t.dispatch(toolResult({ tree: personTree("Ada Lovelace"), css: "", payload: { kind: "person", data: {} } }));
    expect(t.root().hasAttribute("data-wgd-preview")).toBe(false);
    expect(t.root().querySelector(".wg-person")?.textContent).toBe("Ada Lovelace");
  });

  it("keeps one request in flight and sends the latest snapshot when it settles", async () => {
    const t = serverHost();
    await tick();
    t.dispatch(toolInputPartial({ widget: "person", data: { name: "A" } }));
    await settle();
    for (const name of ["Ad", "Ada", "Ada L"]) {
      t.dispatch(toolInputPartial({ widget: "person", data: { name } }));
      await settle();
    }
    expect(t.requests("tools/call")).toHaveLength(1);
    t.answer(t.requests("tools/call")[0]?.id ?? -1, previewAnswer("A"));
    await tick();
    const calls = t.requests("tools/call");
    expect(calls).toHaveLength(2);
    expect(calls[1]?.params.arguments).toEqual({ widget: "person", data: { name: "Ada L" } });
  });

  it("keeps the last server preview on screen between answers", async () => {
    const t = serverHost();
    await tick();
    t.dispatch(toolInputPartial({ widget: "person", data: { name: "Ada" } }));
    await settle();
    t.answer(t.requests("tools/call")[0]?.id ?? -1, previewAnswer("Ada"));
    await tick();
    t.dispatch(toolInputPartial({ widget: "person", data: { name: "Ada L" } }));
    await settle();
    expect(t.root().querySelector(".wg-person")?.textContent).toBe("Ada");
    expect(t.root().textContent).not.toContain("Generating");
  });

  it.each([
    ["an error result", { result: { isError: true, content: [{ type: "text", text: '{"code":"RATE_LIMITED"}' }] } }],
    ["a rejected request", { error: { code: -32601, message: "Method not found" } }]
  ])("stops previews and keeps the skeleton after %s", async (_label, outcome) => {
    const t = serverHost();
    await tick();
    t.dispatch(toolInputPartial({ widget: "person", data: { name: "A" } }));
    await settle();
    t.answer(t.requests("tools/call")[0]?.id ?? -1, outcome);
    await tick();
    t.dispatch(toolInputPartial({ widget: "person", data: { name: "Ada" } }));
    await settle();
    expect(t.requests("tools/call")).toHaveLength(1);
    expect(t.root().textContent).toContain("Generating 'person'");
  });

  it("never asks without serverTools", async () => {
    const t = bootTemplate();
    t.initialize({});
    await tick();
    t.dispatch(toolInputPartial({ widget: "person", data: { name: "Ada" } }));
    await settle();
    expect(t.requests("tools/call")).toHaveLength(0);
    expect(t.root().textContent).toContain("Generating 'person'");
  });

  it("discards an answer that arrives after the result and asks nothing more", async () => {
    const t = serverHost();
    await tick();
    t.dispatch(toolInputPartial({ widget: "person", data: { name: "A" } }));
    await settle();
    t.dispatch(toolInputPartial({ widget: "person", data: { name: "Ad" } }));
    await settle();
    t.dispatch(toolResult({ tree: personTree("Result"), css: "", payload: { kind: "person", data: {} } }));
    t.answer(t.requests("tools/call")[0]?.id ?? -1, previewAnswer("Late"));
    await tick();
    expect(t.root().querySelector(".wg-person")?.textContent).toBe("Result");
    expect(t.root().hasAttribute("data-wgd-preview")).toBe(false);
    expect(t.requests("tools/call")).toHaveLength(1);
  });

  it("previews a group with a custom item through the server", async () => {
    const t = serverHost();
    await tick();
    const args = {
      widget: "group",
      data: { items: [{ kind: "card", data: { title: "A" } }, { kind: "person", data: { name: "Ada" } }] }
    };
    t.dispatch(toolInputPartial(args));
    await settle();
    expect(t.root().querySelectorAll(".wg-card")).toHaveLength(1);
    expect(t.root().textContent).toContain("Generating 'person'");
    const [call] = t.requests("tools/call");
    expect(call?.params.arguments).toEqual(args);
    t.answer(call?.id ?? -1, {
      result: { structuredContent: { tree: { tag: "div", attrs: { class: "wg-group" }, children: [personTree("Ada")] }, css: "" } }
    });
    await tick();
    expect(t.root().querySelector(".wg-person")?.textContent).toBe("Ada");
  });

  it("previews built-in kinds client-side without calling the server", async () => {
    const t = serverHost();
    await tick();
    t.dispatch(toolInputPartial({ widget: "table", data: [{ name: "Ada" }] }));
    await settle();
    t.dispatch(toolInputPartial({ widget: "group", data: { items: [{ kind: "card", data: { title: "A" } }] } }));
    await settle();
    expect(t.requests("tools/call")).toHaveLength(0);
  });

  it("starts a fresh run for a new call on a reused frame", async () => {
    const t = serverHost();
    await tick();
    t.dispatch(toolInputPartial({ widget: "person", data: { name: "A" } }));
    await settle();
    t.answer(t.requests("tools/call")[0]?.id ?? -1, { error: { code: -1, message: "no" } });
    await tick();
    t.dispatch(toolResult({ tree: personTree("First"), css: "", payload: { kind: "person", data: {} } }));
    t.dispatch(toolInputPartial({ widget: "person", data: { name: "B" } }));
    await settle();
    expect(t.requests("tools/call")).toHaveLength(2);
  });
});

describe("previews wait for a settled widget name", () => {
  // Snapshots keep the streamed key order: a name is settled once another
  // key follows it, or in the complete tool-input.
  const toolInput = (args: Record<string, unknown>) => ({
    jsonrpc: "2.0",
    method: "ui/notifications/tool-input",
    params: { arguments: args }
  });

  it("shows an unnamed placeholder while the data streams before the widget", async () => {
    const t = serverHost();
    await tick();
    t.dispatch(toolInputPartial({ data: { appointments: [{ id: "a1", title: "Kickoff" }] } }));
    await settle();
    expect(t.root().textContent).toBe("Generating\u2026");
    expect(t.root().getAttribute("data-wgd-preview")).toBe("true");
    expect(t.requests("tools/call")).toHaveLength(0);
  });

  it("neither names nor requests a half-streamed widget name", async () => {
    const t = serverHost();
    await tick();
    t.dispatch(toolInputPartial({ data: { appointments: [] }, widget: "appointme" }));
    await settle();
    expect(t.root().textContent).toBe("Generating\u2026");
    expect(t.requests("tools/call")).toHaveLength(0);
  });

  it("requests the preview once the complete input settles a trailing name", async () => {
    const t = serverHost();
    await tick();
    t.dispatch(toolInputPartial({ data: { name: "Ada" }, widget: "pers" }));
    await settle();
    t.dispatch(toolInput({ data: { name: "Ada" }, widget: "person" }));
    await settle();
    const calls = t.requests("tools/call");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.params.arguments).toEqual({ widget: "person", data: { name: "Ada" } });
    expect(t.root().textContent).toContain("Generating 'person'");
  });

  it("does not build a built-in preview from a prefix of a stored kind's name", async () => {
    const t = serverHost();
    await tick();
    t.dispatch(toolInputPartial({ widget: "card" }));
    await settle();
    expect(t.root().querySelector(".wg-card")).toBeNull();
    expect(t.root().textContent).toBe("Generating\u2026");
    t.dispatch(toolInputPartial({ widget: "card-deluxe", data: { title: "T" } }));
    await settle();
    expect(t.root().querySelector(".wg-card")).toBeNull();
    expect(t.requests("tools/call")[0]?.params.arguments).toEqual({ widget: "card-deluxe", data: { title: "T" } });
  });

  it("previews a settled built-in name at once", async () => {
    const t = serverHost();
    await tick();
    t.dispatch(toolInputPartial({ widget: "table", data: [{ name: "Ada" }] }));
    await settle();
    expect(t.root().querySelectorAll(".wg-table-row")).toHaveLength(1);
  });

  it("shows a group item still naming itself as an unnamed placeholder and leaves it out of the request", async () => {
    const t = serverHost();
    await tick();
    t.dispatch(toolInputPartial({
      widget: "group",
      data: { items: [{ kind: "person", data: { name: "Ada" } }, { kind: "car" }] }
    }));
    await settle();
    expect(t.root().textContent).toContain("Generating 'person'");
    expect(t.root().textContent).toContain("Generating\u2026");
    expect(t.root().textContent).not.toContain("'car'");
    expect(t.requests("tools/call")[0]?.params.arguments).toEqual({
      widget: "group",
      data: { items: [{ kind: "person", data: { name: "Ada" } }] }
    });
  });
});

describe("keyed results through the template's patcher", () => {
  it("moves keyed table rows with their records", () => {
    const catalog = createCatalog();
    const render = (data: unknown) =>
      handleRenderWidget(catalog, { widget: "table", data }).structuredContent as Record<string, unknown>;
    const rows = [{ id: 1, name: "Ada" }, { id: 2, name: "Grace" }, { id: 3, name: "Linus" }];
    const t = bootTemplate();
    t.dispatch(toolResult(render(rows)));
    const before = new Map([...t.root().querySelectorAll("tbody tr")].map((row) => [row.textContent, row]));
    t.dispatch(toolResult(render([...rows].reverse())));
    const after = [...t.root().querySelectorAll("tbody tr")];
    expect(after.map((row) => row.textContent)).toEqual(["3Linus", "2Grace", "1Ada"]);
    for (const row of after) expect(before.get(row.textContent)).toBe(row);
  });
});
