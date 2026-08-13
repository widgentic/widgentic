/**
 * Demo host for the widgentic designers: two destinations (widget and
 * theme), host-side persistence in localStorage, and the wiring that makes
 * them cooperate — themes saved in the theme designer become the widget
 * designer's preview options.
 *
 * This page is what the future widgentic.dev app replaces: the library
 * performs no network I/O and no persistence; hosts own both.
 */
import {
  createDesigner,
  createThemeDesigner,
  defineDesignerElement,
  defineThemeDesignerElement
} from "widgentic/designer";
import type { DesignerHandle, ThemeDesignerHandle } from "widgentic/designer";
import { createThemeRegistry } from "widgentic/theming";
import type { ThemeEntry } from "widgentic/theming";
import { invoiceWidget } from "../../apps/mcp-server/widgets/invoice.js";
import { xPostWidget } from "../../apps/mcp-server/widgets/x-post.js";

const DRAFT_KEY = "widgentic-designer-draft";
const THEMES_KEY = "widgentic-designer-themes";

defineDesignerElement();
defineThemeDesignerElement();

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
  widgetDesigner = createDesigner(widgetHost, { themes: loadThemes() });
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
  themeDesigner = createThemeDesigner(themeHost);
}

// --- Tabs ----------------------------------------------------------------
const tabs: Record<string, HTMLElement> = {
  widget: widgetHost,
  theme: themeHost
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

document.getElementById("reset")?.addEventListener("click", () => {
  localStorage.removeItem(DRAFT_KEY);
  localStorage.removeItem(THEMES_KEY);
  location.reload();
});

mountThemeDesigner();
show("widget");
