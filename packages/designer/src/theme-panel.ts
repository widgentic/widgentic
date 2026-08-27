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
  themes: ThemeEntry[] = []
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
      const match = themes.find(
        (entry) => JSON.stringify(entry.tokens) === JSON.stringify(draft.theme)
      );
      themeSelect.value = match?.name ?? "";
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
