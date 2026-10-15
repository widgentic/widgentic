/**
 * The rules of the principal settings record, Node-free so the host bundle
 * shares them with the store: the sections and modes this version knows, a
 * lenient read, and checks that report each refused part instead of
 * throwing. One record per principal, made of named sections; this version
 * defines `defaultThemes`, the theme each host mode uses when a render names
 * none, `resourceDomains`, the domains an MCP Apps frame may load assets
 * from directly (read by the core resource-domain rule), and `resources`,
 * the stylesheets those frames link (read by the core resource rule). The
 * store's write path (`./settings.ts`) turns the first problem into its
 * refusal and adds the record's own coverage check; the host bundle keeps
 * the parts that pass, checks coverage against what it declares, and
 * reports the rest.
 */
import {
  RESOURCE_DOMAIN_LIMIT,
  RESOURCE_LIMIT,
  isPlainObject,
  parseResourceDomains,
  parseResources,
  resourceCovered,
  resourceHost
} from "@widgentic/core";
import type { Resource, ThemeMode } from "@widgentic/core";

// A type literal, not an interface: it stays assignable to records with an
// index signature (the designer's pass-through settings record).
export type PrincipalSettings = {
  /** The theme each host mode uses when a render names none. */
  defaultThemes?: Partial<Record<ThemeMode, string>>;
  /** Canonical `https://` origins the app frame may load assets from directly. */
  resourceDomains?: string[];
  /** Stylesheets the app frame links, each on a host `resourceDomains` covers. */
  resources?: Resource[];
};

/** A write: each named section replaces, `null` removes, absent keeps. */
export type PrincipalSettingsUpdate = {
  [Section in keyof PrincipalSettings]?: PrincipalSettings[Section] | null;
};

/** One refused part of a settings record. */
export interface SettingsProblem {
  code: "INVALID_SHAPE" | "UNKNOWN_THEME" | "INVALID_DOMAIN" | "INVALID_RESOURCE" | "UNDECLARED_DOMAIN";
  /** What was refused: the record (`settings`), a section, `defaultThemes.<mode>`, `resourceDomains.<entry>` or `resources.<href>`. */
  name: string;
  message: string;
}

export const SETTINGS_SECTIONS: readonly (keyof PrincipalSettings)[] = ["defaultThemes", "resourceDomains", "resources"];

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
  const defaultThemes = readDefaultThemes(raw.defaultThemes, report);
  const resourceDomains = readResourceDomains(raw.resourceDomains, report);
  const resources = readResources(raw.resources, resourceDomains ?? [], report);
  return {
    ...(defaultThemes === undefined ? {} : { defaultThemes }),
    ...(resourceDomains === undefined ? {} : { resourceDomains }),
    ...(resources === undefined ? {} : { resources })
  };
}

function readDefaultThemes(
  themes: unknown,
  report: ((message: string) => void) | undefined
): Partial<Record<ThemeMode, string>> | undefined {
  if (themes === undefined) return undefined;
  if (!isPlainObject(themes)) {
    report?.("ignored a 'defaultThemes' setting that is not an object.");
    return undefined;
  }
  // Malformed values of known modes are reported; a mode this version does
  // not know is a later version's, ignored silently like an unknown section.
  const picked: Partial<Record<ThemeMode, string>> = {};
  for (const mode of THEME_MODES) {
    const name = themes[mode];
    if (typeof name === "string") picked[mode] = name;
    else if (name !== undefined) report?.(`ignored a ${mode} default theme that is not a name.`);
  }
  return Object.keys(picked).length > 0 ? picked : undefined;
}

/** The stored entries that pass today's rule, canonical; each other one reported by name. */
function readResourceDomains(
  value: unknown,
  report: ((message: string) => void) | undefined
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    report?.("ignored a 'resourceDomains' setting that is not a list.");
    return undefined;
  }
  const entries: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string") entries.push(entry);
    else report?.("ignored a resource domain that is not a string.");
  }
  const { domains, refused } = parseResourceDomains(entries);
  for (const { entry, error } of refused) report?.(`ignored the resource domain '${entry}': ${error}.`);
  return domains.length > 0 ? domains.map((domain) => domain.origin) : undefined;
}

/** The stored stylesheets that pass today's rule and the record's own domains; each other one reported. */
function readResources(
  value: unknown,
  domains: readonly string[],
  report: ((message: string) => void) | undefined
): Resource[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    report?.("ignored a 'resources' setting that is not a list.");
    return undefined;
  }
  const { resources, refused } = parseResources(value);
  for (const { entry, error } of refused) report?.(`ignored the resource ${resourceName(entry)}: ${error}.`);
  const covered = resources.filter((resource) => {
    if (resourceCovered(resource.href, domains)) return true;
    report?.(`ignored the stylesheet '${resource.href}': ${resourceHost(resource.href)} is not one of the resource domains.`);
    return false;
  });
  return covered.length > 0 ? covered : undefined;
}

