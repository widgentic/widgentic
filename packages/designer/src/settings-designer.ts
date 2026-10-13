/**
 * Settings designer: edits a principal's settings record — account-wide
 * preferences, one titled subsection per section. This version edits
 * `defaultThemes` (the theme light hosts and dark hosts get when a render
 * names none; one choice per mode, so choosing a theme replaces the mode's
 * previous one) and `resourceDomains` (the domains MCP Apps frames may load
 * images from directly), each entry checked live by the core rule the store
 * applies: a valid one is recorded canonical, an invalid one as typed, so
 * the save's refusal names what the person sees. Sections it does not edit
 * pass through untouched, and the host saves (the designer writes nothing).
 */
import { RESOURCE_DOMAIN_LIMIT, isPlainObject, parseResourceDomain } from "@widgentic/core";
import type { ThemeEntry, ThemeMode } from "@widgentic/core";
import { applyChrome, diagnosticLine, h, injectDesignerStyles, section } from "./dom.js";
import type { ChromeOptions } from "./dom.js";
import { clone } from "./internal.js";

/** The settings record as the designer sees it: known sections plus any it passes through. */
export interface SettingsRecord {
  defaultThemes?: Partial<Record<ThemeMode, string>>;
  /** Canonical origins, plus any entry the person typed that the rule refuses. */
  resourceDomains?: string[];
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
  /** Replace the themes offered as choices; the record is kept as it is. */
  setThemes(themes: Pick<ThemeEntry, "name" | "label">[]): void;
  setReadOnly(readOnly: boolean): void;
  subscribe(listener: (settings: SettingsRecord) => void): () => void;
  dispose(): void;
}

const MODES: readonly { mode: ThemeMode; label: string; builtIn: string }[] = [
  { mode: "light", label: "Light hosts", builtIn: "Built-in light" },
  { mode: "dark", label: "Dark hosts", builtIn: "Built-in dark" }
];

/** Shape check for an untrusted record; errors instead of throwing. */
function checkSettings(settings: unknown): string[] {
  if (!isPlainObject(settings)) return ["Settings must be an object of named sections."];
  const errors: string[] = [];
  const domains = settings.resourceDomains;
  if (domains !== undefined && (!Array.isArray(domains) || !domains.every((entry) => typeof entry === "string"))) {
    errors.push("resourceDomains: must be a list of domain strings.");
  }
  const themes = settings.defaultThemes;
  if (themes === undefined) return errors;
  if (!isPlainObject(themes)) return [...errors, "defaultThemes: must be an object of { light?, dark? }."];
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

  let themes = options.themes ?? [];
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

  // --- Resource domains --------------------------------------------------
  // The section is in the record once supplied or edited (possibly empty),
  // so a save clears a list the person emptied and never adds one unasked.
  const domainRows = h("div", { class: "wgd-domains" });
  const addInput = h("input", {
    type: "text",
    class: "wgd-input wgd-domain-add",
    placeholder: "cdn.example.com",
    spellcheck: "false",
    "aria-label": "Add a resource domain"
  });
  const addButton = h("button", { class: "wgd-icon", type: "button", title: "Add domain" }, ["+"]);

  /** A typed entry as the record keeps it: canonical when the rule accepts it, else as typed. */
  function recorded(typed: string): { value: string; mark: string; error: boolean } {
    const parsed = parseResourceDomain(typed);
    return "error" in parsed
      ? { value: typed.trim(), mark: `Not a resource domain: ${parsed.error}.`, error: true }
      : { value: parsed.origin, mark: parsed.origin, error: false };
  }

  function setDomains(next: string[]): void {
    record = { ...record, resourceDomains: next };
    renderDomains();
    notify();
  }

  function renderDomains(): void {
    const domains = record.resourceDomains ?? [];
    domainRows.replaceChildren(
      ...domains.map((entry, index) => {
        const input = h("input", { type: "text", class: "wgd-input wgd-domain", spellcheck: "false", "aria-label": `Resource domain ${index + 1}` });
        input.value = entry;
        input.addEventListener("change", () => {
          const next = [...domains];
          next[index] = recorded(input.value).value;
          setDomains(next);
        });
        const remove = h("button", { class: "wgd-icon", type: "button", title: "Remove domain" }, ["✕"]);
        remove.addEventListener("click", () => setDomains(domains.filter((_entry, at) => at !== index)));
        const { mark, error } = recorded(entry);
        return h("div", { class: "wgd-domain-entry" }, [
          h("div", { class: "wgd-row" }, [input, remove]),
          error ? diagnosticLine(mark) : h("span", { class: "wgd-field-label wgd-domain-origin" }, [mark])
        ]);
      })
    );
    const full = domains.length >= RESOURCE_DOMAIN_LIMIT;
    addInput.disabled = full;
    addButton.disabled = full;
  }

  function addDomain(): void {
    if (addInput.value.trim() === "" || (record.resourceDomains ?? []).length >= RESOURCE_DOMAIN_LIMIT) return;
    const entry = recorded(addInput.value).value;
    addInput.value = "";
    setDomains([...(record.resourceDomains ?? []), entry]);
  }
  addButton.addEventListener("click", addDomain);
  addInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addDomain();
    }
  });

  const domainsPanel = section("Resource domains", [
    h("span", { class: "wgd-field-label" }, [
      "Domains your widgets' images may load from directly in chat hosts that honor them, " +
        "when the server does not copy an image inline. Enter cdn.example.com or *.example.com, " +
        `optionally with https:// (no ports, paths or IP addresses), at most ${RESOURCE_DOMAIN_LIMIT}.`
    ]),
    h("span", { class: "wgd-field-label" }, [
      "Any render, including image addresses an agent supplies, may load from these domains in the " +
        "viewer's browser, so list only domains you control. A domain that redirects needs its target " +
        "listed too, and a chat client keeps the list it read until it reloads."
    ]),
    domainRows,
    h("div", { class: "wgd-row" }, [addInput, addButton])
  ]);
  panels.append(domainsPanel);
  renderDomains();

  function loadSettings(settings: unknown): SettingsLoadResult {
    const errors = checkSettings(settings);
    if (errors.length > 0) return { ok: false, errors };
    record = clone(settings as SettingsRecord);
    for (const { mode, builtIn } of MODES) {
      const select = selects.get(mode);
      if (select !== undefined) fillSelect(select, mode, builtIn);
    }
    renderDomains();
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

  function setThemes(next: Pick<ThemeEntry, "name" | "label">[]): void {
    themes = [...next];
    for (const { mode, builtIn } of MODES) {
      const select = selects.get(mode);
      if (select !== undefined) fillSelect(select, mode, builtIn);
    }
  }

  return {
    getSettings,
    loadSettings,
    setThemes,
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
