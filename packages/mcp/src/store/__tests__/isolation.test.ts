// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createWidgenticServer } from "../../server/server.js";
import { composeCatalog, composeThemes, createMemoryStore } from "../index.js";
import type { MemorySeedPrincipal, StoredWidget, WidgetStore } from "../index.js";
import type { ThemeEntry } from "@widgentic/core";

interface Delivered {
  isError?: boolean;
  content: { type: string; text?: string }[];
}

const reportWidget: StoredWidget = {
  kind: "report",
  template: { tag: "div", children: ["report: ", { bind: "title" }] },
  descriptor: { description: "A report", dataShape: "{ title }" }
};
const ticketWidget: StoredWidget = {
  kind: "ticket",
  template: { tag: "p", children: ["ticket: ", { bind: "id" }] },
  descriptor: { description: "A ticket", dataShape: "{ id }" }
};
const brandTheme: ThemeEntry = { name: "brand", tokens: { accent: "#ff5a1f" } };

const KEY_A = "wgk_alice";
const KEY_B = "wgk_bob";

function seed(): MemorySeedPrincipal[] {
  return [
    {
      principal: { id: "alice", scopes: ["read"] },
      apiKey: KEY_A,
      widgets: [reportWidget],
      themes: [brandTheme]
    },
    {
      principal: { id: "bob", scopes: ["read"] },
      apiKey: KEY_B,
      widgets: [ticketWidget]
    }
  ];
}

/** What the HTTP edge does per request: resolve, compose, construct. */
async function connectAs(store: WidgetStore, apiKey: string) {
  const principal = (await store.resolvePrincipal(apiKey)) ?? {
    id: "anonymous",
    scopes: ["read" as const]
  };
  const catalog = await composeCatalog(store, principal.id);
  const themes = await composeThemes(store, principal.id);
  const server = createWidgenticServer({
    catalog: catalog.value,
    themes: themes.value
  });
  const client = new Client({ name: "isolation-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

const kindsOf = async (client: Client): Promise<string[]> => {
  const result = (await client.callTool({
    name: "list_widgets",
    arguments: {}
  })) as Delivered;
  const listed = JSON.parse(result.content[0]?.text ?? "[]") as { kind: string }[];
  return listed.map((entry) => entry.kind);
};

const themeNamesOf = async (client: Client): Promise<string[]> => {
  const result = (await client.callTool({
    name: "list_themes",
    arguments: {}
  })) as Delivered;
  const listing = JSON.parse(result.content[0]?.text ?? "{}") as {
    themes: { name: string }[];
  };
  return listing.themes.map((entry) => entry.name);
};

describe("per-principal isolation over the protocol", () => {
  it("two keys see two catalogs, both with the built-ins", async () => {
    const store = createMemoryStore(seed());
    const alice = await connectAs(store, KEY_A);
    const bob = await connectAs(store, KEY_B);

    const aliceKinds = await kindsOf(alice);
    const bobKinds = await kindsOf(bob);

    expect(aliceKinds).toContain("report");
    expect(aliceKinds).not.toContain("ticket");
    expect(bobKinds).toContain("ticket");
    expect(bobKinds).not.toContain("report");
    for (const builtin of ["card", "table", "tree", "group"]) {
      expect(aliceKinds).toContain(builtin);
      expect(bobKinds).toContain(builtin);
    }
  });

  it("one principal cannot render another's widget", async () => {
    const store = createMemoryStore(seed());
    const bob = await connectAs(store, KEY_B);
    const result = (await bob.callTool({
      name: "render_widget",
      arguments: { widget: "report", data: { title: "secret" } }
    })) as Delivered;

    expect(result.isError).toBe(true);
    const error = JSON.parse(result.content[0]?.text ?? "{}") as {
      code: string;
      message: string;
    };
    expect(error.code).toBe("UNKNOWN_KIND");
    // The message echoes what was ASKED for; what matters is that Alice's
    // kind is absent from the available list Bob is offered.
    const available = error.message.split("Available widgets:")[1] ?? "";
    expect(available).not.toContain("report");
    expect(available).toContain("ticket");
  });

  it("themes resolve per principal too", async () => {
    const store = createMemoryStore(seed());
    const alice = await connectAs(store, KEY_A);
    const bob = await connectAs(store, KEY_B);

    expect(await themeNamesOf(alice)).toContain("brand");
    expect(await themeNamesOf(bob)).not.toContain("brand");

    const forBob = (await bob.callTool({
      name: "render_widget",
      arguments: { widget: "card", data: { a: 1 }, theme: "brand" }
    })) as Delivered;
    expect(forBob.isError).toBe(true);
    expect(forBob.content[0]?.text).toContain("UNKNOWN_THEME");

    const forAlice = (await alice.callTool({
      name: "render_widget",
      arguments: { widget: "card", data: { a: 1 }, format: "page", theme: "brand" }
    })) as Delivered;
    expect(forAlice.isError).toBeUndefined();
    expect(forAlice.content[0]?.text).toContain("--wg-accent: #ff5a1f");
  });

  it("an unknown key degrades to the anonymous catalog, not an error", async () => {
    const store = createMemoryStore(seed());
    const stranger = await connectAs(store, "wgk_not_a_key");
    const kinds = await kindsOf(stranger);
    expect(kinds).toEqual(expect.arrayContaining(["card", "table", "tree", "group"]));
    expect(kinds).not.toContain("report");
    expect(kinds).not.toContain("ticket");
  });

  it("sequential requests do not accumulate kinds", async () => {
    const store = createMemoryStore(seed());
    await kindsOf(await connectAs(store, KEY_A));
    const anonymous = await kindsOf(await connectAs(store, "wgk_none"));
    expect(anonymous).not.toContain("report");
  });

  it("concurrent requests stay isolated", async () => {
    const store = createMemoryStore(seed());
    const [aliceKinds, bobKinds] = await Promise.all([
      connectAs(store, KEY_A).then(kindsOf),
      connectAs(store, KEY_B).then(kindsOf)
    ]);
    expect(aliceKinds).toContain("report");
    expect(aliceKinds).not.toContain("ticket");
    expect(bobKinds).toContain("ticket");
    expect(bobKinds).not.toContain("report");
  });

  it("with no store, every caller shares the library default: the built-ins", async () => {
    const server = createWidgenticServer();
    const client = new Client({ name: "no-store", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const kinds = await kindsOf(client);
    // The assembly assumes nothing: compiled-in extras are a host choice
    // (see examples/mcp-server), never a library default.
    expect(kinds.sort()).toEqual(["card", "group", "table", "tree"]);
  });
});
