import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ANONYMOUS_PRINCIPAL,
  composeCatalog,
  composeThemes,
  createFileStore,
  createMemoryStore,
  DEFAULT_LIMITS,
  generateKey,
  hashKey,
  verifyKey,
  StoreRejectionError
} from "../index.js";
import type { MemorySeedPrincipal, StoredWidget } from "../index.js";
import type { ThemeEntry } from "../../theming/index.js";

const reportWidget: StoredWidget = {
  kind: "report",
  template: { tag: "div", children: [{ bind: "title" }] },
  descriptor: { description: "A report", dataShape: "{ title }" }
};
const ticketWidget: StoredWidget = {
  kind: "ticket",
  template: { tag: "p", children: [{ bind: "id" }] },
  descriptor: { description: "A ticket", dataShape: "{ id }" }
};
const brandTheme: ThemeEntry = { name: "brand", tokens: { accent: "#ff5a1f" } };

/** The actions/secrets half of the read port, for fakes that only test widgets and themes. */
const inertExtras = {
  async actions() {
    return [];
  },
  async listSecrets() {
    return [];
  },
  async secretValue() {
    return undefined;
  }
};

const KEY_A = "wgk_aaaa1111";
const KEY_B = "wgk_bbbb2222";

function twoPrincipals(): MemorySeedPrincipal[] {
  return [
    {
      principal: { id: "alice", scopes: ["read"] },
      apiKey: KEY_A,
      widgets: [reportWidget],
      themes: [brandTheme]
    },
    {
      principal: { id: "bob", scopes: ["read"] },
      apiKey: KEY_B,
      widgets: [ticketWidget]
    }
  ];
}

describe("api keys", () => {
  it("hashes, verifies, and refuses everything else", () => {
    const key = generateKey();
    expect(key.startsWith("wgk_")).toBe(true);
    const digest = hashKey(key);
    expect(digest.startsWith("sha256:")).toBe(true);
    expect(digest).not.toContain(key.slice(4));

    expect(verifyKey(key, digest)).toBe(true);
    expect(verifyKey(`${key}x`, digest)).toBe(false);
    expect(verifyKey("", digest)).toBe(false);
    expect(verifyKey(key, "not-a-digest")).toBe(false);
    expect(verifyKey(key, "sha256:zz")).toBe(false);
  });

  it("never keeps raw key material in the store's state", () => {
    const store = createMemoryStore(twoPrincipals());
    const dump = JSON.stringify(store.snapshot());
    expect(dump).not.toContain(KEY_A);
    expect(dump).not.toContain(KEY_B);
    expect(dump).toContain("sha256:");
  });
});

