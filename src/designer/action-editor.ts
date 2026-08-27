/**
 * Shared editors for the action model: an action DEFINITION (prompt or
 * http) and a BINDING (shared ref or inline definition, plus the input
 * mapping and output mode). The standalone action designer edits
 * definitions; the widget designer binds them to elements and to the
 * widget's `load`. Everything is plain DOM over immutable values, and no
 * network I/O happens here — testing an action is the host's job.
 *
 * Handlers read the editor's live state at event time and a commit
 * re-renders only its own section, so two edits in a row never lose each
 * other and focus survives a commit. Rows without a name (a new header,
 * query parameter or projection) live in editor-local state until they are
 * named; only named rows reach `onChange`.
 */
import type { DataSchema } from "widgentic/catalog";
import type {
  ActionBinding,
  ActionDefinition,
  HttpActionDefinition,
  InputMapping,
  OutputBinding,
  OutputMode,
  PromptSegment,
  StoredAction
} from "widgentic/actions";
import { HTTP_METHODS, OUTPUT_MODES } from "widgentic/actions";
import { clone } from "../shared/clone.js";
import { isPlainObject } from "../shared/plain-object.js";
import { diagnosticLine, fitSelect, h } from "./dom.js";
import { createSchemaBuilder } from "./schema-builder.js";
import type { SchemaEntry } from "./schema-designer.js";
import { allPaths, schemaAt, schemaType, typesConflict } from "./schema-paths.js";

/** The path select's escape hatch to free text. */
const CUSTOM_PATH = "__custom__";

type HeaderValue = string | { secret: string };
type HeaderMap = Record<string, HeaderValue>;
type RefBinding = { ref: string } & Pick<ActionBinding, "input" | "output">;

export interface ActionEditorContext {
  /** Shared schemas offered as "copy from" sources for input/output. */
  schemas?: SchemaEntry[];
  /** Secret names offered for header/query values. */
  secretNames?: string[];
}

export function starterPromptDefinition(): ActionDefinition {
  return { kind: "prompt", text: ["Tell me more about ", { bind: "title" }] };
}

export function starterHttpDefinition(): HttpActionDefinition {
  return {
    kind: "http",
    method: "GET",
    url: "https://api.example.com/resource",
    input: { type: "object", properties: {} },
    output: { type: "object" }
  };
}

function isRefBinding(binding: ActionBinding): binding is RefBinding {
  return "ref" in binding && typeof binding.ref === "string";
}

function textInput(value: string, className: string, onCommit: (value: string) => void, placeholder = ""): HTMLInputElement {
  const el = h("input", { type: "text", class: className, placeholder });
  el.value = value;
  el.addEventListener("change", () => onCommit(el.value));
  return el;
}

function select(options: { value: string; label?: string }[], value: string, className: string, onChange: (value: string) => void): HTMLSelectElement {
  const el = h("select", { class: className });
  for (const option of options) el.append(h("option", { value: option.value }, [option.label ?? option.value]));
  el.value = value;
  fitSelect(el);
  el.addEventListener("change", () => onChange(el.value));
  return el;
}

function label(text: string): HTMLElement {
  return h("span", { class: "wgd-field-label" }, [text]);
}

function removeButton(onClick: () => void): HTMLElement {
  const button = h("button", { class: "wgd-icon", type: "button", title: "Remove" }, ["✕"]);
  button.addEventListener("click", onClick);
  return button;
}

/**
 * Path picker: a select over the known paths (plus the current value when
 * it is off-schema) with a "custom…" escape to free text — the template
 * panel's pathControl, for mappings. The placeholder option clears the
 * value. With no known paths it is a text input.
 */
function pathSelect(
  value: string,
  options: string[],
  onCommit: (path: string) => void,
  placeholder: string,
  className = "wgd-input wgd-rec-value"
): HTMLElement {
  if (options.length === 0) return textInput(value, className, onCommit, placeholder);
  const sel = h("select", { class: "wgd-select wgd-path" });
  const known = options.includes(value);
  const listed = known || value === "" ? options : [value, ...options];
  sel.append(h("option", { value: "" }, [placeholder]));
  for (const option of listed) {
    sel.append(h("option", { value: option }, [option === value && !known ? `${option} (off-schema)` : option]));
  }
  sel.append(h("option", { value: CUSTOM_PATH }, ["custom…"]));
  sel.value = value;
  fitSelect(sel);
  const custom = textInput(value, className, onCommit, placeholder);
  custom.hidden = true;
  sel.addEventListener("change", () => {
    if (sel.value === CUSTOM_PATH) {
      custom.hidden = false;
      custom.focus();
      return;
    }
    custom.hidden = true;
    onCommit(sel.value);
  });
  return h("span", { class: "wgd-pathwrap" }, [sel, custom]);
}

