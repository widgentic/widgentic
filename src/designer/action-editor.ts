/**
 * Shared editors for the action model: an action DEFINITION (prompt or
 * http) and a BINDING (shared ref or inline definition, plus the input
 * mapping and output mode). The standalone action designer edits
 * definitions; the widget designer binds them to elements and to the
 * widget's `load`. Everything is plain DOM over immutable values, and no
 * network I/O happens here — testing an action is the host's job.
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
import { diagnosticLine, fitSelect, h } from "./dom.js";
import { createSchemaBuilder } from "./schema-builder.js";
import type { SchemaEntry } from "./schema-designer.js";
import { allPaths, schemaAt, schemaType, typesConflict } from "./schema-paths.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

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

function input(value: string, className: string, onCommit: (value: string) => void, placeholder = ""): HTMLInputElement {
  const el = h("input", { type: "text", class: className, placeholder }) as HTMLInputElement;
  el.value = value;
  el.addEventListener("change", () => onCommit(el.value));
  return el;
}

function select(options: { value: string; label?: string }[], value: string, className: string, onChange: (value: string) => void): HTMLSelectElement {
  const el = h("select", { class: className }) as HTMLSelectElement;
  for (const option of options) el.append(h("option", { value: option.value }, [option.label ?? option.value]));
  el.value = value;
  fitSelect(el);
  el.addEventListener("change", () => onChange(el.value));
  return el;
}

/**
 * Path picker: a select over the known paths (plus the current value when
 * it is off-schema) with a "custom…" escape to free text — the template
 * panel's pathControl, for mappings. With no known paths it is a text input.
 */
function pathSelect(
  value: string,
  options: string[],
  onCommit: (path: string) => void,
  placeholder: string,
  className = "wgd-input wgd-rec-value"
): HTMLElement {
  if (options.length === 0) return input(value, className, onCommit, placeholder);
  const sel = h("select", { class: "wgd-select wgd-path" }) as HTMLSelectElement;
  const known = options.includes(value);
  const listed = known || value === "" ? options : [value, ...options];
  if (value === "") sel.append(h("option", { value: "" }, [placeholder]));
  for (const option of listed) {
    sel.append(h("option", { value: option }, [option === value && !known ? `${option} (off-schema)` : option]));
  }
  sel.append(h("option", { value: "__custom__" }, ["custom…"]));
  sel.value = value;
  fitSelect(sel);
  const custom = input(value, className, onCommit, placeholder);
  custom.hidden = true;
  sel.addEventListener("change", () => {
    if (sel.value === "__custom__") {
      custom.hidden = false;
      custom.focus();
      return;
    }
    custom.hidden = true;
    if (sel.value !== "") onCommit(sel.value);
  });
  return h("span", { class: "wgd-pathwrap" }, [sel, custom]);
}

