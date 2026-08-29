/**
 * Standalone theme designer: edits a NAMED theme entry
 * (`{ name, label?, description?, tokens }` — the theme registry's shape,
 * which is also what a host persists) with live preview against any
 * catalog kind.
 *
 * Split from the widget designer on purpose: an app routes to "design a
 * theme" and "design a widget" as separate destinations, and a host
 * embedding one should not ship the other. Both share the preview
 * controller, chrome, and store discipline.
 */
import { errorMessage } from "./internal.js";
import { createCatalog } from "@widgentic/core";
import {
  THEME_TOKENS,
  TOKEN_DEFAULTS,
  TOKEN_SPECS,
  isSafeTokenValue,
  validateTheme
} from "@widgentic/core";
import type { ThemeEntry, WidgetThemeInput } from "@widgentic/core";
import { applyChrome, diagnosticLine, h, injectDesignerStyles, section, textField, requireChild } from "./dom.js";
import type { ChromeOptions } from "./dom.js";
import { createPreview } from "./preview.js";
import type { PreviewWidget } from "./preview.js";
import { starterDraft } from "./store.js";
import type { WidgetDraft } from "./store.js";

const BASE_KINDS = createCatalog().kinds();

/** Hex form the native color input accepts. */
const HEX = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;
const CUSTOM_NAME = /^x-[a-z0-9][a-z0-9-]*$/;

function toHexInput(value: string): string | undefined {
  if (!HEX.test(value)) return undefined;
  if (value.length === 7) return value.toLowerCase();
  const [, r, g, b] = value.toLowerCase();
  return `#${r}${r}${g}${g}${b}${b}`;
}

export interface ThemeDesignerOptions {
  initialTheme?: ThemeEntry;
  appearance?: "auto" | "light" | "dark";
  /**
   * Host chrome: a partial map over `CHROME_TOKENS` applied inline on the
   * root, winning over the built-in light/dark defaults. Values may be
   * `var()` references to the host's own properties; CSS-wide keywords are
   * ignored (pass `var(--host-font, system-ui, sans-serif)`, not `inherit`).
   */
  chrome?: ChromeOptions;
  /**
   * Custom widget definitions to offer in the preview-kind selector
   * beside the built-ins — a theme is judged against the widgets it will
   * actually dress. Invalid definitions are skipped.
   */
  widgets?: PreviewWidget[];
  /**
   * Mount with editing disabled: panels stay visible but inert, only the
   * preview and its kind selector operate. Toggle later via `setReadOnly`.
   */
  readOnly?: boolean;
}

export type ThemeLoadResult = { ok: true } | { ok: false; errors: string[] };

export interface ThemeDesignerHandle {
  getTheme(): ThemeEntry;
  loadTheme(entry: unknown): ThemeLoadResult;
  /** Disable/enable editing; the preview and kind selector stay live. */
  setReadOnly(readOnly: boolean): void;
  subscribe(listener: (entry: ThemeEntry) => void): () => void;
  dispose(): void;
}

function starterEntry(): ThemeEntry {
  return { name: "my-theme", label: "My theme", tokens: {} };
}

/** Validate an untrusted entry; errors instead of throwing. */
export function checkThemeEntry(entry: unknown): string[] {
  const errors: string[] = [];
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    return ["Theme entry must be an object."];
  }
  const candidate = entry as Record<string, unknown>;
  if (typeof candidate.name !== "string" || candidate.name.trim() === "") {
    errors.push("'name' must be a non-empty string.");
  }
  const validated = validateTheme(candidate.tokens ?? {});
  if (!validated.ok) {
    errors.push(`tokens: ${validated.error.code} — ${validated.error.message}`);
  }
  return errors;
}