describe("memory store", () => {
  it("resolves principals by key and returns their entries", async () => {
    const store = createMemoryStore(twoPrincipals());
    expect((await store.resolvePrincipal(KEY_A))?.id).toBe("alice");
    expect((await store.resolvePrincipal(KEY_B))?.id).toBe("bob");
    expect(await store.resolvePrincipal("wgk_unknown")).toBeUndefined();
    expect(await store.resolvePrincipal("")).toBeUndefined();

    expect((await store.widgets("alice")).map((w) => w.kind)).toEqual(["report"]);
    expect((await store.themes("alice")).map((t) => t.name)).toEqual(["brand"]);
    expect(await store.widgets("nobody")).toEqual([]);
  });

  it("hands back copies, so a caller cannot mutate stored state", async () => {
    const store = createMemoryStore(twoPrincipals());
    const first = await store.widgets("alice");
    first[0]!.kind = "tampered";
    expect((await store.widgets("alice")).map((w) => w.kind)).toEqual(["report"]);
  });

  it("refuses writes that break the rules", async () => {
    const store = createMemoryStore(twoPrincipals());
    // Built-in kinds may not be shadowed.
    await expect(
      store.putWidget("alice", { ...reportWidget, kind: "table" })
    ).rejects.toThrow(/RESERVED_KIND/);
    // Nor built-in THEME names: without this the write succeeded and the
    // entry was silently dropped at compose (registry.register throws).
    await expect(
      store.putTheme("alice", { name: "dark", tokens: { bg: "#000000" } })
    ).rejects.toThrow(/RESERVED_THEME/);
    await expect(
      store.putTheme("alice", { name: "light", tokens: { bg: "#ffffff" } })
    ).rejects.toThrow(/RESERVED_THEME/);
    // Templates must validate.
    await expect(
      store.putWidget("alice", {
        ...reportWidget,
        kind: "evil",
        template: { tag: "button", attrs: { onclick: "x()" } }
      })
    ).rejects.toThrow(/INVALID_TEMPLATE/);
    // Themes must validate.
    await expect(
      store.putTheme("alice", { name: "bad", tokens: { sneaky: "red" } } as ThemeEntry)
    ).rejects.toThrow(/INVALID_THEME/);
  });

  it("enforces the per-principal count limit", async () => {
    const store = createMemoryStore(twoPrincipals(), {
      maxWidgets: 2,
      maxThemes: 1,
      maxSchemas: 50,
      maxActions: 50,
      maxSecrets: 50,
      maxEntryBytes: 65_536,
      maxTemplateNodes: 2_000
    });
    await store.putWidget("alice", ticketWidget); // 2nd — fits
    await expect(
      store.putWidget("alice", { ...ticketWidget, kind: "third" })
    ).rejects.toThrow(StoreRejectionError);
    await expect(
      store.putTheme("alice", { name: "second", tokens: {} })
    ).rejects.toThrow(/TOO_MANY_THEMES/);
  });

  it("enforces the size and node limits", async () => {
    const store = createMemoryStore(twoPrincipals(), {
      maxWidgets: 100,
      maxThemes: 50,
      maxSchemas: 50,
      maxActions: 50,
      maxSecrets: 50,
      maxEntryBytes: 300,
      maxTemplateNodes: 5
    });
    const big: StoredWidget = {
      kind: "big",
      template: { tag: "div", children: Array.from({ length: 50 }, () => "x") },
      descriptor: { description: "big", dataShape: "x" }
    };
    await expect(store.putWidget("alice", big)).rejects.toThrow(
      /TOO_LARGE|TOO_MANY_NODES/
    );
  });
});

describe("file store", () => {
  async function seeded(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "wg-store-"));
    const store = createFileStore(dir);
    await store.seedPrincipal({
      id: "alice",
      scopes: ["read"],
      keyDigest: hashKey(KEY_A)
    });
    await writeFile(
      join(dir, "alice", "widgets", "report.json"),
      JSON.stringify(reportWidget)
    );
    await writeFile(
      join(dir, "alice", "themes", "brand.json"),
      JSON.stringify(brandTheme)
    );
    return dir;
  }

  it("reads a principal directory and resolves its key", async () => {
    const dir = await seeded();
    const store = createFileStore(dir);
    expect((await store.resolvePrincipal(KEY_A))?.id).toBe("alice");
    expect((await store.widgets("alice")).map((w) => w.kind)).toEqual(["report"]);
    expect((await store.themes("alice")).map((t) => t.name)).toEqual(["brand"]);
  });

  it("treats missing paths as empty, not as errors", async () => {
    const store = createFileStore(join(tmpdir(), "wg-store-does-not-exist"));
    expect(await store.widgets("nobody")).toEqual([]);
    expect(await store.themes("nobody")).toEqual([]);
    expect(await store.resolvePrincipal(KEY_A)).toBeUndefined();
  });

  it("refuses ids that would escape the store directory", async () => {
    const dir = await seeded();
    const store = createFileStore(dir);
    expect(await store.widgets("../../etc")).toEqual([]);
    expect(await store.themes("..")).toEqual([]);
  });

  it("skips out-of-band edits that break the rules", async () => {
    const dir = await seeded();
    const diagnostics: string[] = [];
    // Someone edits the store directly with a hostile template.
    await mkdir(join(dir, "alice", "widgets"), { recursive: true });
    await writeFile(
      join(dir, "alice", "widgets", "evil.json"),
      JSON.stringify({
        kind: "evil",
        template: { tag: "button", attrs: { onclick: "steal()" } },
        descriptor: { description: "evil", dataShape: "x" }
      })
    );
    const store = createFileStore(dir, {
      onDiagnostic: (message) => diagnostics.push(message)
    });
    const widgets = await store.widgets("alice");
    expect(widgets.map((w) => w.kind)).toEqual(["report"]);
    expect(diagnostics.join(" ")).toContain("INVALID_TEMPLATE");
  });
});