/** Header/query map rows: name, literal-or-secret mode, value. */
function headerMapEditor(
  initial: Record<string, string | { secret: string }> | undefined,
  secretNames: string[],
  labels: { add: string; name: string },
  onChange: (next: Record<string, string | { secret: string }> | undefined) => void
): HTMLElement {
  let current = clone(initial ?? {});
  const element = h("div", { class: "wgd-record wgd-headers" });
  function commit(next: Record<string, string | { secret: string }>): void {
    current = next;
    onChange(Object.keys(current).length > 0 ? current : undefined);
    render();
  }
  function render(): void {
    element.replaceChildren();
    for (const [name, value] of Object.entries(current)) {
      const isSecret = isPlainObject(value);
      const nameInput = input(name, "wgd-input wgd-rec-key", (next) => {
        const entries = Object.entries(current).map(([k, v]) => (k === name ? [next, v] : [k, v]));
        commit(Object.fromEntries(entries));
      }, labels.name);
      const mode = select(
        [{ value: "literal" }, { value: "secret" }],
        isSecret ? "secret" : "literal",
        "wgd-select wgd-attr-mode",
        (next) => commit({ ...current, [name]: next === "secret" ? { secret: secretNames[0] ?? "" } : "" })
      );
      let valueControl: HTMLElement;
      if (isSecret) {
        const names = secretNames.includes(value.secret) ? secretNames : [value.secret, ...secretNames];
        valueControl = select(
          names.map((n) => ({ value: n, label: n === "" ? "(pick a secret)" : n })),
          value.secret,
          "wgd-select wgd-secret",
          (next) => commit({ ...current, [name]: { secret: next } })
        );
      } else {
        valueControl = input(value, "wgd-input wgd-rec-value", (next) => commit({ ...current, [name]: next }), "value");
      }
      const remove = h("button", { class: "wgd-icon", type: "button", title: "Remove" }, ["✕"]);
      remove.addEventListener("click", () => {
        const { [name]: _gone, ...rest } = current;
        commit(rest);
      });
      element.append(h("div", { class: "wgd-rec-row" }, [nameInput, mode, valueControl, remove]));
    }
    const add = h("button", { class: "wgd-button wgd-add", type: "button" }, [labels.add]);
    add.addEventListener("click", () => commit({ ...current, "": "" }));
    element.append(h("div", { class: "wgd-row" }, [add]));
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
      const value = input(
        isBind ? segment.bind : segment,
        "wgd-input wgd-rec-value",
        (next) => {
          const copy = [...current];
          copy[index] = isBind ? { bind: next } : next;
          commit(copy);
        },
        isBind ? "data path" : "text"
      );
      const remove = h("button", { class: "wgd-icon", type: "button", title: "Remove" }, ["✕"]);
      remove.addEventListener("click", () => commit(current.filter((_, i) => i !== index)));
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
  const element = h("div", { class: "wgd-action-definition" });

  function commit(next: ActionDefinition, rerender = true): void {
    current = next;
    onChange(clone(current));
    if (rerender) render();
  }

  function schemaSection(label: string, which: "input" | "output"): HTMLElement {
    const definition = current as HttpActionDefinition;
    const builder = createSchemaBuilder(definition[which] as DataSchema, (schema) => {
      commit({ ...(current as HttpActionDefinition), [which]: schema ?? { type: "object" } }, false);
    });
    const parts: (Node | string)[] = [h("span", { class: "wgd-field-label" }, [label]), builder.element];
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
          if (entry) commit({ ...(current as HttpActionDefinition), [which]: clone(entry.schema) });
        }
      );
      parts.push(
        h("div", { class: "wgd-row" }, [
          copyFrom,
          h("span", { class: "wgd-field-label" }, ["(a copy — later edits to the shared schema do not follow)"])
        ])
      );
    }
    return h("div", { class: "wgd-action-schema" }, parts);
  }

  function render(): void {
    element.replaceChildren();
    const kind = select(
      [{ value: "prompt", label: "prompt — propose a message" }, { value: "http", label: "http — call an API" }],
      current.kind,
      "wgd-select wgd-action-kind",
      (next) => commit(next === "http" ? starterHttpDefinition() : starterPromptDefinition())
    );
    element.append(h("div", { class: "wgd-row" }, [h("span", { class: "wgd-field-label" }, ["Kind"]), kind]));
    if (current.kind === "prompt") {
      element.append(
        h("span", { class: "wgd-field-label" }, ["Message (literals and bound values; the user reviews and sends it)"]),
        segmentsEditor(current.text, (text) => commit({ kind: "prompt", text }, false))
      );
      return;
    }
    const definition = current;
    const method = select(HTTP_METHODS.map((m) => ({ value: m })), definition.method, "wgd-select", (next) =>
      commit({ ...definition, method: next as HttpActionDefinition["method"] })
    );
    const url = input(definition.url, "wgd-input wgd-action-url", (next) => commit({ ...definition, url: next }, false), "https://…");
    element.append(
      h("div", { class: "wgd-row" }, [h("span", { class: "wgd-field-label" }, ["Method"]), method]),
      h("label", { class: "wgd-field" }, [h("span", { class: "wgd-field-label" }, ["URL (https, fixed)"]), url]),
      schemaSection("Input schema (arguments; GET → query, POST → JSON body)", "input"),
      schemaSection("Output schema (the response must satisfy it)", "output"),
      h("span", { class: "wgd-field-label" }, ["Headers"]),
      headerMapEditor(definition.headers, ctx.secretNames ?? [], { add: "+ header", name: "header" }, (headers) => {
        const { headers: _h, ...rest } = current as HttpActionDefinition;
        commit(headers === undefined ? rest as HttpActionDefinition : { ...rest, headers } as HttpActionDefinition, false);
      }),
      h("span", { class: "wgd-field-label" }, ["Fixed query parameters"]),
      headerMapEditor(definition.query, ctx.secretNames ?? [], { add: "+ parameter", name: "parameter" }, (query) => {
        const { query: _q, ...rest } = current as HttpActionDefinition;
        commit(query === undefined ? rest as HttpActionDefinition : { ...rest, query } as HttpActionDefinition, false);
      })
    );
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

const SCOPE_HELPERS = ["$index", "$root.", "$parent."];

/** Editor for a binding: none / shared / inline, input mapping, output mode. */
export function createBindingEditor(
  initial: ActionBinding | undefined,
  ctx: BindingEditorContext,
  onChange: (binding: ActionBinding | undefined) => void
): BindingEditor {
  let current: ActionBinding | undefined = initial === undefined ? undefined : clone(initial);
  const element = h("div", { class: "wgd-binding" });
  const diag = diagnosticLine(undefined);

  function definitionOf(binding: ActionBinding | undefined): ActionDefinition | undefined {
    if (binding === undefined) return undefined;
    if ("ref" in binding && typeof binding.ref === "string") {
      return (ctx.actions ?? []).find((a) => a.name === binding.ref)?.definition;
    }
    return "definition" in binding ? binding.definition : undefined;
  }

  function commit(next: ActionBinding | undefined, rerender = true): void {
    current = next;
    onChange(next === undefined ? undefined : clone(next));
    if (rerender) render();
  }

  function withMapping(binding: ActionBinding, input: InputMapping | undefined, output: OutputBinding | undefined): ActionBinding {
    const head: { ref: string } | { definition: ActionDefinition } =
      "ref" in binding && typeof binding.ref === "string"
        ? { ref: binding.ref }
        : { definition: ("definition" in binding ? binding.definition : starterHttpDefinition()) };
    return {
      ...head,
      ...(input !== undefined && Object.keys(input).length > 0 ? { input } : {}),
      ...(output !== undefined && Object.keys(output).length > 0 ? { output } : {})
    };
  }

  function render(): void {
    element.replaceChildren();
    const shared = (ctx.actions ?? []).filter((a) => !ctx.loadOnly || (a.definition.kind === "http" && a.definition.method === "GET"));
    const mode = current === undefined ? "none" : "ref" in current && typeof current.ref === "string" ? "shared" : "inline";
    const modeSelect = select(
      [{ value: "none", label: ctx.loadOnly ? "no load action" : "no action" }, { value: "shared", label: "shared action" }, { value: "inline", label: "inline definition" }],
      mode,
      "wgd-select wgd-binding-mode",
      (next) => {
        if (next === "none") commit(undefined);
        else if (next === "shared") commit({ ref: shared[0]?.name ?? "" });
        else commit({ definition: starterHttpDefinition() });
      }
    );
    element.append(h("div", { class: "wgd-row" }, [modeSelect]));
    if (current === undefined) return;

    if (mode === "shared") {
      const ref = (current as { ref: string }).ref;
      const names = shared.map((a) => a.name);
      const options = (names.includes(ref) ? names : [ref, ...names]).map((n) => ({ value: n, label: n === "" ? "(pick an action)" : names.includes(n) ? n : `${n} (unknown)` }));
      const refSelect = select(options, ref, "wgd-select wgd-binding-ref", (next) => commit(withMapping({ ref: next }, (current as { input?: InputMapping }).input, (current as { output?: OutputBinding }).output)));
      element.append(h("div", { class: "wgd-row" }, [h("span", { class: "wgd-field-label" }, ["Action"]), refSelect]));
    } else {
      const editor = createDefinitionEditor(definitionOf(current), ctx, (definition) => {
        const binding = current as ActionBinding & { input?: InputMapping; output?: OutputBinding };
        commit(withMapping({ definition }, binding.input, binding.output), false);
      });
      element.append(editor.element);
    }

    const definition = definitionOf(current);
    if (definition?.kind === "http") {
      // Input mapping: one row per declared field, each a data path or a constant.
      const properties = isPlainObject(definition.input.properties) ? Object.keys(definition.input.properties) : [];
      const mapping = clone(((current as { input?: InputMapping }).input ?? {}) as InputMapping);
      const pathOptions = [...(ctx.scopePaths ?? []), ...SCOPE_HELPERS];
      const rows = properties.map((field) => {
        const value = mapping[field];
        const isConst = isPlainObject(value) && "const" in value;
        const kindSelect = select([{ value: "path" }, { value: "const" }], isConst ? "const" : "path", "wgd-select wgd-attr-mode", (next) => {
          const nextMapping = { ...mapping, [field]: next === "const" ? { const: "" } : field };
          commit(withMapping(current as ActionBinding, nextMapping, (current as { output?: OutputBinding }).output));
        });
        const onValue = (next: string): void => {
          let entry: string | { const: unknown };
          if (isConst) {
            try { entry = { const: JSON.parse(next) as unknown }; } catch { entry = { const: next }; }
          } else entry = next;
          const nextMapping = { ...mapping, [field]: entry };
          if (!isConst && next === "") delete nextMapping[field];
          commit(withMapping(current as ActionBinding, nextMapping, (current as { output?: OutputBinding }).output), false);
        };
        const valueInput = isConst
          ? input(JSON.stringify((value as { const: unknown }).const), "wgd-input wgd-rec-value", onValue, "JSON literal")
          : pathSelect(typeof value === "string" ? value : "", pathOptions, onValue, "data path");
        return h("div", { class: "wgd-rec-row" }, [h("span", { class: "wgd-rec-key wgd-binding-field" }, [field]), kindSelect, valueInput]);
      });
      element.append(
        h("span", { class: "wgd-field-label" }, ["Input mapping (field ← data path or constant)"]),
        properties.length > 0 ? h("div", { class: "wgd-record" }, rows) : h("div", { class: "wgd-diagnostic" }, ["The input schema declares no properties."])
      );
      // Output: mode, patch path, map projection.
      const output = clone(((current as { output?: OutputBinding }).output ?? {}) as OutputBinding);
      const modeSel = select(OUTPUT_MODES.map((m) => ({ value: m })), output.mode ?? "merge", "wgd-select", (next) => {
        const nextOutput: OutputBinding = { ...output };
        nextOutput.mode = next as OutputMode;
        if (next !== "patch") delete nextOutput.path;
        commit(withMapping(current as ActionBinding, mapping, nextOutput));
      });
      const outputRow: (Node | string)[] = [h("span", { class: "wgd-field-label" }, ["Output"]), modeSel];
      if ((output.mode ?? "merge") === "patch") {
        const pathInput = input(output.path ?? "", "wgd-input", (next) => commit(withMapping(current as ActionBinding, mapping, { ...output, path: next }), false), "data path to write at");
        outputRow.push(pathInput);
      }
      element.append(h("div", { class: "wgd-row" }, outputRow));
      element.append(outputMapEditor(definition, output, (map) => {
        const nextOutput: OutputBinding = { ...output };
        if (map === undefined) delete nextOutput.map; else nextOutput.map = map;
        commit(withMapping(current as ActionBinding, mapping, nextOutput), false);
      }));
    }
    element.append(diag);
  }

  /**
   * Output projection rows: target (a widget data path, relative to the
   * patch path when that mode is on) ← source (a response path). Both
   * inputs complete from the respective schemas, and a type mismatch is
   * flagged here — at execution it would only surface as INVALID_TYPE.
   */
  function outputMapEditor(
    definition: HttpActionDefinition,
    output: OutputBinding,
    onChange: (map: Record<string, string> | undefined) => void
  ): HTMLElement {
    const container = h("div", { class: "wgd-record wgd-output-map" });
    let map: Record<string, string> = clone(output.map ?? {});
    const widgetSchema = ctx.getDataSchema?.();
    const base = (output.mode ?? "merge") === "patch" && output.path ? output.path : "";
    const targetRoot = base === "" ? widgetSchema : schemaAt(widgetSchema, base);
    const targetOptions = allPaths(targetRoot);
    const sourceOptions = [".", ...allPaths(definition.output)];
    const mismatch = diagnosticLine(undefined);

    function commitMap(next: Record<string, string>): void {
      map = next;
      onChange(Object.keys(map).length > 0 ? map : undefined);
      render();
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
        const targetInput = pathSelect(target, targetOptions, (next) => {
          const entries = Object.entries(map).map(([k, v]) => (k === target ? [next, v] : [k, v]));
          commitMap(Object.fromEntries(entries));
        }, "target data path", "wgd-input wgd-rec-key");
        targetInput.classList.add("wgd-map-target");
        const sourceInput = pathSelect(source, sourceOptions, (next) => commitMap({ ...map, [target]: next }), "response path");
        sourceInput.classList.add("wgd-map-source");
        const remove = h("button", { class: "wgd-icon", type: "button", title: "Remove" }, ["✕"]);
        remove.addEventListener("click", () => {
          const { [target]: _gone, ...rest } = map;
          commitMap(rest);
        });
        container.append(h("div", { class: "wgd-rec-row" }, [targetInput, h("span", { class: "wgd-st-colon" }, ["←"]), sourceInput, remove]));
      }
      const add = h("button", { class: "wgd-button wgd-add", type: "button" }, ["+ projection"]);
      add.addEventListener("click", () => commitMap({ ...map, "": "" }));
      mismatch.hidden = problems.length === 0;
      mismatch.textContent = problems.length === 0 ? "" : `Type mismatch: ${problems.join("; ")}.`;
      mismatch.classList.add("wgd-type-mismatch");
      container.append(h("div", { class: "wgd-row" }, [add]), mismatch);
    }
    render();
    return container;
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
