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
import { extractWidgetPayload } from "../../output/index.js";
import { createWidgenticServer } from "../server.js";
import type { StoredAction } from "@widgentic/core";

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
      "group",
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
      "execute_action",
      "get_authoring_guide",
      "list_actions",
      "list_schemas",
      "list_theme_tokens",
      "list_themes",
      "list_widgets",
      "render_widget"
    ]);
    // App-only visibility: Apps hosts hide it from the model; the SDK
    // itself lists it (filtering is the host's job), which is what a
    // non-Apps client sees.
    const execute = tools.tools.find((tool) => tool.name === "execute_action");
    expect(execute?._meta).toMatchObject({
      ui: { resourceUri: "ui://widgentic/app.html", visibility: ["app"] }
    });
  });

  it("field descriptions from definitions reach the wire schema", async () => {
    // The wire schema is what agents actually read; definitions.ts text
    // that never crosses it steers nobody (learned live: theme guidance
    // existed model-side while the wire carried a bare anyOf).
    const { client } = await connect();
    const tools = await client.listTools();
    const render = tools.tools.find((t) => t.name === "render_widget");
    const props = (render?.inputSchema as {
      properties?: Record<string, { description?: string }>;
    })?.properties;
    expect(props?.theme?.description).toContain("pass the NAME");
    expect(props?.theme?.description).toContain("do NOT reconstruct");
    expect(props?.widget?.description).toBeTruthy();
    expect(props?.data?.description).toBeTruthy();
    expect(props?.format?.description).toBeTruthy();
    expect(props?.hints?.description).toBeTruthy();
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

describe("list_schemas over the protocol", () => {
  const person = {
    name: "person",
    label: "Person",
    schema: { type: "object", required: ["name"], properties: { name: { type: "string" } } }
  };

  async function connectWith(schemas?: () => Promise<(typeof person)[]>) {
    const server = createWidgenticServer(schemas === undefined ? {} : { schemas });
    const client = new Client({ name: "widgentic-test-client", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return client;
  }

  it("serves the supplied source's entries", async () => {
    const client = await connectWith(async () => [person]);
    const result = (await client.callTool({
      name: "list_schemas",
      arguments: {}
    })) as DeliveredResult;
    expect(result.isError).toBeFalsy();
    const listing = JSON.parse(textOf(result)) as {
      schemas: { name: string; schema: unknown }[];
      rules: string;
    };
    expect(listing.schemas.map((s) => s.name)).toEqual(["person"]);
    expect(listing.schemas[0]?.schema).toEqual(person.schema);
    // The name-over-copy steering rides the RESULT too, not only the wire.
    expect(listing.rules).toContain("dataSchemaRef");
  });

  it("an absent source lists nothing — anonymous callers, storeless hosts", async () => {
    const client = await connectWith();
    const result = (await client.callTool({
      name: "list_schemas",
      arguments: {}
    })) as DeliveredResult;
    expect(result.isError).toBeFalsy();
    expect((JSON.parse(textOf(result)) as { schemas: unknown[] }).schemas).toEqual([]);
  });

  it("the wire description steers to references by name", async () => {
    const client = await connectWith(async () => [person]);
    const tools = await client.listTools();
    const tool = tools.tools.find((t) => t.name === "list_schemas");
    expect(tool?.description).toContain("dataSchemaRef");
    expect(tool?.description).toContain("NAME");
  });

  it("renders never read the schema source — it is lazy by contract", async () => {
    let reads = 0;
    const client = await connectWith(async () => {
      reads++;
      return [person];
    });
    await client.callTool({
      name: "render_widget",
      arguments: { widget: "card", data: { title: "T" } }
    });
    await client.callTool({ name: "list_widgets", arguments: {} });
    expect(reads).toBe(0);
    await client.callTool({ name: "list_schemas", arguments: {} });
    expect(reads).toBe(1);
  });
});

describe("resourceDomains declaration", () => {
  async function connectWithDomains(resourceDomains?: string[]) {
    const server = createWidgenticServer(
      resourceDomains === undefined ? {} : { resourceDomains }
    );
    const client = new Client({ name: "t", version: "0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport)
    ]);
    return client;
  }

  it("declared domains reach the app resource's csp metadata", async () => {
    const client = await connectWithDomains(["CDN.Example.com ", "media.example.org"]);
    const listed = await client.listResources();
    const app = listed.resources.find((r) => r.uri.startsWith("ui://"));
    expect(app?._meta?.ui).toMatchObject({
      csp: { resourceDomains: ["cdn.example.com", "media.example.org"] }
    });
  });

  it("no configured domains means no csp declaration", async () => {
    const client = await connectWithDomains();
    const listed = await client.listResources();
    const app = listed.resources.find((r) => r.uri.startsWith("ui://"));
    const ui = app?._meta?.ui as { csp?: unknown } | undefined;
    expect(ui?.csp).toBeUndefined();
  });
});

describe("list_actions over the protocol", () => {
  // A stored action as the store holds it: contract AND transport. The
  // listing must serve the first and withhold the second.
  const weather = {
    name: "weather-current",
    label: "Current weather",
    description: "Reading for a city",
    definition: {
      kind: "http" as const,
      method: "GET" as const,
      url: "https://api.weatherapi.example/v1/current.json",
      input: { type: "object", properties: { city: { type: "string" } } },
      output: { type: "object", properties: { temp_c: { type: "number" } } },
      query: { key: { secret: "weather-token" }, lang: "en" },
      headers: { "x-tenant": "acme-42" }
    }
  };
  const askAbout = {
    name: "ask-about-city",
    definition: { kind: "prompt" as const, text: ["What should I wear in ", { bind: "city" }, "?"] }
  };

  async function connectWith(sharedActions?: () => Promise<StoredAction[]>) {
    const server = createWidgenticServer(sharedActions === undefined ? {} : { sharedActions });
    const client = new Client({ name: "widgentic-test-client", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return client;
  }

  const listingOf = async (client: Client) => {
    const result = (await client.callTool({
      name: "list_actions",
      arguments: {}
    })) as DeliveredResult;
    expect(result.isError).toBeFalsy();
    return {
      text: textOf(result),
      parsed: JSON.parse(textOf(result)) as {
        actions: {
          name: string;
          label?: string;
          kind: string;
          method?: string;
          input?: unknown;
          output?: unknown;
        }[];
        rules: string;
      }
    };
  };

  it("serves the contract of the supplied source's entries", async () => {
    const { parsed } = await listingOf(await connectWith(async () => [weather, askAbout]));
    expect(parsed.actions.map((a) => a.name)).toEqual(["weather-current", "ask-about-city"]);
    const [http, prompt] = parsed.actions;
    expect(http).toMatchObject({
      kind: "http",
      method: "GET",
      label: "Current weather",
      description: "Reading for a city"
    });
    expect(http?.input).toEqual(weather.definition.input);
    expect(http?.output).toEqual(weather.definition.output);
    // A prompt has no transport and takes no input mapping; its contract
    // is the data paths its text binds.
    expect(prompt).toEqual({ name: "ask-about-city", kind: "prompt", binds: ["city"] });
    expect(parsed.rules).toContain("NO input mapping");
    // The bind-by-name steering rides the RESULT too, not only the wire.
    expect(parsed.rules).toContain('"ref"');
  });

  it("never lets the transport leave the server", async () => {
    const { text } = await listingOf(await connectWith(async () => [weather]));
    for (const secret of [
      "api.weatherapi.example",
      "https://",
      "weather-token",
      "acme-42",
      "x-tenant"
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it("an absent source lists nothing — anonymous callers, storeless hosts", async () => {
    const { parsed } = await listingOf(await connectWith());
    expect(parsed.actions).toEqual([]);
  });

  it("the wire description steers to binding by name, not inventing", async () => {
    const client = await connectWith(async () => [weather]);
    const tools = await client.listTools();
    const tool = tools.tools.find((t) => t.name === "list_actions");
    expect(tool?.description).toContain('"ref"');
    expect(tool?.description).toContain("DESCRIBE");
  });

  it("renders never read the action source — it is lazy by contract", async () => {
    let reads = 0;
    const client = await connectWith(async () => {
      reads++;
      return [weather];
    });
    await client.callTool({
      name: "render_widget",
      arguments: { widget: "card", data: { title: "T" } }
    });
    await client.callTool({ name: "list_widgets", arguments: {} });
    expect(reads).toBe(0);
    await client.callTool({ name: "list_actions", arguments: {} });
    expect(reads).toBe(1);
  });
});