/**
 * Header/query map rows: name, literal-or-secret mode, value. Unnamed rows
 * are editor-local; a rename onto an existing name is flagged, not applied.
 */
function headerMapEditor(
  initial: HeaderMap | undefined,
  secretNames: string[],
  labels: { add: string; name: string },
  onChange: (next: HeaderMap | undefined) => void
): HTMLElement {
  let current: HeaderMap = clone(initial ?? {});
  const pending: { value: HeaderValue }[] = [];
  const element = h("div", { class: "wgd-record wgd-headers" });
  const duplicate = diagnosticLine(undefined);

  function commit(next: HeaderMap): void {
    current = next;
    onChange(Object.keys(current).length > 0 ? current : undefined);
    render();
  }
  function flagDuplicate(name: string): void {
    duplicate.hidden = false;
    duplicate.textContent = `'${name}' is already used; pick another ${labels.name} name.`;
  }
  function valueControl(value: HeaderValue, onValue: (next: HeaderValue) => void): HTMLElement[] {
    const isSecret = isPlainObject(value);
    const mode = select(
      [{ value: "literal" }, { value: "secret" }],
      isSecret ? "secret" : "literal",
      "wgd-select wgd-attr-mode",
      (next) => onValue(next === "secret" ? { secret: secretNames[0] ?? "" } : "")
    );
    if (isSecret) {
      const names = secretNames.includes(value.secret) ? secretNames : [value.secret, ...secretNames];
      const picker = select(
        names.map((n) => ({ value: n, label: n === "" ? "(pick a secret)" : n })),
        value.secret,
        "wgd-select wgd-secret",
        (next) => onValue({ secret: next })
      );
      return [mode, picker];
    }
    return [mode, textInput(value, "wgd-input wgd-rec-value", onValue, "value")];
  }
  function render(): void {
    element.replaceChildren();
    duplicate.hidden = true;
    for (const [name, value] of Object.entries(current)) {
      const nameInput = textInput(name, "wgd-input wgd-rec-key", (next) => {
        if (next === name) return;
        if (next === "" || Object.hasOwn(current, next)) { flagDuplicate(next || "(empty)"); return; }
        const entries = Object.entries(current).map(([k, v]) => (k === name ? [next, v] : [k, v]));
        commit(Object.fromEntries(entries));
      }, labels.name);
      const controls = valueControl(value, (next) => commit({ ...current, [name]: next }));
      const remove = removeButton(() => {
        const { [name]: _gone, ...rest } = current;
        commit(rest);
      });
      element.append(h("div", { class: "wgd-rec-row" }, [nameInput, ...controls, remove]));
    }
    pending.forEach((row, index) => {
      const nameInput = textInput("", "wgd-input wgd-rec-key", (next) => {
        if (next === "") return;
        if (Object.hasOwn(current, next)) { flagDuplicate(next); return; }
        pending.splice(index, 1);
        commit({ ...current, [next]: row.value });
      }, labels.name);
      const controls = valueControl(row.value, (next) => { row.value = next; render(); });
      const remove = removeButton(() => { pending.splice(index, 1); render(); });
      element.append(h("div", { class: "wgd-rec-row wgd-rec-pending" }, [nameInput, ...controls, remove]));
    });
    const add = h("button", { class: "wgd-button wgd-add", type: "button" }, [labels.add]);
    add.addEventListener("click", () => { pending.push({ value: "" }); render(); });
    element.append(h("div", { class: "wgd-row" }, [add]), duplicate);
  }
  render();
  return element;
}

