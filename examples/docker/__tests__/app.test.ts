// @vitest-environment happy-dom
/**
 * The example app's Settings section and the Themes list's default markers
 * (self-host-example spec, "The app has a Settings section"): the real page
 * and bundle entry, with `/api` answered by the published authoring surface
 * over a memory store — the same routes the service mounts.
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

function themeRow(name: string): HTMLElement | undefined {
  return [...document.querySelectorAll("#theme-list .row")].find(
    (row) => row.querySelector(".name")?.textContent === name
  ) as HTMLElement | undefined;
}

function lightSelect(): HTMLSelectElement {
  return document.querySelector('#settings-designer select[data-mode="light"]') as HTMLSelectElement;
}

beforeAll(async () => {
  principalId = (await store.ensurePrincipal("local:default", "Self-hosted")).id;
  await store.putTheme(principalId, { name: "google-light", tokens: {} });
  await store.putTheme(principalId, { name: "ocean", tokens: { accent: "#0a84ff" } });
  await store.putSettings(principalId, { defaultThemes: { light: "google-light" } });

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
  // The page's markup without its bundle tag: the entry is imported below.
  document.body.innerHTML = (page.split("<body>")[1]?.split("</body>")[0] ?? "").replace(/<script[\s\S]*?<\/script>/g, "");
  await import("../main.js");
  await until(() => status().startsWith("ready"), "the app to boot");
});

describe("the example app's Settings section", () => {
  it("marks the stored default in the Themes list", () => {
    expect(themeRow("google-light")?.querySelector(".badge")?.textContent).toBe("default light");
    expect(themeRow("ocean")?.querySelector(".badge")).toBeNull();
  });

  it("opens the widget designer on the light default", () => {
    click("tab-widgets");
    const select = document.querySelector("#widget-designer .wgd-theme-select") as HTMLSelectElement;
    expect(select.value).toBe("google-light");
  });

  it("keeps an in-progress draft, whatever its kind, across a trip to another tab", () => {
    click("tab-widgets");
    const kindField = [...document.querySelectorAll("#widget-designer .wgd-field")].find((field) =>
      field.textContent?.startsWith("Kind (id)")
    )?.querySelector("input") as HTMLInputElement;
    kindField.value = "my widget";
    kindField.dispatchEvent(new Event("input", { bubbles: true }));
    click("tab-themes");
    click("tab-widgets");
    const remounted = [...document.querySelectorAll("#widget-designer .wgd-field")].find((field) =>
      field.textContent?.startsWith("Kind (id)")
    )?.querySelector("input") as HTMLInputElement;
    expect(remounted.value).toBe("my widget");
    expect(document.querySelector("#widget-designer")?.textContent).toContain("INVALID_IDENTIFIER");
    expect(status()).not.toContain("load failed");
  });

  it("keeps the designer on its tab and the preview pick across a trip", () => {
    click("tab-widgets");
    const designerRoot = () => document.querySelector("#widget-designer .wgd-root");
    const pick = () => document.querySelector("#widget-designer .wgd-theme-select") as HTMLSelectElement;
    pick().value = "ocean";
    pick().dispatchEvent(new Event("change", { bubbles: true }));
    const before = designerRoot();
    // What an agent's tool call does: show the section already shown.
    click("tab-widgets");
    expect(designerRoot()).toBe(before);
    expect(pick().value).toBe("ocean");
    // A trip remounts (to pick up entries saved meanwhile) and keeps the pick.
    click("tab-themes");
    click("tab-widgets");
    expect(designerRoot()).not.toBe(before);
    expect(pick().value).toBe("ocean");
  });

  it("picking a default and saving it moves the mark", async () => {
    click("tab-settings");
    expect([...lightSelect().options].map((option) => option.value)).toEqual(["", "google-light", "ocean"]);
    lightSelect().value = "ocean";
    lightSelect().dispatchEvent(new Event("change", { bubbles: true }));
    click("settings-save");
    await until(() => status() === "saved settings", "the save");
    expect(await store.settings(principalId)).toEqual({ defaultThemes: { light: "ocean" } });
    expect(themeRow("ocean")?.querySelector(".badge")?.textContent).toBe("default light");
    expect(themeRow("google-light")?.querySelector(".badge")).toBeNull();
  });

  it("shows THEME_IN_USE instead of deleting a default theme", async () => {
    click("tab-themes");
    const remove = themeRow("ocean")?.querySelector("button.danger") as HTMLButtonElement;
    remove.click();
    await until(() => status().startsWith("THEME_IN_USE"), "the refusal");
    expect(status()).toContain("light");
    expect(themeRow("ocean")).toBeDefined();
    expect((await store.themes(principalId)).map((theme) => theme.name)).toContain("ocean");
  });

  it("offers a newly saved theme as a choice", async () => {
    click("theme-new");
    click("theme-save");
    await until(() => status() === "saved theme my-theme", "the theme save");
    click("tab-settings");
    expect([...lightSelect().options].map((option) => option.value)).toContain("my-theme");
    const dark = document.querySelector('#settings-designer select[data-mode="dark"]') as HTMLSelectElement;
    expect([...dark.options].map((option) => option.value)).toContain("my-theme");
  });
});

describe("the example app's designers preview in the island", () => {
  it("frames the widget and theme previews on the surface's /preview-frame", () => {
    click("tab-widgets");
    const widgetFrame = document.querySelector("#widget-designer iframe.wgd-preview-frame");
    expect(widgetFrame?.getAttribute("src")).toBe("/api/preview-frame");
    expect(widgetFrame?.getAttribute("sandbox")).toBe("allow-scripts");
    expect(document.querySelector("#widget-designer .wgd-preview")).toBeNull();
    click("tab-themes");
    expect(document.querySelector("#theme-designer iframe.wgd-preview-frame")?.getAttribute("src")).toBe("/api/preview-frame");
  });

  it("previews with the stylesheet the person saved in Settings", async () => {
    const icons = "https://fonts.googleapis.com/icon?family=Material+Icons";
    click("tab-settings");
    const settingsRoot = document.getElementById("settings-designer") as HTMLElement;
    for (const domain of ["fonts.googleapis.com", "fonts.gstatic.com"]) {
      (settingsRoot.querySelector("input.wgd-domain-add") as HTMLInputElement).value = domain;
      (settingsRoot.querySelector('button[title="Add domain"]') as HTMLButtonElement).click();
    }
    (settingsRoot.querySelector("input.wgd-stylesheet-add") as HTMLInputElement).value = icons;
    (settingsRoot.querySelector('button[title="Add stylesheet"]') as HTMLButtonElement).click();
    click("settings-save");
    await until(() => status() === "saved settings", "the settings save");
    expect((await store.settings(principalId)).resources).toEqual([{ type: "stylesheet", href: icons }]);

    click("tab-widgets");
    const frame = document.querySelector("#widget-designer iframe.wgd-preview-frame") as HTMLIFrameElement;
    const sent: { method?: string; params?: { structuredContent?: { resources?: unknown } } }[] = [];
    const fake = { postMessage: (message: (typeof sent)[number]) => sent.push(message) };
    Object.defineProperty(frame, "contentWindow", { configurable: true, get: () => fake });
    const post = (data: unknown) => window.dispatchEvent(new MessageEvent("message", { data, source: fake as unknown as Window }));
    post({ jsonrpc: "2.0", id: 1, method: "ui/initialize", params: {} });
    post({ jsonrpc: "2.0", method: "ui/notifications/initialized" });
    // The draft carried from the earlier trip has an invalid kind; a valid one previews.
    const kindField = [...document.querySelectorAll("#widget-designer .wgd-field")].find((field) =>
      field.textContent?.startsWith("Kind (id)")
    )?.querySelector("input") as HTMLInputElement;
    kindField.value = "my-widget";
    kindField.dispatchEvent(new Event("input", { bubbles: true }));
    const result = sent.filter((message) => message.method === "ui/notifications/tool-result").at(-1);
    expect(result?.params?.structuredContent?.resources).toEqual([{ type: "stylesheet", href: icons }]);
  });

  it("serves the frame under the person's domains, the list its MCP endpoint declares", async () => {
    // The web service mounts the surface with no operator list, as the MCP
    // service declares none: the frame grants exactly the person's domains.
    const person = await store.ensurePrincipal("local:framed", "Framed");
    await store.putSettings(person.id, { resourceDomains: ["cdn.example.com"] });
    const frame = await handleAuthoringRequest(
      { method: "GET", path: "preview-frame", context: { principalId: person.id } },
      { store }
    );
    expect(frame.status).toBe(200);
    expect(frame.headers?.["Content-Security-Policy"]).toContain("img-src data: https://cdn.example.com;");
  });
});
