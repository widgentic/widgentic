// @vitest-environment node
import { describe, expect, it } from "vitest";
import { composeCatalog, createMemoryStore } from "../../store/index.js";
import type { StoredAction, StoredWidget } from "../../store/index.js";
import { handleExecuteAction, handleRenderWidget } from "../index.js";
import type { GuardedFetchDeps, PinnedFetch } from "../index.js";
import { renderToHtml } from "../../catalog/index.js";
import type { WidgetNode } from "../../catalog/index.js";

const refresh: StoredAction = {
  name: "refresh",
  definition: {
    kind: "http",
    method: "GET",
    url: "https://api.example.com/weather",
    input: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
    output: { type: "object", properties: { temp: { type: "number" } }, required: ["temp"] },
    headers: { Authorization: { secret: "weather-token" } }
  }
};
const weather: StoredWidget = {
  kind: "weather",
  template: {
    tag: "div",
    children: [
      { tag: "span", children: [{ bind: "city" }, ": ", { bind: "temp" }] },
      { tag: "button", action: { ref: "refresh", input: { city: "city" } }, children: ["Refresh"] },
      { tag: "button", action: { definition: { kind: "prompt", text: ["Explain ", { bind: "city" }] } }, children: ["Explain"] }
    ]
  },
  descriptor: {
    description: "weather",
    dataShape: "{ city, temp }",
    dataSchema: { type: "object", properties: { temp: { type: "number" } } }
  },
  load: { ref: "refresh", input: { city: "city" } }
};
const payload = { kind: "weather", data: { city: "Oslo", temp: 12 } };

function jsonResponse(status: number, body: unknown, contentType = "application/json"): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": contentType } });
}

async function rig(scopes: string[] = ["read", "execute"], secret: string | null = "sk-live-123") {
  const store = createMemoryStore([
    { principal: { id: "alice", scopes: ["read", "execute"] }, widgets: [weather], actions: [refresh] },
    { principal: { id: "bob", scopes: ["read", "execute"] } }
  ]);
  const composed = await composeCatalog(store, "alice", { executeAllowed: scopes.includes("execute") });
  const calls: { url: string; init: Parameters<PinnedFetch>[1] }[] = [];
  const deps = (respond: (url: string) => Response): GuardedFetchDeps => ({
    lookupImpl: async () => ["93.184.216.34"],
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return respond(url);
    }
  });
  const run = (input: unknown, respond: (url: string) => Response, extra: Record<string, unknown> = {}) =>
    handleExecuteAction(composed.value, input, {
      actions: composed.actions,
      scopes,
      secrets: async (name) => (name === "weather-token" && secret !== null ? secret : undefined),
      fetchDeps: deps(respond),
      ...extra
    });
  return { composed, run, calls };
}

const errorOf = (result: { content: { type: string; text?: string }[] }) =>
  JSON.parse(String(result.content[0]?.text)) as { code: string; message: string; path?: string };

