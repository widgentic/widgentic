// @vitest-environment node
/**
 * The shared WebMCP host wiring (self-host-example spec, "The app mounts the
 * authoring surface and the designers"): a source opens its section BEFORE
 * returning the handle, only supplied designers become sources, and the two
 * status sentences every example page shows.
 */
import { describe, expect, it } from "vitest";
import { describeAgentTools, designerSources } from "../webmcp.js";
import type { DesignerKind } from "../webmcp.js";

describe("designerSources", () => {
  it("shows the section, then returns the live handle", () => {
    const shown: DesignerKind[] = [];
    let mounted: { getDraft(): unknown } | undefined;
    const sources = designerSources({
      show: (kind) => {
        shown.push(kind);
        if (kind === "widget") mounted = { getDraft: () => ({ kind: "after-show" }) };
      },
      current: { widget: () => mounted as never, theme: () => undefined }
    });
    expect(Object.keys(sources).sort()).toEqual(["theme", "widget"]);
    const handle = sources.widget?.();
    expect(shown).toEqual(["widget"]);
    expect(handle?.getDraft()).toEqual({ kind: "after-show" });
    expect(sources.theme?.()).toBeUndefined();
    expect(shown).toEqual(["widget", "theme"]);
  });
});

describe("describeAgentTools", () => {
  const dispose = (): void => {};
  it("says when the browser has no model context", () => {
    expect(describeAgentTools({ supported: false, registered: [], failed: [], dispose })).toBe("no agent-capable browser");
  });
  it("counts what registered, and what was refused", () => {
    const names = Array.from({ length: 12 }, (_, i) => `t${i}`);
    expect(describeAgentTools({ supported: true, registered: names, failed: [], dispose })).toBe("agent tools: 12 registered");
    expect(describeAgentTools({ supported: true, registered: names.slice(1), failed: [{ name: "t0", message: "dup" }], dispose })).toBe(
      "agent tools: 11 registered, 1 refused"
    );
  });
});
