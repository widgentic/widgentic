/**
 * Demo host for the widgentic designers: widget, theme and action
 * destinations, host-side persistence in localStorage, and the wiring that
 * makes them cooperate — themes saved in the theme designer become the
 * widget designer's preview options.
 *
 * The widgentic.dev app is the real host; this page shows the library
 * alone: it performs no network I/O and no persistence, hosts own both.
 */
import {
  CHROME_DEFAULTS,
  chromeCss,
  createActionDesigner,
  createDesigner,
  createThemeDesigner,
  defineActionDesignerElement,
  defineDesignerElement,
  defineThemeDesignerElement
} from "@widgentic/designer";
import type {
  ActionDesignerHandle,
  ChromeOptions,
  DesignerHandle,
  ThemeDesignerHandle
} from "@widgentic/designer";
import { createThemeRegistry } from "@widgentic/core";
import type { ThemeEntry } from "@widgentic/core";
import { invoiceWidget, weatherWidget, xPostWidget } from "@widgentic-examples/mcp-server/widgets";

const DRAFT_KEY = "widgentic-designer-draft";
const THEMES_KEY = "widgentic-designer-themes";
const CHROME_KEY = "widgentic-designer-chrome";

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
  // Surfaces and lines
  bg: "var(--host-bg)",
  panel: "var(--host-panel)",
  hover: "var(--host-hover)",
  border: "var(--host-border)",
  line: "var(--host-line)",
  // Text
  text: "var(--host-text)",
  muted: "var(--host-muted)",
  // Accent and danger
  accent: "var(--host-accent)",
  "accent-bg": "var(--host-accent-bg)",
  "accent-line": "var(--host-accent-line)",
  danger: "var(--host-danger)",
  "danger-bg": "var(--host-danger-bg)",
  "danger-line": "var(--host-danger-line)",
  // JSON highlighting
  "hl-key": "var(--host-hl-key)",
  "hl-str": "var(--host-hl-str)",
  "hl-num": "var(--host-hl-num)",
  "hl-bool": "var(--host-hl-bool)",
  "hl-punct": "var(--host-hl-punct)",
  // Typography: the one thing a library cannot default to, so a host with
  // its own faces passes them with a fallback stack.
  font: 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace',
  "font-mono": 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace',
  "font-size": "14px",
  "font-size-sm": "13px",
  "font-size-xs": "12px",
  // Shape and elevation
  "radius-sm": "3px",
  radius: "var(--host-radius)",
  "radius-lg": "8px",
  gap: "24px",
  shadow: "var(--host-shadow)"
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
defineActionDesignerElement();

const status = document.getElementById("status");
const note = (text: string): void => {
  if (status) status.textContent = text;
};

/** Host-owned theme storage, seeded from the shipped registry. */
function loadThemes(): ThemeEntry[] {
  const builtIns = createThemeRegistry().list();
  const saved = localStorage.getItem(THEMES_KEY);
  if (saved === null) return builtIns;
  try {
    const custom = JSON.parse(saved) as ThemeEntry[];
    const names = new Set(builtIns.map((entry) => entry.name));
    return [...builtIns, ...custom.filter((entry) => !names.has(entry.name))];
  } catch {
    return builtIns;
  }
}

function saveTheme(entry: ThemeEntry): void {
  const saved = localStorage.getItem(THEMES_KEY);
  let custom: ThemeEntry[] = [];
  try {
    custom = saved === null ? [] : (JSON.parse(saved) as ThemeEntry[]);
  } catch {
    custom = [];
  }
  const next = custom.filter((candidate) => candidate.name !== entry.name);
  next.push(entry);
  localStorage.setItem(THEMES_KEY, JSON.stringify(next));
}

// --- Widget designer tab -------------------------------------------------
const widgetHost = document.getElementById("widget-designer") as HTMLElement;
let widgetDesigner: DesignerHandle | undefined;

