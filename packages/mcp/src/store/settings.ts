/**
 * Principal settings in the store: one record per principal, made of named
 * sections, so account-wide preferences have one home. The rules live in
 * `./settings-rules.ts`, Node-free and shared with the host bundle; this
 * module adds the store's refusals, which come from `./types.js` (and so
 * from `node:crypto`).
 *
 * Adapters store the RAW record and call these rules on both sides: writes
 * replace the sections an update names (a `null` removes one) and keep the
 * rest, including sections a later version wrote; reads keep only the
 * sections this version knows.
 */
import { isPlainObject } from "@widgentic/core";
import type { ThemeMode } from "@widgentic/core";
import { StoreRejectionError } from "./types.js";
import { THEME_MODES, checkDefaultThemes, checkResourceDomains, isSettingsSection, readSettings } from "./settings-rules.js";

export type { PrincipalSettings, PrincipalSettingsUpdate } from "./settings-rules.js";
export { readSettings } from "./settings-rules.js";

/**
 * Validate `update` and apply it to the raw stored record. Returns the
 * record to persist, or `undefined` when nothing is left to keep (adapters
 * then delete the record). `storedThemes` is every theme name the principal
 * stores, raw — an entry that fails validation today is still theirs. A
 * refusal changes nothing: the first problem is thrown before anything is
 * kept.
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
    if (!isSettingsSection(section)) {
      throw new StoreRejectionError("INVALID_SHAPE", `'${section}' is not a settings section.`);
    }
    if (value === null) {
      delete next[section];
      continue;
    }
    if (section === "resourceDomains") {
      const checked = checkResourceDomains(value);
      const [problem] = checked.problems;
      if (problem !== undefined) throw new StoreRejectionError(problem.code, problem.message);
      // An empty list is no section: "no domains declared".
      if (checked.resourceDomains.length > 0) next.resourceDomains = checked.resourceDomains;
      else delete next.resourceDomains;
      continue;
    }
    const checked = checkDefaultThemes(value, storedThemes);
    const [problem] = checked.problems;
    if (problem !== undefined) throw new StoreRejectionError(problem.code, problem.message);
    // An empty section is no section: "both modes built-in".
    if (Object.keys(checked.defaultThemes).length > 0) next.defaultThemes = checked.defaultThemes;
    else delete next.defaultThemes;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/** The modes whose default names `theme`, for the `THEME_IN_USE` refusal. */
export function modesUsingTheme(raw: unknown, theme: string): ThemeMode[] {
  const themes = readSettings(raw).defaultThemes ?? {};
  return THEME_MODES.filter((mode) => themes[mode] === theme);
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
