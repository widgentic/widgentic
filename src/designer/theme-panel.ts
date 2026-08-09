/**
 * Theme designer: one control per registry token, validated per change,
 * previewable against the draft or any built-in kind. Unsafe values are
 * flagged inline and — because `applyTheme` itself skips them — never
 * reach the preview.
 */
import { createCatalog } from "widgentic/catalog";
import {
  THEME_TOKENS,
  TOKEN_DEFAULTS,
  darkTheme,
  isSafeTokenValue
} from "widgentic/theming";
import type { ThemeToken, WidgetTheme } from "widgentic/theming";
import { diagnosticLine, h, section } from "./dom.js";
import { PREVIEW_KIND } from "./preview.js";
import type { DraftStore, WidgetDraft } from "./store.js";
import type { PanelsContext } from "./panels.js";

const BASE_KINDS = createCatalog().kinds();

/** Tokens whose values are plain colors — these get a picker + swatch. */
const HEX = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;
function isColorToken(token: ThemeToken): boolean {
  return HEX.test(TOKEN_DEFAULTS[token]);
}
/** `<input type="color">` only speaks #rrggbb. */
function toHexInput(value: string): string | undefined {
  if (!HEX.test(value)) return undefined;
  if (value.length === 7) return value.toLowerCase();
  const [, r, g, b] = value.toLowerCase();
  return `#${r}${r}${g}${g}${b}${b}`;
}

export function mountThemePanel(
  store: DraftStore,
  refreshers: ((draft: WidgetDraft) => void)[],
  context: PanelsContext
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

  // Presets: load a shipped theme wholesale, then keep editing tokens.
  const lightPreset = h("button", { class: "wgd-button wgd-add", type: "button" }, [
    "Light"
  ]);
  lightPreset.addEventListener("click", () =>
    store.update((draft) => {
      const { theme: _gone, ...rest } = draft;
      return rest; // no tokens set = the built-in light defaults
    })
  );
  const darkPreset = h("button", { class: "wgd-button wgd-add", type: "button" }, [
    "Dark"
  ]);
  darkPreset.addEventListener("click", () =>
    store.update((draft) => ({ ...draft, theme: { ...darkTheme } }))
  );

  const rows: (Node | string)[] = [
    h("div", { class: "wgd-row" }, [
      h("span", { class: "wgd-field-label" }, ["Preview kind"]),
      kindSelect
    ]),
    h("div", { class: "wgd-row" }, [
      h("span", { class: "wgd-field-label" }, ["Preset"]),
      lightPreset,
      darkPreset
    ])
  ];

  for (const token of THEME_TOKENS) {
    const input = h("input", {
      type: "text",
      class: "wgd-input",
      placeholder: TOKEN_DEFAULTS[token]
    }) as HTMLInputElement;
    input.value = store.get().theme?.[token] ?? "";
    const issue = diagnosticLine(undefined);
    // Color tokens get a native picker; it doubles as the swatch showing
    // the EFFECTIVE color (the theme value, or the token default).
    const swatch = isColorToken(token)
      ? (h("input", {
          type: "color",
          class: "wgd-swatch",
          title: `Pick --wg-${token}`
        }) as HTMLInputElement)
      : undefined;

    const applyChip = (value: string): void => {
      const effective = value === "" ? TOKEN_DEFAULTS[token] : value;
      if (swatch !== undefined) {
        const hex = toHexInput(effective);
        if (hex !== undefined) swatch.value = hex;
        swatch.style.background = isSafeTokenValue(effective) ? effective : "transparent";
      }
    };
    applyChip(input.value);
    swatch?.addEventListener("input", () => {
      input.value = swatch.value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    input.addEventListener("input", () => {
      const value = input.value;
      const unsafe = value !== "" && !isSafeTokenValue(value);
      issue.hidden = !unsafe;
      issue.textContent = unsafe
        ? `INVALID_TOKEN_VALUE: unsafe value withheld from the preview (no ;{}<> url() expression()).`
        : "";
      applyChip(value);
      store.update((draft) => {
        const theme: WidgetTheme = { ...(draft.theme ?? {}) };
        if (value === "") {
          delete theme[token];
        } else {
          theme[token] = value;
        }
        if (Object.keys(theme).length === 0) {
          const { theme: _gone, ...rest } = draft;
          return rest;
        }
        return { ...draft, theme };
      });
    });

    refreshers.push((draft) => {
      if (document.activeElement !== input) {
        input.value = draft.theme?.[token] ?? "";
        applyChip(input.value);
      }
    });

    rows.push(
      h("div", undefined, [
        h("label", { class: "wgd-field" }, [
          h("span", { class: "wgd-field-label" }, [`--wg-${token}`]),
          h(
            "div",
            { class: "wgd-token-row" },
            swatch === undefined ? [input] : [input, swatch]
          )
        ]),
        issue
      ])
    );
  }

  const element = section("Theme", rows);
  return { element, dispose: () => element.remove() };
}
