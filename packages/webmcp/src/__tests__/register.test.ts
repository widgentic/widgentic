// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { designerTools, exposeDesigners, okResult, registerTools, resolveModelContext } from "../index.js";
import type { ModelContextLike, WebMcpTool } from "../index.js";

interface Recorded { tool: WebMcpTool; options: { signal?: AbortSignal } | undefined }

function fakeContext(options: { reject?: string[]; withUnregister?: boolean } = {}) {
  const calls: Recorded[] = [];
  const unregistered: string[] = [];
  const context: ModelContextLike = {
    registerTool(tool, opts) {
      calls.push({ tool, options: opts });
      if (options.reject?.includes(tool.name)) return Promise.reject(new DOMException("duplicate", "NotAllowedError"));
      return Promise.resolve();
    },
    ...(options.withUnregister === true ? { unregisterTool: (name: string) => { unregistered.push(name); } } : {})
  };
  return { context, calls, unregistered };
}

const none = () => undefined;

function defineGlobal(target: object, value: unknown): () => void {
  Object.defineProperty(target, "modelContext", { value, configurable: true, writable: true });
  return () => { Reflect.deleteProperty(target, "modelContext"); };
}

afterEach(() => {
  Reflect.deleteProperty(document, "modelContext");
  Reflect.deleteProperty(navigator, "modelContext");
});

describe("registration", () => {
  it("is a reported no-op without an agent-capable browser", async () => {
    expect(resolveModelContext()).toBeUndefined();
    const result = await exposeDesigners({ widget: none });
    expect(result.supported).toBe(false);
    expect(result.registered).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.tools.length).toBe(7);
    expect(() => result.dispose()).not.toThrow();
  });

  it("registers every descriptor once, with an abort signal", async () => {
    const { context, calls } = fakeContext();
    const tools = designerTools({ widget: none, theme: none });
    const result = await registerTools(tools, { modelContext: context });
    expect(result.supported).toBe(true);
    expect(calls.map((c) => c.tool.name)).toEqual(tools.map((t) => t.name));
    for (const call of calls) expect(call.options?.signal).toBeInstanceOf(AbortSignal);
    expect(result.registered).toEqual(tools.map((t) => t.name));
    expect(result.failed).toEqual([]);
  });

  it("prefers the document's context over the navigator's", async () => {
    const a = fakeContext();
    const b = fakeContext();
    const restoreDoc = defineGlobal(document, a.context);
    const restoreNav = defineGlobal(navigator, b.context);
    try {
      expect(resolveModelContext()).toBe(a.context);
      await exposeDesigners({ widget: none });
      expect(a.calls.length).toBe(7);
      expect(b.calls.length).toBe(0);
      restoreDoc();
      expect(resolveModelContext()).toBe(b.context);
    } finally {
      restoreDoc();
      restoreNav();
    }
  });

  it("keeps going when one registration is rejected and names the failure", async () => {
    const { context } = fakeContext({ reject: ["widgentic_widget_draft_load"] });
    const result = await exposeDesigners({ widget: none }, { modelContext: context });
    expect(result.registered).toEqual([
      "widgentic_widget_draft_get",
      "widgentic_widget_example_data_set",
      "widgentic_widget_theme_set",
      "widgentic_authoring_guide",
      "widgentic_widget_definition_check",
      "widgentic_theme_token_specs"
    ]);
    expect(result.failed).toEqual([{ name: "widgentic_widget_draft_load", message: "duplicate" }]);
  });

  it("disposes everything at once, idempotently", async () => {
    const { context, calls, unregistered } = fakeContext({ withUnregister: true });
    const result = await exposeDesigners({ widget: none }, { modelContext: context });
    const signal = calls[0]?.options?.signal;
    expect(signal?.aborted).toBe(false);
    result.dispose();
    expect(signal?.aborted).toBe(true);
    expect(unregistered).toEqual(result.registered);
    result.dispose();
    expect(unregistered.length).toBe(result.registered.length);
  });

  it("follows a host signal", async () => {
    const { context, calls } = fakeContext();
    const controller = new AbortController();
    await exposeDesigners({ widget: none }, { modelContext: context, signal: controller.signal });
    controller.abort();
    expect(calls[0]?.options?.signal?.aborted).toBe(true);
  });

  it("registers a host's own tool under the same signal", async () => {
    const { context, calls } = fakeContext();
    const execute = vi.fn(async () => okResult({ saved: false }));
    const extra: WebMcpTool = { name: "acme_ping", description: "ping", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute };
    const result = await exposeDesigners({ widget: none }, { modelContext: context, tools: [extra], prefix: "acme" });
    expect(result.registered).toContain("acme_ping");
    const signals = new Set(calls.map((c) => c.options?.signal));
    expect(signals.size).toBe(1);
    expect(result.tools).toContain(extra);
  });
});