/** How a resource entry is named in a report: its address when it has one. */
function resourceName(entry: unknown): string {
  return isPlainObject(entry) && typeof entry.href === "string" ? `'${entry.href}'` : JSON.stringify(entry) ?? "entry";
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
 * A `resourceDomains` value checked entry by entry: the canonical entries
 * that pass, deduplicated in first-seen order, and one problem per entry
 * the rule refuses. A value that is not a list of strings, or that holds
 * more than the limit, is one shape problem and keeps nothing.
 */
export function checkResourceDomains(value: unknown): { resourceDomains: string[]; problems: SettingsProblem[] } {
  if (!Array.isArray(value) || !value.every((entry): entry is string => typeof entry === "string")) {
    return {
      resourceDomains: [],
      problems: [
        { code: "INVALID_SHAPE", name: "resourceDomains", message: "'resourceDomains' must be a list of domain strings." }
      ]
    };
  }
  if (value.length > RESOURCE_DOMAIN_LIMIT) {
    return {
      resourceDomains: [],
      problems: [
        {
          code: "INVALID_SHAPE",
          name: "resourceDomains",
          message: `'resourceDomains' holds ${value.length} entries; at most ${RESOURCE_DOMAIN_LIMIT} are allowed.`
        }
      ]
    };
  }
  const { domains, refused } = parseResourceDomains(value);
  return {
    resourceDomains: domains.map((domain) => domain.origin),
    problems: refused.map(({ entry, error }) => ({
      code: "INVALID_DOMAIN",
      name: `resourceDomains.${entry}`,
      message: `'${entry}' is not a resource domain: ${error}.`
    }))
  };
}

/**
 * A `resources` value checked entry by entry by the core rule alone: the
 * entries that pass, deduplicated by address in first-seen order, and one
 * problem per refused entry. A value that is not a list of objects, or that
 * holds more than the limit, is one shape problem and keeps nothing.
 * Coverage is the caller's: the store checks the record's own domains, a
 * host the domains it declares.
 */
export function checkResources(value: unknown): { resources: Resource[]; problems: SettingsProblem[] } {
  if (!Array.isArray(value) || !value.every((entry) => isPlainObject(entry))) {
    return {
      resources: [],
      problems: [
        {
          code: "INVALID_SHAPE",
          name: "resources",
          message: "'resources' must be a list of { type: \"stylesheet\", href, integrity? } objects."
        }
      ]
    };
  }
  if (value.length > RESOURCE_LIMIT) {
    return {
      resources: [],
      problems: [
        {
          code: "INVALID_SHAPE",
          name: "resources",
          message: `'resources' holds ${value.length} entries; at most ${RESOURCE_LIMIT} are allowed.`
        }
      ]
    };
  }
  const { resources, refused } = parseResources(value);
  return {
    resources,
    problems: refused.map(({ entry, error }) => ({
      code: "INVALID_RESOURCE",
      name: `resources.${isPlainObject(entry) && typeof entry.href === "string" ? entry.href : "entry"}`,
      message: `the resource ${resourceName(entry)} is refused: ${error}.`
    }))
  };
}

/** The stylesheets of `resources` that `domains` do not cover, each as an `UNDECLARED_DOMAIN` problem. */
export function uncoveredResources(resources: readonly Resource[], domains: readonly string[]): SettingsProblem[] {
  return resources
    .filter((resource) => !resourceCovered(resource.href, domains))
    .map((resource) => {
      const host = resourceHost(resource.href);
      return {
        code: "UNDECLARED_DOMAIN",
        name: `resources.${resource.href}`,
        message: `the stylesheet '${resource.href}' needs ${host} in your resource domains.`
      };
    });
}

/**
 * A whole settings record checked against today's rules, each section by
 * its own rule, keeping what passes: the record itself when it is not an
 * object, an unknown section, each default naming a theme outside
 * `themes`, each refused domain and each refused resource are reported and
 * skipped. Resource coverage is not checked here (see `checkResources`).
 * An absent or `null` section is no section.
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
  const settings: PrincipalSettings = {};
  for (const [section, value] of Object.entries(record)) {
    if (value === undefined || value === null) continue;
    if (section === "defaultThemes") {
      const checked = checkDefaultThemes(value, themes);
      problems.push(...checked.problems);
      if (Object.keys(checked.defaultThemes).length > 0) settings.defaultThemes = checked.defaultThemes;
    } else if (section === "resourceDomains") {
      const checked = checkResourceDomains(value);
      problems.push(...checked.problems);
      if (checked.resourceDomains.length > 0) settings.resourceDomains = checked.resourceDomains;
    } else if (section === "resources") {
      const checked = checkResources(value);
      problems.push(...checked.problems);
      if (checked.resources.length > 0) settings.resources = checked.resources;
    } else {
      problems.push({ code: "INVALID_SHAPE", name: section, message: `'${section}' is not a settings section.` });
    }
  }
  return { settings, problems };
}
