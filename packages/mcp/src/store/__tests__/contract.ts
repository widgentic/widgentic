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
import { ANONYMOUS_PRINCIPAL, StoreRejectionError } from "../types.js";
import type { PrincipalSettingsUpdate, StoredAction, StoredWidget } from "../types.js";
import type { ThemeEntry } from "@widgentic/core";
import { composeResourceDomains, composeResources, composeThemes, readPrincipalSettings } from "../compose.js";

export interface ContractContext {
  /** Built WITH a secret cipher — the suite exercises secrets. */
  store: WritableWidgetStore;
  /** Limits the factory configured; the suite probes against them. */
  maxWidgets: number;
  /** Reopen a NEW store over the same backing (restart simulation). */
  reopen?: () => WritableWidgetStore;
}

function widget(kind: string): StoredWidget {
  return {
    kind,
    template: { tag: "div", children: [{ bind: "title" }] },
    descriptor: { description: `contract fixture ${kind}`, dataShape: "{ title }" }
  };
}

const refreshAction: StoredAction = {
  name: "refresh",
  definition: {
    kind: "http",
    method: "GET",
    url: "https://api.example.com/weather",
    input: { type: "object", properties: { city: { type: "string" } } },
    output: { type: "object" },
    headers: { Authorization: { secret: "weather-token" } }
  }
};