export function createThemeDesigner(
  container: Element,
  options: ThemeDesignerOptions = {}
): ThemeDesignerHandle {
  injectDesignerStyles(document);

  let entry: ThemeEntry = options.initialTheme
    ? (JSON.parse(JSON.stringify(options.initialTheme)) as ThemeEntry)
    : starterEntry();
  const listeners = new Set<(entry: ThemeEntry) => void>();

  const preview = createPreview(
    options.widgets ? { widgets: options.widgets } : {}
  );
  // Built-ins plus whatever custom definitions the host supplied.
  const previewKinds = preview.kinds.length > 0 ? preview.kinds : BASE_KINDS;
  let previewKind = previewKinds[0] ?? "card";
  const panels = h("div", { class: "wgd-panels" });
  const side = h("div", { class: "wgd-side" }, [preview.pane]);
  const root = h("div", { class: "wgd-root wgd-theme-designer" }, [panels, side]);
  if (options.appearance === "light" || options.appearance === "dark") {
    root.setAttribute("data-wgd-theme", options.appearance);
  }
  applyChrome(root, options.chrome);
  container.appendChild(root);

  /** A draft carrying only what the preview needs: kind + this theme. */
  function previewDraft(): WidgetDraft {
    return { ...starterDraft(), theme: entry.tokens };
  }

  function refresh(): void {
    preview.update(previewDraft(), { styles: [], previewable: true }, previewKind);
    for (const listener of [...listeners]) listener(getEntry());
  }

  function getEntry(): ThemeEntry {
    return JSON.parse(JSON.stringify(entry)) as ThemeEntry;
  }

  function setToken(key: string, value: string): void {
    const tokens = { ...entry.tokens } as Record<string, string>;
    if (value === "") delete tokens[key];
    else tokens[key] = value;
    entry = { ...entry, tokens: tokens as WidgetThemeInput };
    refresh();
  }

  // --- Identity panel ----------------------------------------------------
  /** Bind a text field and register its refresher (import must update it). */
  const identityRefreshers: (() => void)[] = [];
  function identityField(
    label: string,
    read: () => string,
    write: (value: string) => void
  ): HTMLElement {
    const field = textField(label, read(), write);
    const input = requireChild(field, "input");
    identityRefreshers.push(() => {
      if (document.activeElement !== input) input.value = read();
    });
    return field;
  }

  const identity = section("Theme", [
    identityField(
      "Name (id)",
      () => entry.name,
      (value) => {
        entry = { ...entry, name: value };
        refresh();
      }
    ),
    identityField(
      "Label",
      () => entry.label ?? "",
      (value) => {
        entry = { ...entry, label: value };
        refresh();
      }
    ),
    identityField(
      "Description",
      () => entry.description ?? "",
      (value) => {
        entry = { ...entry, description: value };
        refresh();
      }
    )
  ]);

  // The kind selector is a PREVIEW control, so it lives beside the
  // preview, outside the editing panels — read-only mode keeps it live.
  const kindSelect = h("select", {
    class: "wgd-select wgd-preview-kind"
  });
  for (const kind of previewKinds) {
    kindSelect.append(h("option", { value: kind }, [kind]));
  }
  kindSelect.value = previewKind;
  kindSelect.addEventListener("change", () => {
    previewKind = kindSelect.value;
    refresh();
  });
  side.prepend(
    h("div", { class: "wgd-row" }, [
      h("span", { class: "wgd-field-label" }, ["Preview kind"]),
      kindSelect
    ])
  );

  // --- Token panel -------------------------------------------------------
  const tokenRefreshers: (() => void)[] = [];
  const tokenRows: (Node | string)[] = [];
  for (const token of THEME_TOKENS) {
    const input = h("input", {
      type: "text",
      class: "wgd-input",
      placeholder: TOKEN_DEFAULTS[token]
    });
    input.value = entry.tokens[token] ?? "";
    const issue = diagnosticLine(undefined);
    // Control choice comes from the token's declared type — no guessing.
    const swatch = TOKEN_SPECS[token].type === "color"
      ? (h("input", {
          type: "color",
          class: "wgd-swatch",
          title: `Pick --wg-${token}`
        }))
      : undefined;

    const paint = (value: string): void => {
      const effective = value === "" ? TOKEN_DEFAULTS[token] : value;
      if (swatch !== undefined) {
        const hex = toHexInput(effective);
        if (hex !== undefined) swatch.value = hex;
        swatch.style.background = isSafeTokenValue(effective) ? effective : "transparent";
      }
    };
    paint(input.value);
    swatch?.addEventListener("input", () => {
      input.value = swatch.value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    input.addEventListener("input", () => {
      const unsafe = input.value !== "" && !isSafeTokenValue(input.value);
      issue.hidden = !unsafe;
      issue.textContent = unsafe
        ? "INVALID_TOKEN_VALUE: unsafe value withheld from the preview (no ;{}<> url() expression())."
        : "";
      paint(input.value);
      setToken(token, input.value);
    });
    tokenRefreshers.push(() => {
      if (document.activeElement !== input) {
        input.value = entry.tokens[token] ?? "";
        paint(input.value);
      }
    });
    tokenRows.push(
      h("div", undefined, [
        h("label", { class: "wgd-field", title: TOKEN_SPECS[token].use }, [
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
  const tokenPanel = section("Tokens", tokenRows);

  // --- Custom variables --------------------------------------------------
  const customHost = h("div", { class: "wgd-jt-children" });
  const customError = diagnosticLine(undefined);

  function customEntries(): [string, string][] {
    return Object.entries(entry.tokens).filter(([key]) =>
      CUSTOM_NAME.test(key)
    ) as [string, string][];
  }

  function renderCustom(): void {
    const rows = customEntries().map(([key, value]) => {
      const nameInput = h("input", {
        type: "text",
        class: "wgd-input wgd-jt-keyinput"
      });
      nameInput.value = key;
      nameInput.addEventListener("change", () => {
        const next = nameInput.value;
        if (!CUSTOM_NAME.test(next)) {
          customError.hidden = false;
          customError.textContent = `'${next}' is not a valid custom name — use x-<lowercase-kebab>.`;
          nameInput.value = key;
          return;
        }
        customError.hidden = true;
        const tokens = { ...entry.tokens } as Record<string, string>;
        delete tokens[key];
        tokens[next] = value;
        entry = { ...entry, tokens: tokens as WidgetThemeInput };
        renderCustom();
        refresh();
      });
      const valueInput = h("input", {
        type: "text",
        class: "wgd-input"
      });
      valueInput.value = value;
      valueInput.addEventListener("input", () => setToken(key, valueInput.value));
      const remove = h("button", { class: "wgd-icon", type: "button", title: "Remove" }, ["✕"]);
      remove.addEventListener("click", () => {
        setToken(key, "");
        renderCustom();
      });
      return h("div", { class: "wgd-attr-row" }, [nameInput, valueInput, remove]);
    });
    const add = h("button", { class: "wgd-button wgd-add", type: "button" }, [
      "+ variable"
    ]);
    add.addEventListener("click", () => {
      let name = "x-custom";
      for (let i = 1; name in entry.tokens; i++) name = `x-custom${i}`;
      setToken(name, "0");
      renderCustom();
    });
    customHost.replaceChildren(...rows, h("div", { class: "wgd-toolbar" }, [add]));
  }
  renderCustom();
  const customPanel = section("Custom variables (--wg-x-*)", [
    customHost,
    customError
  ]);

  // --- Import / export ---------------------------------------------------
  const output = h("textarea", {
    class: "wgd-textarea",
    rows: "8",
    readonly: "",
    spellcheck: "false"
  });
  const exportButton = h("button", { class: "wgd-button wgd-add", type: "button" }, [
    "Export theme entry"
  ]);
  exportButton.addEventListener("click", () => {
    output.value = JSON.stringify(getEntry(), null, 2);
  });
  const importArea = h("textarea", {
    class: "wgd-textarea",
    rows: "5",
    spellcheck: "false"
  });
  const importError = diagnosticLine(undefined);
  const importButton = h("button", { class: "wgd-button", type: "button" }, ["Import"]);
  importButton.addEventListener("click", () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(importArea.value);
    } catch (error) {
      importError.hidden = false;
      importError.textContent = `Invalid JSON: ${errorMessage(error)}`;
      return;
    }
    const result = loadTheme(parsed);
    importError.hidden = result.ok;
    importError.textContent = result.ok ? "" : result.errors.join("\n");
  });
  // Two independent sections, import first — the same shape the widget
  // designer uses, so both designers read alike.
  const importPanel = section("Import", [
    h("span", { class: "wgd-field-label" }, ["Import theme entry JSON"]),
    importArea,
    importError,
    h("div", { class: "wgd-row" }, [importButton])
  ]);
  const exportPanel = section("Export", [
    h("div", { class: "wgd-toolbar" }, [exportButton]),
    output
  ]);
  exportPanel.classList.add("wgd-view-only");

  panels.append(identity, tokenPanel, customPanel, importPanel, exportPanel);

  function loadTheme(input: unknown): ThemeLoadResult {
    const errors = checkThemeEntry(input);
    if (errors.length > 0) return { ok: false, errors };
    entry = JSON.parse(JSON.stringify(input)) as ThemeEntry;
    for (const refreshIdentity of identityRefreshers) refreshIdentity();
    for (const refreshToken of tokenRefreshers) refreshToken();
    renderCustom();
    refresh();
    return { ok: true };
  }

  refresh();

  /** Same mechanism as the widget designer: inert the section bodies. */
  function setReadOnly(readOnly: boolean): void {
    root.classList.toggle("wgd-readonly", readOnly);
    const bodies = [...panels.querySelectorAll(".wgd-section-body")].filter(
      (body) => !body.parentElement?.classList.contains("wgd-view-only")
    );
    for (const body of bodies) {
      if (readOnly) body.setAttribute("inert", "");
      else body.removeAttribute("inert");
    }
  }
  if (options.readOnly === true) setReadOnly(true);

  return {
    getTheme: getEntry,
    loadTheme,
    setReadOnly,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      listeners.clear();
      preview.dispose();
      root.remove();
    }
  };
}
