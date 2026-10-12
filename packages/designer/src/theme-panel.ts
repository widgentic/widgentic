/**
 * Preview controls in the widget designer: which of the host-supplied
 * named themes the DRAFT renders under — plus a read-only reference of
 * the effective tokens, so style authoring can reach for
 * `var(--wg-…)` by sight instead of memory.
 *
 * Theme *authoring* lives in the standalone theme designer — this panel
 * only selects and displays. There is deliberately no preview-kind
 * selector: the widget designer previews the draft, and previewing
 * arbitrary kinds under a theme is the theme designer's job.
 */
import type { ThemeEntry } from "@widgentic/core";
import { TOKEN_SPECS } from "@widgentic/core";
import { diagnosticLine, h, section } from "./dom.js";
import type { DraftStore, WidgetDraft } from "./store.js";

export function mountThemePanel(
  store: DraftStore,
  refreshers: ((draft: WidgetDraft) => void)[],
  themes: ThemeEntry[] = [],
  /** The entry the designer opened with, so equal-content entries stay told apart. */
  initialName?: string
): {
  element: HTMLElement;
  /** Show the theme validator's error — this panel owns the value. */
  setDiagnostic(message: string | undefined): void;
  dispose(): void;
} {
  // Theme validation errors were computed and dropped before this: the
  // panel that owns the offending value showed nothing at all.
  const themeDiag = diagnosticLine(undefined);
  // Theme selector: "none" plus whatever the host supplied.
  const themeSelect = h("select", {
    class: "wgd-select wgd-theme-select"
  });
  themeSelect.append(h("option", { value: "" }, ["(none — defaults)"]));
  for (const entry of themes) {
    themeSelect.append(
      h("option", { value: entry.name }, [entry.label ?? entry.name])
    );
  }
  if (initialName !== undefined && themes.some((entry) => entry.name === initialName)) {
    themeSelect.value = initialName;
  }
  themeSelect.addEventListener("change", () => {
    const entry = themes.find((candidate) => candidate.name === themeSelect.value);
    store.update((draft) => {
      const { theme: _theme, themeStyles: _styles, ...rest } = draft;
      if (entry === undefined) return rest;
      // The entry's shared styles dress the preview too, so its classes
      // look in the draft as they will under this theme.
      return entry.styles === undefined
        ? { ...rest, theme: entry.tokens }
        : { ...rest, theme: entry.tokens, themeStyles: entry.styles };
    });
  });

  // Token reference: the EFFECTIVE preview tokens — the selected entry
  // merged over the registry defaults — plus the entry's x-* customs.
  // Types come from TOKEN_SPECS metadata (color → swatch), never inferred.
  const tokenList = h("div", { class: "wgd-token-ref" });

  function renderTokenReference(theme: Record<string, string> | undefined): void {
    tokenList.replaceChildren();
    for (const [name, spec] of Object.entries(TOKEN_SPECS)) {
      const value = theme?.[name] ?? spec.default;
      const row = h("div", { class: "wgd-token-ref-row", title: spec.use }, [
        spec.type === "color"
          ? h("span", {
              class: "wgd-token-ref-swatch",
              style: `background: ${value}`
            })
          : h("span", { class: "wgd-token-ref-swatch wgd-token-ref-noswatch" }),
        h("code", { class: "wgd-token-ref-name" }, [`--wg-${name}`]),
        h("span", { class: "wgd-token-ref-value" }, [value])
      ]);
      tokenList.append(row);
    }
    for (const [name, value] of Object.entries(theme ?? {})) {
      if (!name.startsWith("x-")) continue;
      const row = h("div", { class: "wgd-token-ref-row", title: "Custom variable" }, [
        h("span", { class: "wgd-token-ref-swatch wgd-token-ref-noswatch" }),
        h("code", { class: "wgd-token-ref-name" }, [`--wg-${name}`]),
        h("span", { class: "wgd-token-ref-value" }, [value])
      ]);
      tokenList.append(row);
    }
  }
  renderTokenReference(store.get().theme);

  refreshers.push((draft) => {
    // Reflect programmatic theme loads; an unrecognized map shows as none.
    if (draft.theme === undefined) {
      themeSelect.value = "";
    } else {
      // The chosen name stands while the draft still carries that entry;
      // otherwise the first entry with the same tokens AND styles (a
      // styles-only theme has the built-in light's tokens).
      const same = (entry: ThemeEntry) =>
        JSON.stringify(entry.tokens) === JSON.stringify(draft.theme) &&
        JSON.stringify(entry.styles) === JSON.stringify(draft.themeStyles);
      const chosen = themes.find((entry) => entry.name === themeSelect.value);
      if (chosen === undefined || !same(chosen)) {
        // An empty map with no styles is the defaults — "none" — never a
        // guess at whichever named entry happens to be empty (the built-in
        // light): a token map set programmatically names no entry.
        const empty = Object.keys(draft.theme).length === 0 && draft.themeStyles === undefined;
        themeSelect.value = empty ? "" : themes.find(same)?.name ?? "";
      }
    }
    renderTokenReference(draft.theme);
  });

  const rows: (Node | string)[] = [
    h("div", { class: "wgd-row" }, [
      h("span", { class: "wgd-field-label" }, ["Preview theme"]),
      themeSelect
    ]),
    h("span", { class: "wgd-field-label" }, [
      themes.length === 0
        ? "No themes supplied by the host — design themes in the theme designer."
        : "Themes come from the host; edit them in the theme designer."
    ]),
    themeDiag,
    h("details", { class: "wgd-token-ref-details" }, [
      h("summary", { class: "wgd-field-label" }, [
        "Theme tokens (reference for styles)"
      ]),
      tokenList
    ])
  ];

  const element = section("Preview", rows);
  return {
    element,
    setDiagnostic(message) {
      themeDiag.hidden = message === undefined;
      themeDiag.textContent = message ?? "";
    },
    dispose: () => element.remove()
  };
}
