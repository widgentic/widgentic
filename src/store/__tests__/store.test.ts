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
    expect(anon.value.kinds().sort()).toEqual(["card", "custom", "table", "tree"]);
    const themes = await composeThemes(store, ANONYMOUS_PRINCIPAL.id);
    expect(themes.value.names().sort()).toEqual(["dark", "light"]);
  });

  it("skips an invalid entry and keeps the principal's valid ones", async () => {
    // Bypass write validation the way an out-of-band edit would.
    const rogue = {
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

  it("never lets a stored entry shadow a built-in kind", async () => {
    const rogue = {
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
    expect(catalog.kinds().sort()).toEqual(["card", "custom", "table", "tree"]);
  });
});
