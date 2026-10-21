// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { compileTemplate } from "@widgentic/core";
import { bootTemplate, settle, tick, toolInputPartial, toolResult } from "./template-harness.js";

const INSTANT = "2026-10-21T16:30:00.000Z";
const stamp = (pattern = "HH:mm") => ({
  tag: "p",
  attrs: { class: "wg-when" },
  children: [{ tag: "time", attrs: { datetime: INSTANT, "data-wg-date": pattern }, children: ["16:30"] }]
});
const inZone = (timeZone: string | undefined) =>
  new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).format(
    new Date(INSTANT)
  );

/** Boot the frame and answer its initialize with this host context (applied once the answer settles). */
async function hostWith(hostContext: Record<string, unknown>, hostCapabilities: Record<string, unknown> = {}) {
  const t = bootTemplate();
  const init = t.requests("ui/initialize")[0];
  t.dispatch({ jsonrpc: "2.0", id: init?.id, result: { hostCapabilities, hostContext } });
  await tick();
  return t;
}
const timeText = (t: { root: () => HTMLElement }) => t.root().querySelector("time")?.textContent;

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("the frame shows viewer-zone dates in the viewer's zone", () => {
  it("a viewer-zone date renders in the host's zone", async () => {
    const t = await hostWith({ timeZone: "Asia/Tokyo" });
    t.dispatch(toolResult({ tree: stamp(), css: "" }));
    expect(timeText(t)).toBe("01:30");
    expect(t.root().querySelector("time")?.getAttribute("datetime")).toBe(INSTANT);
  });

  it("formats every token on a 24-hour clock", async () => {
    const t = await hostWith({ timeZone: "America/New_York" });
    t.dispatch(toolResult({ tree: stamp("yyyy-MM-dd HH:mm:ss"), css: "" }));
    expect(timeText(t)).toBe("2026-10-21 12:30:00");
  });

  it("without a usable host zone the frame's own zone applies", async () => {
    // The frame's own zone, made other than UTC so the case is not vacuous.
    const saved = process.env.TZ;
    process.env.TZ = "Asia/Kolkata";
    try {
      expect(inZone(undefined)).toBe("22:00");
      for (const hostContext of [{}, { timeZone: "Mars/Base" }, { timeZone: "" }, { timeZone: 5 }]) {
        const t = await hostWith(hostContext);
        t.dispatch(toolResult({ tree: stamp(), css: "" }));
        expect(timeText(t), JSON.stringify(hostContext)).toBe("22:00");
      }
    } finally {
      if (saved === undefined) delete process.env.TZ;
      else process.env.TZ = saved;
    }
  });

  it("a zone change re-renders mounted dates, keeping the node", async () => {
    const t = await hostWith({ timeZone: "Asia/Tokyo" });
    t.dispatch(toolResult({ tree: stamp(), css: "" }));
    const node = t.root().querySelector("time");
    expect(node?.textContent).toBe("01:30");
    t.dispatch({ jsonrpc: "2.0", method: "ui/notifications/host-context-changed", params: { theme: "dark" } });
    expect(timeText(t)).toBe("01:30");
    t.dispatch({
      jsonrpc: "2.0",
      method: "ui/notifications/host-context-changed",
      params: { timeZone: "America/New_York" }
    });
    expect(timeText(t)).toBe("12:30");
    expect(t.root().querySelector("time")).toBe(node);
  });

  it("server previews localize too", async () => {
    const t = await hostWith({ timeZone: "Asia/Tokyo" }, { serverTools: {} });
    await tick();
    t.dispatch(toolInputPartial({ widget: "meeting", data: { at: "2026-10-21T09:30:00-07:00" }, format: "both" }));
    await settle();
    const [call] = t.requests("tools/call");
    expect(call?.params.name).toBe("preview_widget");
    t.answer(call?.id ?? -1, { result: { content: [], structuredContent: { tree: stamp(), css: "" } } });
    await tick();
    expect(t.root().getAttribute("data-wgd-preview")).toBe("true");
    expect(timeText(t)).toBe("01:30");
  });

  it("a re-render patches without phantom changes", async () => {
    const t = await hostWith({ timeZone: "Asia/Tokyo" });
    t.dispatch(toolResult({ tree: stamp(), css: "" }));
    const node = t.root().querySelector("time");
    const text = node?.firstChild;
    t.dispatch(toolResult({ tree: stamp(), css: "" }));
    expect(t.root().querySelector("time")).toBe(node);
    expect(node?.firstChild).toBe(text);
    expect(timeText(t)).toBe("01:30");
  });

  it("localizes the tree the renderer emits, and leaves an unreadable instant in UTC", async () => {
    const t = await hostWith({ timeZone: "Asia/Kolkata" });
    const tree = compileTemplate({
      tag: "p",
      children: [{ bind: "at", format: { type: "date", pattern: "HH:mm", zone: "viewer" } }]
    })({ kind: "x", data: { at: "2026-10-21T09:30:00-07:00" } });
    t.dispatch(toolResult({ tree, css: "" }));
    expect(timeText(t)).toBe("22:00");
    const broken = { tag: "time", attrs: { datetime: "not a date", "data-wg-date": "HH:mm" }, children: ["16:30"] };
    t.dispatch(toolResult({ tree: broken, css: "" }));
    expect(timeText(t)).toBe("16:30");
  });
});
