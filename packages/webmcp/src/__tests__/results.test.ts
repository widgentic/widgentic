// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { designerTools } from "../index.js";
import { payload, run } from "./helpers.js";

const none = () => undefined;
const tools = designerTools({ widget: none, theme: none, schema: none, action: none });

describe("results are structured, never thrown", () => {
  it("reports an unmounted designer", async () => {
    const result = await run(tools, "widgentic_theme_get");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("NOT_MOUNTED");
    expect(result.designer).toBe("theme");
  });

  it("reports a malformed argument by name", async () => {
    const untouched = { subscribe: () => () => {}, getDraft: () => { throw new Error("must not be reached"); } };
    const mounted = designerTools({ widget: () => untouched as never });
    const result = await run(mounted, "widgentic_widget_draft_load", { definition: "not an object" });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INVALID_INPUT");
    expect(result.argument).toBe("definition");
  });

  it("resolves text content with parseable JSON for every tool and every odd input", async () => {
    for (const t of tools) {
      for (const input of [{}, undefined, null, "junk", 42, []]) {
        const result = await t.execute(input);
        expect(result.content[0]?.type).toBe("text");
        const doc = payload(result);
        expect(typeof doc.ok).toBe("boolean");
      }
    }
  });
});
