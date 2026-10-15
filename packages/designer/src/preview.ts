/**
 * Live preview through the real pipeline: the draft template compiles into
 * a delegating renderer registered ONCE under a stable internal kind, so a
 * single `mountWidget` handle survives every template revision and updates
 * patch the DOM in place (`reactive-rendering` dogfooded). Built-in kinds
 * share the same scratch catalog for theme-designer previews.
 *
 * Invalid drafts freeze the last good render behind an error banner —
 * never a blank pane (the app-template error-state lesson).
 *
 * Two modes. In the page, the preview mounts into the host's DOM and scopes
 * every style it emits to itself. With `previewFrame`, it is an island: the
 * same tree and CSS go to the app template framed at that URL (see
 * preview-island.ts), whose own document needs no scoping.
 */
import { isPlainObject } from "@widgentic/core";
import { createCatalog } from "@widgentic/core";
import type { WidgetRenderer } from "@widgentic/core";
import type { WidgetPayload } from "@widgentic/core";
import { mountWidget } from "@widgentic/core";
import type { WidgetMount } from "@widgentic/core";
import { compileTemplate, validateTemplate } from "@widgentic/core";
import { applyTheme, injectBaseStyles, themeStylesToCss, themeToCss, widgetStylesToCss } from "@widgentic/core";
import type { WidgetStyles } from "@widgentic/core";
import { h, injectPagePreviewStyles } from "./dom.js";
import { createPreviewIsland } from "./preview-island.js";
import type { PreviewIsland, PreviewScheme } from "./preview-island.js";
import type { WidgetDraft } from "./store.js";
import type { DesignerDiagnostics } from "./validate.js";
import type { StoredAction } from "@widgentic/core";

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

export interface PreviewOptions {
  /**
   * Custom widget definitions to make previewable by kind — a theme is
   * judged against the widgets it will actually dress, not only the
   * built-ins. Definitions that fail template validation are skipped.
   */
  widgets?: PreviewWidget[];
  /** Shared actions, so `{ ref }` bindings preview with their real kind. */
  actions?: StoredAction[];
  /**
   * The URL of a preview frame (an authoring surface's `/preview-frame`):
   * the preview then runs there as an island instead of in the page.
   */
  previewFrame?: string;
}

/**
 * Marks action-bound elements in the island, as the page preview's badge
 * does; the frame's own tokens dress it.
 */
const ISLAND_BADGE_CSS =
  "[data-wg-action] { position: relative; outline: 1px dashed var(--wg-muted); outline-offset: 2px; }\n" +
  '[data-wg-action]::after { content: "\u26A1 action"; position: absolute; top: -0.9em; right: 0; ' +
  "font: 10px var(--wg-font-family); color: var(--wg-muted); background: var(--wg-bg); padding: 0 4px; " +
  "border-radius: var(--wg-radius-sm); pointer-events: none; }";

/** Token declarations for both modes: a previewed theme is chosen for both, like a named theme. */
const BOTH_MODES = ':root, :root[data-theme="dark"]';

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

/**
 * Distinguishes previews on one page, so a theme's styles stay in theirs.
 * The random part keeps two copies of this module (two bundles on one page)
 * from handing out the same id.
 */
let previewCount = 0;
const previewSalt = Math.random().toString(36).slice(2, 8);

export function createPreview(options: PreviewOptions = {}): PreviewController {
  const banner = h("div", { class: "wgd-banner" });
  banner.hidden = true;
  // Theme styles first: the previewed kind's own rule wins a tie, as it
  // does in a render.
  const themeStyles = h("style");
  const kindStyles = h("style");
  const scope = `wgd-preview-${previewSalt}-${++previewCount}`;
  const mountRoot = h("div", { class: "wgd-preview", "data-wgd-scope": scope });
  // Every style the preview emits — the widget's and the theme's — is
  // scoped to this preview at no added weight: the preview shares the host
  // page's DOM, and a widget's `.wg-title` must not restyle the page.
  const scoped = (styles: Record<string, Record<string, string>>) =>
    themeStylesToCss(styles, `[data-wgd-scope="${scope}"]`);
  const islandUrl = options.previewFrame !== undefined && options.previewFrame !== "" ? options.previewFrame : undefined;
  // Only an in-page preview needs the widget stylesheet and its own rules
  // in the page; the island's document carries its own.
  if (islandUrl === undefined) {
    injectBaseStyles(document);
    injectPagePreviewStyles(document);
  }
  // The island's empty state lives in the designer's document, like the banner.
  const emptyState = h("div", { class: "wgd-preview-empty" }, ["No preview: the draft has never been valid."]);
  emptyState.hidden = true;
  const pane = h(
    "div",
    { class: "wgd-preview-pane" },
    islandUrl === undefined ? [banner, themeStyles, kindStyles, mountRoot] : [banner, emptyState]
  );
  /** The designer's scheme: its pinned appearance, else the page's, else the system's. */
  const scheme = (): PreviewScheme => {
    const pinned = pane.closest("[data-wgd-theme]")?.getAttribute("data-wgd-theme");
    if (pinned === "light" || pinned === "dark") return pinned;
    const page = document.documentElement.getAttribute("data-theme");
    if (page === "light" || page === "dark") return page;
    return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  };
  const island: PreviewIsland | undefined = islandUrl === undefined ? undefined : createPreviewIsland(islandUrl, scheme);
  if (island !== undefined) pane.append(island.frame);

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
  const customStyles = new Map<string, WidgetStyles>();
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
      customStyles.set(widget.kind, descriptor.styles as WidgetStyles);
    }
  }
  const kinds = catalog.kinds().filter((kind) => kind !== PREVIEW_KIND);

  let mount: WidgetMount | undefined;
  /** Whether the island has been sent a render, so an invalid draft freezes on it. */
  let shown = false;

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
      if (island !== undefined) {
        // The frame keeps its last good render; nothing is sent.
        banner.textContent = shown
          ? `Preview frozen on the last valid draft — ${issue}`
          : `Nothing to preview yet — ${issue}`;
        emptyState.hidden = shown;
        return;
      }
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
    emptyState.hidden = true;
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
    const ownStyles = renderingDraft ? draft.descriptor.styles : customStyles.get(previewKind as string);
    const payload = {
      kind: renderingDraft ? PREVIEW_KIND : (previewKind as string),
      data: renderingDraft
        ? draft.sampleData ?? draft.descriptor.dataExample ?? null
        : sampleFor(previewKind as string)
    };
    if (island !== undefined) {
      const rendered = catalog.render(payload);
      if (!rendered.ok) return; // as in the page: the last good render stays
      // The order a render's css uses: theme styles, kind styles, tokens.
      const css = [
        draft.themeStyles ? themeStylesToCss(draft.themeStyles) : "",
        ownStyles ? widgetStylesToCss(ownStyles) : "",
        draft.theme && Object.keys(draft.theme).length > 0 ? themeToCss(draft.theme, BOTH_MODES) : "",
        ISLAND_BADGE_CSS
      ].filter((part) => part !== "").join("\n");
      island.show({ tree: rendered.node, css, payload });
      shown = true;
      return;
    }
    kindStyles.textContent = ownStyles ? scoped(ownStyles) : "";
    // Unsafe values are also skipped inside applyTheme (lenient layer).
    applyTheme(mountRoot, draft.theme ?? {});
    // The guards drop unsafe entries.
    themeStyles.textContent = draft.themeStyles ? scoped(draft.themeStyles) : "";

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
      island?.dispose();
      pane.replaceChildren();
    }
  };
}
