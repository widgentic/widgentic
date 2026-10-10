// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client, InMemoryTransport, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
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

});

/**
 * A client reaching createWidgenticServer through the SDK's HTTP serving
 * entry, in process: the transport's fetch calls the handler directly.
 * `modern` pins protocol revision 2026-07-28 (capabilities ride every
 * request's _meta envelope); `legacy` is a 2025-era client, which the entry
 * serves statelessly (a fresh instance per request, never initialized).
 */
async function overHttp(era: "modern" | "legacy", clientCapabilities?: Record<string, unknown>) {
  const handler = createMcpHandler(() => createWidgenticServer());
  const client = new Client(
    { name: "wiring-test", version: "0.0.0" },
    {
      ...(clientCapabilities === undefined ? {} : { capabilities: clientCapabilities }),
      ...(era === "modern" ? { versionNegotiation: { mode: { pin: "2026-07-28" } } } : {})
    }
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL("http://widgentic.test/mcp"), {
      fetch: (url, init) => handler.fetch(new Request(url, init))
    })
  );
  closers.push(async () => {
    await client.close();
    await handler.close();
  });
  expect(client.getProtocolEra()).toBe(era);
  return client;
}

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const APPS_UI = { extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } } };

describe("slimming through the HTTP serving entry", () => {
  it("slims a 2026-07-28 request whose own capabilities advertise the Apps UI", async () => {
    const result = await renderDefault(await overHttp("modern", APPS_UI));
    expect(textOf(result)).toContain("do not restate this data as text");
    expect(textOf(result)).not.toContain("<div");
  });

  it("keeps full output for a 2026-07-28 request without the capability, even when UI is assumed", async () => {
    process.env.WIDGENTIC_ASSUME_UI = "1";
    const result = await renderDefault(await overHttp("modern"));
    expect(textOf(result)).toContain('class="wg-card"');
  });

  it("follows WIDGENTIC_ASSUME_UI for stateless 2025-era requests, which reveal no capabilities", async () => {
    process.env.WIDGENTIC_ASSUME_UI = "1";
    const assumed = await renderDefault(await overHttp("legacy"));
    expect(textOf(assumed)).toContain("do not restate this data as text");

    delete process.env.WIDGENTIC_ASSUME_UI;
    const unassumed = await renderDefault(await overHttp("legacy"));
    expect(textOf(unassumed)).toContain('class="wg-card"');
  });
});

describe("the session log line", () => {
  const sessionLines = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.map((call) => String(call[0])).filter((line) => line.startsWith("MCP Apps:"));

  it("reports what an initialized session negotiated", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await session(APPS_UI);
    await session();
    // The initialized notification is asynchronous; let it land.
    await vi.waitFor(() => expect(sessionLines(spy)).toHaveLength(2));
    expect(sessionLines(spy)[0]).toContain("host advertises UI support");
    expect(sessionLines(spy)[1]).toContain("host lacks the UI capability");
    spy.mockRestore();
  });

  it("stays silent where the instance never saw initialize (stateless HTTP)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await renderDefault(await overHttp("legacy", APPS_UI));
    expect(sessionLines(spy)).toEqual([]);
    spy.mockRestore();
  });
});

describe("both protocol eras through one assembly", () => {
  it("lists the same tools and renders the same structuredContent", async () => {
    const modern = await overHttp("modern", APPS_UI);
    const { client: legacy } = await session(APPS_UI);
    const shape = (tools: Awaited<ReturnType<Client["listTools"]>>["tools"]) =>
      tools.map(({ name, description, inputSchema, _meta }) => ({ name, description, inputSchema, _meta }));
    expect(shape((await modern.listTools()).tools)).toEqual(shape((await legacy.listTools()).tools));

    const args = { name: "render_widget", arguments: { widget: "card", data: { title: "T" } } };
    const modernResult = await modern.callTool(args);
    expect(modernResult.structuredContent).toEqual((await legacy.callTool(args)).structuredContent);
    expect(JSON.stringify(modernResult.structuredContent)).toContain('class=\\"wg-card\\"');
  });
});

describe("library assembly defaults", () => {
  it("no options serves exactly the built-in kinds", async () => {
    const { client } = await session();
    const result = (await client.callTool({
      name: "list_widgets",
      arguments: {}
    })) as DeliveredResult;
    const kinds = (JSON.parse(textOf(result)) as { kind: string }[]).map((d) => d.kind);
    expect(kinds.sort()).toEqual(["card", "group", "table", "tree"]);
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
