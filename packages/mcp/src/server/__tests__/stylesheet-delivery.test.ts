// @vitest-environment node
/**
 * Stylesheet resources reach every structured result and page document a
 * caller's renders produce, never a fragment or a payload, and only when
 * the declared domains cover them.
 */
import { describe, expect, it } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createCatalog, createThemeRegistry } from "@widgentic/core";
import type { Resource } from "@widgentic/core";
import { createWidgenticServer } from "../server.js";
import type { WidgenticServerOptions } from "../server.js";
import { handleListThemes, handlePreviewWidget, handleRenderWidget } from "../handlers.js";

const ICONS = "https://fonts.googleapis.com/icon?family=Material+Icons";
const SRI = "sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC";
const icons: Resource = { type: "stylesheet", href: ICONS };
const brand: Resource = { type: "stylesheet", href: "https://cdn.example.org/brand.css?v=1&x=2", integrity: SRI };
const card = { widget: "card", data: { title: "Ada", role: "Engineer" } };

async function connect(options: WidgenticServerOptions) {
  const server = createWidgenticServer(options);
  const client = new Client({ name: "t", version: "0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

const structured = (result: unknown) => (result as { structuredContent?: Record<string, unknown> }).structuredContent ?? {};
const texts = (result: unknown) =>
  ((result as { content: { type: string; text?: string; resource?: { text?: string } }[] }).content ?? []).map(
    (block) => block.text ?? block.resource?.text ?? ""
  );

describe("the server assembly delivers the caller's stylesheets", () => {
  it("a render carries the covered stylesheets, in order", async () => {
    const client = await connect({
      resourceDomains: ["fonts.googleapis.com", "fonts.gstatic.com", "cdn.example.org"],
      resources: [icons, brand]
    });
    const result = await client.callTool({ name: "render_widget", arguments: card });
    expect(structured(result).resources).toEqual([icons, brand]);
    const preview = await client.callTool({ name: "preview_widget", arguments: card });
    expect(structured(preview).resources).toEqual([icons, brand]);
    const themes = JSON.parse(texts(await client.callTool({ name: "list_themes", arguments: {} }))[0] ?? "{}");
    expect(themes.resources).toEqual([{ type: "stylesheet", href: ICONS }, { type: "stylesheet", href: brand.href }]);
    expect(themes.rules).toContain("'resources' lists the stylesheets");
  });

  it("an uncovered or refused stylesheet is never delivered", async () => {
    const client = await connect({
      resourceDomains: ["cdn.example.org"],
      resources: [icons, { type: "script", href: "https://cdn.example.org/x.js" }]
    });
    const result = await client.callTool({ name: "render_widget", arguments: card });
    expect(structured(result)).not.toHaveProperty("resources");
    const themes = JSON.parse(texts(await client.callTool({ name: "list_themes", arguments: {} }))[0] ?? "{}");
    expect(themes).not.toHaveProperty("resources");
    expect(themes.rules).not.toContain("'resources'");
  });

  it("without stylesheets every output is what it was", async () => {
    const plain = await connect({ resourceDomains: ["cdn.example.org"] });
    const empty = await connect({ resourceDomains: ["cdn.example.org"], resources: [] });
    for (const format of ["both", "page", "html", "app"]) {
      const a = await plain.callTool({ name: "render_widget", arguments: { ...card, format } });
      const b = await empty.callTool({ name: "render_widget", arguments: { ...card, format } });
      expect(b).toEqual(a);
      expect(structured(a)).not.toHaveProperty("resources");
      expect(JSON.stringify(a)).not.toContain("<link");
    }
  });
});

describe("documents link them; fragments and payloads never", () => {
  const catalog = createCatalog();

  it("a page document links each stylesheet before its styles, escaped, integrity with crossorigin", () => {
    const result = handleRenderWidget(catalog, { ...card, format: "page" }, { resources: [icons, brand] });
    const page = texts(result).find((text) => text.startsWith("<!doctype html>")) ?? "";
    const first = page.indexOf(`<link rel="stylesheet" href="${ICONS}">`);
    const second = page.indexOf(
      `<link rel="stylesheet" href="https://cdn.example.org/brand.css?v=1&amp;x=2" integrity="${SRI}" crossorigin="anonymous">`
    );
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(first);
    expect(second).toBeLessThan(page.indexOf("<style>"));
  });

  it("the app format's embedded document links them too", () => {
    const result = handleRenderWidget(catalog, { ...card, format: "app" }, { resources: [icons] });
    expect(texts(result).some((text) => text.includes(`<link rel="stylesheet" href="${ICONS}">`))).toBe(true);
  });

  it("an html fragment and the payload block never mention them", () => {
    for (const format of ["html", "widget", "both"]) {
      const result = handleRenderWidget(catalog, { ...card, format }, { resources: [icons] });
      for (const text of texts(result)) expect(text).not.toContain("fonts.googleapis.com");
      expect(JSON.stringify(structured(result).payload)).not.toContain("fonts.googleapis.com");
      expect(structured(result).resources).toEqual([icons]);
    }
  });

  it("previews and the theme listing carry them; none means no key", () => {
    expect(structured(handlePreviewWidget(catalog, card, { resources: [icons] })).resources).toEqual([icons]);
    expect(structured(handlePreviewWidget(catalog, card, {}))).not.toHaveProperty("resources");
    const listing = (resources: Resource[]) => JSON.parse(texts(handleListThemes(createThemeRegistry(), resources))[0] ?? "{}");
    expect(listing([icons]).resources).toEqual([{ type: "stylesheet", href: ICONS }]);
    expect(listing([])).not.toHaveProperty("resources");
  });

  it("structured content never shares an object with the caller's list", () => {
    const list: Resource[] = [{ ...icons }];
    const result = handleRenderWidget(catalog, card, { resources: list });
    (structured(result).resources as Resource[])[0]!.href = "mutated";
    expect(list[0]?.href).toBe(ICONS);
  });
});
