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

/** Internal kind the draft renders under (stable across recompiles). */
export const PREVIEW_KIND = "designer-preview";

export interface PreviewController {
  readonly pane: HTMLElement;
  /**
   * Re-render for a draft revision. The WIDGET designer always renders
   * the draft (no `previewKind`); the optional kind parameter exists for
   * the THEME designer, whose job is previewing built-ins under a theme.
   */
  update(
    draft: WidgetDraft,
    diagnostics: DesignerDiagnostics,
    previewKind?: string
  ): void;
  dispose(): void;
}

export function createPreview(): PreviewController {
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
      banner.textContent = `Preview frozen on the last valid draft — ${issue}`;
      return; // keep the last good render mounted
    }
    banner.hidden = true;
    banner.textContent = "";

    if (renderingDraft) {
      const validated = validateTemplate(draft.template);
      if (!validated.ok) return; // defensive: previewable implies ok
      renderer = compileTemplate(validated.template);
    }
    kindStyles.textContent =
      renderingDraft && draft.descriptor.styles
        ? widgetStylesToCss(draft.descriptor.styles)
        : "";
    // Unsafe values are also skipped inside applyTheme (lenient layer).
    applyTheme(mountRoot, draft.theme ?? {});

    const payload = {
      kind: renderingDraft ? PREVIEW_KIND : (previewKind as string),
      data: renderingDraft
        ? draft.sampleData ?? draft.descriptor.dataExample ?? null
        : sampleFor(previewKind as string)
    };
    if (mount === undefined) {
      mount = mountWidget(payload, mountRoot, { catalog });
    } else {
      mount.update(payload);
    }
  }

  /** Built-in preview data for the THEME designer's kind previews. */
  function sampleFor(kind: string): unknown {
    return catalog.describe(kind)?.dataExample ?? { value: "preview" };
  }

  return {
    pane,
    update,
    dispose() {
      mount?.dispose();
      mount = undefined;
      pane.replaceChildren();
    }
  };
}
