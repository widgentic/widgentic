/**
 * Live preview through the real pipeline: the draft template compiles into
 * a delegating renderer registered ONCE under a stable internal kind, so a
 * single `mountWidget` handle survives every template revision and updates
 * patch the DOM in place (`reactive-rendering` dogfooded). Built-in kinds
 * share the same scratch catalog for theme-designer previews.
 *
 * Invalid drafts freeze the last good render behind an error banner —
 * never a blank pane (the app-template error-state lesson).
 */
import { createCatalog, widgetStylesToCss } from "widgentic/catalog";
import type { WidgetRenderer } from "widgentic/catalog";
import type { WidgetPayload } from "widgentic/contract";
import { mountWidget } from "widgentic/reactive";
import type { WidgetMount } from "widgentic/reactive";
import { compileTemplate, validateTemplate } from "widgentic/templates";
import { applyTheme, injectBaseStyles } from "widgentic/theming";
import { h } from "./dom.js";
import type { WidgetDraft } from "./store.js";
import type { DesignerDiagnostics } from "./validate.js";
import type { StoredAction } from "widgentic/actions";

/** Internal kind the draft renders under (stable across recompiles). */
export const PREVIEW_KIND = "designer-preview";

/**
 * A host-supplied definition the preview can render by kind. `descriptor`
 * stays `unknown` on purpose: hosts hand these straight off the wire, so
 * the preview narrows what it needs and ignores the rest.
 */
export interface PreviewWidget {
  kind: string;
  template: unknown;
  descriptor?: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface PreviewOptions {
  /**
   * Custom widget definitions to make previewable by kind — a theme is
   * judged against the widgets it will actually dress, not only the
   * built-ins. Definitions that fail template validation are skipped.
   */
  widgets?: PreviewWidget[];
  /** Shared actions, so `{ ref }` bindings preview with their real kind. */
  actions?: StoredAction[];
}

export interface PreviewController {
  readonly pane: HTMLElement;
  /** Selectable kinds: built-ins plus the registered customs. */
  readonly kinds: string[];
  /**
   * Re-render for a draft revision. The WIDGET designer always renders
   * the draft (no `previewKind`); the optional kind parameter exists for
   * the THEME designer, whose job is previewing catalog kinds under a
   * theme.
   */
  update(
    draft: WidgetDraft,
    diagnostics: DesignerDiagnostics,
    previewKind?: string
  ): void;
  dispose(): void;
}

export function createPreview(options: PreviewOptions = {}): PreviewController {
  injectBaseStyles(document);

  const banner = h("div", { class: "wgd-banner" });
  banner.hidden = true;
  const kindStyles = h("style") as HTMLStyleElement;
  const mountRoot = h("div", { class: "wgd-preview" });
  const pane = h("div", { class: "wgd-preview-pane" }, [banner, kindStyles, mountRoot]);

  const catalog = createCatalog();
  let renderer: WidgetRenderer = () => ({ tag: "div", children: ["…"] });
  catalog.register(
    PREVIEW_KIND,
    (payload: WidgetPayload) => renderer(payload),
    {
      description: "Designer preview delegate.",
      dataShape: "Defined by the draft being designed."
    }
  );

  // Host-supplied customs join the scratch catalog so the theme designer
  // can preview them. Each carries its own styles, emitted when selected.
  const customStyles = new Map<string, string>();
  for (const widget of options.widgets ?? []) {
    const validated = validateTemplate(widget.template);
    // Untrusted-ish input: a bad definition is skipped, never fatal.
    if (!validated.ok || typeof widget.kind !== "string" || widget.kind === "") continue;
    const compiled = compileTemplate(validated.template);
    const descriptor = isPlainObject(widget.descriptor) ? widget.descriptor : {};
    try {
      catalog.register(widget.kind, (payload: WidgetPayload) => compiled(payload), {
        description: `Custom widget '${widget.kind}' supplied for preview.`,
        dataShape: "Defined by the supplied definition.",
        ...(descriptor.dataExample !== undefined
          ? { dataExample: descriptor.dataExample }
          : {})
      });
    } catch {
      continue; // a reserved/duplicate kind never breaks the designer
    }
    if (isPlainObject(descriptor.styles)) {
      customStyles.set(
        widget.kind,
        widgetStylesToCss(descriptor.styles as Record<string, Record<string, string>>)
      );
    }
  }
  const kinds = catalog.kinds().filter((kind) => kind !== PREVIEW_KIND);

  let mount: WidgetMount | undefined;

  function update(
    draft: WidgetDraft,
    diagnostics: DesignerDiagnostics,
    previewKind?: string
  ): void {
    const renderingDraft = previewKind === undefined || previewKind === PREVIEW_KIND;
    if (renderingDraft && !diagnostics.previewable) {
      const issue =
        diagnostics.kind ??
        (diagnostics.template
          ? `${diagnostics.template.code}: ${diagnostics.template.message}` +
            (diagnostics.template.path ? ` (at ${diagnostics.template.path})` : "")
          : "Draft is not previewable.");
      banner.hidden = false;
      // Freezing needs something to freeze ON. On the first update there
      // is no mount yet — reachable whenever a host supplies an invalid
      // or reserved-kind `initialWidget` — and returning here left the
      // pane blank, the one state the contract forbids.
      if (mount === undefined) {
        banner.textContent = `Nothing to preview yet — ${issue}`;
        mountRoot.replaceChildren(
          h("div", { class: "wgd-preview-empty" }, [
            "No preview: the draft has never been valid."
          ])
        );
        return;
      }
      banner.textContent = `Preview frozen on the last valid draft — ${issue}`;
      return; // keep the last good render mounted
    }
    // A first valid render replaces the empty state.
    mountRoot.querySelector(".wgd-preview-empty")?.remove();
    banner.hidden = true;
    banner.textContent = "";

    if (renderingDraft) {
      const validated = validateTemplate(draft.template);
      if (!validated.ok) return; // defensive: previewable implies ok
      const shared = options.actions ?? [];
      renderer = compileTemplate(validated.template, {
        actions: (ref) => shared.find((action) => action.name === ref)?.definition
      });
    }
    // Styles follow whatever is on screen: the draft's own, or the
    // selected custom kind's (a built-in needs none).
    kindStyles.textContent = renderingDraft
      ? draft.descriptor.styles
        ? widgetStylesToCss(draft.descriptor.styles)
        : ""
      : customStyles.get(previewKind as string) ?? "";
    // Unsafe values are also skipped inside applyTheme (lenient layer).
    applyTheme(mountRoot, draft.theme ?? {});

    const payload = {
      kind: renderingDraft ? PREVIEW_KIND : (previewKind as string),
      data: renderingDraft
        ? draft.sampleData ?? draft.descriptor.dataExample ?? null
        : sampleFor(previewKind as string)
    };
    if (mount === undefined) {
      // No onAction: the preview never executes anything; bound elements
      // only wear the inert badge below.
      mount = mountWidget(payload, mountRoot, { catalog });
    } else {
      mount.update(payload);
    }
    for (const bound of mountRoot.querySelectorAll("[data-wg-action]")) {
      bound.classList.add("wg-designer-action");
    }
  }

  /** Built-in preview data for the THEME designer's kind previews. */
  function sampleFor(kind: string): unknown {
    return catalog.describe(kind)?.dataExample ?? { value: "preview" };
  }

  return {
    pane,
    kinds,
    update,
    dispose() {
      mount?.dispose();
      mount = undefined;
      pane.replaceChildren();
    }
  };
}
