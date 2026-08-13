/**
 * The designer shell: layout, store wiring, and the embedding handle.
 * Panels and the preview are plain modules receiving the store — every
 * designer instance is fully closure-scoped so multiple instances coexist
 * in one document.
 */
import { validateTheme } from "widgentic/theming";
import type { ThemeEntry, WidgetTheme } from "widgentic/theming";
import { h, injectDesignerStyles } from "./dom.js";
import { applyDefinition, checkDefinition } from "./io.js";
import type { WidgetDefinition } from "./io.js";
import { mountPanels } from "./panels.js";
import { createPreview, PREVIEW_KIND } from "./preview.js";
import type { WidgetDraft } from "./store.js";
import { cloneDraft, createDraftStore, starterDraft } from "./store.js";
import { deriveDiagnostics } from "./validate.js";
import type { DesignerDiagnostics } from "./validate.js";

export type { WidgetDefinition } from "./io.js";

export interface DesignerOptions {
  initialWidget?: WidgetDefinition;
  initialTheme?: WidgetTheme;
  /**
   * Named themes offered as preview options. Theme authoring belongs to
   * the standalone theme designer; the widget designer only selects.
   */
  themes?: ThemeEntry[];
  /**
   * Designer chrome appearance. "auto" (default) follows the host's
   * `prefers-color-scheme`; the explicit values pin it. This is the
   * designer's own UI — the widget preview uses the draft's theme.
   */
  appearance?: "auto" | "light" | "dark";
}

export type LoadResult = { ok: true } | { ok: false; errors: string[] };

export interface DesignerHandle {
  getDraft(): WidgetDraft;
  loadWidget(definition: unknown): LoadResult;
  loadTheme(theme: unknown): LoadResult;
  subscribe(
    listener: (draft: WidgetDraft, diagnostics: DesignerDiagnostics) => void
  ): () => void;
  dispose(): void;
}

export function createDesigner(
  container: Element,
  options: DesignerOptions = {}
): DesignerHandle {
  injectDesignerStyles(document);

  const base: WidgetDraft = options.initialWidget
    ? cloneDraft({ ...options.initialWidget })
    : starterDraft();
  const initial: WidgetDraft =
    options.initialTheme !== undefined ? { ...base, theme: options.initialTheme } : base;
  const store = createDraftStore(initial);

  const listeners = new Set<
    (draft: WidgetDraft, diagnostics: DesignerDiagnostics) => void
  >();

  // UI state that is not part of the draft: what the preview pane shows.
  let previewKind: string = PREVIEW_KIND;

  const preview = createPreview();
  const leftColumn = h("div", { class: "wgd-panels" });
  const rightSections = h("div", { class: "wgd-preview-pane" });
  const rightColumn = h("div", { class: "wgd-side" }, [preview.pane, rightSections]);
  const root = h("div", { class: "wgd-root" }, [leftColumn, rightColumn]);
  if (options.appearance === "light" || options.appearance === "dark") {
    root.setAttribute("data-wgd-theme", options.appearance);
  }
  container.appendChild(root);

  const panels = mountPanels(
    store,
    { left: leftColumn, right: rightSections },
    {
      setPreviewKind(kind: string) {
        previewKind = kind;
        refresh(store.get());
      },
      getPreviewKind: () => previewKind
    },
    options.themes ?? []
  );

  function refresh(draft: WidgetDraft): void {
    const diagnostics = deriveDiagnostics(draft);
    preview.update(draft, diagnostics, previewKind);
    for (const listener of [...listeners]) listener(draft, diagnostics);
  }

  const unsubscribe = store.subscribe(refresh);
  refresh(store.get());

  return {
    getDraft: () => cloneDraft(store.get()),
    loadWidget(definition) {
      const errors = checkDefinition(definition);
      if (errors.length > 0) return { ok: false, errors };
      applyDefinition(store, definition as unknown as WidgetDefinition);
      return { ok: true };
    },
    loadTheme(theme) {
      const validated = validateTheme(theme);
      if (!validated.ok) {
        return { ok: false, errors: [validated.error.message] };
      }
      store.update((draft) => ({ ...draft, theme: validated.theme }));
      return { ok: true };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      unsubscribe();
      panels.dispose();
      preview.dispose();
      listeners.clear();
      root.remove();
    }
  };
}
