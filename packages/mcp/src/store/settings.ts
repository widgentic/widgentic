/**
 * Principal settings: one record per principal, made of named sections, so
 * account-wide preferences have one home. This version defines one section,
 * `defaultThemes` — the theme each host mode uses when a render names none.
 *
 * Adapters store the RAW record and call these rules on both sides: writes
 * replace the sections an update names (a `null` removes one) and keep the
 * rest, including sections a later version wrote; reads keep only the
 * sections this version knows. Not loaded by the host bundle: its refusals
 * come from `./types.js`, which imports `node:crypto`.
 */
import { isPlainObject } from "@widgentic/core";
import type { ThemeMode } from "@widgentic/core";
import { StoreRejectionError } from "./types.js";

// A type literal, not an interface: it stays assignable to records with an
// index signature (the designer's pass-through settings record).
export type PrincipalSettings = {
  /** The theme each host mode uses when a render names none. */
  defaultThemes?: Partial<Record<ThemeMode, string>>;
};

/** A write: each named section replaces, `null` removes, absent keeps. */
export type PrincipalSettingsUpdate = {
  [Section in keyof PrincipalSettings]?: PrincipalSettings[Section] | null;
};

const SECTIONS: readonly (keyof PrincipalSettings)[] = ["defaultThemes"];
const MODES: readonly ThemeMode[] = ["light", "dark"];

/**
 * The sections this version knows, malformed values dropped — each drop
 * reported through `report` when one is given. Never throws.
 */
export function readSettings(raw: unknown, report?: (message: string) => void): PrincipalSettings {
  if (raw === undefined || raw === null) return {};
  if (!isPlainObject(raw)) {
    report?.("ignored a settings record that is not an object.");
    return {};
  }
  const themes = raw.defaultThemes;
  if (themes === undefined) return {};
  if (!isPlainObject(themes)) {
    report?.("ignored a 'defaultThemes' setting that is not an object.");
    return {};
  }
  const picked: Partial<Record<ThemeMode, string>> = {};
  for (const mode of MODES) {
    const name = themes[mode];
    if (typeof name === "string") picked[mode] = name;
    else if (name !== undefined) report?.(`ignored a ${mode} default theme that is not a name.`);
  }
  return Object.keys(picked).length > 0 ? { defaultThemes: picked } : {};
}

function checkDefaultThemes(
  value: unknown,
  storedThemes: ReadonlySet<string>
): Partial<Record<ThemeMode, string>> {
  if (!isPlainObject(value)) {
    throw new StoreRejectionError("INVALID_SHAPE", "'defaultThemes' must be an object of { light?, dark? }.");
  }
  const out: Partial<Record<ThemeMode, string>> = {};
  for (const [mode, name] of Object.entries(value)) {
    const known = MODES.find((candidate) => candidate === mode);
    if (known === undefined) {
      throw new StoreRejectionError("INVALID_SHAPE", `'${mode}' is not a theme mode: use 'light' or 'dark'.`);
    }
    if (typeof name !== "string") {
      throw new StoreRejectionError("INVALID_SHAPE", `the ${known} default must be a theme name.`);
    }
    if (!storedThemes.has(name)) {
      throw new StoreRejectionError("UNKNOWN_THEME", `the ${known} default names '${name}', which is not one of your themes.`);
    }
    out[known] = name;
  }
  return out;
}

/**
 * Validate `update` and apply it to the raw stored record. Returns the
 * record to persist, or `undefined` when nothing is left to keep (adapters
 * then delete the record). `storedThemes` is every theme name the principal
 * stores, raw — an entry that fails validation today is still theirs.
 */
export function applySettingsUpdate(
  raw: unknown,
  update: unknown,
  storedThemes: ReadonlySet<string>
): Record<string, unknown> | undefined {
  if (!isPlainObject(update)) {
    throw new StoreRejectionError("INVALID_SHAPE", "settings must be an object of named sections.");
  }
  const next: Record<string, unknown> = isPlainObject(raw) ? { ...raw } : {};
  for (const [section, value] of Object.entries(update)) {
    // An undefined section is an absent one, in every adapter alike.
    if (value === undefined) continue;
    if (!SECTIONS.some((known) => known === section)) {
      throw new StoreRejectionError("INVALID_SHAPE", `'${section}' is not a settings section.`);
    }
    if (value === null) {
      delete next[section];
      continue;
    }
    const themes = checkDefaultThemes(value, storedThemes);
    // An empty section is no section: "both modes built-in".
    if (Object.keys(themes).length > 0) next.defaultThemes = themes;
    else delete next.defaultThemes;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/** The modes whose default names `theme`, for the `THEME_IN_USE` refusal. */
export function modesUsingTheme(raw: unknown, theme: string): ThemeMode[] {
  const themes = readSettings(raw).defaultThemes ?? {};
  return MODES.filter((mode) => themes[mode] === theme);
}

/** Throw `THEME_IN_USE` when a default names `theme`. */
export function refuseThemeInUse(raw: unknown, theme: string): void {
  const modes = modesUsingTheme(raw, theme);
  if (modes.length > 0) {
    throw new StoreRejectionError(
      "THEME_IN_USE",
      `'${theme}' is your default ${modes.join(" and ")} theme — choose another in Settings first.`
    );
  }
}
