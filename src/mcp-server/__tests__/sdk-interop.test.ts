import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createCatalog } from "../../catalog/index.js";
import { extractWidgetPayload } from "../../mcp/index.js";
import {
  LIST_WIDGETS_TOOL,
  RENDER_WIDGET_TOOL,
  handleListWidgets,
  handleRenderWidget
} from "../index.js";

interface DeliveredResult {
  isError?: boolean;
  content: { type: string; text?: string }[];
}

function textOf(result: DeliveredResult): string {
  return result.content.find((b) => b.type === "text")?.text ?? "";
}

async function connect() {
  const catalog = createCatalog();
  const server = new McpServer({ name: "widgentic-test", version: "0.0.0" });
  server.registerTool(
    LIST_WIDGETS_TOOL.name,
    { description: LIST_WIDGETS_TOOL.description },
    () => handleListWidgets(catalog) as CallToolResult
  );
  server.registerTool(
    RENDER_WIDGET_TOOL.name,
    {
      description: RENDER_WIDGET_TOOL.description,
      inputSchema: {
        widget: z.string(),
        data: z.union([
          z.array(z.unknown()),
          z.record(z.string(), z.unknown()),
          z.string(),
          z.number(),
          z.boolean(),
          z.null()
        ]),
        hints: z.record(z.string(), z.unknown()).optional(),
        meta: z.record(z.string(), z.unknown()).optional()
      }
    },
    (args) => handleRenderWidget(catalog, args) as CallToolResult
  );

  const client = new Client({ name: "widgentic-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport)
  ]);
  return { client, catalog };
}

describe("SDK interoperability (in-memory transport)", () => {
  it("list_widgets round-trips the descriptor list", async () => {
    const { client, catalog } = await connect();
    const result = (await client.callTool({
      name: "list_widgets",
      arguments: {}
    })) as DeliveredResult;
    expect(result.isError).toBeFalsy();
    const descriptors = JSON.parse(textOf(result)) as { kind: string }[];
    expect(descriptors.map((d) => d.kind).sort()).toEqual(
      [...catalog.kinds()].sort()
    );
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
      expect(extraction.payload).toEqual({
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

  it("unknown widget id arrives as an isError result", async () => {
    const { client } = await connect();
    const result = (await client.callTool({
      name: "render_widget",
      arguments: { widget: "nope", data: 1 }
    })) as DeliveredResult;
    expect(result.isError).toBe(true);
    expect(JSON.parse(textOf(result)).code).toBe("UNKNOWN_KIND");
  });

  it("tools are discoverable through the protocol", async () => {
    const { client } = await connect();
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name).sort();
    expect(names).toEqual(["list_widgets", "render_widget"]);
  });
});
