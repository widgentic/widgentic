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
  });
});
