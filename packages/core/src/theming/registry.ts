/**
 * Named theme registry — themes as addressable entities rather than
 * anonymous token maps, mirroring the widget catalog's ergonomics. Each
 * entry is complete as registered: a host that derives one theme from
 * another merges the tokens and styles before registering. The registry
 * also knows which entry each mode falls back to when a render names no
 * theme — the built-ins until a caller's settings choose otherwise.
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
  tokens: WidgetThemeInput;
  /** Shared `.wg-` classes for every widget the theme dresses. */
  styles?: WidgetStyles;
}

/** Entry as supplied to `register`. */
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
  /** Register an entry. Throws on conflicts and invalid entries. */
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

/** A copy of the styles, so later edits to the input never reach the registry. */
function copyStyles(styles: WidgetStyles | undefined): WidgetStyles {
  const copy: WidgetStyles = {};
  for (const [selector, declarations] of Object.entries(styles ?? {})) copy[selector] = { ...declarations };
  return copy;
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

      const styles = copyStyles(entry.styles);
      const stored: ThemeEntry = { name: entry.name, tokens: validated.theme };
      if (Object.keys(styles).length > 0) stored.styles = styles;
      if (entry.label !== undefined) stored.label = entry.label;
      if (entry.description !== undefined) stored.description = entry.description;
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