function boundWidget(kind: string): StoredWidget {
  return {
    kind,
    template: { tag: "button", action: { ref: "refresh", input: { city: "city" } }, children: ["Refresh"] },
    descriptor: { description: `bound fixture ${kind}`, dataShape: "{ city }" }
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

    it("a linked subject resolves to the same principal with the same material", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:link-owner");
      await store.putWidget(p.id, widget("linked-card"));
      const created = await store.createKey(p.id, "shared");
      await store.linkSubject(p.id, "contract:link-other", "Other Account");
      const viaLink = await store.ensurePrincipal("contract:link-other");
      expect(viaLink.id).toBe(p.id);
      // any session sees the CANONICAL subject
      expect(viaLink.subject).toBe("contract:link-owner");
      expect((await store.widgets(viaLink.id)).map((w) => w.kind)).toContain("linked-card");
      const resolved = await store.resolvePrincipal(created.key);
      expect(resolved?.id).toBe(p.id);
      expect(await store.listLinkedSubjects(p.id)).toEqual([
        { subject: "contract:link-other", label: "Other Account" }
      ]);
    });

    it("linking refuses to swallow an account with data", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:conflict-a");
      const other = await store.ensurePrincipal("contract:conflict-b");
      await store.putWidget(other.id, widget("keeper"));
      await expect(store.linkSubject(p.id, "contract:conflict-b")).rejects.toMatchObject({
        code: "SUBJECT_IN_USE"
      });
      expect((await store.widgets(other.id)).map((w) => w.kind)).toEqual(["keeper"]);
      expect((await store.ensurePrincipal("contract:conflict-b")).id).toBe(other.id);
      // an unrevoked key alone also counts as data
      const q = await store.ensurePrincipal("contract:conflict-c");
      await store.createKey(q.id, "live");
      await expect(store.linkSubject(p.id, "contract:conflict-c")).rejects.toMatchObject({
        code: "SUBJECT_IN_USE"
      });
    });

    it("an empty principal is absorbed by linking, idempotently", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:absorb-into");
      const empty = await store.ensurePrincipal("contract:absorb-me");
      expect(empty.id).not.toBe(p.id);
      await store.linkSubject(p.id, "contract:absorb-me");
      expect((await store.ensurePrincipal("contract:absorb-me")).id).toBe(p.id);
      await store.linkSubject(p.id, "contract:absorb-me");
      expect(await store.listLinkedSubjects(p.id)).toEqual([{ subject: "contract:absorb-me" }]);
    });

    it("unlink detaches, the primary stays", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:unlink-owner");
      await store.linkSubject(p.id, "contract:unlink-me");
      await store.unlinkSubject(p.id, "contract:unlink-me");
      const fresh = await store.ensurePrincipal("contract:unlink-me");
      expect(fresh.id).not.toBe(p.id);
      await expect(
        store.unlinkSubject(p.id, "contract:unlink-owner")
      ).rejects.toMatchObject({ code: "CANNOT_UNLINK_PRIMARY" });
      expect(await store.listLinkedSubjects(p.id)).toEqual([]);
    });

    it("links survive a store reopen when the backing persists", async () => {
      const context = await factory();
      if (context.reopen === undefined) return; // memory has no restart notion
      const p = await context.store.ensurePrincipal("contract:persist-owner");
      await context.store.linkSubject(p.id, "contract:persist-linked");
      const reopened = context.reopen();
      expect((await reopened.ensurePrincipal("contract:persist-linked")).id).toBe(p.id);
      expect(await reopened.listLinkedSubjects(p.id)).toEqual([
        { subject: "contract:persist-linked" }
      ]);
    });

    it("actions round-trip and cannot be removed while a widget binds them", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:actions");
      await store.putAction(p.id, refreshAction);
      expect((await store.actions(p.id)).map((a) => a.name)).toEqual(["refresh"]);
      await store.putWidget(p.id, boundWidget("weather"));
      await expect(store.removeAction(p.id, "refresh")).rejects.toMatchObject({
        code: "ACTION_IN_USE",
        detail: expect.stringContaining("weather")
      });
      expect((await store.actions(p.id)).map((a) => a.name)).toEqual(["refresh"]);
      await store.removeWidget(p.id, "weather");
      await store.removeAction(p.id, "refresh");
      expect(await store.actions(p.id)).toEqual([]);
      await expect(
        store.putAction(p.id, { name: "bad", definition: { kind: "http", method: "GET", url: "http://x", input: { type: "object" }, output: {} } })
      ).rejects.toBeInstanceOf(StoreRejectionError);
    });

    it("secrets are write-only ciphertext with in-use protection", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:secrets");
      await store.putSecret(p.id, "weather-token", "sk-live-123");
      const listed = await store.listSecrets(p.id);
      expect(listed.map((e) => e.name)).toEqual(["weather-token"]);
      expect(JSON.stringify(listed)).not.toContain("sk-live-123");
      expect(await store.secretValue(p.id, "weather-token")).toBe("sk-live-123");
      expect(await store.secretValue(p.id, "missing")).toBeUndefined();
      await store.putSecret(p.id, "weather-token", "sk-live-456");
      expect(await store.secretValue(p.id, "weather-token")).toBe("sk-live-456");
      expect((await store.listSecrets(p.id)).length).toBe(1);
      await store.putAction(p.id, refreshAction);
      await expect(store.removeSecret(p.id, "weather-token")).rejects.toMatchObject({
        code: "SECRET_IN_USE",
        detail: expect.stringContaining("refresh")
      });
      await store.removeAction(p.id, "refresh");
      await store.removeSecret(p.id, "weather-token");
      expect(await store.listSecrets(p.id)).toEqual([]);
      await expect(store.putSecret(p.id, "Bad Name", "v")).rejects.toMatchObject({ code: "INVALID_SECRET_NAME" });
      await expect(store.putSecret(p.id, "big", "x".repeat(5000))).rejects.toMatchObject({ code: "SECRET_TOO_LARGE" });
    });

    it("key scopes are fixed at creation and travel with the key", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:scopes");
      const reader = await store.createKey(p.id, "reader");
      const runner = await store.createKey(p.id, "runner", ["read", "execute"]);
      expect(reader.entry.scopes).toEqual(["read"]);
      expect(runner.entry.scopes).toEqual(["read", "execute"]);
      expect((await store.resolvePrincipal(reader.key))?.scopes).toEqual(["read"]);
      expect((await store.resolvePrincipal(runner.key))?.scopes).toEqual(["read", "execute"]);
      await expect(store.createKey(p.id, "writer", ["write"])).rejects.toMatchObject({ code: "INVALID_SCOPES" });
      const listed = await store.listKeys(p.id);
      expect(listed.find((k) => k.name === "runner")?.scopes).toEqual(["read", "execute"]);
    });

    it("themes round-trip their styles; a malformed styles section is refused", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:theme-styles");
      const styles = { ".wg-btn": { padding: "4px 8px" } };
      await store.putTheme(p.id, { name: "brand", tokens: { accent: "#ff5a1f" }, styles });
      expect((await store.themes(p.id)).find((t) => t.name === "brand")?.styles).toEqual(styles);
      const malformed = { name: "bad", tokens: {}, styles: { ".wg-btn": "padding: 4px" } };
      await expect(store.putTheme(p.id, malformed as unknown as ThemeEntry)).rejects.toMatchObject({ code: "INVALID_THEME" });
      expect((await store.themes(p.id)).map((t) => t.name)).toEqual(["brand"]);
      const composed = await composeThemes(store, p.id);
      expect(composed.value.get("brand")?.styles).toEqual(styles);
    });

    it("settings: default themes round-trip, replace, and reach the composed registry", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:settings");
      expect(await store.settings(p.id)).toEqual({});
      await store.putTheme(p.id, { name: "a", tokens: {} });
      await store.putTheme(p.id, { name: "b", tokens: {} });
      await store.putSettings(p.id, { defaultThemes: { light: "a", dark: "b" } });
      await store.putSettings(p.id, { defaultThemes: { light: "b" } });
      expect(await store.settings(p.id)).toEqual({ defaultThemes: { light: "b" } });
      expect((await composeThemes(store, p.id)).value.defaults()).toEqual({ light: "b", dark: "dark" });
      // One theme may serve both modes.
      await store.putSettings(p.id, { defaultThemes: { light: "a", dark: "a" } });
      expect((await composeThemes(store, p.id)).value.defaults()).toEqual({ light: "a", dark: "a" });
    });

    it("settings: unmentioned sections are kept, null and an empty section remove", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:settings-sections");
      await store.putTheme(p.id, { name: "a", tokens: {} });
      await store.putSettings(p.id, { defaultThemes: { light: "a" } });
      await store.putSettings(p.id, {});
      expect(await store.settings(p.id)).toEqual({ defaultThemes: { light: "a" } });
      // An undefined section is an absent one, in every adapter alike.
      await store.putSettings(p.id, { defaultThemes: undefined } as unknown as PrincipalSettingsUpdate);
      expect(await store.settings(p.id)).toEqual({ defaultThemes: { light: "a" } });
      await store.putSettings(p.id, { defaultThemes: null });
      expect(await store.settings(p.id)).toEqual({});
      await store.putSettings(p.id, { defaultThemes: { light: "a" } });
      await store.putSettings(p.id, { defaultThemes: {} });
      expect(await store.settings(p.id)).toEqual({});
    });

    it("settings: refusals change nothing", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:settings-refusals");
      await store.putTheme(p.id, { name: "a", tokens: {} });
      await store.putSettings(p.id, { defaultThemes: { light: "a" } });
      await expect(store.putSettings(p.id, { defaultThemes: { dark: "missing" } })).rejects.toMatchObject({ code: "UNKNOWN_THEME" });
      const sepia = { defaultThemes: { sepia: "a" } } as unknown as PrincipalSettingsUpdate;
      await expect(store.putSettings(p.id, sepia)).rejects.toMatchObject({ code: "INVALID_SHAPE" });
      const fonts = { fonts: {} } as unknown as PrincipalSettingsUpdate;
      await expect(store.putSettings(p.id, fonts)).rejects.toMatchObject({ code: "INVALID_SHAPE" });
      const mixed = { defaultThemes: { dark: "a" }, fonts: {} } as unknown as PrincipalSettingsUpdate;
      await expect(store.putSettings(p.id, mixed)).rejects.toMatchObject({ code: "INVALID_SHAPE" });
      const numeric = { defaultThemes: { light: 7 } } as unknown as PrincipalSettingsUpdate;
      await expect(store.putSettings(p.id, numeric)).rejects.toMatchObject({ code: "INVALID_SHAPE" });
      expect(await store.settings(p.id)).toEqual({ defaultThemes: { light: "a" } });
      await expect(store.putSettings("usr_nobody", { defaultThemes: null })).rejects.toMatchObject({ code: "UNKNOWN_PRINCIPAL" });
    });

    it("settings: a default theme cannot be removed until it is unset", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:settings-in-use");
      await store.putTheme(p.id, { name: "a", tokens: {} });
      await store.putSettings(p.id, { defaultThemes: { light: "a", dark: "a" } });
      const refusal = store.removeTheme(p.id, "a");
      await expect(refusal).rejects.toMatchObject({ code: "THEME_IN_USE" });
      await expect(refusal).rejects.toThrow(/light and dark/);
      expect((await store.themes(p.id)).map((t) => t.name)).toEqual(["a"]);
      await store.putSettings(p.id, { defaultThemes: null });
      await store.removeTheme(p.id, "a");
      expect(await store.themes(p.id)).toEqual([]);
    });

    it("widget themes: an unknown theme is refused, a stored or built-in one is kept", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:widget-themes");
      const promo = (themes: unknown): StoredWidget =>
        ({ ...widget("promo"), descriptor: { ...widget("promo").descriptor, themes } }) as StoredWidget;
      const refusal = store.putWidget(p.id, promo({ light: "acme" }));
      await expect(refusal).rejects.toMatchObject({ code: "UNKNOWN_THEME" });
      await expect(refusal).rejects.toThrow(/light theme 'acme'/);
      expect(await store.widgets(p.id)).toEqual([]);
      await store.putTheme(p.id, { name: "acme", tokens: {} });
      await store.putWidget(p.id, promo({ light: "acme" }));
      await store.putWidget(p.id, { ...promo({ dark: "dark" }), kind: "plain" });
      const listed = (await store.widgets(p.id)).map((w) => [w.kind, w.descriptor.themes]);
      expect(listed.sort((a, b) => String(a[0]).localeCompare(String(b[0])))).toEqual([
        ["plain", { dark: "dark" }],
        ["promo", { light: "acme" }]
      ]);
      for (const bad of [{ light: 5 }, { sepia: "acme" }, { light: "" }, "acme"]) {
        await expect(store.putWidget(p.id, promo(bad)), JSON.stringify(bad)).rejects.toMatchObject({ code: "INVALID_SHAPE" });
      }
    });

    it("widget themes: a theme a widget names cannot be removed until the widget lets go", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:widget-theme-in-use");
      await store.putTheme(p.id, { name: "acme", tokens: {} });
      const promo: StoredWidget = { ...widget("promo"), descriptor: { ...widget("promo").descriptor, themes: { light: "acme", dark: "acme" } } };
      await store.putWidget(p.id, promo);
      await store.putWidget(p.id, { ...promo, kind: "report" });
      const refusal = store.removeTheme(p.id, "acme");
      await expect(refusal).rejects.toMatchObject({ code: "THEME_IN_USE" });
      await expect(refusal).rejects.toThrow(/named by widgets promo, report/);
      await store.putSettings(p.id, { defaultThemes: { light: "acme" } });
      await expect(store.removeTheme(p.id, "acme")).rejects.toThrow(/default light theme and is named by widgets promo, report/);
      await store.putSettings(p.id, { defaultThemes: null });
      await store.removeWidget(p.id, "report");
      await expect(store.removeTheme(p.id, "acme")).rejects.toThrow(/named by widget promo —/);
      await store.putWidget(p.id, widget("promo"));
      await store.removeTheme(p.id, "acme");
      expect(await store.themes(p.id)).toEqual([]);
    });

    it("settings never cross principals and leave entry listings alone", async () => {
      const { store } = await factory();
      const a = await store.ensurePrincipal("contract:settings-a");
      const b = await store.ensurePrincipal("contract:settings-b");
      await store.putTheme(a.id, { name: "brand", tokens: {} });
      await store.putTheme(b.id, { name: "brand", tokens: {} });
      await store.putSettings(a.id, { defaultThemes: { light: "brand" } });
      expect(await store.settings(b.id)).toEqual({});
      expect((await composeThemes(store, b.id)).value.defaults()).toEqual({ light: "light", dark: "dark" });
      expect((await composeThemes(store, ANONYMOUS_PRINCIPAL.id)).value.defaults()).toEqual({ light: "light", dark: "dark" });
      // The settings record is not an entry of any kind.
      expect((await store.themes(a.id)).map((t) => t.name)).toEqual(["brand"]);
      expect(await store.widgets(a.id)).toEqual([]);
      expect(await store.schemas(a.id)).toEqual([]);
      expect(await store.actions(a.id)).toEqual([]);
      expect(await store.listSecrets(a.id)).toEqual([]);
    });

    it("resource domains: accepted forms are stored canonical and deduplicated", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:domains");
      await store.putSettings(p.id, {
        resourceDomains: ["CDN.Example.com", "https://*.example.org/", "https://cdn.example.com"]
      });
      expect(await store.settings(p.id)).toEqual({ resourceDomains: ["https://cdn.example.com", "https://*.example.org"] });
      const composed = await composeResourceDomains(store, p.id);
      expect(composed).toEqual({ value: ["https://cdn.example.com", "https://*.example.org"], diagnostics: [] });
    });

    it("resource domains: unacceptable entries are refused by name and change nothing", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:domains-refused");
      await store.putSettings(p.id, { resourceDomains: ["cdn.example.com"] });
      for (const entry of [
        "http://cdn.example.com",
        "https://cdn.example.com:8443",
        "https://cdn.example.com/img",
        "192.168.1.10",
        "localhost",
        "*",
        "*.com",
        "a.*.example.com",
        "exämple.com",
        "cdn.example.com; script-src *",
        "'self'"
      ]) {
        const refusal = store.putSettings(p.id, { resourceDomains: ["img.example.com", entry] });
        await expect(refusal).rejects.toMatchObject({ code: "INVALID_DOMAIN" });
        await expect(refusal).rejects.toThrow(entry);
      }
      expect(await store.settings(p.id)).toEqual({ resourceDomains: ["https://cdn.example.com"] });
    });

    it("resource domains: shape and limit are refused as shape", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:domains-shape");
      const asString = { resourceDomains: "cdn.example.com" } as unknown as PrincipalSettingsUpdate;
      await expect(store.putSettings(p.id, asString)).rejects.toMatchObject({ code: "INVALID_SHAPE" });
      const numeric = { resourceDomains: [42] } as unknown as PrincipalSettingsUpdate;
      await expect(store.putSettings(p.id, numeric)).rejects.toMatchObject({ code: "INVALID_SHAPE" });
      const many = (count: number) => Array.from({ length: count }, (_value, index) => `cdn${index}.example.com`);
      await expect(store.putSettings(p.id, { resourceDomains: many(21) })).rejects.toMatchObject({ code: "INVALID_SHAPE" });
      expect(await store.settings(p.id)).toEqual({});
      await store.putSettings(p.id, { resourceDomains: many(20) });
      expect((await store.settings(p.id)).resourceDomains).toHaveLength(20);
    });

    it("resource domains: an empty list removes the section, as null does", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:domains-empty");
      await store.putSettings(p.id, { resourceDomains: ["cdn.example.com"] });
      await store.putSettings(p.id, { resourceDomains: [] });
      expect(await store.settings(p.id)).toEqual({});
      await store.putSettings(p.id, { resourceDomains: ["cdn.example.com"] });
      await store.putSettings(p.id, { resourceDomains: null });
      expect(await store.settings(p.id)).toEqual({});
    });

    it("resource domains: sections stay independent", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:domains-sections");
      await store.putTheme(p.id, { name: "a", tokens: {} });
      await store.putTheme(p.id, { name: "b", tokens: {} });
      await store.putSettings(p.id, { defaultThemes: { light: "a" } });
      await store.putSettings(p.id, { resourceDomains: ["cdn.example.com"] });
      expect(await store.settings(p.id)).toEqual({
        defaultThemes: { light: "a" },
        resourceDomains: ["https://cdn.example.com"]
      });
      await store.putSettings(p.id, { defaultThemes: { dark: "b" } });
      expect(await store.settings(p.id)).toEqual({
        defaultThemes: { dark: "b" },
        resourceDomains: ["https://cdn.example.com"]
      });
      // A domains-only update names no theme, so a theme removed meanwhile cannot refuse it.
      await store.putSettings(p.id, { defaultThemes: null });
      await store.removeTheme(p.id, "a");
      await store.putSettings(p.id, { resourceDomains: ["img.example.com"] });
      expect(await store.settings(p.id)).toEqual({ resourceDomains: ["https://img.example.com"] });
    });

    it("resource domains: composition yields only the caller's, from one shared read", async () => {
      const { store } = await factory();
      const a = await store.ensurePrincipal("contract:domains-a");
      const b = await store.ensurePrincipal("contract:domains-b");
      await store.putTheme(a.id, { name: "brand", tokens: {} });
      await store.putSettings(a.id, { defaultThemes: { light: "brand" }, resourceDomains: ["cdn.a.example"] });
      expect((await composeResourceDomains(store, a.id)).value).toEqual(["https://cdn.a.example"]);
      expect((await composeResourceDomains(store, b.id)).value).toEqual([]);
      expect((await composeResourceDomains(store, ANONYMOUS_PRINCIPAL.id)).value).toEqual([]);
      const read = readPrincipalSettings(store, a.id);
      const [themes, domains] = await Promise.all([
        composeThemes(store, a.id, { settings: read }),
        composeResourceDomains(store, a.id, { settings: read })
      ]);
      expect(themes.value.defaults()).toEqual({ light: "brand", dark: "dark" });
      expect(domains.value).toEqual(["https://cdn.a.example"]);
    });

    const ICONS = "https://fonts.googleapis.com/icon?family=Material+Icons";
    const SRI = "sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC";
    const sheet = (href: string, extra: Record<string, unknown> = {}) => ({ type: "stylesheet" as const, href, ...extra });
    const resourcesUpdate = (value: unknown) => ({ resources: value }) as unknown as PrincipalSettingsUpdate;

    it("stylesheets: accepted entries are stored in order, deduplicated, host lowercased", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:resources");
      await store.putSettings(p.id, { resourceDomains: ["fonts.googleapis.com", "*.example.org"] });
      await store.putSettings(p.id, {
        resources: [
          sheet("https://Fonts.Googleapis.com/icon?family=Material+Icons"),
          sheet("https://cdn.example.org/brand.css", { integrity: SRI }),
          sheet(ICONS)
        ]
      });
      expect((await store.settings(p.id)).resources).toEqual([
        { type: "stylesheet", href: ICONS },
        { type: "stylesheet", href: "https://cdn.example.org/brand.css", integrity: SRI }
      ]);
      expect((await composeResources(store, p.id)).value).toEqual((await store.settings(p.id)).resources);
    });

    it("stylesheets: unacceptable entries are refused by name and change nothing", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:resources-refused");
      await store.putSettings(p.id, { resourceDomains: ["cdn.example.org"], resources: [sheet("https://cdn.example.org/ok.css")] });
      const before = await store.settings(p.id);
      for (const entry of [
        sheet("http://cdn.example.org/a.css"),
        sheet("https://user:pw@cdn.example.org/a.css"),
        sheet("https://cdn.example.org:8443/a.css"),
        sheet("https://192.168.1.10/a.css"),
        sheet("https://localhost/a.css"),
        sheet("javascript:alert(1)"),
        sheet('https://cdn.example.org/a.css" onload="x'),
        sheet("https://cdn.example.org/a.css", { integrity: "md5-abc" }),
        { type: "script", href: "https://cdn.example.org/x.js" },
        sheet("https://cdn.example.org/a.css", { media: "print" })
      ]) {
        const refusal = store.putSettings(p.id, resourcesUpdate([entry]));
        await expect(refusal).rejects.toMatchObject({ code: "INVALID_RESOURCE" });
        await expect(refusal).rejects.toThrow(String(entry.href));
      }
      expect(await store.settings(p.id)).toEqual(before);
    });

    it("stylesheets: shape and limit are refused as shape", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:resources-shape");
      await store.putSettings(p.id, { resourceDomains: ["cdn.example.org"] });
      for (const value of ["https://cdn.example.org/a.css", ["https://cdn.example.org/a.css"]]) {
        await expect(store.putSettings(p.id, resourcesUpdate(value))).rejects.toMatchObject({ code: "INVALID_SHAPE" });
      }
      const many = (count: number) => Array.from({ length: count }, (_value, index) => sheet(`https://cdn.example.org/${index}.css`));
      await expect(store.putSettings(p.id, { resources: many(9) })).rejects.toMatchObject({ code: "INVALID_SHAPE" });
      expect((await store.settings(p.id)).resources).toBeUndefined();
      await store.putSettings(p.id, { resources: many(8) });
      expect((await store.settings(p.id)).resources).toHaveLength(8);
    });

    it("stylesheets: one outside the declared domains is refused, accepted with its domain in the same write", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:resources-undeclared");
      await store.putSettings(p.id, { resourceDomains: ["cdn.example.org"] });
      const inter = sheet("https://fonts.googleapis.com/css2?family=Inter");
      const refusal = store.putSettings(p.id, { resources: [inter] });
      await expect(refusal).rejects.toMatchObject({ code: "UNDECLARED_DOMAIN" });
      await expect(refusal).rejects.toThrow("fonts.googleapis.com");
      expect(await store.settings(p.id)).toEqual({ resourceDomains: ["https://cdn.example.org"] });
      await store.putSettings(p.id, { resourceDomains: ["cdn.example.org", "fonts.googleapis.com"], resources: [inter] });
      expect((await store.settings(p.id)).resources).toEqual([inter]);
    });

    it("stylesheets: a domain a stylesheet needs cannot be removed", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:resources-domain-in-use");
      await store.putSettings(p.id, { resourceDomains: ["fonts.googleapis.com", "cdn.example.org"], resources: [sheet(ICONS)] });
      const before = await store.settings(p.id);
      for (const update of [{ resourceDomains: ["cdn.example.org"] }, { resourceDomains: null }, { resourceDomains: [] }]) {
        const refusal = store.putSettings(p.id, update);
        await expect(refusal).rejects.toMatchObject({ code: "UNDECLARED_DOMAIN" });
        await expect(refusal).rejects.toThrow(ICONS);
      }
      expect(await store.settings(p.id)).toEqual(before);
    });

    it("stylesheets: a wildcard domain covers its subdomains, never its apex", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:resources-wildcard");
      await store.putSettings(p.id, { resourceDomains: ["*.example.org"] });
      await store.putSettings(p.id, { resources: [sheet("https://cdn.example.org/a.css")] });
      await expect(store.putSettings(p.id, { resources: [sheet("https://example.org/a.css")] })).rejects.toMatchObject({
        code: "UNDECLARED_DOMAIN"
      });
      expect((await store.settings(p.id)).resources).toEqual([sheet("https://cdn.example.org/a.css")]);
    });

    it("stylesheets: an empty list removes the section, as null does, keeping the domains", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:resources-empty");
      await store.putSettings(p.id, { resourceDomains: ["fonts.googleapis.com"], resources: [sheet(ICONS)] });
      await store.putSettings(p.id, { resources: [] });
      expect(await store.settings(p.id)).toEqual({ resourceDomains: ["https://fonts.googleapis.com"] });
      await store.putSettings(p.id, { resources: [sheet(ICONS)] });
      await store.putSettings(p.id, { resources: null });
      expect(await store.settings(p.id)).toEqual({ resourceDomains: ["https://fonts.googleapis.com"] });
    });

    it("stylesheets: composition yields only the caller's", async () => {
      const { store } = await factory();
      const a = await store.ensurePrincipal("contract:resources-a");
      const b = await store.ensurePrincipal("contract:resources-b");
      await store.putSettings(a.id, { resourceDomains: ["fonts.googleapis.com"], resources: [sheet(ICONS)] });
      expect((await composeResources(store, a.id)).value).toEqual([sheet(ICONS)]);
      expect((await composeResources(store, b.id)).value).toEqual([]);
      expect((await composeResources(store, ANONYMOUS_PRINCIPAL.id)).value).toEqual([]);
    });

    it("settings written before stylesheets read back unchanged", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("contract:resources-old-shape");
      await store.putTheme(p.id, { name: "brand", tokens: {} });
      await store.putSettings(p.id, { defaultThemes: { light: "brand" }, resourceDomains: ["cdn.example.org"] });
      expect(await store.settings(p.id)).toEqual({ defaultThemes: { light: "brand" }, resourceDomains: ["https://cdn.example.org"] });
      expect((await composeResources(store, p.id)).value).toEqual([]);
      // A write naming neither section never checks stylesheet coverage.
      await store.putSettings(p.id, { defaultThemes: null });
      expect(await store.settings(p.id)).toEqual({ resourceDomains: ["https://cdn.example.org"] });
    });
  });
}
