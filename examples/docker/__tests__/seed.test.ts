// @vitest-environment node
/**
 * The optional startup seed (self-host-example spec, "An optional seed
 * populates the single principal at startup"), against the SQLite store
 * the deployment runs.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleRenderWidget } from "@widgentic/mcp";
import { composeCatalog, composeThemes } from "@widgentic/mcp/store";
import { createSqliteStore } from "@widgentic/mcp/store/sqlite";
import { seedOnStartup, seedPrincipal } from "../seed.js";

const SAMPLE = join(dirname(fileURLToPath(import.meta.url)), "..", "seed", "demo.json");

let dir: string;
let store: ReturnType<typeof createSqliteStore>;
let principalId: string;
let lines: string[];
const log = (line: string) => lines.push(line);

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "widgentic-seed-"));
  store = createSqliteStore(join(dir, "store.db"));
  principalId = (await store.ensurePrincipal("local:default", "Self-hosted")).id;
  lines = [];
});
afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

function seedFile(document: unknown): string {
  const path = join(dir, "seed.json");
  writeFileSync(path, typeof document === "string" ? document : JSON.stringify(document));
  return path;
}

const schema = { name: "person", schema: { type: "object", properties: { name: { type: "string" } } } };
const theme = { name: "brand", tokens: { accent: "#123456" } };
const widget = (kind: string, ref: string) => ({
  kind,
  template: { tag: "p", children: [{ bind: "name" }] },
  descriptor: { description: "d", dataShape: "{ name }", dataSchemaRef: ref }
});

describe("startup seed", () => {
  it("populates an empty store with the sample content, and its widgets render", async () => {
    const summary = await seedPrincipal(store, principalId, SAMPLE, log);
    expect(summary).toEqual({ written: 7, skipped: 0, refused: 0 });
    expect((await store.schemas(principalId)).map((s) => s.name).sort()).toEqual(["appointment-agenda", "email-inbox"]);
    expect((await store.themes(principalId)).map((t) => t.name).sort()).toEqual(["google-dark", "google-light"]);
    const widgets = await store.widgets(principalId);
    expect(widgets.map((w) => w.kind).sort()).toEqual(["appointment-agenda-widget", "email-inbox-widget"]);
    const catalog = (await composeCatalog(store, principalId)).value;
    for (const stored of widgets) {
      const result = handleRenderWidget(catalog, { widget: stored.kind, data: stored.descriptor.dataExample });
      expect(result.isError, stored.kind).toBeUndefined();
    }
    expect(lines.at(-1)).toContain("7 written, 0 already present, 0 refused");
  });

  it("never overwrites an entry the principal already holds", async () => {
    await store.putTheme(principalId, { name: "google-dark", tokens: { accent: "#ff0000" } });
    const summary = await seedPrincipal(store, principalId, SAMPLE, log);
    expect(summary).toEqual({ written: 6, skipped: 1, refused: 0 });
    const kept = (await store.themes(principalId)).find((t) => t.name === "google-dark");
    expect(kept?.tokens).toEqual({ accent: "#ff0000" });
  });

  it("refuses a bad entry with its code and still writes the rest", async () => {
    const path = seedFile({ schemas: [schema], themes: [theme], widgets: [widget("orphan", "nope"), widget("person-card", "person")] });
    const summary = await seedPrincipal(store, principalId, path, log);
    expect(summary).toEqual({ written: 3, skipped: 0, refused: 1 });
    expect(lines).toContain("widgentic web: seed widget 'orphan' refused: UNKNOWN_SCHEMA");
    expect((await store.widgets(principalId)).map((w) => w.kind)).toEqual(["person-card"]);
  });

  it.each([
    ["a missing file", () => join(dir, "absent.json")],
    ["a file that is not JSON", () => seedFile("{ not json")],
    ["a JSON value that is not an object", () => seedFile([1, 2])]
  ])("logs %s and writes nothing", async (_label, pathOf) => {
    const summary = await seedPrincipal(store, principalId, pathOf(), log);
    expect(summary).toBeUndefined();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("not loaded");
    expect(await store.widgets(principalId)).toEqual([]);
  });

  it("ignores a section that is not an array", async () => {
    const summary = await seedPrincipal(store, principalId, seedFile({ themes: { name: "x" }, schemas: [schema] }), log);
    expect(summary).toEqual({ written: 1, skipped: 0, refused: 0 });
    expect(lines).toContain("widgentic web: seed 'themes' ignored: expected an array");
  });

  it("does nothing when no file is configured", async () => {
    for (const file of [undefined, "", "  "]) {
      expect(await seedOnStartup(store, { principalId }, file, log)).toBeUndefined();
    }
    expect(lines).toEqual([]);
    expect(await store.themes(principalId)).toEqual([]);
  });

  it("ignores the seed in trusted-header mode, saying so", async () => {
    expect(await seedOnStartup(store, {}, SAMPLE, log)).toBeUndefined();
    expect(lines).toEqual(["widgentic web: WIDGENTIC_SEED_FILE ignored in multi-user mode — no single principal owns a seed"]);
    expect(await store.widgets(principalId)).toEqual([]);
  });

  it("seeds through the single principal at startup", async () => {
    const summary = await seedOnStartup(store, { principalId }, SAMPLE, log);
    expect(summary?.written).toBe(7);
  });
});

describe("startup seed settings", () => {
  it("sets the demo's default themes, and a render naming no theme uses them", async () => {
    await seedPrincipal(store, principalId, SAMPLE, log);
    expect(await store.settings(principalId)).toEqual({ defaultThemes: { light: "google-light", dark: "google-dark" } });
    const themes = (await composeThemes(store, principalId)).value;
    expect(themes.defaults()).toEqual({ light: "google-light", dark: "google-dark" });
    const catalog = (await composeCatalog(store, principalId)).value;
    const css = String((handleRenderWidget(catalog, { widget: "card", data: { title: "t" } }, { themes }).structuredContent as { css: string }).css);
    // Each mode's block carries that theme's accent from the seed.
    const block = (selector: string) => css.slice(css.indexOf(`${selector} {`)).split("}")[0] ?? "";
    expect(block(':root:not([data-theme="dark"])')).toContain(`--wg-accent: ${themes.get("google-light")?.tokens.accent};`);
    expect(block(':root[data-theme="dark"]')).toContain(`--wg-accent: ${themes.get("google-dark")?.tokens.accent};`);
    expect(themes.get("google-light")?.tokens.accent).toBe("#1a73e8");
  });

  it("never overwrites a section the person already holds", async () => {
    await seedPrincipal(store, principalId, SAMPLE, log);
    // The person sets dark hosts back to the built-in, then the service restarts.
    await store.putSettings(principalId, { defaultThemes: { light: "google-light" } });
    const summary = await seedPrincipal(store, principalId, SAMPLE, log);
    expect(summary).toEqual({ written: 0, skipped: 7, refused: 0 });
    expect(await store.settings(principalId)).toEqual({ defaultThemes: { light: "google-light" } });
  });

  it("logs a refused section with its code and keeps the entries", async () => {
    const path = seedFile({ themes: [theme], settings: { defaultThemes: { dark: "missing" }, fonts: {} } });
    const summary = await seedPrincipal(store, principalId, path, log);
    expect(summary).toEqual({ written: 1, skipped: 0, refused: 2 });
    expect(lines).toContain("widgentic web: seed setting 'defaultThemes' refused: UNKNOWN_THEME");
    expect(lines).toContain("widgentic web: seed setting 'fonts' refused: INVALID_SHAPE");
    expect(await store.settings(principalId)).toEqual({});
  });

  it("ignores settings that are not an object", async () => {
    const summary = await seedPrincipal(store, principalId, seedFile({ themes: [theme], settings: ["x"] }), log);
    expect(summary).toEqual({ written: 1, skipped: 0, refused: 0 });
    expect(lines).toContain("widgentic web: seed 'settings' ignored: expected an object of sections");
  });
});