/** Prompt text: ordered literal/bind segments. */
function segmentsEditor(initial: PromptSegment[], onChange: (next: PromptSegment[]) => void): HTMLElement {
  let current = clone(initial);
  const element = h("div", { class: "wgd-record wgd-segments" });
  function commit(next: PromptSegment[]): void {
    current = next;
    onChange(current);
    render();
  }
  function render(): void {
    element.replaceChildren();
    current.forEach((segment, index) => {
      const isBind = typeof segment !== "string";
      const mode = select([{ value: "text" }, { value: "bind" }], isBind ? "bind" : "text", "wgd-select wgd-attr-mode", (next) => {
        const copy = [...current];
        copy[index] = next === "bind" ? { bind: "." } : "";
        commit(copy);
      });
      const value = textInput(
        isBind ? segment.bind : segment,
        "wgd-input wgd-rec-value",
        (next) => {
          const copy = [...current];
          copy[index] = isBind ? { bind: next } : next;
          commit(copy);
        },
        isBind ? "data path" : "text"
      );
      const remove = removeButton(() => commit(current.filter((_, i) => i !== index)));
      element.append(h("div", { class: "wgd-rec-row" }, [mode, value, remove]));
    });
    const addText = h("button", { class: "wgd-button wgd-add", type: "button" }, ["+ text"]);
    addText.addEventListener("click", () => commit([...current, ""]));
    const addBind = h("button", { class: "wgd-button wgd-add", type: "button" }, ["+ bind"]);
    addBind.addEventListener("click", () => commit([...current, { bind: "." }]));
    element.append(h("div", { class: "wgd-row" }, [addText, addBind]));
  }
  render();
  return element;
}

export interface DefinitionEditor {
  element: HTMLElement;
  getValue(): ActionDefinition;
  setValue(definition: ActionDefinition): void;
}

/** Editor for one action definition, either kind. */
export function createDefinitionEditor(
  initial: ActionDefinition | undefined,
  ctx: ActionEditorContext,
  onChange: (definition: ActionDefinition) => void
): DefinitionEditor {
  let current: ActionDefinition = clone(initial ?? starterPromptDefinition());
  const headEl = h("div", { class: "wgd-action-head" });
  const schemasEl = h("div", { class: "wgd-action-schemas" });
  const mapsEl = h("div", { class: "wgd-action-maps" });
  const element = h("div", { class: "wgd-action-definition" }, [headEl, schemasEl, mapsEl]);

  /** The live http definition; handlers call this at event time, never a render-time copy. */
  function http(): HttpActionDefinition {
    return current as HttpActionDefinition;
  }

  function commit(next: ActionDefinition, rerender: "all" | "schemas" | "none"): void {
    current = next;
    onChange(clone(current));
    if (rerender === "all") render();
    else if (rerender === "schemas") renderSchemas();
  }

  function schemaSection(title: string, which: "input" | "output"): HTMLElement {
    const builder = createSchemaBuilder(http()[which] as DataSchema, (schema) => {
      commit({ ...http(), [which]: schema ?? { type: "object" } }, "none");
    });
    const parts: (Node | string)[] = [label(title), builder.element];
    const shared = ctx.schemas ?? [];
    if (shared.length > 0) {
      // Actions store their schemas INLINE (a contract must not drift when a
      // shared schema is edited), so this is a copy — and says so.
      const copyFrom = select(
        [{ value: "", label: "copy a shared schema into this action…" }, ...shared.map((s) => ({ value: s.name }))],
        "",
        "wgd-select",
        (name) => {
          const entry = shared.find((s) => s.name === name);
          if (entry) commit({ ...http(), [which]: clone(entry.schema) }, "schemas");
        }
      );
      parts.push(h("div", { class: "wgd-row" }, [copyFrom, label("(a copy — later edits to the shared schema do not follow)")]));
    }
    return h("div", { class: "wgd-action-schema" }, parts);
  }

  function renderHead(): void {
    headEl.replaceChildren();
    const kind = select(
      [{ value: "prompt", label: "prompt — propose a message" }, { value: "http", label: "http — call an API" }],
      current.kind,
      "wgd-select wgd-action-kind",
      (next) => commit(next === "http" ? starterHttpDefinition() : starterPromptDefinition(), "all")
    );
    headEl.append(h("div", { class: "wgd-row" }, [label("Kind"), kind]));
    if (current.kind === "prompt") {
      headEl.append(
        label("Message (literals and bound values; the user reviews and sends it)"),
        segmentsEditor(current.text, (text) => commit({ kind: "prompt", text }, "none"))
      );
      return;
    }
    const method = select(HTTP_METHODS.map((m) => ({ value: m })), current.method, "wgd-select", (next) =>
      commit({ ...http(), method: next as HttpActionDefinition["method"] }, "none")
    );
    const url = textInput(current.url, "wgd-input wgd-action-url", (next) => commit({ ...http(), url: next }, "none"), "https://…");
    headEl.append(
      h("div", { class: "wgd-row" }, [label("Method"), method]),
      h("label", { class: "wgd-field" }, [label("URL (https, fixed)"), url])
    );
  }

  function renderSchemas(): void {
    schemasEl.replaceChildren();
    if (current.kind !== "http") return;
    schemasEl.append(
      schemaSection("Input schema (arguments; GET → query, POST → JSON body)", "input"),
      schemaSection("Output schema (the response must satisfy it)", "output")
    );
  }

  function renderMaps(): void {
    mapsEl.replaceChildren();
    if (current.kind !== "http") return;
    const secretNames = ctx.secretNames ?? [];
    mapsEl.append(
      label("Headers"),
      headerMapEditor(current.headers, secretNames, { add: "+ header", name: "header" }, (headers) => {
        const { headers: _h, ...rest } = http();
        commit(headers === undefined ? rest : { ...rest, headers }, "none");
      }),
      label("Fixed query parameters"),
      headerMapEditor(current.query, secretNames, { add: "+ parameter", name: "parameter" }, (query) => {
        const { query: _q, ...rest } = http();
        commit(query === undefined ? rest : { ...rest, query }, "none");
      })
    );
  }

  function render(): void {
    renderHead();
    renderSchemas();
    renderMaps();
  }
  render();
  return {
    element,
    getValue: () => clone(current),
    setValue(definition) {
      current = clone(definition);
      render();
    }
  };
}

