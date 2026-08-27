/**
 * The designer shell: layout, store wiring, and the embedding handle.
 * Panels and the preview are plain modules receiving the store — every
 * designer instance is fully closure-scoped so multiple instances coexist
 * in one document.
 */
import { validateTheme } from "@widgentic/core";
import type { ThemeEntry, WidgetTheme } from "@widgentic/core";
import { h, injectDesignerStyles } from "./dom.js";
import { applyDefinition, checkDefinition } from "./io.js";
import type { WidgetDefinition } from "./io.js";
import { mountPanels } from "./panels.js";
import type { SchemaEntry } from "./schema-designer.js";
import type { StoredAction } from "@widgentic/core";
import { createPreview } from "./preview.js";
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
   * Shared data schemas the draft may reference by name (the Data schema
   * section's "use shared" mode). Schema authoring belongs to the
   * standalone schema designer; the widget designer only selects.
   */
  schemas?: SchemaEntry[];
  /**
   * Shared actions the draft may bind by name (element `action` bindings
   * and the widget-level `load`). Action authoring belongs to the
   * standalone action designer; the widget designer only binds.
   */
  actions?: StoredAction[];
  /** Secret names offered when an inline http action needs a header or query secret. */
  secretNames?: string[];
  /**
   * Designer chrome appearance. "auto" (default) follows the host's
   * `prefers-color-scheme`; the explicit values pin it. This is the
   * designer's own UI — the widget preview uses the draft's theme.
   */
  appearance?: "auto" | "light" | "dark";
  /**
   * Mount with editing disabled: panels stay visible but inert, only the
   * preview and its theme selector operate. Toggle later via
   * `setReadOnly`.
   */
  readOnly?: boolean;
}

export type LoadResult = { ok: true } | { ok: false; errors: string[] };

export interface DesignerHandle {
  getDraft(): WidgetDraft;
  loadWidget(definition: unknown): LoadResult;
  loadTheme(theme: unknown): LoadResult;
  /** Disable/enable editing; the preview and theme selector stay live. */
  setReadOnly(readOnly: boolean): void;
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

  const preview = createPreview({ actions: options.actions ?? [] });
  const leftColumn = h("div", { class: "wgd-panels" });
  const rightSections = h("div", { class: "wgd-preview-pane" });
  const rightColumn = h("div", { class: "wgd-side" }, [preview.pane, rightSections]);
  const root = h("div", { class: "wgd-root" }, [leftColumn, rightColumn]);
  if (options.appearance === "light" || options.appearance === "dark") {
    root.setAttribute("data-wgd-theme", options.appearance);
  }
  container.appendChild(root);

  const actionContext = {
    actions: options.actions ?? [],
    secretNames: options.secretNames ?? [],
    schemas: options.schemas ?? []
  };
  const panels = mountPanels(
    store,
    { left: leftColumn, right: rightSections },
    options.themes ?? [],
    options.schemas ?? [],
    actionContext
  );

  function refresh(draft: WidgetDraft): void {
    const diagnostics = deriveDiagnostics(draft, {
      schemas: options.schemas ?? [],
      actions: options.actions ?? []
    });
    preview.update(draft, diagnostics);
    for (const listener of [...listeners]) listener(draft, diagnostics);
  }

  const unsubscribe = store.subscribe(refresh);
  refresh(store.get());

  /**
   * Read-only: every editing surface goes inert (visible, inoperable —
   * section summaries stay clickable so content can still be inspected),
   * while the preview and the theme panel's selector keep working. inert
   * is applied to section BODIES, which are stable elements: panel
   * re-renders replace children inside them, never the bodies themselves.
   */
  function setReadOnly(readOnly: boolean): void {
    root.classList.toggle("wgd-readonly", readOnly);
    // Complex selectors inside :not() are not universally supported, so
    // the view-only exclusion is filtered here rather than in the query.
    const bodies = [
      ...root.querySelectorAll(
        ".wgd-panels .wgd-section-body, .wgd-edit-only > .wgd-section-body"
      )
    ].filter((body) => !body.parentElement?.classList.contains("wgd-view-only"));
    for (const body of bodies) {
      if (readOnly) body.setAttribute("inert", "");
      else body.removeAttribute("inert");
    }
  }
  if (options.readOnly === true) setReadOnly(true);

  return {
    getDraft: () => cloneDraft(store.get()),
    setReadOnly,
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
