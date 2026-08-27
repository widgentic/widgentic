/**
 * Standalone schema designer: edits a stored-schema entry
 * (`{ name, label?, description?, schema }` — the widget-store's shape)
 * so one definition (`person`) can serve many widgets. Split out like the
 * theme designer: an app routes to "design a schema" as its own
 * destination, and a host embedding one designer should not ship the
 * others. Shares the chrome, the schema builder, and the parse-gated
 * JSON discipline.
 */
import { errorMessage } from "./internal.js";
import { isPlainObject } from "@widgentic/core";
import type { DataSchema } from "@widgentic/core";
import { diagnosticLine, h, injectDesignerStyles, section, textField, requireChild } from "./dom.js";
import { attachJsonHighlight, repaintHighlight } from "./highlight.js";
import { createSchemaBuilder } from "./schema-builder.js";

/** The store's identifier charset — kept local: `widgentic/store` is a
 * Node-only entry and the designer runs in browsers. */
const SAFE_NAME = /^[a-zA-Z0-9._-]+$/;

export interface SchemaEntry {
  name: string;
  label?: string;
  description?: string;
  schema: Record<string, unknown>;
}

export interface SchemaDesignerOptions {
  initialSchema?: SchemaEntry;
  appearance?: "auto" | "light" | "dark";
  /**
   * Mount with editing disabled: panels stay visible but inert. Toggle
   * later via `setReadOnly`.
   */
  readOnly?: boolean;
}

export type SchemaLoadResult = { ok: true } | { ok: false; errors: string[] };

export interface SchemaDesignerHandle {
  getSchema(): SchemaEntry;
  loadSchema(entry: unknown): SchemaLoadResult;
  /** Disable/enable editing. */
  setReadOnly(readOnly: boolean): void;
  subscribe(listener: (entry: SchemaEntry) => void): () => void;
  dispose(): void;
}

function starterEntry(): SchemaEntry {
  return {
    name: "my-schema",
    label: "My schema",
    schema: { type: "object", properties: {} }
  };
}

/** Validate an untrusted entry; errors instead of throwing. */
export function checkSchemaEntry(entry: unknown): string[] {
  const errors: string[] = [];
  if (!isPlainObject(entry)) return ["Schema entry must be an object."];
  if (typeof entry.name !== "string" || entry.name.trim() === "") {
    errors.push("'name' must be a non-empty string.");
  } else if (!SAFE_NAME.test(entry.name)) {
    errors.push(
      `'${entry.name}' is not a valid schema name — use letters, digits, '.', '_' or '-'.`
    );
  }
  if (!isPlainObject(entry.schema)) {
    errors.push("'schema' must be a plain object.");
  }
  return errors;
}

