/**
 * Optional startup seed (self-host-example spec): `WIDGENTIC_SEED_FILE`
 * names a JSON document `{ schemas?, themes?, actions?, widgets? }` that the
 * authoring service loads into the single principal at boot. Every entry
 * goes through the store's validated write — the checks a person's import
 * passes — in dependency order (schemas and actions before the widgets that
 * reference them). Entries the principal already holds are skipped, never
 * overwritten, so a restart cannot undo an edit; a refused entry is logged
 * with its code and the rest still land. A seed is a convenience: nothing
 * here stops the service, and keys and secrets are never seeded.
 */
import { readFileSync } from "node:fs";
import { isPlainObject } from "@widgentic/core";
import { StoreRejectionError } from "@widgentic/mcp/store";
import type { ThemeEntry } from "@widgentic/core";
import type { StoredAction, StoredSchema, StoredWidget, WritableWidgetStore } from "@widgentic/mcp/store";

export interface SeedSummary {
  written: number;
  skipped: number;
  refused: number;
}

const SECTIONS = ["schemas", "themes", "actions", "widgets"] as const;
type Section = (typeof SECTIONS)[number];

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Seed the principal from the file, or do nothing when no file is named. */
export async function seedPrincipal(
  store: WritableWidgetStore,
  principalId: string,
  file: string | undefined,
  log: (line: string) => void = (line) => console.error(line)
): Promise<SeedSummary | undefined> {
  const path = file?.trim() ?? "";
  if (path === "") return undefined;
  let document: unknown;
  try {
    document = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    log(`widgentic web: seed file ${path} not loaded: ${errorMessage(error)}`);
    return undefined;
  }
  if (!isPlainObject(document)) {
    log(`widgentic web: seed file ${path} not loaded: expected an object of schemas, themes, actions and widgets`);
    return undefined;
  }

  // What the principal already holds, by the identity each section uses.
  const held: Record<Section, Set<string>> = {
    schemas: new Set((await store.schemas(principalId)).map((entry) => entry.name)),
    themes: new Set((await store.themes(principalId)).map((entry) => entry.name)),
    actions: new Set((await store.actions(principalId)).map((entry) => entry.name)),
    widgets: new Set((await store.widgets(principalId)).map((entry) => entry.kind))
  };
  // The store validates every entry on write; these casts only name the
  // method each section goes to.
  const put: Record<Section, (entry: unknown) => Promise<void>> = {
    schemas: (entry) => store.putSchema(principalId, entry as StoredSchema),
    themes: (entry) => store.putTheme(principalId, entry as ThemeEntry),
    actions: (entry) => store.putAction(principalId, entry as StoredAction),
    widgets: (entry) => store.putWidget(principalId, entry as StoredWidget)
  };

  const summary: SeedSummary = { written: 0, skipped: 0, refused: 0 };
  for (const section of SECTIONS) {
    const entries = document[section];
    if (entries === undefined) continue;
    if (!Array.isArray(entries)) {
      log(`widgentic web: seed '${section}' ignored: expected an array`);
      continue;
    }
    for (const entry of entries) {
      const identity = isPlainObject(entry) ? (section === "widgets" ? entry.kind : entry.name) : undefined;
      const id = typeof identity === "string" ? identity : "(unnamed)";
      if (held[section].has(id)) {
        summary.skipped++;
        continue;
      }
      try {
        await put[section](entry);
        held[section].add(id);
        summary.written++;
      } catch (error) {
        summary.refused++;
        const code = error instanceof StoreRejectionError ? error.code : "STORE_ERROR";
        log(`widgentic web: seed ${section.slice(0, -1)} '${id}' refused: ${code}`);
      }
    }
  }
  log(
    `widgentic web: seeded from ${path}: ${summary.written} written, ${summary.skipped} already present, ${summary.refused} refused`
  );
  return summary;
}

/**
 * The service's startup step: seed the single principal, or — in
 * trusted-header mode, where no single principal owns a seed — say the
 * file was ignored.
 */
export async function seedOnStartup(
  store: WritableWidgetStore,
  identity: { principalId?: string },
  file: string | undefined,
  log: (line: string) => void = (line) => console.error(line)
): Promise<SeedSummary | undefined> {
  if (identity.principalId !== undefined) return seedPrincipal(store, identity.principalId, file, log);
  if ((file ?? "").trim() !== "") {
    log("widgentic web: WIDGENTIC_SEED_FILE ignored in multi-user mode — no single principal owns a seed");
  }
  return undefined;
}

