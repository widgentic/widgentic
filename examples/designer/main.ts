/**
 * Demo host for the widgentic designers: all four (widget, theme, schema,
 * action), host-side persistence in localStorage, and the wiring that makes
 * them cooperate — every designer has the same Save action, and what one
 * saves the others consume: saved themes join the widget designer's preview
 * selector, saved schemas are offered to the widget and action designers,
 * saved actions become bindable, and saved widgets join the theme designer's
 * preview kinds.
 *
 * The widgentic.dev app is the real host; this page shows the library
 * alone: it performs no network I/O — localStorage stands in for the store.
 */
import {
  CHROME_DEFAULTS,
  chromeCss,
  chromeReferences,
  defineActionDesignerElement,
  defineDesignerElement,
  defineSchemaDesignerElement,
  defineThemeDesignerElement
} from "@widgentic/designer";
import type {
  ActionDesignerHandle,
  ChromeOptions,
  DesignerDiagnostics,
  DesignerHandle,
  SchemaDesignerHandle,
  SchemaEntry,
  ThemeDesignerHandle
} from "@widgentic/designer";
import type { StoredAction, ThemeEntry } from "@widgentic/core";
import { invoiceWidget, weatherWidget, xPostWidget } from "@widgentic-examples/mcp-server/widgets";
// The mount discipline (dispose → clear → construct, and re-mount a designer
// when returning to its tab so entries saved meanwhile appear) is example
// WIRING and lives once in @widgentic-examples/shared; the seeds, persistence
// and toggle below are the DEMO — copy those freely.
import { mountAction, mountSchema, mountTheme, mountWidget, previewThemes } from "@widgentic-examples/shared/designers";

const DRAFT_KEY = "widgentic-designer-draft";
const THEMES_KEY = "widgentic-designer-themes";
const SCHEMAS_KEY = "widgentic-designer-schemas";
const ACTIONS_KEY = "widgentic-designer-actions";
const WIDGETS_KEY = "widgentic-designer-widgets";
const CHROME_KEY = "widgentic-designer-chrome";
const ALL_KEYS = [DRAFT_KEY, THEMES_KEY, SCHEMAS_KEY, ACTIONS_KEY, WIDGETS_KEY, CHROME_KEY];

// --- Host chrome ---------------------------------------------------------
// The designers wear the widgentic palette by DEFAULT — this page passes no
// `chrome` at all in its normal state, and paints itself from the same
// exported palette so page and designers match with nothing configured.
//
// The toggle is the demonstration: the page swaps to its OWN palette — Dracula
// (Zeno Rocha, MIT), written out in index.html, because the package ships one
// default and no second palette to fall back to — and hands the designers a
// map covering all 28 chrome tokens pointed at the page's --host-* properties,
// plus a typeface pair a library can never default to.
const paletteStyle = document.createElement("style");
paletteStyle.textContent = chromeCss(CHROME_DEFAULTS, { prefix: "--host", selector: ":root" });
document.head.appendChild(paletteStyle);

const HOST_CHROME: ChromeOptions = {
  // The full-takeover recipe: the page paints every --host-* (above), the
  // designers reference them — flipping [data-host-chrome] repaints mounted
  // designers through the cascade. Entries the demo wants to differ are
  // spread-overridden; typography is the one thing a library cannot default
  // to, so a host with its own faces passes them with a fallback stack.
  ...chromeReferences(),
  font: 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace',
  "font-mono": 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace',
  "font-size": "14px",
  "font-size-sm": "13px",
  "font-size-xs": "12px",
  "radius-sm": "3px",
  "radius-lg": "8px",
  gap: "24px"
};
let hostChrome = localStorage.getItem(CHROME_KEY) === "on";
const chromeOptions = (): { chrome?: ChromeOptions } => (hostChrome ? { chrome: HOST_CHROME } : {});
/** The page's own look follows the toggle, so both states are consistent. */
const applyHostLook = (): void => {
  if (hostChrome) document.documentElement.dataset.hostChrome = "dracula";
  else delete document.documentElement.dataset.hostChrome;
};
applyHostLook();

defineDesignerElement();
defineThemeDesignerElement();
defineSchemaDesignerElement();
defineActionDesignerElement();

const status = document.getElementById("status");
const note = (text: string): void => {
  if (status) status.textContent = text;
};