export interface BindingEditorContext extends ActionEditorContext {
  /** Shared actions offered by name. */
  actions?: StoredAction[];
  /** Data paths in scope at the bound element, offered as completions. */
  scopePaths?: string[];
  /** The widget's effective data schema (inline or resolved ref) — drives output-map targets and type checks. */
  getDataSchema?: () => DataSchema | undefined;
  /** `load` bindings: http GET only, no prompt. */
  loadOnly?: boolean;
}

export interface BindingEditor {
  element: HTMLElement;
  setValue(binding: ActionBinding | undefined): void;
}

/** Editor for a binding: none / shared / inline, input mapping, output mode. */
export function createBindingEditor(
  initial: ActionBinding | undefined,
  ctx: BindingEditorContext,
  onChange: (binding: ActionBinding | undefined) => void
): BindingEditor {
  let current: ActionBinding | undefined = initial === undefined ? undefined : clone(initial);
  const headEl = h("div", { class: "wgd-binding-head" });
  const inputEl = h("div", { class: "wgd-binding-input" });
  const outputEl = h("div", { class: "wgd-binding-output" });
  const element = h("div", { class: "wgd-binding" }, [headEl, inputEl, outputEl]);

  function definitionOf(binding: ActionBinding | undefined): ActionDefinition | undefined {
    if (binding === undefined) return undefined;
    if (isRefBinding(binding)) return (ctx.actions ?? []).find((a) => a.name === binding.ref)?.definition;
    return binding.definition;
  }
  const inputOf = (): InputMapping => clone(current?.input ?? {});
  const outputOf = (): OutputBinding => clone(current?.output ?? {});

  function commit(next: ActionBinding | undefined, rerender: "all" | "io" | "input" | "output" | "none"): void {
    current = next;
    onChange(next === undefined ? undefined : clone(next));
    if (rerender === "all") render();
    else if (rerender === "io") { renderInput(); renderOutput(); }
    else if (rerender === "input") renderInput();
    else if (rerender === "output") renderOutput();
  }

  function withMapping(binding: ActionBinding, input: InputMapping | undefined, output: OutputBinding | undefined): ActionBinding {
    const head: { ref: string } | { definition: ActionDefinition } = isRefBinding(binding)
      ? { ref: binding.ref }
      : { definition: binding.definition };
    return {
      ...head,
      ...(input !== undefined && Object.keys(input).length > 0 ? { input } : {}),
      ...(output !== undefined && Object.keys(output).length > 0 ? { output } : {})
    };
  }

  /** Helper completions are complete paths: the scope markers alone, plus every root path. */
  function helperPaths(): string[] {
    const root = allPaths(ctx.getDataSchema?.()).map((p) => `$root.${p}`);
    return ["$index", "$parent", "$root", ...root];
  }

  function renderHead(): void {
    headEl.replaceChildren();
    const shared = (ctx.actions ?? []).filter((a) => !ctx.loadOnly || (a.definition.kind === "http" && a.definition.method === "GET"));
    const mode = current === undefined ? "none" : isRefBinding(current) ? "shared" : "inline";
    const modeSelect = select(
      [{ value: "none", label: ctx.loadOnly ? "no load action" : "no action" }, { value: "shared", label: "shared action" }, { value: "inline", label: "inline definition" }],
      mode,
      "wgd-select wgd-binding-mode",
      (next) => {
        if (next === "none") commit(undefined, "all");
        else if (next === "shared") commit({ ref: shared[0]?.name ?? "" }, "all");
        else commit({ definition: starterHttpDefinition() }, "all");
      }
    );
    headEl.append(h("div", { class: "wgd-row" }, [modeSelect]));
    if (current === undefined) return;
    if (isRefBinding(current)) {
      const ref = current.ref;
      const names = shared.map((a) => a.name);
      const options = (names.includes(ref) ? names : [ref, ...names]).map((n) => ({ value: n, label: n === "" ? "(pick an action)" : names.includes(n) ? n : `${n} (unknown)` }));
      const refSelect = select(options, ref, "wgd-select wgd-binding-ref", (next) =>
        commit(withMapping({ ref: next }, inputOf(), outputOf()), "io")
      );
      headEl.append(h("div", { class: "wgd-row" }, [label("Action"), refSelect]));
      return;
    }
    const editor = createDefinitionEditor(current.definition, ctx, (definition) => {
      // The definition's schemas drive the mapping rows; the head keeps focus.
      commit(withMapping({ definition }, inputOf(), outputOf()), "io");
    });
    headEl.append(editor.element);
  }

  function renderInput(): void {
    inputEl.replaceChildren();
    const definition = definitionOf(current);
    if (current === undefined || definition?.kind !== "http") return;
    const binding = current;
    // Input mapping: one row per declared field, each a data path or a constant.
    const properties = isPlainObject(definition.input.properties) ? Object.keys(definition.input.properties) : [];
    // No element scope supplied (the widget-level `load`): the root data paths ARE the scope.
    const scopePaths = ctx.scopePaths ?? allPaths(ctx.getDataSchema?.());
    const pathOptions = [...new Set([...scopePaths, ...helperPaths()])];
    const mapping = inputOf();
    const rows = properties.map((field) => {
      const value = mapping[field];
      const isConst = isPlainObject(value) && "const" in value;
      const kindSelect = select([{ value: "path" }, { value: "const" }], isConst ? "const" : "path", "wgd-select wgd-attr-mode", (next) => {
        commit(withMapping(binding, { ...inputOf(), [field]: next === "const" ? { const: "" } : field }, outputOf()), "input");
      });
      const onValue = (next: string): void => {
        const nextMapping = inputOf();
        if (isConst) {
          let literal: unknown;
          try { literal = JSON.parse(next); } catch { literal = next; }
          nextMapping[field] = { const: literal };
        } else if (next === "") {
          delete nextMapping[field];
        } else {
          nextMapping[field] = next;
        }
        commit(withMapping(binding, nextMapping, outputOf()), "none");
      };
      const valueInput = isConst
        ? textInput(JSON.stringify(value.const), "wgd-input wgd-rec-value", onValue, "JSON literal")
        : pathSelect(typeof value === "string" ? value : "", pathOptions, onValue, "data path");
      return h("div", { class: "wgd-rec-row" }, [h("span", { class: "wgd-rec-key wgd-binding-field" }, [field]), kindSelect, valueInput]);
    });
    inputEl.append(
      label("Input mapping (field ← data path or constant)"),
      properties.length > 0 ? h("div", { class: "wgd-record" }, rows) : h("div", { class: "wgd-diagnostic" }, ["The input schema declares no properties."])
    );
  }

  function renderOutput(): void {
    outputEl.replaceChildren();
    const definition = definitionOf(current);
    if (current === undefined || definition?.kind !== "http") return;
    const binding = current;
    const output = outputOf();
    const mode = output.mode ?? "merge";
    const modeSel = select(OUTPUT_MODES.map((m) => ({ value: m })), mode, "wgd-select", (next) => {
      const nextOutput: OutputBinding = { ...outputOf(), mode: next as OutputMode };
      if (next !== "patch") delete nextOutput.path;
      commit(withMapping(binding, inputOf(), nextOutput), "output");
    });
    const outputRow: (Node | string)[] = [label("Output"), modeSel];
    if (mode === "patch") {
      outputRow.push(textInput(output.path ?? "", "wgd-input", (next) => {
        commit(withMapping(binding, inputOf(), { ...outputOf(), path: next }), "output");
      }, "data path to write at"));
    }
    outputEl.append(h("div", { class: "wgd-row" }, outputRow));
    outputEl.append(outputMapEditor(definition, output, (map) => {
      const nextOutput = outputOf();
      if (map === undefined) delete nextOutput.map; else nextOutput.map = map;
      commit(withMapping(binding, inputOf(), nextOutput), "none");
    }));
  }

  /**
   * Output projection rows: target (a widget data path, relative to the
   * patch path when that mode is on) ← source (a response path). Both
   * inputs complete from the respective schemas, and a type mismatch is
   * flagged here — at execution it would only surface as INVALID_TYPE.
   * Unnamed rows are editor-local until they get a target.
   */
  function outputMapEditor(
    definition: HttpActionDefinition,
    output: OutputBinding,
    onMap: (map: Record<string, string> | undefined) => void
  ): HTMLElement {
    const container = h("div", { class: "wgd-record wgd-output-map" });
    let map: Record<string, string> = clone(output.map ?? {});
    const pending: { source: string }[] = [];
    const widgetSchema = ctx.getDataSchema?.();
    const base = (output.mode ?? "merge") === "patch" && output.path ? output.path : "";
    const targetRoot = base === "" ? widgetSchema : schemaAt(widgetSchema, base);
    const targetOptions = allPaths(targetRoot);
    const sourceOptions = [".", ...allPaths(definition.output)];
    const mismatch = diagnosticLine(undefined);
    mismatch.classList.add("wgd-type-mismatch");

    function commitMap(next: Record<string, string>): void {
      map = next;
      onMap(Object.keys(map).length > 0 ? map : undefined);
      render();
    }
    function flag(text: string): void {
      mismatch.hidden = false;
      mismatch.textContent = text;
    }
    function targetControl(target: string, onTarget: (next: string) => void): HTMLElement {
      const control = pathSelect(target, targetOptions, onTarget, "target data path", "wgd-input wgd-rec-key");
      control.classList.add("wgd-map-target");
      return control;
    }
    function render(): void {
      container.replaceChildren();
      const problems: string[] = [];
      for (const [target, source] of Object.entries(map)) {
        const targetType = schemaType(schemaAt(targetRoot, target));
        const sourceType = schemaType(schemaAt(definition.output, source));
        if (typesConflict(sourceType, targetType)) {
          problems.push(`'${source}' is ${sourceType} in the response but '${base ? `${base}.` : ""}${target}' is ${targetType} in the widget schema`);
        }
        const targetInput = targetControl(target, (next) => {
          if (next === target) return;
          if (next === "" || Object.hasOwn(map, next)) { flag(`'${next || "(empty)"}' is already a projection target.`); return; }
          const entries = Object.entries(map).map(([k, v]) => (k === target ? [next, v] : [k, v]));
          commitMap(Object.fromEntries(entries));
        });
        const sourceInput = pathSelect(source, sourceOptions, (next) => commitMap({ ...map, [target]: next }), "response path");
        sourceInput.classList.add("wgd-map-source");
        const remove = removeButton(() => {
          const { [target]: _gone, ...rest } = map;
          commitMap(rest);
        });
        container.append(h("div", { class: "wgd-rec-row" }, [targetInput, h("span", { class: "wgd-st-colon" }, ["←"]), sourceInput, remove]));
      }
      pending.forEach((row, index) => {
        const targetInput = targetControl("", (next) => {
          if (next === "") return;
          if (Object.hasOwn(map, next)) { flag(`'${next}' is already a projection target.`); return; }
          pending.splice(index, 1);
          commitMap({ ...map, [next]: row.source });
        });
        const sourceInput = pathSelect(row.source, sourceOptions, (next) => { row.source = next; render(); }, "response path");
        sourceInput.classList.add("wgd-map-source");
        const remove = removeButton(() => { pending.splice(index, 1); render(); });
        container.append(h("div", { class: "wgd-rec-row wgd-rec-pending" }, [targetInput, h("span", { class: "wgd-st-colon" }, ["←"]), sourceInput, remove]));
      });
      const add = h("button", { class: "wgd-button wgd-add", type: "button" }, ["+ projection"]);
      add.addEventListener("click", () => { pending.push({ source: "" }); render(); });
      mismatch.hidden = problems.length === 0;
      mismatch.textContent = problems.length === 0 ? "" : `Type mismatch: ${problems.join("; ")}.`;
      container.append(h("div", { class: "wgd-row" }, [add]), mismatch);
    }
    render();
    return container;
  }

  function render(): void {
    renderHead();
    renderInput();
    renderOutput();
  }
  render();
  return {
    element,
    setValue(binding) {
      current = binding === undefined ? undefined : clone(binding);
      render();
    }
  };
}
