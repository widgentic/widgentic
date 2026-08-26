/**
 * Standalone action designer: edits a stored-action entry
 * (`{ name, label?, description?, definition }` — the widget-store's
 * shape). Split out like the theme and schema designers. The Test control
 * appears only when the host supplies `options.testCall`: the library
 * performs no network I/O, and a test call must run through the host's
 * production execution path (secrets, SSRF guard, redaction).
 */
import type { ActionDefinition, HttpActionDefinition, StoredAction } from "widgentic/actions";
import { ACTION_NAME, validateActionDefinition } from "widgentic/actions";
import type { DataSchema } from "widgentic/catalog";
import { createDefinitionEditor } from "./action-editor.js";
import { diagnosticLine, h, injectDesignerStyles, section, textField } from "./dom.js";
import { attachJsonHighlight, repaintHighlight } from "./highlight.js";
import { createSchemaForm } from "./schema-form.js";
import type { SchemaEntry } from "./schema-designer.js";

export type ActionEntry = StoredAction;

export interface ActionDesignerOptions {
  initialAction?: ActionEntry;
  appearance?: "auto" | "light" | "dark";
  readOnly?: boolean;
  /** Shared schemas offered as "copy from" sources for input/output. */
  schemas?: SchemaEntry[];
  /** Secret names offered for header/query values. */
  secretNames?: string[];
  /**
   * Host-supplied test call (the production execute path). Without it no
   * Test control renders. Resolves to whatever the host wants shown —
   * typically the redacted response or a structured error.
   */
  testCall?: (definition: HttpActionDefinition, args: Record<string, unknown>) => Promise<unknown>;
}

export type ActionLoadResult = { ok: true } | { ok: false; errors: string[] };

