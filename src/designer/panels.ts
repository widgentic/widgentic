/**
 * Editor panels: plain modules over the draft store. Refresh discipline:
 * every store change re-derives diagnostics and refreshes bound controls,
 * but never overwrites the control the user is typing in
 * (`document.activeElement` wins) — the store is the single model, the
 * DOM is a projection.
 */
import type { DataSchema } from "widgentic/catalog";
import type { ThemeEntry } from "widgentic/theming";
import { diagnosticLine, h, section, textArea, textField } from "./dom.js";
import { attachJsonHighlight, repaintHighlight } from "./highlight.js";
import { mountIoPanel } from "./io.js";
import { createJsonTreeEditor } from "./json-tree-editor.js";
import { createSchemaBuilder } from "./schema-builder.js";
import { createSchemaForm } from "./schema-form.js";
import { createStylesEditor } from "./styles-editor.js";
import type { DraftStore, WidgetDraft } from "./store.js";
import { mountTemplatePanel } from "./template-panel.js";
import { mountThemePanel } from "./theme-panel.js";
import { deriveDiagnostics } from "./validate.js";

/** Tabbed container: first tab visible, buttons switch panes. */
function tabs(entries: { label: string; element: HTMLElement }[]): HTMLElement {
  const buttons = entries.map((entry, index) => {
    const button = h(
      "button",
      { class: `wgd-button wgd-tab${index === 0 ? " wgd-tab-active" : ""}`, type: "button" },
      [entry.label]
    );
    button.addEventListener("click", () => {
      entries.forEach((other, i) => {
        other.element.hidden = i !== index;
        buttons[i]?.classList.toggle("wgd-tab-active", i === index);
      });
    });
    entry.element.hidden = index !== 0;
    return button;
  });
  return h("div", { class: "wgd-tabs" }, [
    h("div", { class: "wgd-row" }, buttons),
    ...entries.map((entry) => entry.element)
  ]);
}

/** Column layout: definition (exported) on the left, presentation on the right. */
export interface PanelColumns {
  left: HTMLElement;
  right: HTMLElement;
}

type Refresher = (draft: WidgetDraft) => void;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * JSON-valued textarea with parse gating: invalid JSON never reaches the
 * store (last-valid-wins) — the parse error shows beside the field.
 */
function jsonField(
  label: string,
  read: (draft: WidgetDraft) => unknown,
  write: (draft: WidgetDraft, value: unknown) => WidgetDraft,
  clear: ((draft: WidgetDraft) => WidgetDraft) | undefined,
  store: DraftStore,
  refreshers: Refresher[],
  rows = 6
): HTMLElement {
  const parseError = diagnosticLine(undefined);
  const initial = read(store.get());
  const field = textArea(
    label,
    initial === undefined ? "" : JSON.stringify(initial, null, 2),
    (text) => {
      if (text.trim() === "") {
        parseError.hidden = true;
        if (clear) store.update((draft) => clear(draft));
        return;
      }
      try {
        const value: unknown = JSON.parse(text);
        parseError.hidden = true;
        parseError.textContent = "";
        store.update((draft) => write(draft, value));
      } catch (error) {
        parseError.hidden = false;
        parseError.textContent = `Invalid JSON (draft keeps the last valid value): ${String(
          (error as Error).message
        )}`;
      }
    },
    rows
  );
  const area = field.querySelector("textarea") as HTMLTextAreaElement;
  attachJsonHighlight(area);
  refreshers.push((draft) => {
    if (document.activeElement === area) return;
    const value = read(draft);
    area.value = value === undefined ? "" : JSON.stringify(value, null, 2);
    repaintHighlight(area); // programmatic writes fire no input event
  });
  return h("div", undefined, [field, parseError]);
}