export function createSchemaDesigner(
  container: Element,
  options: SchemaDesignerOptions = {}
): SchemaDesignerHandle {
  injectDesignerStyles(document);

  let entry: SchemaEntry = options.initialSchema
    ? (JSON.parse(JSON.stringify(options.initialSchema)) as SchemaEntry)
    : starterEntry();
  const listeners = new Set<(entry: SchemaEntry) => void>();

  const panels = h("div", { class: "wgd-panels" });
  const root = h("div", { class: "wgd-root wgd-schema-designer" }, [panels]);
  if (options.appearance === "light" || options.appearance === "dark") {
    root.setAttribute("data-wgd-theme", options.appearance);
  }
  container.appendChild(root);

  function getEntry(): SchemaEntry {
    return JSON.parse(JSON.stringify(entry)) as SchemaEntry;
  }

  function notify(): void {
    for (const listener of [...listeners]) listener(getEntry());
  }

  // --- Identity panel ----------------------------------------------------
  const identityRefreshers: (() => void)[] = [];
  const nameDiag = diagnosticLine(undefined);

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

  const identity = section("Schema", [
    identityField(
      "Name (id)",
      () => entry.name,
      (value) => {
        entry = { ...entry, name: value };
        const bad = value.trim() === "" || !SAFE_NAME.test(value);
        nameDiag.hidden = !bad;
        nameDiag.textContent = bad
          ? "Name must be non-empty using letters, digits, '.', '_' or '-'."
          : "";
        notify();
      }
    ),
    nameDiag,
    identityField(
      "Label",
      () => entry.label ?? "",
      (value) => {
        entry = { ...entry, label: value };
        notify();
      }
    ),
    identityField(
      "Description",
      () => entry.description ?? "",
      (value) => {
        entry = { ...entry, description: value };
        notify();
      }
    )
  ]);

  // --- Definition panel: builder + parse-gated JSON, one view at a time --
  const builder = createSchemaBuilder(entry.schema as DataSchema, (schema) => {
    entry = { ...entry, schema: (schema ?? {}) as Record<string, unknown> };
    syncJson();
    notify();
  });

  const jsonError = diagnosticLine(undefined);
  const jsonArea = h("textarea", {
    class: "wgd-textarea",
    rows: "12",
    spellcheck: "false"
  });
  const jsonWrap = h("div", undefined, [jsonArea, jsonError]);
  jsonArea.value = JSON.stringify(entry.schema, null, 2);
  jsonArea.addEventListener("input", () => {
    try {
      const parsed: unknown = JSON.parse(jsonArea.value);
      if (!isPlainObject(parsed)) throw new Error("schema must be an object");
      jsonError.hidden = true;
      jsonError.textContent = "";
      entry = { ...entry, schema: parsed };
      builder.setValue(parsed as DataSchema);
      notify();
    } catch (error) {
      jsonError.hidden = false;
      jsonError.textContent = `Invalid JSON (schema keeps the last valid value): ${String(
        errorMessage(error)
      )}`;
    }
  });

  function syncJson(): void {
    if (document.activeElement === jsonArea) return;
    jsonArea.value = JSON.stringify(entry.schema, null, 2);
    repaintHighlight(jsonArea);
  }

  const builderTab = h(
    "button",
    { class: "wgd-button wgd-tab wgd-tab-active", type: "button" },
    ["Builder"]
  );
  const jsonTab = h("button", { class: "wgd-button wgd-tab", type: "button" }, [
    "JSON"
  ]);
  jsonWrap.hidden = true;
  builderTab.addEventListener("click", () => {
    builder.element.hidden = false;
    jsonWrap.hidden = true;
    builderTab.classList.add("wgd-tab-active");
    jsonTab.classList.remove("wgd-tab-active");
  });
  jsonTab.addEventListener("click", () => {
    builder.element.hidden = true;
    jsonWrap.hidden = false;
    jsonTab.classList.add("wgd-tab-active");
    builderTab.classList.remove("wgd-tab-active");
    syncJson();
  });

  const definition = section("Definition", [
    h("div", { class: "wgd-row" }, [builderTab, jsonTab]),
    builder.element,
    jsonWrap
  ]);

  // --- Import / Export: the agent hand-off -------------------------------
  // Live testing surfaced this within a day of list_schemas shipping: an
  // agent drafts the complete entry JSON from the guide, and Import is
  // where the user pastes it. Same two-section shape as the siblings.
  const importError = diagnosticLine(undefined);
  const importArea = h("textarea", {
    class: "wgd-textarea wgd-schema-import",
    rows: "6",
    spellcheck: "false"
  });
  const importButton = h("button", { class: "wgd-button", type: "button" }, [
    "Import"
  ]);
  importButton.addEventListener("click", () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(importArea.value);
    } catch (error) {
      importError.hidden = false;
      importError.textContent = `Invalid JSON: ${errorMessage(error)}`;
      return;
    }
    const result = loadSchema(parsed);
    importError.hidden = result.ok;
    importError.textContent = result.ok ? "" : result.errors.join("\n");
  });
  const importSection = section("Import", [
    h("span", { class: "wgd-field-label" }, [
      "Import schema entry JSON ({ name, label?, description?, schema })"
    ]),
    importArea,
    importError,
    h("div", { class: "wgd-row" }, [importButton])
  ]);

  const output = h("textarea", {
    class: "wgd-textarea",
    rows: "8",
    readonly: "",
    spellcheck: "false"
  });
  const exportButton = h("button", { class: "wgd-button wgd-add", type: "button" }, [
    "Export schema entry"
  ]);
  exportButton.addEventListener("click", () => {
    output.value = JSON.stringify(getEntry(), null, 2);
    repaintHighlight(output);
  });
  const exportSection = section("Export", [
    h("div", { class: "wgd-toolbar" }, [exportButton]),
    output
  ]);
  // Export copies out what is on screen — read-only leaves it operable.
  exportSection.classList.add("wgd-view-only");

  panels.append(identity, definition, importSection, exportSection);
  // The JSON layer wraps the textareas in place, so attach after assembly.
  attachJsonHighlight(jsonArea);
  attachJsonHighlight(importArea);
  attachJsonHighlight(output);

  function loadSchema(input: unknown): SchemaLoadResult {
    const errors = checkSchemaEntry(input);
    if (errors.length > 0) return { ok: false, errors };
    entry = JSON.parse(JSON.stringify(input)) as SchemaEntry;
    for (const refresh of identityRefreshers) refresh();
    nameDiag.hidden = true;
    builder.setValue(entry.schema as DataSchema);
    syncJson();
    notify();
    return { ok: true };
  }

  /** Same mechanism as the other designers: inert the section bodies —
   * except the view-only Export, which restricts nothing. */
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
    getSchema: getEntry,
    loadSchema,
    setReadOnly,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      listeners.clear();
      root.remove();
    }
  };
}
