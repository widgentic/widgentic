// @vitest-environment happy-dom
/**
 * The example app's Settings section when the settings cannot be read: it
 * opens read-only and offers no Save, and once a later read succeeds it
 * opens the stored record rather than the placeholder, so an empty record
 * can never be saved over the stored one. The real page and bundle entry, with `/api` answered
 * by the published authoring surface except for the failing read.
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
// The settings read fails until a test lets it through.
let settingsReadable = false;

async function until(check: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for ${label}`);
}

const status = () => document.getElementById("status")?.textContent ?? "";
const click = (id: string) => (document.getElementById(id) as HTMLElement).click();


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
    if (!settingsReadable && url.pathname === "/api/settings" && (init?.method ?? "GET") === "GET") {
      return new Response(JSON.stringify({ error: { code: "STORE_ERROR", message: "settings unavailable" } }), { status: 502 });
    }
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

describe("unread settings are never saved over", () => {
  it("opens Settings read-only with no Save and leaves the stored record alone", async () => {
    click("tab-settings");
    await until(() => status().startsWith("settings could not be read"), "the read-only notice");
    expect((document.getElementById("settings-save") as HTMLElement).hidden).toBe(true);
    expect(lightSelect().closest("[inert]")).not.toBeNull();
    click("settings-save");
    expect(await store.settings(principalId)).toEqual({ defaultThemes: { light: "google-light" } });
  });

  it("opens the stored record, not the read-only placeholder, once a later read succeeds", async () => {
    settingsReadable = true;
    click("tab-themes");
    click("tab-settings");
    await until(() => !(document.getElementById("settings-save") as HTMLElement).hidden, "the editable designer");
    expect(lightSelect().value).toBe("google-light");
    expect(lightSelect().closest("[inert]")).toBeNull();
    click("settings-save");
    await until(() => status() === "saved settings", "the save");
    expect(await store.settings(principalId)).toEqual({ defaultThemes: { light: "google-light" } });
  });
});