describe("execute_action", () => {
  it("runs a bound http action and re-renders the merged payload", async () => {
    const { run, calls } = await rig();
    const result = await run({ widget: "weather", action: "children.1", args: { city: "Oslo" }, payload }, () => jsonResponse(200, { temp: 18 }));
    expect(result.isError).toBeUndefined();
    expect(calls[0]?.url).toBe("https://api.example.com/weather?city=Oslo");
    expect(calls[0]?.init.headers).toMatchObject({ Authorization: "sk-live-123" });
    const sc = result.structuredContent as { payload: { data: unknown }; tree: WidgetNode; html: string };
    expect(sc.payload.data).toEqual({ city: "Oslo", temp: 18 });
    expect(renderToHtml(sc.tree)).toBe(sc.html);
    expect(sc.html).toContain("Oslo: 18");
    expect(JSON.stringify(result)).not.toContain("sk-live-123");
  });

  it("ignores tampered request fields and executes only the stored definition", async () => {
    const { run, calls } = await rig();
    await run(
      { widget: "weather", action: "children.1", args: { city: "Oslo" }, payload, url: "https://evil.example/x", headers: { X: "y" }, method: "POST" },
      () => jsonResponse(200, { temp: 1 })
    );
    expect(calls[0]?.url).toBe("https://api.example.com/weather?city=Oslo");
    expect(calls[0]?.init.method).toBe("GET");
  });

  it("refuses without the execute scope, before any network activity", async () => {
    const { run, calls } = await rig(["read"]);
    const result = await run({ widget: "weather", action: "children.1", args: { city: "Oslo" }, payload }, () => jsonResponse(200, { temp: 1 }));
    expect(errorOf(result).code).toBe("FORBIDDEN_SCOPE");
    expect(calls).toHaveLength(0);
  });

  it("another principal's kind is unknown and nothing is fetched", async () => {
    const store = createMemoryStore([{ principal: { id: "bob", scopes: ["read", "execute"] } }]);
    const composed = await composeCatalog(store, "bob");
    let fetched = 0;
    const result = await handleExecuteAction(composed.value, { widget: "weather", action: "children.1", payload }, {
      actions: composed.actions,
      scopes: ["read", "execute"],
      fetchDeps: { fetchImpl: async () => { fetched++; return jsonResponse(200, {}); }, lookupImpl: async () => ["93.184.216.34"] }
    });
    expect(errorOf(result).code).toBe("UNKNOWN_KIND");
    expect(fetched).toBe(0);
  });

  it("unknown bindings, prompt bindings and bad arguments are refused", async () => {
    const { run } = await rig();
    expect(errorOf(await run({ widget: "weather", action: "children.9", payload }, () => jsonResponse(200, {}))).code).toBe("UNKNOWN_ACTION");
    expect(errorOf(await run({ widget: "weather", action: "children.2", payload }, () => jsonResponse(200, {}))).code).toBe("ACTION_NOT_HTTP");
    const bad = errorOf(await run({ widget: "weather", action: "children.1", args: {}, payload }, () => jsonResponse(200, {})));
    expect(bad).toMatchObject({ code: "INVALID_ACTION_INPUT", path: "args.city" });
  });

  it("private targets are refused before bytes are read", async () => {
    const { composed } = await rig();
    let fetched = 0;
    const result = await handleExecuteAction(composed.value, { widget: "weather", action: "children.1", args: { city: "Oslo" }, payload }, {
      actions: composed.actions,
      scopes: ["read", "execute"],
      secrets: async () => "sk",
      fetchDeps: { lookupImpl: async () => ["10.0.0.5"], fetchImpl: async () => { fetched++; return jsonResponse(200, { temp: 1 }); } }
    });
    expect(errorOf(result).code).toBe("ACTION_FETCH_FAILED");
    expect(fetched).toBe(0);
  });

  it("redirects are failures", async () => {
    const { run } = await rig();
    const result = await run({ widget: "weather", action: "children.1", args: { city: "Oslo" }, payload }, () => new Response(null, { status: 302, headers: { location: "https://elsewhere.example/" } }));
    expect(errorOf(result)).toMatchObject({ code: "ACTION_FETCH_FAILED", message: expect.stringContaining("redirect") });
  });

  it("remote echoes of the secret are redacted", async () => {
    const { run } = await rig();
    const result = await run({ widget: "weather", action: "children.1", args: { city: "Oslo" }, payload }, () => jsonResponse(401, { error: "invalid key sk-live-123" }));
    const error = errorOf(result);
    expect(error.code).toBe("ACTION_FETCH_FAILED");
    expect(error.message).toContain("invalid key ***");
    expect(JSON.stringify(result)).not.toContain("sk-live-123");
  });

  it("unknown secrets and schema-breaking responses are refused", async () => {
    const missing = await rig(["read", "execute"], null);
    expect(errorOf(await missing.run({ widget: "weather", action: "children.1", args: { city: "Oslo" }, payload }, () => jsonResponse(200, { temp: 1 }))).code).toBe("UNKNOWN_SECRET");
    const { run } = await rig();
    expect(errorOf(await run({ widget: "weather", action: "children.1", args: { city: "Oslo" }, payload }, () => jsonResponse(200, { temp: "warm" }))).code).toBe("INVALID_ACTION_OUTPUT");
    expect(errorOf(await run({ widget: "weather", action: "children.1", args: { city: "Oslo" }, payload }, () => jsonResponse(200, "<html>", "text/html"))).code).toBe("ACTION_FETCH_FAILED");
  });

  it("the rate-limit gate refuses without executing", async () => {
    const { run, calls } = await rig();
    const result = await run({ widget: "weather", action: "children.1", args: { city: "Oslo" }, payload }, () => jsonResponse(200, { temp: 1 }), { rateLimit: () => false });
    expect(errorOf(result).code).toBe("RATE_LIMITED");
    expect(calls).toHaveLength(0);
  });

  it("load executes as a binding of its own", async () => {
    const { run, calls } = await rig();
    const result = await run({ widget: "weather", action: "load", args: { city: "Oslo" }, payload }, () => jsonResponse(200, { temp: 3 }));
    expect(result.isError).toBeUndefined();
    expect(calls[0]?.url).toContain("city=Oslo");
    expect((result.structuredContent as { payload: { data: { temp: number } } }).payload.data.temp).toBe(3);
  });
});

