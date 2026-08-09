/**
 * Demo host for the widgentic designer: registers the custom element,
 * demonstrates host-side persistence (localStorage autosave/restore), and
 * offers the invoice example as a starting point. This page is what the
 * future widgentic.dev host app replaces.
 */
import { defineDesignerElement } from "widgentic/designer";
import type { DesignerHandle } from "widgentic/designer";
import { invoiceWidget } from "../mcp-server/widgets/invoice.js";

const STORAGE_KEY = "widgentic-designer-draft";

defineDesignerElement();

const element = document.createElement("widgentic-designer") as HTMLElement & {
  designer?: DesignerHandle;
};
document.getElementById("designer-host")?.appendChild(element);

const status = document.getElementById("status");

element.addEventListener("widgentic-change", (event) => {
  const { draft } = (event as CustomEvent<{ draft: unknown }>).detail;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  if (status) status.textContent = `autosaved ${new Date().toLocaleTimeString()}`;
});

const saved = localStorage.getItem(STORAGE_KEY);
if (saved !== null) {
  try {
    const draft = JSON.parse(saved) as {
      kind: string;
      template: unknown;
      descriptor: unknown;
      theme?: unknown;
    };
    const result = element.designer?.loadWidget(draft);
    if (result?.ok && draft.theme !== undefined) {
      element.designer?.loadTheme(draft.theme);
    }
    if (status) status.textContent = "restored from localStorage";
  } catch {
    // Corrupt saved state: start fresh.
  }
}

document.getElementById("load-invoice")?.addEventListener("click", () => {
  element.designer?.loadWidget(invoiceWidget);
  if (status) status.textContent = "loaded the invoice example";
});

document.getElementById("reset")?.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});
