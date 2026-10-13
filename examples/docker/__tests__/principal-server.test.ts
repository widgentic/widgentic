// @vitest-environment node
/**
 * The self-host MCP endpoint's per-request composition (self-host-example
 * spec, "The MCP endpoint declares each caller's resource domains"): each
 * principal's app resource declares its own domains, the settings are read
 * once per request, and a saved change reaches the next request.
 */
import { describe, expect, it } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { ANONYMOUS_PRINCIPAL, createMemoryStore } from "@widgentic/mcp/store";
import type { Principal, WidgetStore } from "@widgentic/mcp/store";
import { serverForPrincipal } from "../principal-server.js";

const open = { take: () => true };
const alice: Principal = { id: "alice", scopes: ["read"] };
const bob: Principal = { id: "bob", scopes: ["read"] };

/** The app resource's `_meta.ui` for `principal`, listed and read (asserted equal). */
async function appUi(store: WidgetStore, principal: Principal): Promise<{ csp?: { resourceDomains?: string[] } }> {
  const server = await serverForPrincipal(store, principal, { execute: open, preview: open }, () => {});
  const client = new Client({ name: "t", version: "0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const listed = (await client.listResources()).resources.find((r) => r.uri === "ui://widgentic/app.html");
  const read = await client.readResource({ uri: "ui://widgentic/app.html" });
  await client.close();
  expect(read.contents[0]?._meta?.ui).toEqual(listed?._meta?.ui);
  return listed?._meta?.ui as { csp?: { resourceDomains?: string[] } };
}

function seeded() {
  return createMemoryStore([
    { principal: alice, themes: [{ name: "brand", tokens: {} }], settings: { defaultThemes: { light: "brand" }, resourceDomains: ["cdn.example.com"] } },
    { principal: bob }
  ]);
}

describe("the endpoint declares each caller's resource domains", () => {
  it("a principal's saved domains reach its app resource", async () => {
    expect((await appUi(seeded(), alice)).csp).toEqual({ resourceDomains: ["https://cdn.example.com"] });
  });

  it("another principal and an anonymous caller declare none", async () => {
    const store = seeded();
    expect((await appUi(store, bob)).csp).toBeUndefined();
    expect((await appUi(store, ANONYMOUS_PRINCIPAL)).csp).toBeUndefined();
  });

  it("reads the settings once per request, for the default theme and the domains alike", async () => {
    const store = seeded();
    let reads = 0;
    const counting: WidgetStore = {
      ...store,
      settings: async (principalId) => {
        reads++;
        return store.settings(principalId);
      }
    };
    const server = await serverForPrincipal(counting, alice, { execute: open, preview: open }, () => {});
    expect(reads).toBe(1);
    const client = new Client({ name: "t", version: "0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const themes = await client.callTool({ name: "list_themes", arguments: {} });
    const listing = JSON.parse((themes.content as { text: string }[])[0]?.text ?? "{}") as { defaults: unknown };
    expect(listing.defaults).toEqual({ light: "brand", dark: "dark" });
    await client.close();
  });

  it("a saved change applies on the next request, with no restart", async () => {
    const store = seeded();
    expect((await appUi(store, alice)).csp).toBeDefined();
    await store.putSettings(alice.id, { resourceDomains: null });
    expect((await appUi(store, alice)).csp).toBeUndefined();
  });

  it("an unreadable record declares nothing and is logged, never failing the request", async () => {
    const store = seeded();
    const lines: string[] = [];
    const failing: WidgetStore = { ...store, settings: async () => { throw new Error("disk gone"); } };
    const server = await serverForPrincipal(failing, alice, { execute: open, preview: open }, (line) => lines.push(line));
    expect(server).toBeDefined();
    expect(lines.join("\n")).toContain("resource domains not read (disk gone)");
  });
});