describe("render_widget load descriptors", () => {
  it("rides structuredContent only for callers who may execute", async () => {
    const store = createMemoryStore([{ principal: { id: "alice", scopes: ["read", "execute"] }, widgets: [weather], actions: [refresh] }]);
    const allowed = await composeCatalog(store, "alice", { executeAllowed: true });
    const withLoad = handleRenderWidget(allowed.value, { widget: "weather", data: payload.data }, {
      actions: { load: allowed.actions!.load, resolve: allowed.actions!.resolve, executeAllowed: true }
    });
    expect(withLoad.structuredContent?.load).toEqual({ id: "load", kind: "http", args: { city: "Oslo" }, widget: "weather" });
    const denied = await composeCatalog(store, "alice", { executeAllowed: false });
    const withoutLoad = handleRenderWidget(denied.value, { widget: "weather", data: payload.data }, {
      actions: { load: denied.actions!.load, resolve: denied.actions!.resolve, executeAllowed: false }
    });
    expect(withoutLoad.structuredContent?.load).toBeUndefined();
    const html = (withoutLoad.structuredContent as { html: string }).html;
    expect(html).toContain("&quot;disabled&quot;:&quot;scope&quot;");
  });
});

describe("model-facing action notes", () => {
  it("explain disabled, live, and load behavior; plain widgets get no tail", async () => {
    const store = createMemoryStore([{ principal: { id: "alice", scopes: ["read", "execute"] }, widgets: [weather], actions: [refresh] }]);
    const readOnly = await composeCatalog(store, "alice", { executeAllowed: false });
    const roText = String(handleRenderWidget(readOnly.value, { widget: "weather", data: payload.data }, {
      actions: { load: readOnly.actions!.load, resolve: readOnly.actions!.resolve, executeAllowed: false }
    }).content[0]?.text);
    expect(roText).toContain("Action notes:");
    expect(roText).toContain("disabled for this API key — it lacks the 'execute' scope");
    expect(roText).toContain("1 prompt action");
    expect(roText).not.toContain("loads its data");
    const live = await composeCatalog(store, "alice");
    const liveText = String(handleRenderWidget(live.value, { widget: "weather", data: payload.data }, {
      actions: { load: live.actions!.load, resolve: live.actions!.resolve, executeAllowed: true }
    }).content[0]?.text);
    expect(liveText).toContain("1 http action that runs server-side");
    expect(liveText).toContain("it loads its data on first render");
    expect(liveText).toContain("You do not call execute_action yourself");
    const plain = String(handleRenderWidget(live.value, { widget: "card", data: { title: "x" } }).content[0]?.text);
    expect(plain).not.toContain("Action notes:");
  });
});