export interface ActionDesignerHandle {
  getAction(): ActionEntry;
  loadAction(entry: unknown): ActionLoadResult;
  setReadOnly(readOnly: boolean): void;
  subscribe(listener: (entry: ActionEntry) => void): () => void;
  dispose(): void;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function starterEntry(): ActionEntry {
  return {
    name: "my-action",
    label: "My action",
    definition: { kind: "prompt", text: ["Tell me more about ", { bind: "title" }] }
  };
}

/** Validate an untrusted entry; errors instead of throwing. */
export function checkActionEntry(entry: unknown): string[] {
  const errors: string[] = [];
  if (!isPlainObject(entry)) return ["Action entry must be an object."];
  if (typeof entry.name !== "string" || !ACTION_NAME.test(entry.name)) {
    errors.push("'name' must be lowercase letters, digits and dashes, starting with a letter (max 64).");
  }
  const problem = validateActionDefinition(entry.definition, "definition");
  if (problem) errors.push(`${problem.message} (at ${problem.path})`);
  return errors;
}

export function createActionDesigner(
  container: Element,
  options: ActionDesignerOptions = {}
): ActionDesignerHandle {
  injectDesignerStyles(document);

  let entry: ActionEntry = options.initialAction
    ? (JSON.parse(JSON.stringify(options.initialAction)) as ActionEntry)
    : starterEntry();
  const listeners = new Set<(entry: ActionEntry) => void>();

  const panels = h("div", { class: "wgd-panels" });
  const root = h("div", { class: "wgd-root wgd-action-designer" }, [panels]);
  if (options.appearance === "light" || options.appearance === "dark") {
    root.setAttribute("data-wgd-theme", options.appearance);
  }
  container.appendChild(root);

  const getEntry = (): ActionEntry => JSON.parse(JSON.stringify(entry)) as ActionEntry;
  function notify(): void {
    for (const listener of [...listeners]) listener(getEntry());
  }

  // --- Identity --------------------------------------------------------
  const identityRefreshers: (() => void)[] = [];
  const nameDiag = diagnosticLine(undefined);
  function identityField(label: string, read: () => string, write: (value: string) => void): HTMLElement {
    const field = textField(label, read(), write);
    const inputEl = field.querySelector("input") as HTMLInputElement;
    identityRefreshers.push(() => {
      if (document.activeElement !== inputEl) inputEl.value = read();
    });
    return field;
  }
  const identity = section("Action", [
    identityField("Name (id)", () => entry.name, (value) => {
      entry = { ...entry, name: value };
      const bad = !ACTION_NAME.test(value);
      nameDiag.hidden = !bad;
      nameDiag.textContent = bad ? "Name must be lowercase letters, digits and dashes, starting with a letter." : "";
      notify();
    }),
    nameDiag,
    identityField("Label", () => entry.label ?? "", (value) => {
      entry = { ...entry, label: value };
      notify();
    }),
    identityField("Description", () => entry.description ?? "", (value) => {
      entry = { ...entry, description: value };
      notify();
    })
  ]);

  // --- Definition: editor + parse-gated JSON -----------------------------
  const definitionDiag = diagnosticLine(undefined);
  const editor = createDefinitionEditor(
    entry.definition,
    { ...(options.schemas ? { schemas: options.schemas } : {}), ...(options.secretNames ? { secretNames: options.secretNames } : {}) },
    (definition) => {
      entry = { ...entry, definition };
      syncJson();
      refreshDefinitionDiag();
      refreshTest();
      notify();
    }
  );
  const jsonError = diagnosticLine(undefined);
  const jsonArea = h("textarea", { class: "wgd-textarea", rows: "12", spellcheck: "false" }) as HTMLTextAreaElement;
  const jsonWrap = h("div", undefined, [jsonArea, jsonError]);
  jsonArea.value = JSON.stringify(entry.definition, null, 2);
  jsonArea.addEventListener("input", () => {
    try {
      const parsed: unknown = JSON.parse(jsonArea.value);
      const problem = validateActionDefinition(parsed, "definition");
      if (problem) throw new Error(`${problem.message} (at ${problem.path})`);
      jsonError.hidden = true;
      jsonError.textContent = "";
      entry = { ...entry, definition: parsed as ActionDefinition };
      editor.setValue(entry.definition);
      refreshDefinitionDiag();
      refreshTest();
      notify();
    } catch (error) {
      jsonError.hidden = false;
      jsonError.textContent = `Invalid (definition keeps the last valid value): ${String((error as Error).message)}`;
    }
  });
  function syncJson(): void {
    if (document.activeElement === jsonArea) return;
    jsonArea.value = JSON.stringify(entry.definition, null, 2);
    repaintHighlight(jsonArea);
  }
  function refreshDefinitionDiag(): void {
    const problem = validateActionDefinition(entry.definition, "definition");
    definitionDiag.hidden = problem === undefined;
    definitionDiag.textContent = problem ? `${problem.message} (at ${problem.path})` : "";
  }
  refreshDefinitionDiag();

  const builderTab = h("button", { class: "wgd-button wgd-tab wgd-tab-active", type: "button" }, ["Editor"]);
  const jsonTab = h("button", { class: "wgd-button wgd-tab", type: "button" }, ["JSON"]);
  jsonWrap.hidden = true;
  builderTab.addEventListener("click", () => {
    editor.element.hidden = false;
    jsonWrap.hidden = true;
    builderTab.classList.add("wgd-tab-active");
    jsonTab.classList.remove("wgd-tab-active");
  });
  jsonTab.addEventListener("click", () => {
    editor.element.hidden = true;
    jsonWrap.hidden = false;
    jsonTab.classList.add("wgd-tab-active");
    builderTab.classList.remove("wgd-tab-active");
    syncJson();
  });
  const definition = section("Definition", [
    h("div", { class: "wgd-row" }, [builderTab, jsonTab]),
    definitionDiag,
    editor.element,
    jsonWrap
  ]);

  // --- Test (host-supplied) ------------------------------------------------
  const testHost = h("div", { class: "wgd-action-test" });
  const testSection = section("Test", [testHost]);
  let testArgs: Record<string, unknown> = {};
  function refreshTest(): void {
    if (options.testCall === undefined) return;
    testHost.replaceChildren();
    if (entry.definition.kind !== "http") {
      testHost.append(h("p", { class: "wgd-diagnostic" }, ["Prompt actions run in the host's composer; nothing to test."]));
      return;
    }
    const definitionNow = entry.definition;
    const form = createSchemaForm(definitionNow.input as DataSchema, testArgs, (value) => {
      testArgs = isPlainObject(value) ? value : {};
    });
    testArgs = isPlainObject(form.getValue()) ? (form.getValue() as Record<string, unknown>) : {};
    const output = h("pre", { class: "wgd-test-output" });
    const run = h("button", { class: "wgd-button wgd-add wgd-test-run", type: "button" }, ["Test call"]) as HTMLButtonElement;
    run.addEventListener("click", () => {
      run.disabled = true;
      output.textContent = "…";
      void options.testCall!(definitionNow, testArgs)
        .then((result) => {
          output.textContent = typeof result === "string" ? result : JSON.stringify(result, null, 2);
        })
        .catch((error: Error) => {
          output.textContent = `Test failed: ${error.message}`;
        })
        .finally(() => {
          run.disabled = false;
        });
    });
    testHost.append(h("span", { class: "wgd-field-label" }, ["Arguments"]), form.element, h("div", { class: "wgd-row" }, [run]), output);
  }
  refreshTest();

  // --- Import / Export ------------------------------------------------------
  const importError = diagnosticLine(undefined);
  const importArea = h("textarea", { class: "wgd-textarea wgd-action-import", rows: "6", spellcheck: "false" }) as HTMLTextAreaElement;
  const importButton = h("button", { class: "wgd-button", type: "button" }, ["Import"]);
  importButton.addEventListener("click", () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(importArea.value);
    } catch (error) {
      importError.hidden = false;
      importError.textContent = `Invalid JSON: ${String((error as Error).message)}`;
      return;
    }
    const result = loadAction(parsed);
    importError.hidden = result.ok;
    importError.textContent = result.ok ? "" : result.errors.join("\n");
  });
  const importSection = section("Import", [
    h("span", { class: "wgd-field-label" }, ["Import action entry JSON ({ name, label?, description?, definition })"]),
    importArea,
    importError,
    h("div", { class: "wgd-row" }, [importButton])
  ]);
  const output = h("textarea", { class: "wgd-textarea", rows: "8", readonly: "", spellcheck: "false" }) as HTMLTextAreaElement;
  const exportButton = h("button", { class: "wgd-button wgd-add", type: "button" }, ["Export action entry"]);
  exportButton.addEventListener("click", () => {
    output.value = JSON.stringify(getEntry(), null, 2);
    repaintHighlight(output);
  });
  const exportSection = section("Export", [h("div", { class: "wgd-toolbar" }, [exportButton]), output]);
  exportSection.classList.add("wgd-view-only");

  panels.append(identity, definition, ...(options.testCall === undefined ? [] : [testSection]), importSection, exportSection);
  attachJsonHighlight(jsonArea);
  attachJsonHighlight(importArea);
  attachJsonHighlight(output);

  function loadAction(input: unknown): ActionLoadResult {
    const errors = checkActionEntry(input);
    if (errors.length > 0) return { ok: false, errors };
    entry = JSON.parse(JSON.stringify(input)) as ActionEntry;
    for (const refresh of identityRefreshers) refresh();
    nameDiag.hidden = true;
    editor.setValue(entry.definition);
    syncJson();
    refreshDefinitionDiag();
    refreshTest();
    notify();
    return { ok: true };
  }

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
    getAction: getEntry,
    loadAction,
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
