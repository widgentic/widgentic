/**
 * Shared harness for the app template's inline bridge: runs the served
 * script against the current (happy-dom) document with a faked parent
 * window, records what the frame posts, and dispatches host messages into
 * its listener. Suites that need a host answering requests use `answer`.
 */
import { buildAppTemplate } from "../index.js";

export function bootTemplate() {
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
  const requests = (method: string) =>
    sent.filter((m) => m.method === method) as { id: number; params: Record<string, unknown> }[];
  return {
    sent,
    dispatch,
    root: () => document.getElementById("wg-root") as HTMLElement,
    css: () => document.getElementById("wg-dynamic-css")?.textContent ?? "",
    /** Answer the bridge's initialize request with the given host capabilities. */
    initialize(hostCapabilities: Record<string, unknown>) {
      const init = requests("ui/initialize")[0];
      dispatch({ jsonrpc: "2.0", id: init?.id, result: { hostCapabilities, hostContext: {} } });
    },
    requests,
    /** Resolve (or, with `error`, reject) the request with this id. */
    answer(id: number, outcome: { result?: unknown; error?: unknown }) {
      dispatch({ jsonrpc: "2.0", id, ...outcome });
    }
  };
}

export const toolResult = (structuredContent: Record<string, unknown>) => ({
  jsonrpc: "2.0",
  method: "ui/notifications/tool-result",
  params: { structuredContent }
});

export const toolInputPartial = (args: Record<string, unknown>) => ({
  jsonrpc: "2.0",
  method: "ui/notifications/tool-input-partial",
  params: { arguments: args }
});

/** Past the bridge's frame coalescing (setTimeout(16) without rAF). */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

/** Let promise callbacks inside the bridge run. */
export const tick = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};
