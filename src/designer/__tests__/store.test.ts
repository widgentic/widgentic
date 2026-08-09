import { describe, expect, it } from "vitest";
import { createDraftStore, starterDraft } from "../store.js";
import { deriveDiagnostics } from "../validate.js";

describe("draft store", () => {
  it("updates immutably and notifies subscribers", () => {
    const store = createDraftStore();
    const seen: string[] = [];
    store.subscribe((draft) => seen.push(draft.kind));
    const before = store.get();
    store.update((draft) => ({ ...draft, kind: "changed" }));
    expect(before.kind).toBe("my-widget"); // original untouched
    expect(store.get().kind).toBe("changed");
    expect(seen).toEqual(["changed"]);
  });

  it("undo restores the previous draft; replace clears history", () => {
    const store = createDraftStore();
    store.update((d) => ({ ...d, kind: "a" }));
    store.update((d) => ({ ...d, kind: "b" }));
    expect(store.undo()).toBe(true);
    expect(store.get().kind).toBe("a");
    store.replace({ ...starterDraft(), kind: "loaded" });
    expect(store.undo()).toBe(false);
    expect(store.get().kind).toBe("loaded");
  });

  it("unsubscribe stops notifications", () => {
    const store = createDraftStore();
    let calls = 0;
    const off = store.subscribe(() => calls++);
    store.update((d) => d);
    off();
    store.update((d) => d);
    expect(calls).toBe(1);
  });
});

describe("deriveDiagnostics", () => {
  it("passes the starter draft as previewable", () => {
    const diagnostics = deriveDiagnostics(starterDraft());
    expect(diagnostics.previewable).toBe(true);
    expect(diagnostics.template).toBeUndefined();
    expect(diagnostics.styles).toEqual([]);
  });

  it("flags built-in kind collisions and empty kinds", () => {
    expect(deriveDiagnostics({ ...starterDraft(), kind: "card" }).kind).toContain(
      "built-in"
    );
    expect(deriveDiagnostics({ ...starterDraft(), kind: "  " }).kind).toBeDefined();
  });

  it("surfaces template validation with code and stops preview", () => {
    const draft = starterDraft();
    draft.template = { tag: "button", attrs: { onclick: "x()" } };
    const diagnostics = deriveDiagnostics(draft);
    expect(diagnostics.template?.code).toBe("FORBIDDEN_ATTRIBUTE");
    expect(diagnostics.previewable).toBe(false);
  });

  it("cross-checks dataExample and sampleData against dataSchema", () => {
    const draft = starterDraft();
    draft.descriptor.dataSchema = { type: "object", required: ["lines"] };
    draft.sampleData = { lines: [] };
    const diagnostics = deriveDiagnostics(draft);
    expect(diagnostics.example).toMatchObject({
      code: "MISSING_FIELD",
      path: "data.lines"
    });
    expect(diagnostics.sample).toBeUndefined();
  });

  it("audits styles through the public generator", () => {
    const draft = starterDraft();
    draft.descriptor.styles = {
      ".not-widgentic": { color: "red" },
      ".wg-ok": { color: "red", background: "url(https://evil.example/x)" }
    };
    const issues = deriveDiagnostics(draft).styles;
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({ selector: ".not-widgentic" });
    expect(issues[1]).toMatchObject({ selector: ".wg-ok", property: "background" });
  });

  it("validates the preview theme", () => {
    const draft = starterDraft();
    draft.theme = { bg: "red; } body { display:none" };
    expect(deriveDiagnostics(draft).theme?.code).toBe("INVALID_TOKEN_VALUE");
  });
});
