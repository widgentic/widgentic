// @vitest-environment happy-dom
/**
 * The example app's WebMCP wiring (self-host-example spec, "A schema saved
 * meanwhile is never called unknown"): the real page and bundle entry,
 * registering its tools on a stand-in model context, with `/api` answered
 * by the published authoring surface over a memory store. The definition
 * check consults the widget designer only while the Widgets section is
 * shown, and never moves the person's view.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { handleAuthoringRequest } from "@widgentic/mcp/authoring";
import { createMemoryStore } from "@widgentic/mcp/store";
import type { WebMcpTool } from "@widgentic/webmcp";

const here = dirname(fileURLToPath(import.meta.url));
const store = createMemoryStore();
const tools: WebMcpTool[] = [];
let principalId = "";

async function until(check: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for ${label}`);
}

const click = (id: string) => (document.getElementById(id) as HTMLElement).click();
const shownPane = () => [...document.querySelectorAll("[id^='pane-']")].find((pane) => !(pane as HTMLElement).hidden)?.id;

async function check(dataSchemaRef: string): Promise<Record<string, unknown>> {
  const found = tools.find((candidate) => candidate.name === "widgentic_widget_definition_check");
  if (found === undefined) throw new Error("the check tool was not registered");
  const result = await found.execute({
    definition: {
      kind: "orders-card",
      template: { tag: "div", children: ["x"] },
      descriptor: { description: "d", dataShape: "{}", dataSchemaRef }
    }
  });
  return JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;
}

beforeAll(async () => {
  principalId = (await store.ensurePrincipal("local:default", "Self-hosted")).id;
  await store.putSchema(principalId, { name: "inbox", schema: { type: "object" } });

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
  // An agent-capable browser's model context, collecting what the page registers.
  (document as unknown as { modelContext: unknown }).modelContext = {
    registerTool(tool: WebMcpTool) {
      tools.push(tool);
    }
  };

  const page = readFileSync(join(here, "..", "index.html"), "utf8");
  document.body.innerHTML = (page.split("<body>")[1]?.split("</body>")[0] ?? "").replace(/<script[\s\S]*?<\/script>/g, "");
  await import("../main.js");
  await until(() => tools.some((tool) => tool.name === "widgentic_widget_definition_check"), "the tools to register");
});

describe("the definition check in the example app", () => {
  it("resolves references through the widget designer while Widgets is shown", async () => {
    click("tab-widgets");
    const known = await check("inbox");
    expect(known.ok).toBe(true);
    expect(known).not.toHaveProperty("diagnosticsDerived");
    expect((known.diagnostics as { schemaRef?: string }).schemaRef).toBeUndefined();
  });

  it("never calls a schema saved in another section unknown, and never moves the view", async () => {
    click("tab-schemas");
    // Saved while the person is in Data schemas: the hidden widget designer was
    // mounted before it existed.
    await store.putSchema(principalId, { name: "orders", schema: { type: "object" } });
    const result = await check("orders");
    expect(result.ok).toBe(true);
    expect(result.diagnosticsDerived).toBe(true);
    expect((result.diagnostics as { schemaRef?: string }).schemaRef).toBeUndefined();
    expect(shownPane()).toBe("pane-schemas");
  });
});
