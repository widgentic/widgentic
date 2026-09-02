// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { TOKEN_SPECS } from "@widgentic/core";
import { createActionDesigner, createSchemaDesigner, createThemeDesigner } from "@widgentic/designer";
import type { ActionDesignerHandle, SchemaDesignerHandle, ThemeDesignerHandle } from "@widgentic/designer";
import { designerTools } from "../index.js";
import { host, run } from "./helpers.js";

let theme: ThemeDesignerHandle;
let schema: SchemaDesignerHandle;
let action: ActionDesignerHandle;
const tools = designerTools({ theme: () => theme, schema: () => schema, action: () => action });

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  theme = createThemeDesigner(host());
  schema = createSchemaDesigner(host());
  action = createActionDesigner(host());
});

describe("theme designer tools", () => {
  it("round-trips an entry", async () => {
    const loaded = await run(tools, "widgentic_theme_load", { entry: { name: "ocean", tokens: { bg: "#001b2e" } } });
    expect(loaded.ok).toBe(true);
    const read = await run(tools, "widgentic_theme_get");
    const entry = read.entry as { name: string; tokens: Record<string, string> };
    expect(entry.name).toBe("ocean");
    expect(entry.tokens.bg).toBe("#001b2e");
    expect(theme.getTheme().name).toBe("ocean");
  });

  it("merges tokens into the current entry, exactly", async () => {
    theme.loadTheme({ name: "t", tokens: { bg: "#fff", fg: "#000" } });
    const result = await run(tools, "widgentic_theme_tokens_set", { tokens: { accent: "#0a84ff" }, remove: ["fg"] });
    expect(result.ok).toBe(true);
    expect(theme.getTheme().tokens).toEqual({ bg: "#fff", accent: "#0a84ff" });
  });

  it("leaves the entry unchanged when the merge is invalid", async () => {
    theme.loadTheme({ name: "t", tokens: { bg: "#fff" } });
    const result = await run(tools, "widgentic_theme_tokens_set", { tokens: { nope: "red" } });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("REJECTED");
    expect(theme.getTheme().tokens).toEqual({ bg: "#fff" });
    const badRemove = await run(tools, "widgentic_theme_tokens_set", { remove: [1] });
    expect(badRemove.code).toBe("INVALID_INPUT");
    expect(badRemove.argument).toBe("remove");
  });
});

describe("schema and action designer tools", () => {
  it("refuses a schema entry at the door", async () => {
    const result = await run(tools, "widgentic_schema_load", { entry: { name: "", schema: {} } });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("REJECTED");
    expect(result.errors).toContain("'name' must be a non-empty string.");
    expect(schema.getSchema().name).toBe("my-schema");
  });

  it("loads and reads a schema entry", async () => {
    const entry = { name: "person", label: "Person", schema: { type: "object", properties: { name: { type: "string" } } } };
    expect((await run(tools, "widgentic_schema_load", { entry })).ok).toBe(true);
    const read = await run(tools, "widgentic_schema_get");
    expect(read.entry).toEqual(entry);
  });

  it("loads an action entry", async () => {
    const entry = { name: "ask-more", definition: { kind: "prompt", text: ["Tell me more about ", { bind: "title" }] } };
    const loaded = await run(tools, "widgentic_action_load", { entry });
    expect(loaded.ok).toBe(true);
    const read = await run(tools, "widgentic_action_get");
    expect((read.entry as { name: string }).name).toBe("ask-more");
    expect(action.getAction().name).toBe("ask-more");
  });
});

describe("theme token reference", () => {
  it("lists every token from the exported specs", async () => {
    const result = await run(tools, "widgentic_theme_token_specs");
    const tokens = result.tokens as { name: string; type: string; default: string; use: string; fallback?: string }[];
    expect(tokens.map((t) => t.name).sort()).toEqual(Object.keys(TOKEN_SPECS).sort());
    for (const t of tokens) {
      expect(typeof t.type).toBe("string");
      expect(typeof t.default).toBe("string");
      expect(t.use.length).toBeGreaterThan(0);
    }
    expect(tokens.find((t) => t.name === "surface")?.fallback).toBe("bg");
    expect(tokens.find((t) => t.name === "bg")?.fallback).toBeUndefined();
  });
});
