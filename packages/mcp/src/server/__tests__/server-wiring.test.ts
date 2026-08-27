// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { EXTENSION_ID, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { createWidgenticServer } from "../server.js";
import { buildAppTemplate, WIDGENTIC_APP_TEMPLATE_URI } from "../index.js";

interface DeliveredResult {
  isError?: boolean;
  content: { type: string; text?: string }[];
}

/** Connect a real createWidgenticServer to a client over in-memory pipes. */
async function session(clientCapabilities?: Record<string, unknown>) {
  const server = createWidgenticServer();
  const client = new Client(
    { name: "wiring-test", version: "0.0.0" },
    clientCapabilities ? { capabilities: clientCapabilities } : undefined
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

async function renderDefault(client: Client): Promise<DeliveredResult> {
  return (await client.callTool({
    name: "render_widget",
    arguments: { widget: "card", data: { a: 1 } }
  })) as DeliveredResult;
}

const textOf = (r: DeliveredResult) =>
  r.content.find((b) => b.type === "text")?.text ?? "";

afterEach(() => {
  delete process.env.WIDGENTIC_ASSUME_UI;
});

describe("capability-aware slim wiring", () => {
  it("slims the default output when the session negotiates UI support", async () => {
    const { client } = await session({
      extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } }
    });
    const result = await renderDefault(client);
    expect(textOf(result)).toContain("do not restate this data as text");
    expect(textOf(result)).not.toContain("<div");
  });

  it("keeps full output for sessions without the capability", async () => {
    const { client } = await session();
    const result = await renderDefault(client);
    expect(textOf(result)).toContain('class="wg-card"');
  });

  it("session negotiation overrides the env assumption in both directions", async () => {
    process.env.WIDGENTIC_ASSUME_UI = "1";
    // Env says assume UI, but the session negotiates none: full wins.
    const { client } = await session();
    const result = await renderDefault(client);
    expect(textOf(result)).toContain('class="wg-card"');
  });

  // The env-assumption path (WIDGENTIC_ASSUME_UI slimming an un-negotiated
  // instance) cannot be observed through an in-memory session — connect()
  // always runs initialize, which authoritatively overwrites the default.
  // That path exists precisely for stateless HTTP tools/call and is
  // verified against the deployed endpoint (see TESTING.md).
});

describe("library assembly defaults", () => {
  it("no options serves exactly the built-in kinds", async () => {
    const { client } = await session();
    const result = (await client.callTool({
      name: "list_widgets",
      arguments: {}
    })) as DeliveredResult;
    const kinds = (JSON.parse(textOf(result)) as { kind: string }[]).map((d) => d.kind);
    expect(kinds.sort()).toEqual(["card", "custom", "group", "table", "tree"]);
  });

});

describe("image inlining env knob", () => {
  it("WIDGENTIC_INLINE_IMAGES=0 disables inlining without touching the network", async () => {
    process.env.WIDGENTIC_INLINE_IMAGES = "0";
    try {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const { client } = await session({
        extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } }
      });
      const result = (await client.callTool({
        name: "render_widget",
        arguments: {
          widget: "card",
          data: { photo: "https://cdn.example/pic.jpg" }
        }
      })) as DeliveredResult & { structuredContent?: { html?: string } };
      expect(result.structuredContent?.html).toContain("https://cdn.example/pic.jpg");
      expect(result.structuredContent?.html).not.toContain("data:image");
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    } finally {
      delete process.env.WIDGENTIC_INLINE_IMAGES;
    }
  });
});

describe("app template resource", () => {
  it("serves exactly the library builder's output", async () => {
    const { client } = await session({
      extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } }
    });
    const read = (await client.readResource({
      uri: WIDGENTIC_APP_TEMPLATE_URI
    })) as { contents: { uri: string; mimeType?: string; text?: string }[] };
    expect(read.contents).toHaveLength(1);
    expect(read.contents[0]?.mimeType).toBe(RESOURCE_MIME_TYPE);
    expect(read.contents[0]?.text).toBe(buildAppTemplate());
  });
});