// --- Host-owned persistence: localStorage stands in for the store ---------
// Each collection is a name-keyed list; saving replaces by name. This is the
// whole "backend" of the demo — a real host persists through its own API
// (see examples/docker) and the designers never know the difference.

function loadCollection<T>(key: string): T[] {
  const saved = localStorage.getItem(key);
  if (saved === null) return [];
  try {
    const parsed = JSON.parse(saved) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function saveIntoCollection<T>(key: string, name: string, entry: T, nameOf: (e: T) => string): void {
  const next = loadCollection<T>(key).filter((candidate) => nameOf(candidate) !== name);
  next.push(entry);
  localStorage.setItem(key, JSON.stringify(next));
}

interface SavedWidget {
  kind: string;
  template: unknown;
  descriptor: unknown;
  load?: unknown;
}

const savedThemes = (): ThemeEntry[] => loadCollection<ThemeEntry>(THEMES_KEY);
const savedSchemas = (): SchemaEntry[] => loadCollection<SchemaEntry>(SCHEMAS_KEY);
const savedActions = (): StoredAction[] => loadCollection<StoredAction>(ACTIONS_KEY);
const savedWidgets = (): SavedWidget[] => loadCollection<SavedWidget>(WIDGETS_KEY);



// --- Widget designer tab ---------------------------------------------------
const widgetHost = document.getElementById("widget-designer") as HTMLElement;
let widgetDesigner: DesignerHandle | undefined;
let widgetDiagnostics: DesignerDiagnostics | undefined;

function mountWidgetDesigner(): void {
  // Everything saved in the other tabs is on offer here: themes for the
  // preview, schemas to reference, actions to bind, per the cooperation
  // story this demo exists to tell.
  widgetDesigner = mountWidget(widgetHost, widgetDesigner, {
    themes: previewThemes(savedThemes()),
    schemas: savedSchemas(),
    actions: savedActions(),
    ...chromeOptions()
  });
  widgetDesigner.subscribe((draft, diagnostics) => {
    widgetDiagnostics = diagnostics;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    note(`draft autosaved ${new Date().toLocaleTimeString()}`);
  });
  const saved = localStorage.getItem(DRAFT_KEY);
  if (saved !== null) {
    try {
      widgetDesigner.loadWidget(JSON.parse(saved));
      note("draft restored from localStorage");
    } catch {
      // Corrupt state: start fresh.
    }
  }
}

// --- Theme designer tab ------------------------------------------------------
const themeHost = document.getElementById("theme-designer") as HTMLElement;
let themeDesigner: ThemeDesignerHandle | undefined;

function mountThemeDesigner(): void {
  // The example widgets and everything saved in the widget tab join the
  // preview-kind selector: a theme is judged against the widgets it will
  // actually dress. The current entry rides across the re-mount, so a trip
  // to another tab never costs unsaved edits.
  const carried = themeDesigner?.getTheme();
  themeDesigner = mountTheme(themeHost, themeDesigner, {
    widgets: [invoiceWidget, xPostWidget, ...savedWidgets()],
    ...(carried === undefined ? {} : { initialTheme: carried }),
    ...chromeOptions()
  });
}

// --- Schema designer tab -----------------------------------------------------
const schemaHost = document.getElementById("schema-designer") as HTMLElement;
let schemaDesigner: SchemaDesignerHandle | undefined;

function mountSchemaDesigner(): void {
  const carried = schemaDesigner?.getSchema();
  schemaDesigner = mountSchema(schemaHost, schemaDesigner, {
    ...(carried === undefined ? {} : { initialSchema: carried }),
    ...chromeOptions()
  });
}

// --- Action designer tab -----------------------------------------------------
// No testCall here: the demo has no server, so the Test control is absent
// by design (a host wires the production execute path — see examples/docker).
const actionHost = document.getElementById("action-designer") as HTMLElement;
let actionDesigner: ActionDesignerHandle | undefined;

function mountActionDesigner(): void {
  const carried = actionDesigner?.getAction();
  actionDesigner = mountAction(actionHost, actionDesigner, {
    schemas: savedSchemas(),
    ...(carried === undefined ? {} : { initialAction: carried }),
    ...chromeOptions()
  });
}

// --- Tabs --------------------------------------------------------------------
const TABS = ["widget", "theme", "schema", "action"] as const;
type Tab = (typeof TABS)[number];
const hosts: Record<Tab, HTMLElement> = {
  widget: widgetHost,
  theme: themeHost,
  schema: schemaHost,
  action: actionHost
};
const remount: Record<Tab, () => void> = {
  widget: mountWidgetDesigner,
  theme: mountThemeDesigner,
  schema: mountSchemaDesigner,
  action: mountActionDesigner
};

function show(name: Tab): void {
  for (const tab of TABS) {
    hosts[tab].hidden = tab !== name;
    document.getElementById(`tab-${tab}`)?.classList.toggle("active", tab === name);
    const controls = document.getElementById(`controls-${tab}`);
    if (controls) controls.hidden = tab !== name;
  }
  // Re-mount the designer being entered, so entries saved in the other tabs
  // appear in its selectors (themes/schemas/actions/preview widgets).
  remount[name]();
}

for (const tab of TABS) {
  document.getElementById(`tab-${tab}`)?.addEventListener("click", () => show(tab));
}

// --- Saves: the same action on every tab -------------------------------------
document.getElementById("save-widget")?.addEventListener("click", () => {
  const draft = widgetDesigner?.getDraft();
  if (draft === undefined) return;
  // Refuse at the door: a draft the theme preview would silently skip must
  // not be announced as saved. `previewable` is the designer's own verdict.
  if (widgetDiagnostics !== undefined && !widgetDiagnostics.previewable) {
    const reason = widgetDiagnostics.kind ?? widgetDiagnostics.template?.message ?? "the draft is not previewable yet";
    note(`not saved: ${reason}`);
    return;
  }
  saveIntoCollection<SavedWidget>(WIDGETS_KEY, draft.kind, draft as unknown as SavedWidget, (w) => w.kind);
  note(`widget '${draft.kind}' saved — it is now a preview kind in the theme designer`);
});

document.getElementById("save-theme")?.addEventListener("click", () => {
  const entry = themeDesigner?.getTheme();
  if (entry === undefined) return;
  saveIntoCollection(THEMES_KEY, entry.name, entry, (t) => t.name);
  note(`theme '${entry.name}' saved — it is now selectable in the widget designer`);
});

document.getElementById("save-schema")?.addEventListener("click", () => {
  const entry = schemaDesigner?.getSchema();
  if (entry === undefined) return;
  saveIntoCollection(SCHEMAS_KEY, entry.name, entry, (s) => s.name);
  note(`schema '${entry.name}' saved — widgets and actions can reference it now`);
});

document.getElementById("save-action")?.addEventListener("click", () => {
  const entry = actionDesigner?.getAction();
  if (entry === undefined) return;
  saveIntoCollection(ACTIONS_KEY, entry.name, entry as StoredAction, (a) => a.name);
  note(`action '${entry.name}' saved — widgets can bind it now`);
});

// --- Seeds (widget tab only; the controls live in its tab bar) ---------------
const SEEDS = [
  ["load-invoice", invoiceWidget, "loaded the invoice example"],
  ["load-xpost", xPostWidget, "loaded the x-post example"],
  ["load-weather", weatherWidget, "loaded the weather example — see its Refresh (http) and Ask (prompt) bindings"]
] as const;
for (const [id, seed, message] of SEEDS) {
  document.getElementById(id)?.addEventListener("click", () => {
    widgetDesigner?.loadWidget(seed);
    note(message);
  });
}

// --- Host chrome toggle and reset ---------------------------------------------
const chromeToggle = document.getElementById("chrome-toggle");
const reflectChrome = (): void => {
  chromeToggle?.classList.toggle("active", hostChrome);
  applyHostLook();
};
chromeToggle?.addEventListener("click", () => {
  hostChrome = !hostChrome;
  localStorage.setItem(CHROME_KEY, hostChrome ? "on" : "off");
  reflectChrome();
  for (const tab of TABS) remount[tab]();
  note(
    hostChrome
      ? `host override — Dracula (MIT) across all ${Object.keys(HOST_CHROME).length} chrome tokens, monospace, one size step up. Seven pairs measure below WCAG AA (its Comment and selection tones): pass your own palette, own its contrast.`
      : "no chrome passed — designers and page both wear the widgentic palette"
  );
});
reflectChrome();

document.getElementById("reset")?.addEventListener("click", () => {
  for (const key of ALL_KEYS) localStorage.removeItem(key);
  location.reload();
});

show("widget"); // show() mounts the entered tab; the others mount on first entry