describe("composition", () => {
  it("gives two principals two catalogs, both with the built-ins", async () => {
    const store = createMemoryStore(twoPrincipals());
    const alice = await composeCatalog(store, "alice");
    const bob = await composeCatalog(store, "bob");

    expect(alice.value.kinds()).toContain("report");
    expect(alice.value.kinds()).not.toContain("ticket");
    expect(bob.value.kinds()).toContain("ticket");
    expect(bob.value.kinds()).not.toContain("report");
    for (const builtin of ["card", "table", "tree", "custom"]) {
      expect(alice.value.kinds()).toContain(builtin);
      expect(bob.value.kinds()).toContain(builtin);
    }
  });

  it("returns independent instances", async () => {
    const store = createMemoryStore(twoPrincipals());
    const first = await composeCatalog(store, "alice");
    const second = await composeCatalog(store, "alice");
    first.value.register("scratch", () => ({ tag: "div" }));
    expect(second.value.kinds()).not.toContain("scratch");
  });

  it("gives the anonymous principal the built-ins only", async () => {
    const store = createMemoryStore(twoPrincipals());
    const anon = await composeCatalog(store, ANONYMOUS_PRINCIPAL.id);
    expect(anon.value.kinds().sort()).toEqual(["card", "custom", "group", "table", "tree"]);
    const themes = await composeThemes(store, ANONYMOUS_PRINCIPAL.id);
    expect(themes.value.names().sort()).toEqual(["dark", "light"]);
  });

  it("skips an invalid entry and keeps the principal's valid ones", async () => {
    // Bypass write validation the way an out-of-band edit would.
    const rogue = {
      ...inertExtras,
      async resolvePrincipal() {
        return undefined;
      },
      async widgets() {
        return [
          reportWidget,
          {
            kind: "evil",
            template: { tag: "button", attrs: { onclick: "x()" } },
            descriptor: { description: "evil", dataShape: "x" }
          } as StoredWidget,
          ticketWidget
        ];
      },
      async themes() {
        return [brandTheme, { name: "bad", tokens: { sneaky: "red" } } as ThemeEntry];
      },
      async schemas() {
        return [];
      }
    };
    const catalog = await composeCatalog(rogue, "alice");
    expect(catalog.value.kinds()).toContain("report");
    expect(catalog.value.kinds()).toContain("ticket");
    expect(catalog.value.kinds()).not.toContain("evil");
    expect(catalog.diagnostics.join(" ")).toContain("evil");

    const themes = await composeThemes(rogue, "alice");
    expect(themes.value.names()).toContain("brand");
    expect(themes.value.names()).not.toContain("bad");
    expect(themes.diagnostics.join(" ")).toContain("bad");
  });

  it("never lets a stored theme shadow a built-in theme name", async () => {
    // Out-of-band stores can hold one even though writes now refuse it.
    const rogue = {
      ...inertExtras,
      async resolvePrincipal() {
        return undefined;
      },
      async widgets() {
        return [] as StoredWidget[];
      },
      async themes() {
        return [
          { name: "dark", tokens: { bg: "#ff0000" } } as ThemeEntry,
          brandTheme
        ];
      },
      async schemas() {
        return [];
      }
    };
    const themes = await composeThemes(rogue, "alice");
    // Skipped with a diagnostic naming the reason, the rest intact.
    expect(themes.diagnostics.join(" ")).toContain("RESERVED_THEME");
    expect(themes.value.names()).toContain("brand");
    // `dark` still resolves — to the BUILT-IN preset, not the stored one.
    expect(themes.value.get("dark")?.tokens.bg).not.toBe("#ff0000");
  });

  it("refuses exotic identifiers on write, everywhere the same", async () => {
    // One charset for all adapters: what breaks a Cosmos document id must
    // be refused by the memory store too, so behavior never depends on
    // the backend.
    const store = createMemoryStore([
      { principal: { id: "alice", scopes: ["read"] } }
    ]);
    await expect(
      store.putWidget("alice", {
        kind: "a/b#c",
        template: { tag: "div", children: [{ bind: "t" }] },
        descriptor: { description: "d", dataShape: "{ t }" }
      })
    ).rejects.toMatchObject({ code: "INVALID_IDENTIFIER" });
    await expect(
      store.putTheme("alice", { name: "no?slash", tokens: {} })
    ).rejects.toMatchObject({ code: "INVALID_IDENTIFIER" });
  });

  it("skips exotic identifiers at composition with a diagnostic", async () => {
    const rogue = {
      ...inertExtras,
      async resolvePrincipal() {
        return undefined;
      },
      async widgets() {
        return [
          reportWidget,
          {
            kind: "sneaky/one",
            template: { tag: "div", children: ["x"] },
            descriptor: { description: "d", dataShape: "x" }
          } as StoredWidget
        ];
      },
      async themes() {
        return [] as ThemeEntry[];
      },
      async schemas() {
        return [];
      }
    };
    const catalog = await composeCatalog(rogue, "alice");
    expect(catalog.value.kinds()).toContain("report");
    expect(catalog.value.kinds()).not.toContain("sneaky/one");
    expect(catalog.diagnostics.join(" ")).toContain("sneaky/one");
  });

  it("skips oversized and over-budget entries at composition, not just write", async () => {
    const tinyLimits = { ...DEFAULT_LIMITS, maxEntryBytes: 300, maxTemplateNodes: 3 };
    const fat = {
      kind: "fat",
      template: { tag: "div", children: ["y".repeat(400)] },
      descriptor: { description: "too big", dataShape: "x" }
    } as StoredWidget;
    const bushy = {
      kind: "bushy",
      template: {
        tag: "div",
        children: [
          { tag: "span", children: ["a"] },
          { tag: "span", children: ["b"] },
          { tag: "span", children: ["c"] }
        ]
      },
      descriptor: { description: "too many nodes", dataShape: "x" }
    } as StoredWidget;
    const rogue = {
      ...inertExtras,
      async resolvePrincipal() {
        return undefined;
      },
      async widgets() {
        return [reportWidget, fat, bushy];
      },
      async themes() {
        return [] as ThemeEntry[];
      },
      async schemas() {
        return [];
      }
    };
    const catalog = await composeCatalog(rogue, "alice", { limits: tinyLimits });
    expect(catalog.value.kinds()).toContain("report");
    expect(catalog.value.kinds()).not.toContain("fat");
    expect(catalog.value.kinds()).not.toContain("bushy");
    expect(catalog.diagnostics.join(" ")).toMatch(/fat.*|.*bytes/);
    expect(catalog.diagnostics.join(" ")).toContain("bushy");
  });

  it("never lets a stored entry shadow a built-in kind", async () => {
    const rogue = {
      ...inertExtras,
      async resolvePrincipal() {
        return undefined;
      },
      async widgets() {
        return [
          {
            kind: "table",
            template: { tag: "div", children: ["hijacked"] },
            descriptor: { description: "hijack", dataShape: "x" }
          } as StoredWidget
        ];
      },
      async themes() {
        return [];
      },
      async schemas() {
        return [];
      }
    };
    const { value: catalog, diagnostics } = await composeCatalog(rogue, "alice");
    expect(diagnostics.join(" ")).toContain("RESERVED_KIND");
    const rendered = catalog.render({ kind: "table", data: [{ a: 1 }] });
    expect(rendered.ok).toBe(true);
    if (rendered.ok) {
      // Still the built-in renderer, not the stored template.
      expect(JSON.stringify(rendered.node)).toContain("wg-table");
      expect(JSON.stringify(rendered.node)).not.toContain("hijacked");
    }
  });

  it("composes with no store at all", async () => {
    const { value: catalog } = await composeCatalog(undefined, "anyone");
    expect(catalog.kinds().sort()).toEqual(["card", "custom", "group", "table", "tree"]);
  });
});

