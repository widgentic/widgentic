// @vitest-environment node
/**
 * SDK interoperability over the in-memory transport — against the REAL
 * library assembly (`createWidgenticServer`), per the runnable-server
 * requirement. One assembly serves every transport; these tests are the
 * in-memory one.
 */
import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { extractWidgetPayload } from "../../mcp/index.js";
import { createWidgenticServer } from "../server.js";

interface DeliveredResult {
  isError?: boolean;
  content: { type: string; text?: string }[];
}

function textOf(result: DeliveredResult): string {
  return result.content.find((b) => b.type === "text")?.text ?? "";
}

async function connect() {
  const server = createWidgenticServer();
  const client = new Client({ name: "widgentic-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport)
  ]);
  return { client };
}

describe("SDK interoperability (in-memory transport, library assembly)", () => {
  it("list_widgets round-trips the descriptor list", async () => {
    const { client } = await connect();
    const result = (await client.callTool({
      name: "list_widgets",
      arguments: {}
    })) as DeliveredResult;
    expect(result.isError).toBeFalsy();
    const descriptors = JSON.parse(textOf(result)) as { kind: string }[];
    expect(descriptors.map((d) => d.kind).sort()).toEqual([
      "card",
      "custom",
      "table",
      "tree"
    ]);
  });

  it("render_widget round-trips HTML and an extractable payload", async () => {
    const { client } = await connect();
    const result = (await client.callTool({
      name: "render_widget",
      arguments: { widget: "card", data: { title: "T" } }
    })) as DeliveredResult;
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('class="wg-card"');

    const extraction = extractWidgetPayload(result);
    expect(extraction).toMatchObject({ found: true, ok: true });
    if (extraction.found && extraction.ok) {
      expect(extraction.payload).toMatchObject({
        kind: "card",
        data: { title: "T" }
      });
    }
  });

  it("string-marshalled data renders fully through the protocol (regression)", async () => {
    const { client } = await connect();
    const rows = [
      { title: "A", points: 1 },
      { title: "B", points: 2 },
      { title: "C", points: 3 }
    ];
    const result = (await client.callTool({
      name: "render_widget",
      arguments: {
        widget: "table",
        data: JSON.stringify(rows),
        hints: { columns: ["title", "points"] }
      }
    })) as DeliveredResult;
    expect(result.isError).toBeFalsy();
    expect(textOf(result).match(/wg-table-row/g)).toHaveLength(3);
    const extraction = extractWidgetPayload(result);
    if (extraction.found && extraction.ok) {
      expect(extraction.payload.data).toEqual(rows);
    } else {
      expect.fail("expected a successful extraction");
    }
  });

  it("app format round-trips the ui:// html resource through the protocol", async () => {
    const { client } = await connect();
    const result = (await client.callTool({
      name: "render_widget",
      arguments: {
        widget: "card",
        data: { title: "T" },
        format: "app",
        theme: { bg: "#0f131c" }
      }
    })) as DeliveredResult & {
      content: { type: string; resource?: { uri: string; mimeType?: string; text?: string } }[];
    };
    expect(result.isError).toBeFalsy();
    expect(result.content.map((b) => b.type)).toEqual([
      "text",
      "resource",
      "resource"
    ]);
    const ui = result.content[1]?.resource;
    expect(ui?.uri).toBe("ui://widgentic/page/card");
    expect(ui?.mimeType).toBe("text/html;profile=mcp-app");
    expect(ui?.text?.startsWith("<!doctype html>")).toBe(true);
    expect(extractWidgetPayload(result)).toMatchObject({
      found: true,
      ok: true
    });
    // structuredContent survives the protocol for app templates
    const sc = (result as { structuredContent?: { html?: string } })
      .structuredContent;
    expect(sc?.html).toContain('class="wg-card"');
  });

  it("unknown widget id arrives as an isError result", async () => {
    const { client } = await connect();
    const result = (await client.callTool({
      name: "render_widget",
      arguments: { widget: "nope", data: 1 }
    })) as DeliveredResult;
    expect(result.isError).toBe(true);
    expect(JSON.parse(textOf(result)).code).toBe("UNKNOWN_KIND");
  });

  it("themed page format round-trips through the protocol", async () => {
    const { client } = await connect();
    const result = (await client.callTool({
      name: "render_widget",
      arguments: {
        widget: "card",
        data: { title: "T" },
        format: "page",
        theme: { bg: "#0f131c" }
      }
    })) as DeliveredResult;
    expect(result.isError).toBeFalsy();
    const doc = textOf(result);
    expect(doc.startsWith("<!doctype html>")).toBe(true);
    expect(doc).toContain(".wg-card {");
    expect(doc).toContain("--wg-bg: #0f131c;");
    expect(extractWidgetPayload(result)).toMatchObject({
      found: true,
      ok: true
    });
  });

  it("tools are discoverable through the protocol — the assembly's real shape", async () => {
    const { client } = await connect();
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name).sort();
    expect(names).toEqual([
      "list_theme_tokens",
      "list_themes",
      "list_widgets",
      "render_widget"
    ]);
  });

  it("render_widget declares its app template in tools/list", async () => {
    const { client } = await connect();
    const tools = await client.listTools();
    const render = tools.tools.find((tool) => tool.name === "render_widget") as
      | { _meta?: { ui?: { resourceUri?: string } } }
      | undefined;
    expect(render?._meta?.ui?.resourceUri).toBe("ui://widgentic/app.html");
  });

  it("theme vocabulary round-trips through the protocol", async () => {
    const { client } = await connect();
    const result = (await client.callTool({
      name: "list_theme_tokens",
      arguments: {}
    })) as DeliveredResult;
    expect(result.isError).toBeFalsy();
    const listing = JSON.parse(textOf(result));
    expect(listing.presets.dark.bg).toBeDefined();
    expect(listing.tokens.length).toBeGreaterThanOrEqual(10);
  });

  it("list_themes round-trips the named registry", async () => {
    const { client } = await connect();
    const result = (await client.callTool({
      name: "list_themes",
      arguments: {}
    })) as DeliveredResult;
    expect(result.isError).toBeFalsy();
    const listing = JSON.parse(textOf(result)) as { themes: { name: string }[] };
    expect(listing.themes.map((t) => t.name).sort()).toEqual(["dark", "light"]);
  });
});