function mountWidgetDesigner(): void {
  widgetDesigner?.dispose();
  widgetHost.replaceChildren();
  widgetDesigner = createDesigner(widgetHost, { themes: loadThemes(), ...chromeOptions() });
  widgetDesigner.subscribe((draft) => {
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

// --- Theme designer tab --------------------------------------------------
const themeHost = document.getElementById("theme-designer") as HTMLElement;
let themeDesigner: ThemeDesignerHandle | undefined;

function mountThemeDesigner(): void {
  themeDesigner?.dispose();
  themeHost.replaceChildren();
  // The example widgets join the preview-kind selector, so a theme can be
  // judged against custom widgets and not only the built-ins.
  themeDesigner = createThemeDesigner(themeHost, {
    widgets: [invoiceWidget, xPostWidget],
    ...chromeOptions()
  });
}

// --- Action designer tab -------------------------------------------------
// No testCall here: the demo has no server, so the Test control is absent
// by design (the widgentic.dev app supplies the production execute path).
const actionHost = document.getElementById("action-designer") as HTMLElement;
let actionDesigner: ActionDesignerHandle | undefined;

function mountActionDesigner(): void {
  actionDesigner?.dispose();
  actionHost.replaceChildren();
  actionDesigner = createActionDesigner(actionHost, chromeOptions());
}

// --- Tabs ----------------------------------------------------------------
const tabs: Record<string, HTMLElement> = {
  widget: widgetHost,
  theme: themeHost,
  action: actionHost
};

function show(name: string): void {
  for (const [key, element] of Object.entries(tabs)) {
    element.hidden = key !== name;
    document
      .getElementById(`tab-${key}`)
      ?.classList.toggle("active", key === name);
  }
  // Re-mount the widget designer when returning to it, so themes saved in
  // the theme tab appear in its selector.
  if (name === "widget") mountWidgetDesigner();
}

document.getElementById("tab-widget")?.addEventListener("click", () => show("widget"));
document.getElementById("tab-theme")?.addEventListener("click", () => show("theme"));
document.getElementById("tab-action")?.addEventListener("click", () => show("action"));

document.getElementById("save-theme")?.addEventListener("click", () => {
  const entry = themeDesigner?.getTheme();
  if (entry === undefined) return;
  saveTheme(entry);
  note(`theme '${entry.name}' saved — it is now selectable in the widget designer`);
});

document.getElementById("load-invoice")?.addEventListener("click", () => {
  widgetDesigner?.loadWidget(invoiceWidget);
  note("loaded the invoice example");
});

document.getElementById("load-xpost")?.addEventListener("click", () => {
  widgetDesigner?.loadWidget(xPostWidget);
  note("loaded the x-post example");
});

document.getElementById("load-weather")?.addEventListener("click", () => {
  widgetDesigner?.loadWidget(weatherWidget);
  note("loaded the weather example — see its Refresh (http) and Ask (prompt) bindings");
});

const chromeToggle = document.getElementById("chrome-toggle");
const reflectChrome = (): void => {
  chromeToggle?.classList.toggle("active", hostChrome);
  applyHostLook();
};
chromeToggle?.addEventListener("click", () => {
  hostChrome = !hostChrome;
  localStorage.setItem(CHROME_KEY, hostChrome ? "on" : "off");
  reflectChrome();
  mountThemeDesigner();
  mountActionDesigner();
  mountWidgetDesigner();
  note(
    hostChrome
      ? `host override — Dracula (MIT) across all ${Object.keys(HOST_CHROME).length} chrome tokens, monospace, one size step up. Seven pairs measure below WCAG AA (its Comment and selection tones): pass your own palette, own its contrast.`
      : "no chrome passed — designers and page both wear the widgentic palette"
  );
});
reflectChrome();

document.getElementById("reset")?.addEventListener("click", () => {
  localStorage.removeItem(DRAFT_KEY);
  localStorage.removeItem(THEMES_KEY);
  location.reload();
});

mountThemeDesigner();
mountActionDesigner();
show("widget");