describe("shared data schemas", () => {
  const personSchema = {
    name: "person",
    label: "Person",
    schema: {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" }, role: { type: "string" } }
    }
  };
  const personCard: StoredWidget = {
    kind: "person-card",
    template: { tag: "div", children: [{ bind: "name" }] },
    descriptor: {
      description: "A person as a card",
      dataShape: "{ name, role? }",
      dataSchemaRef: "person"
    }
  };

  function seededWithSchema(): MemorySeedPrincipal[] {
    return [
      {
        principal: { id: "alice", scopes: ["read"] },
        schemas: [personSchema],
        widgets: [personCard]
      }
    ];
  }

  it("resolves the ref at composition — and only there", async () => {
    const store = createMemoryStore(seededWithSchema());
    const { value: catalog, diagnostics } = await composeCatalog(store, "alice");
    expect(diagnostics).toEqual([]);
    const descriptor = catalog.describe("person-card");
    // The registered descriptor carries the RESOLVED schema, never a ref.
    expect(descriptor?.dataSchema).toEqual(personSchema.schema);
    expect(
      (descriptor as unknown as { dataSchemaRef?: string }).dataSchemaRef
    ).toBeUndefined();
    // Resolution feeds real validation: schema'd kinds fail fast.
    const rendered = catalog.render({ kind: "person-card", data: { role: "x" } });
    expect(rendered.ok).toBe(false);
    if (!rendered.ok) expect(rendered.error.path).toContain("name");
  });

  it("a schema edit propagates on the next composition", async () => {
    const store = createMemoryStore(seededWithSchema());
    await store.putSchema("alice", {
      ...personSchema,
      schema: {
        type: "object",
        required: ["name", "email"],
        properties: { name: { type: "string" }, email: { type: "string" } }
      }
    });
    const { value: catalog } = await composeCatalog(store, "alice");
    // person-card was never touched, yet validates against the NEW schema.
    const rendered = catalog.render({ kind: "person-card", data: { name: "Ada" } });
    expect(rendered.ok).toBe(false);
    if (!rendered.ok) expect(rendered.error.path).toContain("email");
  });

  it("a dangling ref skips that widget with a diagnostic, not the rest", async () => {
    // Out-of-band state: a rogue store hands back a ref with no schema.
    const rogue = {
      ...inertExtras,
      async resolvePrincipal() {
        return undefined;
      },
      async widgets() {
        return [personCard, reportWidget];
      },
      async themes() {
        return [] as ThemeEntry[];
      },
      async schemas() {
        return []; // the schema vanished out of band
      }
    };
    const { value: catalog, diagnostics } = await composeCatalog(rogue, "alice");
    expect(catalog.has("person-card")).toBe(false);
    expect(catalog.has("report")).toBe(true);
    expect(diagnostics.join(" ")).toContain("UNKNOWN_SCHEMA");
    expect(diagnostics.join(" ")).toContain("person");
  });

  it("schemas load only when some widget carries a ref", async () => {
    let schemaReads = 0;
    const counting = {
      ...inertExtras,
      async resolvePrincipal() {
        return undefined;
      },
      async widgets() {
        return [reportWidget];
      },
      async themes() {
        return [] as ThemeEntry[];
      },
      async schemas() {
        schemaReads++;
        return [];
      }
    };
    await composeCatalog(counting, "alice");
    expect(schemaReads).toBe(0);
  });

  it("file store serves <dir>/<principal>/schemas/*.json", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wg-store-"));
    const store = createFileStore(dir);
    await store.seedPrincipal({ id: "alice", scopes: ["read"], keyDigest: hashKey(KEY_A) });
    await writeFile(
      join(dir, "alice", "schemas", "person.json"),
      JSON.stringify(personSchema)
    );
    expect((await store.schemas("alice")).map((s) => s.name)).toEqual(["person"]);
    // Invalid files are skipped with a diagnostic, like widgets and themes.
    const diagnostics: string[] = [];
    await writeFile(join(dir, "alice", "schemas", "bad.json"), JSON.stringify({ name: "bad" }));
    const reporting = createFileStore(dir, { onDiagnostic: (m) => diagnostics.push(m) });
    expect((await reporting.schemas("alice")).map((s) => s.name)).toEqual(["person"]);
    expect(diagnostics.join(" ")).toContain("INVALID_SHAPE");
  });
});

