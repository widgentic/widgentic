/**
 * Settings designer: edits a principal's settings record — account-wide
 * preferences, one titled subsection per section. This version edits
 * `defaultThemes`: the theme light hosts and dark hosts get when a render
 * names none. One choice per mode, so choosing a theme replaces the mode's
 * previous one. Sections it does not edit pass through untouched, and the
 * host saves (the designer writes nothing).
 */
import { isPlainObject } from "@widgentic/core";
import type { ThemeEntry, ThemeMode } from "@widgentic/core";
import { applyChrome, h, injectDesignerStyles, section } from "./dom.js";
import type { ChromeOptions } from "./dom.js";

/** The settings record as the designer sees it: known sections plus any it passes through. */
export interface SettingsRecord {
  defaultThemes?: Partial<Record<ThemeMode, string>>;
  [section: string]: unknown;
}

export interface SettingsDesignerOptions {
  initialSettings?: SettingsRecord;
  /** The person's themes, offered as choices beside the built-ins. */
  themes?: Pick<ThemeEntry, "name" | "label">[];
  appearance?: "auto" | "light" | "dark";
  /** Host chrome, as for the other designers. */
  chrome?: ChromeOptions;
  /** Mount with the choices visible but inert. Toggle later via `setReadOnly`. */
  readOnly?: boolean;
}

export type SettingsLoadResult = { ok: true } | { ok: false; errors: string[] };

export interface SettingsDesignerHandle {
  /** The record, built-in choices omitted; unedited sections as supplied. */
  getSettings(): SettingsRecord;
  loadSettings(settings: unknown): SettingsLoadResult;
  setReadOnly(readOnly: boolean): void;
  subscribe(listener: (settings: SettingsRecord) => void): () => void;
  dispose(): void;
}

const MODES: readonly { mode: ThemeMode; label: string; builtIn: string }[] = [
  { mode: "light", label: "Light hosts", builtIn: "Built-in light" },
  { mode: "dark", label: "Dark hosts", builtIn: "Built-in dark" }
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Shape check for an untrusted record; errors instead of throwing. */
function checkSettings(settings: unknown): string[] {
  if (!isPlainObject(settings)) return ["Settings must be an object of named sections."];
  const themes = settings.defaultThemes;
  if (themes === undefined) return [];
  if (!isPlainObject(themes)) return ["defaultThemes: must be an object of { light?, dark? }."];
  const errors: string[] = [];
  for (const [mode, name] of Object.entries(themes)) {
    if (!MODES.some((known) => known.mode === mode)) errors.push(`defaultThemes: '${mode}' is not a theme mode.`);
    else if (typeof name !== "string") errors.push(`defaultThemes: the ${mode} default must be a theme name.`);
  }
  return errors;
}

export function createSettingsDesigner(
  container: Element,
  options: SettingsDesignerOptions = {}
): SettingsDesignerHandle {
  injectDesignerStyles(document);

  const themes = options.themes ?? [];
  let record: SettingsRecord = options.initialSettings ? clone(options.initialSettings) : {};
  const listeners = new Set<(settings: SettingsRecord) => void>();

  const panels = h("div", { class: "wgd-panels" });
  const root = h("div", { class: "wgd-root wgd-settings-designer" }, [panels]);
  if (options.appearance === "light" || options.appearance === "dark") {
    root.setAttribute("data-wgd-theme", options.appearance);
  }
  applyChrome(root, options.chrome);
  container.appendChild(root);

  function getSettings(): SettingsRecord {
    // The edited section is always present (possibly empty), so a host
    // saving it clears a mode the person set back to the built-in.
    return { ...clone(record), defaultThemes: clone(record.defaultThemes ?? {}) };
  }

  function notify(): void {
    for (const listener of [...listeners]) listener(getSettings());
  }

  // --- Default themes ----------------------------------------------------
  const selects = new Map<ThemeMode, HTMLSelectElement>();

  function fillSelect(select: HTMLSelectElement, mode: ThemeMode, builtIn: string): void {
    const current = record.defaultThemes?.[mode];
    select.replaceChildren(h("option", { value: "" }, [builtIn]));
    for (const theme of themes) {
      select.append(h("option", { value: theme.name }, [theme.label ?? theme.name]));
    }
    // A default whose theme the host did not supply stays visible and
    // selected until the person picks another — never dropped silently.
    if (current !== undefined && !themes.some((theme) => theme.name === current)) {
      select.append(h("option", { value: current, class: "wgd-unavailable" }, [`${current} (unavailable)`]));
    }
    select.value = current ?? "";
  }

  const rows = MODES.map(({ mode, label, builtIn }) => {
    const select = h("select", { class: "wgd-select wgd-default-theme", "data-mode": mode });
    fillSelect(select, mode, builtIn);
    select.addEventListener("change", () => {
      const next = { ...(record.defaultThemes ?? {}) };
      if (select.value === "") delete next[mode];
      else next[mode] = select.value;
      record = { ...record, defaultThemes: next };
      notify();
    });
    selects.set(mode, select);
    return h("label", { class: "wgd-row" }, [h("span", { class: "wgd-field-label" }, [label]), select]);
  });

  const defaultsPanel = section("Default themes", [
    h("span", { class: "wgd-field-label" }, [
      "The theme a render uses when it names none: light hosts get the light default, dark hosts the dark one."
    ]),
    ...rows
  ]);
  panels.append(defaultsPanel);

  function loadSettings(settings: unknown): SettingsLoadResult {
    const errors = checkSettings(settings);
    if (errors.length > 0) return { ok: false, errors };
    record = clone(settings as SettingsRecord);
    for (const { mode, builtIn } of MODES) {
      const select = selects.get(mode);
      if (select !== undefined) fillSelect(select, mode, builtIn);
    }
    notify();
    return { ok: true };
  }

  /** Same mechanism as the other designers: inert the section bodies. */
  function setReadOnly(readOnly: boolean): void {
    root.classList.toggle("wgd-readonly", readOnly);
    for (const body of panels.querySelectorAll(".wgd-section-body")) {
      if (readOnly) body.setAttribute("inert", "");
      else body.removeAttribute("inert");
    }
  }
  if (options.readOnly === true) setReadOnly(true);

  return {
    getSettings,
    loadSettings,
    setReadOnly,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      listeners.clear();
      root.remove();
    }
  };
}
