/**
 * The rules of the principal settings record, Node-free so the host bundle
 * shares them with the store: the sections and modes this version knows, a
 * lenient read, and checks that report each refused part instead of
 * throwing. One record per principal, made of named sections; this version
 * defines `defaultThemes`, the theme each host mode uses when a render names
 * none. The store's write path (`./settings.ts`) turns the first problem
 * into its refusal; the host bundle keeps the parts that pass and reports
 * the rest.
 */
import { isPlainObject } from "@widgentic/core";
import type { ThemeMode } from "@widgentic/core";

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

/** One refused part of a settings record. */
export interface SettingsProblem {
  code: "INVALID_SHAPE" | "UNKNOWN_THEME";
  /** What was refused: the record (`settings`), a section, or `defaultThemes.<mode>`. */
  name: string;
  message: string;
}

export const SETTINGS_SECTIONS: readonly (keyof PrincipalSettings)[] = ["defaultThemes"];

/** The host colour schemes a default theme is chosen for, in reporting order. */
export const THEME_MODES: readonly ThemeMode[] = ["light", "dark"];

/** Whether `section` names a section this version knows. */
export function isSettingsSection(section: string): boolean {
  return SETTINGS_SECTIONS.some((known) => known === section);
}

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
  // Malformed values of known modes are reported; a mode this version does
  // not know is a later version's, ignored silently like an unknown section.
  const picked: Partial<Record<ThemeMode, string>> = {};
  for (const mode of THEME_MODES) {
    const name = themes[mode];
    if (typeof name === "string") picked[mode] = name;
    else if (name !== undefined) report?.(`ignored a ${mode} default theme that is not a name.`);
  }
  return Object.keys(picked).length > 0 ? { defaultThemes: picked } : {};
}

/**
 * A `defaultThemes` value checked mode by mode against the names of the
 * themes it may choose: the modes that pass, and one problem per mode that
 * does not.
 */
export function checkDefaultThemes(
  value: unknown,
  themes: ReadonlySet<string>
): { defaultThemes: Partial<Record<ThemeMode, string>>; problems: SettingsProblem[] } {
  if (!isPlainObject(value)) {
    return {
      defaultThemes: {},
      problems: [
        { code: "INVALID_SHAPE", name: "defaultThemes", message: "'defaultThemes' must be an object of { light?, dark? }." }
      ]
    };
  }
  const defaultThemes: Partial<Record<ThemeMode, string>> = {};
  const problems: SettingsProblem[] = [];
  for (const [mode, name] of Object.entries(value)) {
    const known = THEME_MODES.find((candidate) => candidate === mode);
    if (known === undefined) {
      problems.push({
        code: "INVALID_SHAPE",
        name: `defaultThemes.${mode}`,
        message: `'${mode}' is not a theme mode: use 'light' or 'dark'.`
      });
    } else if (typeof name !== "string") {
      problems.push({ code: "INVALID_SHAPE", name: `defaultThemes.${known}`, message: `the ${known} default must be a theme name.` });
    } else if (!themes.has(name)) {
      problems.push({
        code: "UNKNOWN_THEME",
        name: `defaultThemes.${known}`,
        message: `the ${known} default names '${name}', which is not one of your themes.`
      });
    } else {
      defaultThemes[known] = name;
    }
  }
  return { defaultThemes, problems };
}

/**
 * A whole settings record checked against today's rules, keeping what
 * passes: the record itself when it is not an object, an unknown section,
 * and each default naming a theme outside `themes` are reported and
 * skipped. An absent or `null` section is no section.
 */
export function checkSettings(
  record: unknown,
  themes: ReadonlySet<string>
): { settings: PrincipalSettings; problems: SettingsProblem[] } {
  if (!isPlainObject(record)) {
    return {
      settings: {},
      problems: [{ code: "INVALID_SHAPE", name: "settings", message: "settings must be an object of named sections." }]
    };
  }
  const problems: SettingsProblem[] = [];
  let settings: PrincipalSettings = {};
  for (const [section, value] of Object.entries(record)) {
    if (value === undefined || value === null) continue;
    if (!isSettingsSection(section)) {
      problems.push({ code: "INVALID_SHAPE", name: section, message: `'${section}' is not a settings section.` });
      continue;
    }
    const checked = checkDefaultThemes(value, themes);
    problems.push(...checked.problems);
    if (Object.keys(checked.defaultThemes).length > 0) settings = { defaultThemes: checked.defaultThemes };
  }
  return { settings, problems };
}
