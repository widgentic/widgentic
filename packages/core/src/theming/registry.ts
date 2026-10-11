/**
 * Named theme registry — themes as addressable entities rather than
 * anonymous token maps, mirroring the widget catalog's ergonomics.
 *
 * `extends` is resolved AT REGISTRATION into a flat token map and a flat
 * styles map: no runtime cascade, no cycles, and what a host persists is
 * exactly what renders. The base name is retained on the entry for
 * display and re-editing. The registry also knows which entry each mode
 * falls back to when a render names no theme — the built-ins until a
 * caller's settings choose otherwise.
 */
import { isStyleMap } from "../catalog/styles.js";
import type { WidgetStyles } from "../catalog/styles.js";
import { darkTheme, validateTheme } from "./apply.js";
import type { WidgetThemeInput } from "./tokens.js";

/** The host colour schemes a default theme is chosen for. */
export type ThemeMode = "light" | "dark";

/** A registered theme: identity, optional prose, tokens and shared styles. */
export interface ThemeEntry {
  name: string;
  label?: string;
  description?: string;
  /** Name of the entry this one was derived from (already merged in). */
  extends?: string;
  tokens: WidgetThemeInput;
  /** Shared `.wg-` classes for every widget the theme dresses. */
  styles?: WidgetStyles;
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
  /** Make a registered entry the mode's default. Throws for an unknown name. */
  setDefault(mode: ThemeMode, name: string): void;
  /** The mode's default entry: the built-in of that mode until set. */
  getDefault(mode: ThemeMode): ThemeEntry;
  /** The effective default name per mode. */
  defaults(): Record<ThemeMode, string>;
}

/** Base styles under own styles: per selector, then per property. */
function mergeStyles(base: WidgetStyles | undefined, own: WidgetStyles | undefined): WidgetStyles {
  const merged: WidgetStyles = {};
  for (const source of [base ?? {}, own ?? {}]) {
    for (const [selector, declarations] of Object.entries(source)) {
      merged[selector] = { ...(merged[selector] ?? {}), ...declarations };
    }
  }
  return merged;
}

/**
 * A registry seeded with the built-ins: `light` (no tokens — the
 * stylesheet defaults) and `dark` (the shipped preset).
 */
export function createThemeRegistry(): ThemeRegistry {
  const entries = new Map<string, ThemeEntry>();
  const defaultNames: Record<ThemeMode, string> = { light: "light", dark: "dark" };

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

      if (entry.styles !== undefined && !isStyleMap(entry.styles)) {
        throw new InvalidThemeEntryError(
          entry.name,
          "INVALID_THEME",
          "styles must map selectors to objects of property/value strings."
        );
      }

      let tokens: WidgetThemeInput = validated.theme;
      let styles: WidgetStyles = mergeStyles(undefined, entry.styles);
      if (entry.extends !== undefined) {
        const base = entries.get(entry.extends);
        if (base === undefined) {
          throw new InvalidThemeEntryError(
            entry.name,
            "UNKNOWN_BASE_THEME",
            `extends '${entry.extends}' which is not registered.`
          );
        }
        // Merge once: base first, own tokens and styles win. Flat from here on.
        tokens = { ...base.tokens, ...validated.theme };
        styles = mergeStyles(base.styles, entry.styles);
      }

      const stored: ThemeEntry = { name: entry.name, tokens };
      if (Object.keys(styles).length > 0) stored.styles = styles;
      if (entry.label !== undefined) stored.label = entry.label;
      if (entry.description !== undefined) stored.description = entry.description;
      if (entry.extends !== undefined) stored.extends = entry.extends;
      entries.set(entry.name, stored);
    },
    get: (name) => entries.get(name),
    list: () => [...entries.values()],
    names: () => [...entries.keys()],
    setDefault(mode, name) {
      if (!entries.has(name)) {
        throw new InvalidThemeEntryError(name, "UNKNOWN_THEME", "it is not registered, so it cannot be a default.");
      }
      defaultNames[mode] = name;
    },
    getDefault(mode) {
      // Defaults only ever name registered entries and entries are never
      // removed, so this cannot miss; narrowed rather than asserted.
      const entry = entries.get(defaultNames[mode]);
      if (entry === undefined) throw new Error(`No ${mode} default theme is registered.`);
      return entry;
    },
    defaults: () => ({ ...defaultNames })
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
