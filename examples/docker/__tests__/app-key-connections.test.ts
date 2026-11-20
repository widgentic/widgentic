// @vitest-environment happy-dom
/**
 * The Keys section names the applications connected through each key
 * (self-host-example spec, "Hosts sign in through the authoring app"): the
 * real page and bundle entry, with `/api` answered by the published
 * authoring surface over a memory store that holds grants.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { handleAuthoringRequest } from "@widgentic/mcp/authoring";
import { createMemoryStore } from "@widgentic/mcp/store";

const here = dirname(fileURLToPath(import.meta.url));
const store = createMemoryStore();

async function until(check: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for ${label}`);
}

function keyRow(name: string): HTMLElement | undefined {
  return [...document.querySelectorAll("#key-list .row")].find((row) =>
    row.querySelector(".name")?.textContent?.startsWith(`${name} ·`)
  ) as HTMLElement | undefined;
}

beforeAll(async () => {
  const principal = await store.ensurePrincipal("local:default", "Self-hosted");
  const ops = await store.createKey(principal.id, "ops", ["read", "execute"]);
  await store.createKey(principal.id, "laptop");
  for (const clientName of ["Claude", "<b>VS Code</b>"]) {
    const code = await store.createAuthorizationCode(principal.id, {
      keyId: ops.entry.id,
      clientId: `cid_${clientName}`,
      clientName,
      resource: "https://mcp.example/mcp",
      redirectUri: "https://host.example/cb",
      codeChallenge: "challenge"
    });
    await store.exchangeAuthorizationCode(code, () => true);
  }

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://example.test");
    const answer = await handleAuthoringRequest(
      {
        method: init?.method ?? "GET",
        path: url.pathname.replace(/^\/api\//, ""),
        body: typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined,
        context: { principalId: principal.id }
      },
      { store, grants: store }
    );
    return new Response(JSON.stringify(answer.body), { status: answer.status });
  }) as typeof fetch;

  const page = readFileSync(join(here, "..", "index.html"), "utf8");
  document.body.innerHTML = (page.split("<body>")[1]?.split("</body>")[0] ?? "").replace(/<script[\s\S]*?<\/script>/g, "");
  await import("../main.js");
  await until(() => (document.getElementById("status")?.textContent ?? "").startsWith("ready"), "the app to boot");
  (document.getElementById("tab-keys") as HTMLElement).click();
  await until(() => keyRow("ops") !== undefined, "the key list");
});

describe("the Keys section names what uses a key", () => {
  it("shows the connected applications beside their key, as text and as reported", () => {
    const connections = keyRow("ops")?.querySelector(".connections");
    expect(connections?.textContent).toContain("used by Claude, <b>VS Code</b>");
    expect(connections?.textContent).toContain("as reported by the application");
    expect(connections?.textContent).toContain("revoking the key disconnects them");
    // The application chose that name: it is text, never markup.
    expect(connections?.querySelector("b")).toBeNull();
  });

  it("shows none for a key no host is connected through", () => {
    expect(keyRow("laptop")).toBeDefined();
    expect(keyRow("laptop")?.querySelector(".connections")).toBeNull();
  });

  it("says where a host signs in and where no key is needed", () => {
    const hint = document.getElementById("key-connect")?.textContent ?? "";
    expect(hint).toContain("supports sign-in");
    expect(hint).toContain("x-api-key: <your key>");
    expect(hint).toMatch(/\/mcp\/public/);
  });
});
