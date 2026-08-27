/**
 * Named theme registry — themes as addressable entities rather than
 * anonymous token maps, mirroring the widget catalog's ergonomics.
 *
 * `extends` is resolved AT REGISTRATION into a flat token map: no runtime
 * cascade, no cycles, and what a host persists is exactly what renders.
 * The base name is retained on the entry for display and re-editing.
 */
import { darkTheme, validateTheme } from "./apply.js";
import type { WidgetThemeInput } from "./tokens.js";

/** A registered theme: identity, optional prose, and its token map. */
export interface ThemeEntry {
  name: string;
  label?: string;
  description?: string;
  /** Name of the entry this one was derived from (already merged in). */
  extends?: string;
  tokens: WidgetThemeInput;
}

/** Entry as supplied to `register` — `tokens` may omit inherited values. */
export type ThemeEntryInput = ThemeEntry;

export class DuplicateThemeError extends Error {
  readonly code: "DUPLICATE_THEME" = "DUPLICATE_THEME";
  readonly theme: string;

  constructor(name: string) {
    super(`Theme '${name}' is already registered.`);
    this.name = "DuplicateThemeError";
    this.theme = name;
  }
}

export class InvalidThemeEntryError extends Error {
  readonly code: string;
  readonly theme: string;

  constructor(name: string, code: string, message: string) {
    super(`Theme '${name}' is invalid: ${message}`);
    this.name = "InvalidThemeEntryError";
    this.code = code;
    this.theme = name;
  }
}

export interface ThemeRegistry {
  /** Register an entry; `extends` is merged eagerly. Throws on conflicts. */
  register(entry: ThemeEntryInput): void;
  get(name: string): ThemeEntry | undefined;
  list(): ThemeEntry[];
  names(): string[];
}

/**
 * A registry seeded with the built-ins: `light` (no tokens — the
 * stylesheet defaults) and `dark` (the shipped preset).
 */
export function createThemeRegistry(): ThemeRegistry {
  const entries = new Map<string, ThemeEntry>();

  const registry: ThemeRegistry = {
    register(entry) {
      if (
        typeof entry?.name !== "string" ||
        entry.name.trim() === ""
      ) {
        throw new InvalidThemeEntryError(
          String(entry?.name),
          "INVALID_NAME",
          "name must be a non-empty string."
        );
      }
      if (entries.has(entry.name)) throw new DuplicateThemeError(entry.name);

      const validated = validateTheme(entry.tokens ?? {});
      if (!validated.ok) {
        throw new InvalidThemeEntryError(
          entry.name,
          validated.error.code,
          validated.error.message
        );
      }

      let tokens: WidgetThemeInput = validated.theme;
      if (entry.extends !== undefined) {
        const base = entries.get(entry.extends);
        if (base === undefined) {
          throw new InvalidThemeEntryError(
            entry.name,
            "UNKNOWN_BASE_THEME",
            `extends '${entry.extends}' which is not registered.`
          );
        }
        // Merge once: base first, own tokens win. Flat from here on.
        tokens = { ...base.tokens, ...validated.theme };
      }

      const stored: ThemeEntry = { name: entry.name, tokens };
      if (entry.label !== undefined) stored.label = entry.label;
      if (entry.description !== undefined) stored.description = entry.description;
      if (entry.extends !== undefined) stored.extends = entry.extends;
      entries.set(entry.name, stored);
    },
    get: (name) => entries.get(name),
    list: () => [...entries.values()],
    names: () => [...entries.keys()]
  };

  registry.register({
    name: "light",
    label: "Light",
    description: "The built-in defaults — no tokens set.",
    tokens: {}
  });
  registry.register({
    name: "dark",
    label: "Dark",
    description: "Shipped dark preset with a lifted surface.",
    tokens: darkTheme
  });

  return registry;
}