export function mountPanels(
  store: DraftStore,
  columns: PanelColumns,
  themes: ThemeEntry[] = []
): { dispose(): void } {
  const refreshers: Refresher[] = [];
  const disposers: (() => void)[] = [];

  function bindText(
    label: string,
    read: (draft: WidgetDraft) => string,
    write: (draft: WidgetDraft, value: string) => WidgetDraft
  ): HTMLElement {
    const field = textField(label, read(store.get()), (value) =>
      store.update((draft) => write(draft, value))
    );
    const input = field.querySelector("input") as HTMLInputElement;
    refreshers.push((draft) => {
      if (document.activeElement !== input) input.value = read(draft);
    });
    return field;
  }

  // --- General: kind + prose descriptor fields (left) -------------------
  const kindDiag = diagnosticLine(undefined);
  const generalPanel = section("General", [
    bindText("Kind (id)", (d) => d.kind, (d, v) => ({ ...d, kind: v })),
    kindDiag,
    bindText(
      "Description",
      (d) => d.descriptor.description ?? "",
      (d, v) => ({ ...d, descriptor: { ...d.descriptor, description: v } })
    ),
    bindText(
      "Data shape (prose)",
      (d) => d.descriptor.dataShape ?? "",
      (d, v) => ({ ...d, descriptor: { ...d.descriptor, dataShape: v } })
    ),
    jsonField(
      "Hints (Record<name, doc>)",
      (d) => d.descriptor.hints,
      (d, v) => {
        if (!isPlainObject(v)) return d;
        const hints = Object.fromEntries(
          Object.entries(v).map(([k, doc]) => [k, String(doc)])
        ) as Record<string, string>;
        return { ...d, descriptor: { ...d.descriptor, hints } };
      },
      (d) => {
        const { hints: _hints, ...rest } = d.descriptor;
        return { ...d, descriptor: rest };
      },
      store,
      refreshers,
      3
    )
  ]);

  // --- Data schema (left, definition): Builder + JSON tabs ---------------
  const schemaBuilder = createSchemaBuilder(store.get().descriptor.dataSchema, (schema) =>
    store.update((d) => {
      if (schema === undefined) {
        const { dataSchema: _s, ...rest } = d.descriptor;
        return { ...d, descriptor: rest };
      }
      return { ...d, descriptor: { ...d.descriptor, dataSchema: schema } };
    })
  );
  refreshers.push((draft) => schemaBuilder.setValue(draft.descriptor.dataSchema));
  const schemaPanel = section(
    "Data schema",
    [
      tabs([
        { label: "Builder", element: schemaBuilder.element },
        {
          label: "JSON",
          element: jsonField(
            "dataSchema (JSON-Schema subset: type/properties/required/items/enum/pattern)",
            (d) => d.descriptor.dataSchema,
            (d, v) => {
              if (!isPlainObject(v)) return d;
              return { ...d, descriptor: { ...d.descriptor, dataSchema: v } };
            },
            (d) => {
              const { dataSchema: _s, ...rest } = d.descriptor;
              return { ...d, descriptor: rest };
            },
            store,
            refreshers
          )
        }
      ])
    ],
    false
  );

  /**
   * Adaptive data editor: schema-driven form when a dataSchema exists,
   * generic JSON tree otherwise — rebuilt when the schema changes; the raw
   * JSON textarea remains as a sibling tab either way.
   */
  function adaptiveDataEditor(
    read: (d: WidgetDraft) => unknown,
    write: (d: WidgetDraft, v: unknown) => WidgetDraft
  ): HTMLElement {
    const hostEl = h("div");
    let schemaKey = "";
    let editor:
      | { element: HTMLElement; setValue(v: unknown): void }
      | undefined;

    function rebuild(draft: WidgetDraft): void {
      const schema = draft.descriptor.dataSchema;
      const key = schema === undefined ? "" : JSON.stringify(schema);
      if (editor !== undefined && key === schemaKey) {
        editor.setValue(read(draft));
        return;
      }
      schemaKey = key;
      const onChange = (value: unknown): void =>
        store.update((d) => write(d, value));
      editor =
        schema !== undefined && isPlainObject(schema)
          ? createSchemaForm(schema as DataSchema, read(draft), onChange)
          : createJsonTreeEditor(read(draft), onChange);
      hostEl.replaceChildren(editor.element);
    }

    rebuild(store.get());
    refreshers.push(rebuild);
    return hostEl;
  }

  // --- Sample data = the descriptor's dataExample (left, exported) -------
  const exampleDiag = diagnosticLine(undefined);
  const samplePanel = section(
    "Sample data",
    [
      h("span", { class: "wgd-field-label" }, [
        "dataExample — ships with the widget as the example agents imitate"
      ]),
      tabs([
        {
          label: "Edit",
          element: adaptiveDataEditor(
            (d) => d.descriptor.dataExample,
            (d, v) => ({ ...d, descriptor: { ...d.descriptor, dataExample: v } })
          )
        },
        {
          label: "JSON",
          element: jsonField(
            "dataExample (JSON)",
            (d) => d.descriptor.dataExample,
            (d, v) => ({ ...d, descriptor: { ...d.descriptor, dataExample: v } }),
            (d) => {
              const { dataExample: _e, ...rest } = d.descriptor;
              return { ...d, descriptor: rest };
            },
            store,
            refreshers
          )
        }
      ]),
      exampleDiag
    ],
    false
  );

  // --- Data for preview (right, session-only) ----------------------------
  const sampleDiag = diagnosticLine(undefined);
  const previewDataPanel = section(
    "Data for preview",
    [
      h("span", { class: "wgd-field-label" }, [
        "Overrides dataExample in the preview only (not exported)"
      ]),
      tabs([
        {
          label: "Edit",
          element: adaptiveDataEditor(
            (d) => d.sampleData,
            (d, v) => ({ ...d, sampleData: v })
          )
        },
        {
          label: "JSON",
          element: jsonField(
            "Preview data (JSON)",
            (d) => d.sampleData,
            (d, v) => ({ ...d, sampleData: v }),
            (d) => {
              const { sampleData: _s, ...rest } = d;
              return rest;
            },
            store,
            refreshers,
            4
          )
        }
      ]),
      sampleDiag
    ],
    false
  );

  // --- Styles panel (right, presentation): Tree + JSON tabs --------------
  // Two projections of the one draft value, exactly like the template's
  // tree/JSON pair: the tree enforces the string-only two-level shape,
  // the JSON pane stays parse-gated.
  const stylesDiag = h("div");
  const stylesEditor = createStylesEditor(store.get().descriptor.styles, (styles) =>
    store.update((d) => {
      if (styles === undefined) {
        const { styles: _s, ...rest } = d.descriptor;
        return { ...d, descriptor: rest };
      }
      return { ...d, descriptor: { ...d.descriptor, styles } };
    })
  );
  refreshers.push((draft) => stylesEditor.setValue(draft.descriptor.styles));
  const stylesPanel = section("Styles (.wg- selectors, guarded like the server)", [
    tabs([
      { label: "Tree", element: stylesEditor.element },
      {
        label: "JSON",
        element: jsonField(
          "styles (Record<selector, Record<property, value>>)",
          (d) => d.descriptor.styles,
          (d, v) => {
            if (!isPlainObject(v)) return d;
            return {
              ...d,
              descriptor: {
                ...d.descriptor,
                styles: v as Record<string, Record<string, string>>
              }
            };
          },
          (d) => {
            const { styles: _s, ...rest } = d.descriptor;
            return { ...d, descriptor: rest };
          },
          store,
          refreshers
        )
      }
    ]),
    stylesDiag
  ]);

  const templatePanel = mountTemplatePanel(store, refreshers);
  const themePanel = mountThemePanel(store, refreshers, themes);
  const ioPanel = mountIoPanel(store);

  // Left: the widget definition (what export produces). Right: presentation.
  columns.left.append(
    generalPanel,
    schemaPanel,
    samplePanel,
    templatePanel.element,
    ioPanel.element
  );
  columns.right.append(previewDataPanel, stylesPanel, themePanel.element);
  disposers.push(templatePanel.dispose, themePanel.dispose, ioPanel.dispose);

  // Diagnostics refresh: derive once per change here (cheap, pure) — and
  // once immediately, so the tree/JSON projections render before any edit.
  function applyDiagnostics(draft: WidgetDraft): void {
    const diagnostics = deriveDiagnostics(draft);
    kindDiag.hidden = diagnostics.kind === undefined;
    kindDiag.textContent = diagnostics.kind ?? "";
    exampleDiag.hidden = diagnostics.example === undefined;
    exampleDiag.textContent = diagnostics.example
      ? `dataExample vs dataSchema: ${diagnostics.example.code} at ${diagnostics.example.path} — ${diagnostics.example.message}`
      : "";
    sampleDiag.hidden = diagnostics.sample === undefined;
    sampleDiag.textContent = diagnostics.sample
      ? `sample vs dataSchema: ${diagnostics.sample.code} at ${diagnostics.sample.path} — ${diagnostics.sample.message}`
      : "";
    stylesDiag.replaceChildren(
      ...diagnostics.styles.map((issue) =>
        diagnosticLine(
          `${issue.selector}${issue.property ? ` → ${issue.property}` : ""}: ${issue.message}`
        )
      )
    );
    for (const refresh of refreshers) refresh(draft);
    templatePanel.refresh(draft, diagnostics);
  }

  const off = store.subscribe(applyDiagnostics);
  disposers.push(off);
  applyDiagnostics(store.get());

  return {
    dispose() {
      for (const dispose of disposers) dispose();
      columns.left.replaceChildren();
      columns.right.replaceChildren();
    }
  };
}
