/**
 * Preview controls in the widget designer: which kind renders, and which
 * of the host-supplied named themes it renders under.
 *
 * Theme *authoring* lives in the standalone theme designer — this panel
 * only selects. That keeps the widget draft free of theme tokens (the
 * export was always theme-free) and lets an app route the two activities
 * to separate destinations.
 */
import { createCatalog } from "widgentic/catalog";
import type { ThemeEntry } from "widgentic/theming";
import { h, section } from "./dom.js";
import { PREVIEW_KIND } from "./preview.js";
import type { DraftStore, WidgetDraft } from "./store.js";
import type { PanelsContext } from "./panels.js";

const BASE_KINDS = createCatalog().kinds();

export function mountThemePanel(
  store: DraftStore,
  refreshers: ((draft: WidgetDraft) => void)[],
  context: PanelsContext,
  themes: ThemeEntry[] = []
): { element: HTMLElement; dispose(): void } {
  // Preview-kind selector: the draft, or any built-in.
  const kindSelect = h("select", {
    class: "wgd-select wgd-preview-kind"
  }) as HTMLSelectElement;
  kindSelect.append(h("option", { value: PREVIEW_KIND }, ["(this draft)"]));
  for (const kind of BASE_KINDS) {
    kindSelect.append(h("option", { value: kind }, [kind]));
  }
  kindSelect.value = context.getPreviewKind();
  kindSelect.addEventListener("change", () => context.setPreviewKind(kindSelect.value));

  // Theme selector: "none" plus whatever the host supplied.
  const themeSelect = h("select", {
    class: "wgd-select wgd-theme-select"
  }) as HTMLSelectElement;
  themeSelect.append(h("option", { value: "" }, ["(none — defaults)"]));
  for (const entry of themes) {
    themeSelect.append(
      h("option", { value: entry.name }, [entry.label ?? entry.name])
    );
  }
  themeSelect.addEventListener("change", () => {
    const entry = themes.find((candidate) => candidate.name === themeSelect.value);
    store.update((draft) => {
      if (entry === undefined) {
        const { theme: _gone, ...rest } = draft;
        return rest;
      }
      return { ...draft, theme: entry.tokens };
    });
  });

  refreshers.push((draft) => {
    // Reflect programmatic theme loads; an unrecognized map shows as none.
    if (draft.theme === undefined) {
      themeSelect.value = "";
      return;
    }
    const match = themes.find(
      (entry) => JSON.stringify(entry.tokens) === JSON.stringify(draft.theme)
    );
    themeSelect.value = match?.name ?? "";
  });

  const rows: (Node | string)[] = [
    h("div", { class: "wgd-row" }, [
      h("span", { class: "wgd-field-label" }, ["Preview kind"]),
      kindSelect
    ]),
    h("div", { class: "wgd-row" }, [
      h("span", { class: "wgd-field-label" }, ["Preview theme"]),
      themeSelect
    ]),
    h("span", { class: "wgd-field-label" }, [
      themes.length === 0
        ? "No themes supplied by the host — design themes in the theme designer."
        : "Themes come from the host; edit them in the theme designer."
    ])
  ];

  const element = section("Preview", rows);
  return { element, dispose: () => element.remove() };
}
