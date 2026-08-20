/**
 * The writable-store contract: one suite, every implementation.
 *
 * Run it against anything claiming `WritableWidgetStore` — the memory
 * reference here, the Cosmos adapter against an emulator, whatever comes
 * later. An implementation that passes serves the same behavior the port
 * promises: round-trips, deletes scoped to one principal, limit
 * rejections, invalid-entry refusal, and the key lifecycle
 * (create → resolve → revoke → unknown).
 *
 * Not a .test.ts on purpose: it defines the suite, callers instantiate it.
 */
import { describe, expect, it } from "vitest";
import type { WritableWidgetStore } from "../types.js";
import { StoreRejectionError } from "../types.js";
import type { StoredWidget } from "../types.js";

export interface ContractContext {
  store: WritableWidgetStore;
  /** Limits the factory configured; the suite probes against them. */
  maxWidgets: number;
}

function widget(kind: string): StoredWidget {
  return {
    kind,
    template: { tag: "div", children: [{ bind: "title" }] },
    descriptor: { description: `contract fixture ${kind}`, dataShape: "{ title }" }
  };
}

export function describeStoreContract(
  name: string,
  factory: () => Promise<ContractContext>
): void {
  describe(`store contract: ${name}`, () => {
    it("round-trips widgets and themes through the writable port", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:roundtrip");
      await store.putWidget(p.id, widget("report"));
      await store.putTheme(p.id, { name: "brand", tokens: { accent: "#123456" } });
      expect((await store.widgets(p.id)).map((w) => w.kind)).toContain("report");
      expect((await store.themes(p.id)).map((t) => t.name)).toContain("brand");
      // Removal is scoped to the named entry: siblings stay.
      await store.putWidget(p.id, widget("sibling"));
      await store.removeWidget(p.id, "report");
      await store.removeTheme(p.id, "brand");
      expect((await store.widgets(p.id)).map((w) => w.kind)).toEqual(["sibling"]);
      expect(await store.themes(p.id)).toEqual([]);
      await store.removeWidget(p.id, "sibling");
      expect(await store.widgets(p.id)).toEqual([]);
    });

    it("ensurePrincipal is idempotent per subject", async () => {
      const { store } = await factory();
      const first = await store.ensurePrincipal("contract:same-subject", "First");
      const again = await store.ensurePrincipal("contract:same-subject");
      expect(again.id).toBe(first.id);
      const other = await store.ensurePrincipal("contract:other-subject");
      expect(other.id).not.toBe(first.id);
    });

    it("keys: create resolves, listing never leaks, revoke isolates", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:keys");
      const a = await store.createKey(p.id, "laptop");
      const b = await store.createKey(p.id, "ci");
      const c = await store.createKey(p.id, "phone");
      expect(a.key).toMatch(/^wgk_/);
      expect((await store.resolvePrincipal(a.key))?.id).toBe(p.id);
      expect((await store.resolvePrincipal(b.key))?.id).toBe(p.id);
      expect((await store.resolvePrincipal(c.key))?.id).toBe(p.id);

      const listed = await store.listKeys(p.id);
      expect(listed.map((k) => k.name).sort()).toEqual(["ci", "laptop", "phone"]);
      expect(JSON.stringify(listed)).not.toContain(a.key);
      expect(JSON.stringify(listed)).not.toContain(b.key);
      expect(JSON.stringify(listed)).not.toContain(c.key);

      // Revocation scoped to ONE of three keys (the spec's scenario shape).
      await store.revokeKey(p.id, a.entry.id);
      expect(await store.resolvePrincipal(a.key)).toBeUndefined();
      expect((await store.resolvePrincipal(b.key))?.id).toBe(p.id);
      expect((await store.resolvePrincipal(c.key))?.id).toBe(p.id);
      const after = await store.listKeys(p.id);
      expect(after.find((k) => k.id === a.entry.id)?.revokedAt).toBeTruthy();
      expect(after.find((k) => k.id === b.entry.id)?.revokedAt).toBeUndefined();
      expect(after.find((k) => k.id === c.entry.id)?.revokedAt).toBeUndefined();
    });

    it("unknown and malformed keys resolve to undefined", async () => {
      const { store } = await factory();
      expect(await store.resolvePrincipal("wgk_" + "0".repeat(64))).toBeUndefined();
      expect(await store.resolvePrincipal("")).toBeUndefined();
      expect(await store.resolvePrincipal("not a key")).toBeUndefined();
    });

    it("rejects invalid entries and leaves state untouched", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:invalid");
      const bad: StoredWidget = {
        kind: "sneaky",
        template: { tag: "div", attrs: { onclick: "x()" }, children: [] },
        descriptor: { description: "forbidden handler", dataShape: "{}" }
      };
      await expect(store.putWidget(p.id, bad)).rejects.toThrow(StoreRejectionError);
      expect(await store.widgets(p.id)).toEqual([]);
      await expect(
        store.putWidget(p.id, widget("table"))
      ).rejects.toThrow(StoreRejectionError); // built-in kind is reserved
    });

    it("enforces the widget count limit with a structured rejection", async () => {
      const { store, maxWidgets } = await factory();
      const p = await store.ensurePrincipal("contract:limits");
      for (let i = 0; i < maxWidgets; i++) {
        await store.putWidget(p.id, widget(`w${i}`));
      }
      await expect(store.putWidget(p.id, widget("overflow"))).rejects.toMatchObject({
        code: "TOO_MANY_WIDGETS"
      });
      // Overwriting an existing kind is not a new entry and stays legal.
      await store.putWidget(p.id, widget("w0"));
    });

    it("writes against an unknown principal are refused", async () => {
      const { store } = await factory();
      await expect(
        store.putWidget("usr_nobody", widget("report"))
      ).rejects.toMatchObject({ code: "UNKNOWN_PRINCIPAL" });
      await expect(store.createKey("usr_nobody", "x")).rejects.toMatchObject({
        code: "UNKNOWN_PRINCIPAL"
      });
    });

    it("round-trips schemas through the writable port", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:schemas");
      await store.putSchema(p.id, {
        name: "person",
        label: "Person",
        schema: { type: "object", required: ["name"], properties: { name: { type: "string" } } }
      });
      const listed = await store.schemas(p.id);
      expect(listed.map((s) => s.name)).toContain("person");
      await store.removeSchema(p.id, "person");
      expect(await store.schemas(p.id)).toEqual([]);
      // Invalid entries are refused with state untouched.
      await expect(
        store.putSchema(p.id, { name: "a/b", schema: {} })
      ).rejects.toMatchObject({ code: "INVALID_IDENTIFIER" });
      await expect(
        store.putSchema(p.id, { name: "bad", schema: 42 as unknown as Record<string, unknown> })
      ).rejects.toMatchObject({ code: "INVALID_SHAPE" });
      expect(await store.schemas(p.id)).toEqual([]);
    });

    it("schema references live the full lifecycle at the door", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:schema-refs");
      // A ref to a schema that does not exist is refused.
      const refWidget: StoredWidget = {
        ...widget("person-card"),
        descriptor: { ...widget("person-card").descriptor, dataSchemaRef: "person" }
      };
      await expect(store.putWidget(p.id, refWidget)).rejects.toMatchObject({
        code: "UNKNOWN_SCHEMA"
      });
      // With the schema present, the same write is accepted.
      await store.putSchema(p.id, { name: "person", schema: { type: "object" } });
      await store.putWidget(p.id, refWidget);
      // Carrying BOTH an inline schema and a ref is refused.
      await expect(
        store.putWidget(p.id, {
          ...refWidget,
          kind: "person-table",
          descriptor: {
            ...refWidget.descriptor,
            dataSchema: { type: "object" }
          }
        })
      ).rejects.toMatchObject({ code: "INVALID_SHAPE" });
      // A referenced schema cannot be removed — the error names the widget.
      await expect(store.removeSchema(p.id, "person")).rejects.toMatchObject({
        code: "SCHEMA_IN_USE"
      });
      await expect(store.removeSchema(p.id, "person")).rejects.toThrow(/person-card/);
      // Re-pointing the widget frees the schema.
      await store.removeWidget(p.id, "person-card");
      await store.removeSchema(p.id, "person");
      expect(await store.schemas(p.id)).toEqual([]);
    });
  });
}
