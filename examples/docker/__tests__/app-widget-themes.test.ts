// @vitest-environment happy-dom
/**
 * The example app opens a widget's preview on the widget's own theme
 * (widget-designer spec, "Preview theme selection in the widget designer"):
 * the real page and bundle entry over the published authoring surface.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { handleAuthoringRequest } from "@widgentic/mcp/authoring";
import { createMemoryStore } from "@widgentic/mcp/store";

const here = dirname(fileURLToPath(import.meta.url));
const store = createMemoryStore();
let principalId = "";

async function until(check: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for ${label}`);
}
const status = () => document.getElementById("status")?.textContent ?? "";
const click = (id: string) => (document.getElementById(id) as HTMLElement).click();
const pick = () => (document.querySelector("#widget-designer .wgd-theme-select") as HTMLSelectElement).value;
function openWidget(kind: string): void {
  const row = [...document.querySelectorAll("#widget-list .row .name")].find((name) => name.textContent === kind);
  (row as HTMLElement).click();
}
const widget = (kind: string, themes?: Record<string, string>) => ({
  kind,
  template: { tag: "p", children: [{ bind: "title" }] },
  descriptor: { description: kind, dataShape: "{ title }", ...(themes === undefined ? {} : { themes }) }
});

beforeAll(async () => {
  principalId = (await store.ensurePrincipal("local:default", "Self-hosted")).id;
  await store.putTheme(principalId, { name: "google-light", tokens: {} });
  await store.putTheme(principalId, { name: "acme", tokens: { accent: "#c2410c" } });
  await store.putSettings(principalId, { defaultThemes: { light: "google-light" } });
  await store.putWidget(principalId, widget("person-card-widget", { light: "acme" }));
  await store.putWidget(principalId, widget("plain-widget"));

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://example.test");
    const answer = await handleAuthoringRequest(
      {
        method: init?.method ?? "GET",
        path: url.pathname.replace(/^\/api\//, ""),
        body: typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined,
        context: { principalId }
      },
      { store }
    );
    return new Response(JSON.stringify(answer.body), { status: answer.status });
  }) as typeof fetch;

  const page = readFileSync(join(here, "..", "index.html"), "utf8");
  document.body.innerHTML = (page.split("<body>")[1]?.split("</body>")[0] ?? "").replace(/<script[\s\S]*?<\/script>/g, "");
  await import("../main.js");
  await until(() => status().startsWith("ready"), "the app to boot");
});

describe("the app previews a widget in its own theme", () => {
  it("opens a widget naming a theme on that theme, and others on the default", () => {
    click("tab-widgets");
    openWidget("person-card-widget");
    expect(pick()).toBe("acme");
    openWidget("plain-widget");
    expect(pick()).toBe("google-light");
    openWidget("person-card-widget");
    expect(pick()).toBe("acme");
  });

  it("keeps the person's pick across a remount", () => {
    click("tab-widgets");
    openWidget("person-card-widget");
    const select = document.querySelector("#widget-designer .wgd-theme-select") as HTMLSelectElement;
    select.value = "google-light";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    click("tab-themes");
    click("tab-widgets");
    expect(pick()).toBe("google-light");
  });
});
