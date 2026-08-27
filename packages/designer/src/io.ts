/**
 * Import/export in the server's shapes: widget JSON is exactly the
 * `CustomWidget` definition (`{ kind, template, descriptor }`) that
 * `examples/mcp-server/widgets/` registers; themes are bare token maps.
 * Imports are untrusted — everything re-validates, and a failed import
 * never touches the current draft.
 */
import { errorMessage } from "./internal.js";
import { isPlainObject } from "@widgentic/core";
import { parsePath, validateTemplate } from "@widgentic/core";
import { validateLoadBinding } from "@widgentic/core";
import type { ActionBinding } from "@widgentic/core";
import { } from "@widgentic/core";
import { diagnosticLine, h, section, textArea, requireChild } from "./dom.js";
import { attachJsonHighlight, repaintHighlight } from "./highlight.js";
import type { DraftStore, WidgetDraft } from "./store.js";

export interface WidgetDefinition {
  kind: WidgetDraft["kind"];
  template: WidgetDraft["template"];
  descriptor: WidgetDraft["descriptor"];
  load?: ActionBinding;
}

/** Validate an untrusted definition; errors instead of throws. */
export function checkDefinition(definition: unknown): string[] {
  const errors: string[] = [];
  if (!isPlainObject(definition)) return ["Definition must be an object."];
  if (typeof definition.kind !== "string" || definition.kind.trim() === "") {
    errors.push("'kind' must be a non-empty string.");
  }
  const template = validateTemplate(definition.template);
  if (!template.ok) {
    errors.push(`template: ${template.error.code} — ${template.error.message}`);
  }
  if (!isPlainObject(definition.descriptor)) {
    errors.push("'descriptor' must be an object.");
  } else if (typeof definition.descriptor.description !== "string") {
    errors.push("'descriptor.description' must be a string.");
  }
  if (definition.load !== undefined) {
    const problem = validateLoadBinding(definition.load, "load", {
      isPath: (value) => parsePath(value) !== undefined
    });
    if (problem) errors.push(`load: ${problem.message} (at ${problem.path})`);
  }
  return errors;
}

export function exportWidgetJson(draft: WidgetDraft): string {
  const definition: WidgetDefinition = {
    kind: draft.kind,
    template: draft.template,
    descriptor: draft.descriptor,
    ...(draft.load !== undefined ? { load: draft.load } : {})
  };
  return JSON.stringify(definition, null, 2);
}

export function exportThemeJson(draft: WidgetDraft): string {
  return JSON.stringify(draft.theme ?? {}, null, 2);
}

export type ImportResult =
  | { ok: true; definition: WidgetDefinition }
  | { ok: false; errors: string[] };

export function importWidgetJson(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`Invalid JSON: ${errorMessage(error)}`] };
  }
  const errors = checkDefinition(parsed);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, definition: parsed as unknown as WidgetDefinition };
}

/** Apply a validated definition to the store, preserving the session theme. */
export function applyDefinition(store: DraftStore, definition: WidgetDefinition): void {
  const theme = store.get().theme;
  store.replace({
    kind: definition.kind,
    template: definition.template,
    descriptor: definition.descriptor,
    ...(definition.load !== undefined ? { load: definition.load } : {}),
    ...(theme !== undefined ? { theme } : {})
  });
}

function camelCase(kind: string): string {
  return kind
    .split(/[^a-zA-Z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part, i) => (i === 0 ? part : part[0]?.toUpperCase() + part.slice(1)))
    .join("");
}

/**
 * Emit a module body compatible with `examples/mcp-server/widgets/` —
 * the manual-registration bridge until wire registration exists.
 */
export function toTypeScriptModule(draft: WidgetDraft): string {
  const name = camelCase(draft.kind) || "custom";
  return (
    `import type { CustomWidget } from "./index.js";\n\n` +
    `export const ${name}Widget: CustomWidget = ${JSON.stringify(
      {
        kind: draft.kind,
        template: draft.template,
        descriptor: draft.descriptor,
        ...(draft.load !== undefined ? { load: draft.load } : {})
      },
      null,
      2
    )};\n`
  );
}

export function mountIoPanel(store: DraftStore): {
  element: HTMLElement;
  dispose(): void;
} {
  const output = h("textarea", {
    class: "wgd-textarea",
    rows: "8",
    readonly: "",
    spellcheck: "false"
  });

  function button(label: string, produce: () => string): HTMLElement {
    const el = h("button", { class: "wgd-button wgd-add", type: "button" }, [label]);
    el.addEventListener("click", () => {
      output.value = produce();
      repaintHighlight(output);
    });
    return el;
  }

  const importError = diagnosticLine(undefined);
  const importField = textArea("Import widget JSON", "", () => undefined, 5);
  const importArea = requireChild(importField, "textarea");
  attachJsonHighlight(importArea);
  const importButton = h("button", { class: "wgd-button", type: "button" }, [
    "Import"
  ]);
  importButton.addEventListener("click", () => {
    const result = importWidgetJson(importArea.value);
    if (!result.ok) {
      importError.hidden = false;
      importError.textContent = result.errors.join("\n");
      return; // current draft untouched
    }
    importError.hidden = true;
    importError.textContent = "";
    applyDefinition(store, result.definition);
  });

  // Import and export are independent flows — two sections, import first
  // (bringing a drafted definition in is the more common entry point).
  const importSection = section("Import", [
    importField,
    importError,
    h("div", { class: "wgd-row" }, [importButton])
  ]);
  // Export copies out what is already on screen, so read-only leaves it
  // operable: the mode restricts editing, not looking.
  const exportSection = section("Export", [
    h("div", { class: "wgd-row" }, [
      button("Export widget JSON", () => exportWidgetJson(store.get())),
      button("Export theme JSON", () => exportThemeJson(store.get())),
      button("Copy as TypeScript", () => toTypeScriptModule(store.get()))
    ]),
    output
  ]);
  exportSection.classList.add("wgd-view-only");
  const element = h("div", { class: "wgd-io" }, [importSection, exportSection]);
  // After assembly: the layer wraps the textarea in place, so the element
  // must already have its parent.
  attachJsonHighlight(output);

  return { element, dispose: () => element.remove() };
}