describe("action bindings through composition", () => {
  const refresh = {
    name: "refresh",
    definition: {
      kind: "http" as const,
      method: "GET" as const,
      url: "https://api.example.com/weather",
      input: { type: "object", properties: { city: { type: "string" } } },
      output: { type: "object" }
    }
  };
  const bound: StoredWidget = {
    kind: "weather",
    template: { tag: "button", action: { ref: "refresh", input: { city: "city" } }, children: ["Refresh"] },
    descriptor: { description: "bound", dataShape: "{ city }" },
    load: { ref: "refresh", input: { city: "city" } }
  };
  const descriptorOf = (catalog: { render(p: unknown): unknown }, payload: unknown) => {
    const rendered = catalog.render(payload) as { ok: boolean; node?: { attrs?: Record<string, string> } };
    return JSON.parse(rendered.node?.attrs?.["data-wg-action"] ?? "{}") as Record<string, unknown>;
  };

  it("resolves shared refs, exposes bindings and load through the action source", async () => {
    const store = createMemoryStore([{ principal: { id: "alice", scopes: ["read", "execute"] }, widgets: [bound], actions: [refresh] }]);
    const composed = await composeCatalog(store, "alice");
    expect(composed.diagnostics).toEqual([]);
    expect(descriptorOf(composed.value, { kind: "weather", data: { city: "Oslo" } })).toEqual({ id: "", kind: "http", args: { city: "Oslo" }, widget: "weather" });
    expect(composed.actions?.resolve("refresh")).toEqual(refresh.definition);
    expect(composed.actions?.bindingAt("weather", "")).toEqual((bound.template as { action?: unknown }).action);
    expect(composed.actions?.bindingAt("weather", "children.0")).toBeUndefined();
    expect(composed.actions?.load("weather")).toEqual(bound.load);
    expect(composed.actions?.executeAllowed).toBe(true);
  });

  it("dangling refs degrade to disabled descriptors with a diagnostic", async () => {
    const store = createMemoryStore([{ principal: { id: "alice", scopes: ["read"] }, widgets: [bound] }]);
    const composed = await composeCatalog(store, "alice");
    expect(composed.diagnostics.join(" ")).toContain("unknown action 'refresh'");
    expect(descriptorOf(composed.value, { kind: "weather", data: { city: "Oslo" } })).toEqual({ id: "", disabled: "unresolved" });
  });

  it("a caller without execute sees http actions disabled by scope", async () => {
    const store = createMemoryStore([{ principal: { id: "alice", scopes: ["read"] }, widgets: [bound], actions: [refresh] }]);
    const composed = await composeCatalog(store, "alice", { executeAllowed: false });
    expect(descriptorOf(composed.value, { kind: "weather", data: { city: "Oslo" } })).toEqual({ id: "", kind: "http", args: { city: "Oslo" }, disabled: "scope", widget: "weather" });
    expect(composed.actions?.executeAllowed).toBe(false);
  });

  it("stores without a cipher refuse secret operations, and seeded keys carry scopes", async () => {
    const store = createMemoryStore([{ principal: { id: "alice", scopes: ["read", "execute"] }, apiKey: "wgk_seed" }]);
    await expect(store.putSecret("alice", "t", "v")).rejects.toMatchObject({ code: "NO_CIPHER" });
    await expect(store.secretValue("alice", "t")).rejects.toMatchObject({ code: "NO_CIPHER" });
    expect((await store.resolvePrincipal("wgk_seed"))?.scopes).toEqual(["read", "execute"]);
  });
});
