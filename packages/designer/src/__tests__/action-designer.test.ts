// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createActionDesigner, defineActionDesignerElement } from "../index.js";
import type { ActionEntry } from "../index.js";

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

function host(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

const refresh: ActionEntry = {
  name: "refresh",
  label: "Refresh",
  definition: {
    kind: "http",
    method: "GET",
    url: "https://api.example.com/weather",
    input: { type: "object", properties: { city: { type: "string" } } },
    output: { type: "object" },
    headers: { Authorization: { secret: "weather-token" } }
  }
};

describe("action designer", () => {
  it("mounts standalone; the Test section exists only with a host testCall", () => {
    const container = host();
    const designer = createActionDesigner(container);
    const titles = () => [...container.querySelectorAll(".wgd-section-title")].map((t) => t.textContent);
    expect(titles()).toEqual(["Action", "Definition", "Import", "Export"]);
    expect(container.querySelector(".wgd-preview")).toBeNull();
    designer.dispose();
    expect(container.querySelector(".wgd-root")).toBeNull();

    const withTest = createActionDesigner(container, { testCall: async () => ({ ok: true }) });
    expect(titles()).toEqual(["Action", "Definition", "Test", "Import", "Export"]);
    withTest.dispose();
  });

  it("loads, edits and exports entries; invalid entries are refused untouched", () => {
    const container = host();
    const designer = createActionDesigner(container, { secretNames: ["weather-token"] });
    const seen: ActionEntry[] = [];
    designer.subscribe((entry) => seen.push(entry));
    expect(designer.loadAction(refresh)).toEqual({ ok: true });
    expect(designer.getAction()).toEqual(refresh);
    const bad = designer.loadAction({ name: "Bad Name", definition: { kind: "sql" } });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.length).toBeGreaterThan(0);
    expect(designer.getAction()).toEqual(refresh);
    // Switching kind through the editor replaces the definition.
    const kind = container.querySelector(".wgd-action-kind") as HTMLSelectElement;
    kind.value = "prompt";
    kind.dispatchEvent(new Event("change"));
    expect(designer.getAction().definition.kind).toBe("prompt");
    expect(seen.at(-1)?.definition.kind).toBe("prompt");
    // Export mirrors the entry.
    const exportButton = [...container.querySelectorAll("button")].find((b) => b.textContent === "Export action entry") as HTMLButtonElement;
    exportButton.click();
    const output = exportButton.closest(".wgd-section")?.querySelector("textarea") as HTMLTextAreaElement;
    expect(JSON.parse(output.value)).toEqual(designer.getAction());
  });

  it("runs the host's test call with the current http definition and the form's arguments", async () => {
    const container = host();
    const testCall = vi.fn(async (definition, args) => ({ echoed: args, url: (definition as { url: string }).url }));
    const designer = createActionDesigner(container, { initialAction: refresh, testCall });
    const run = container.querySelector(".wgd-test-run") as HTMLButtonElement;
    expect(run).not.toBeNull();
    run.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(testCall).toHaveBeenCalledTimes(1);
    expect(testCall.mock.calls[0]?.[0]).toMatchObject({ kind: "http", url: "https://api.example.com/weather" });
    expect(container.querySelector(".wgd-test-output")?.textContent).toContain("api.example.com");
    designer.dispose();
  });

  it("registers its element only on the explicit call and read-only inerts editing", () => {
    expect(customElements.get("widgentic-action-designer")).toBeUndefined();
    defineActionDesignerElement();
    expect(customElements.get("widgentic-action-designer")).toBeDefined();
    const container = host();
    const designer = createActionDesigner(container, { readOnly: true });
    const bodies = [...container.querySelectorAll(".wgd-section-body")];
    const editable = bodies.filter((b) => !b.parentElement?.classList.contains("wgd-view-only"));
    expect(editable.every((b) => b.hasAttribute("inert"))).toBe(true);
    designer.setReadOnly(false);
    expect(editable.some((b) => b.hasAttribute("inert"))).toBe(false);
  });
});