describe("actions inside group renders", () => {
  const card = { kind: "card", data: { title: "8-day outlook" } };
  const group = { kind: "group", data: { items: [payload, card] } };

  it("item descriptors carry widget and at; execute folds into the item and re-renders the group", async () => {
    const { composed, run, calls } = await rig();
    const rendered = handleRenderWidget(composed.value, { widget: "group", data: group.data }, {
      actions: { load: composed.actions!.load, resolve: composed.actions!.resolve, executeAllowed: true }
    });
    const html = (rendered.structuredContent as { html: string }).html;
    expect(html).toContain("&quot;widget&quot;:&quot;weather&quot;");
    expect(html).toContain("&quot;at&quot;:&quot;data.items.0&quot;");
    // The group's own load list carries the weather item's load, stamped.
    expect((rendered.structuredContent as { loads?: unknown[] }).loads).toEqual([
      { id: "load", kind: "http", args: { city: "Oslo" }, widget: "weather", at: "data.items.0" }
    ]);
    const result = await run(
      { widget: "group", action: "children.1", at: "data.items.0", item: "weather", args: { city: "Oslo" }, payload: group },
      () => jsonResponse(200, { temp: 21 })
    );
    expect(result.isError).toBeUndefined();
    expect(calls[0]?.url).toBe("https://api.example.com/weather?city=Oslo");
    const sc = result.structuredContent as { payload: { kind: string; data: { items: { data: unknown }[] } }; html: string };
    expect(sc.payload.kind).toBe("group");
    expect(sc.payload.data.items[0]?.data).toEqual({ city: "Oslo", temp: 21 });
    expect(sc.payload.data.items[1]).toEqual(card);
    expect(sc.html).toContain("Oslo: 21");
    expect(sc.html).toContain("8-day outlook");
  });

  it("a wrong or missing item location is refused", async () => {
    const { run } = await rig();
    expect(errorOf(await run({ widget: "group", action: "children.1", at: "data.items.5", item: "weather", payload: group }, () => jsonResponse(200, {}))).code).toBe("INVALID_TYPE");
    expect(errorOf(await run({ widget: "group", action: "children.1", at: "data.items.1", item: "weather", payload: group }, () => jsonResponse(200, {}))).code).toBe("INVALID_TYPE");
    expect(errorOf(await run({ widget: "group", action: "children.1", payload: group }, () => jsonResponse(200, {}))).code).toBe("UNKNOWN_ACTION");
  });
});

describe("hardening: execute_action input and error hygiene", () => {
  it("refuses empty ids and stray locations before fetching", async () => {
    const { run, calls } = await rig();
    expect(errorOf(await run({ widget: "weather", action: "", payload }, () => jsonResponse(200, {}))).code).toBe("MISSING_FIELD");
    expect(errorOf(await run({ widget: "weather", action: "children.1", at: "meta.x", item: "weather", args: { city: "Oslo" }, payload }, () => jsonResponse(200, {})))).toMatchObject({ code: "INVALID_TYPE", path: "at" });
    expect(calls).toHaveLength(0);
  });

  it("never echoes store or vault error text; names the referencing field for unknown secrets", async () => {
    const { composed } = await rig();
    const result = await handleExecuteAction(composed.value, { widget: "weather", action: "children.1", args: { city: "Oslo" }, payload }, {
      actions: composed.actions,
      scopes: ["read", "execute"],
      secrets: async () => { throw new Error("KeyVault https://kv.vault.azure.net/keys/kek/abc unreachable"); },
      fetchDeps: { lookupImpl: async () => ["93.184.216.34"], fetchImpl: async () => jsonResponse(200, {}) }
    });
    const error = errorOf(result);
    expect(error.code).toBe("ACTION_FETCH_FAILED");
    expect(JSON.stringify(result)).not.toContain("kv.vault.azure.net");
    const missing = await rig(["read", "execute"], null);
    expect(errorOf(await missing.run({ widget: "weather", action: "children.1", args: { city: "Oslo" }, payload }, () => jsonResponse(200, {})))).toMatchObject({ code: "UNKNOWN_SECRET", path: "headers.Authorization" });
  });

  it("testHttpAction validates the definition before doing anything", async () => {
    const { testHttpAction } = await import("../index.js");
    const malformed = await testHttpAction({ kind: "http" }, {}, {});
    expect(malformed).toMatchObject({ ok: false, code: "INVALID_ACTION_INPUT" });
    const prompt = await testHttpAction({ kind: "prompt", text: ["x"] }, {}, {});
    expect(prompt).toMatchObject({ ok: false, code: "ACTION_NOT_HTTP" });
  });

  it("notes count bindings, not repeated rows, and agree in number", async () => {
    const store = createMemoryStore([{
      principal: { id: "alice", scopes: ["read", "execute"] },
      widgets: [{
        kind: "rows",
        template: { tag: "ul", children: [{ each: "rows", template: { tag: "button", action: { ref: "refresh", input: { city: "city" } }, children: ["Go"] } }] },
        descriptor: { description: "rows", dataShape: "{ rows }" }
      }],
      actions: [refresh]
    }]);
    const composed = await composeCatalog(store, "alice");
    const text = String(handleRenderWidget(composed.value, { widget: "rows", data: { rows: Array.from({ length: 20 }, (_, i) => ({ city: `c${i}` })) } }, {
      actions: { load: composed.actions!.load, resolve: composed.actions!.resolve, executeAllowed: true }
    }).content[0]?.text);
    expect(text).toContain("1 http action that runs server-side");
    expect(text).not.toContain("20 http");
  });
});
