/**
 * Template editing: a structured node tree and a JSON source pane — two
 * projections of one canonical model (the draft's template). The JSON
 * pane is parse-gated (invalid JSON never reaches the store; last valid
 * wins); structural edits from either side may still fail
 * `validateTemplate`, which surfaces as diagnostics pinned to the node
 * path without ever losing the draft.
 */
import type { DataSchema } from "widgentic/catalog";
import type { WidgetTemplate } from "widgentic/templates";
import type { ActionBinding, StoredAction } from "widgentic/actions";
import { createBindingEditor } from "./action-editor.js";
import type { SchemaEntry } from "./schema-designer.js";
import { collectPaths, schemaType } from "./schema-paths.js";
import { effectiveDataSchema } from "./validate.js";
import { diagnosticLine, fitSelect, h, menuButton } from "./dom.js";
import { createRecordEditor } from "./record-editor.js";
import { attachJsonHighlight, repaintHighlight } from "./highlight.js";
import type { DraftStore, WidgetDraft } from "./store.js";
import type { DesignerDiagnostics } from "./validate.js";

type Path = (string | number)[];

/** What a data path is being used for — decides which paths are offered. */
type PathUse = "bind" | "each" | "when";

/** Paths worth offering for a given use. */
function pathOptions(scope: unknown, use: PathUse): string[] {
  const entries: { path: string; schema: unknown }[] = [];
  collectPaths(scope, "", entries);
  const scalars = new Set([
    "string",
    "number",
    "integer",
    "boolean",
    "null",
    undefined
  ]);
  const filtered = entries.filter(({ schema }) => {
    const type = schemaType(schema);
    if (use === "each") return type === "array";
    if (use === "bind") return scalars.has(type);
    return true; // `when` tests truthiness of anything
  });
  const paths = filtered.map((entry) => entry.path);
  // "." is the scope itself — the item inside an each over scalars.
  if (use !== "each" && scalars.has(schemaType(scope))) paths.unshift(".");
  return paths;
}

/** Schema in effect inside `each: <path>` — the array's item schema. */
function itemScope(scope: unknown, eachPath: string): unknown {
  if (!isPlainObject(scope) || eachPath === ".") return undefined;
  let current: unknown = scope;
  for (const segment of eachPath.split(".")) {
    if (!isPlainObject(current) || !isPlainObject(current.properties)) return undefined;
    current = current.properties[segment];
  }
  return isPlainObject(current) && schemaType(current) === "array"
    ? current.items
    : undefined;
}

const REMOVE = Symbol("remove");

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pathString(path: Path): string {
  let out = "";
  for (const step of path) {
    const segment = typeof step === "number" ? `children.${step}` : step;
    out = out === "" ? segment : `${out}.${segment}`;
  }
  return out;
}

/** Immutable set/remove at a node path (numbers index `children`). */
function setNode(node: unknown, path: Path, next: unknown): unknown {
  if (path.length === 0) return next === REMOVE ? undefined : next;
  const [step, ...rest] = path as [string | number, ...Path];
  if (typeof step === "number") {
    if (!isPlainObject(node) || !Array.isArray(node.children)) return node;
    const children = [...(node.children as unknown[])];
    if (rest.length === 0 && next === REMOVE) {
      children.splice(step, 1);
    } else {
      children[step] = setNode(children[step], rest, next);
    }
    return { ...node, children };
  }
  if (!isPlainObject(node)) return node;
  if (rest.length === 0 && next === REMOVE) {
    const { [step]: _removed, ...remaining } = node;
    return remaining;
  }
  return { ...node, [step]: setNode(node[step], rest, next) };
}

function swapChildren(root: unknown, parent: Path, a: number, b: number): unknown {
  const holder = parent.length === 0 ? root : getNode(root, parent);
  if (!isPlainObject(holder) || !Array.isArray(holder.children)) return root;
  const children = [...(holder.children as unknown[])];
  if (a < 0 || b < 0 || a >= children.length || b >= children.length) return root;
  const [x, y] = [children[a], children[b]];
  children[a] = y;
  children[b] = x;
  const swapped = { ...holder, children };
  return parent.length === 0 ? swapped : setNode(root, parent, swapped);
}

function getNode(node: unknown, path: Path): unknown {
  let current = node;
  for (const step of path) {
    if (!isPlainObject(current)) return undefined;
    current =
      typeof step === "number"
        ? Array.isArray(current.children)
          ? (current.children as unknown[])[step]
          : undefined
        : current[step];
  }
  return current;
}

const NODE_PRESETS: Record<string, () => unknown> = {
  text: () => "text",
  bind: () => ({ bind: "." }),
  element: () => ({ tag: "div", children: [] }),
  each: () => ({ each: ".", template: "item" }),
  when: () => ({ when: ".", template: "shown" })
};

/** What element bindings can reach: shared actions, secrets, schemas. */
export interface TemplateActionContext {
  actions: StoredAction[];
  secretNames: string[];
  schemas: SchemaEntry[];
}

export function mountTemplatePanel(
  store: DraftStore,
  refreshers: ((draft: WidgetDraft) => void)[],
  actionContext: TemplateActionContext = { actions: [], secretNames: [], schemas: [] }
): {
  element: HTMLElement;
  refresh(draft: WidgetDraft, diagnostics: DesignerDiagnostics): void;
  dispose(): void;
} {
  const treeHost = h("div", { class: "wgd-tree" });
  const jsonError = diagnosticLine(undefined);
  const jsonArea = h("textarea", {
    class: "wgd-textarea wgd-template-json",
    rows: "14",
    spellcheck: "false"
  }) as HTMLTextAreaElement;
  const jsonWrap = h("div", undefined, [jsonArea, jsonError]);
  attachJsonHighlight(jsonArea);
  jsonWrap.hidden = true;

  const treeTab = h("button", { class: "wgd-button", type: "button" }, ["Tree"]);
  const jsonTab = h("button", { class: "wgd-button", type: "button" }, ["JSON"]);
  treeTab.addEventListener("click", () => {
    treeHost.hidden = false;
    jsonWrap.hidden = true;
  });
  jsonTab.addEventListener("click", () => {
    treeHost.hidden = true;
    jsonWrap.hidden = false;
  });

  const templateDiag = diagnosticLine(undefined);
  const element = h("details", { class: "wgd-section", open: "" }, [
    h("summary", { class: "wgd-section-title" }, ["Template"]),
    h("div", { class: "wgd-section-body" }, [
      h("div", { class: "wgd-row" }, [treeTab, jsonTab]),
      templateDiag,
      treeHost,
      jsonWrap
    ])
  ]);

  function commit(next: unknown): void {
    store.update((draft) => ({ ...draft, template: next as WidgetTemplate }));
  }

  function commitAt(path: Path, next: unknown): void {
    commit(setNode(store.get().template, path, next));
  }

  // --- JSON pane: parse-gated projection --------------------------------
  jsonArea.addEventListener("input", () => {
    try {
      const parsed: unknown = JSON.parse(jsonArea.value);
      jsonError.hidden = true;
      jsonError.textContent = "";
      commit(parsed);
    } catch (error) {
      jsonError.hidden = false;
      jsonError.textContent = `Invalid JSON (template keeps the last valid value): ${String(
        (error as Error).message
      )}`;
    }
  });

  // --- Tree editor -------------------------------------------------------
  function changeInput(
    value: string,
    onCommit: (value: string) => void,
    className = "wgd-input wgd-node-value"
  ): HTMLInputElement {
    const input = h("input", { type: "text", class: className }) as HTMLInputElement;
    input.value = value;
    input.addEventListener("change", () => onCommit(input.value));
    return input;
  }

  /**
   * Collapse state, keyed by node path so it survives the full re-render
   * every draft edit triggers. Paths shift when siblings move or vanish —
   * an accepted approximation, exactly like text-editor fold markers.
   */
  const collapsedPaths = new Set<string>();

  /**
   * One node = one header row: chevron, badge, the node's own value
   * control(s), then add/move/remove icons (revealed on hover). Sub-
   * structure (attrs, children, slots) nests below and folds away when
   * the node is collapsed; a muted summary keeps the hidden shape legible.
   */
  function nodeShell(
    /** Omitted for elements — their tag select already names the node. */
    badge: string | undefined,
    path: Path,
    inline: (Node | string)[],
    body: (Node | string)[],
    errorText: string | undefined,
    removable: boolean,
    moves?: { parent: Path; index: number; count: number },
    extras?: { icons?: (Node | string)[]; summary?: string }
  ): HTMLElement {
    const key = pathString(path);
    const collapsible = body.length > 0;
    const isCollapsed = collapsible && collapsedPaths.has(key);
    let chevron: HTMLElement;
    if (collapsible) {
      chevron = h(
        "button",
        {
          class: "wgd-chevron",
          type: "button",
          title: isCollapsed ? "Expand" : "Collapse"
        },
        [isCollapsed ? "▸" : "▾"]
      );
      chevron.addEventListener("click", () => {
        if (isCollapsed) collapsedPaths.delete(key);
        else collapsedPaths.add(key);
        renderTree();
      });
    } else {
      // Every row reserves the chevron column so values align.
      chevron = h("span", { class: "wgd-chevron wgd-chevron-none" });
    }
    const header: (Node | string)[] =
      badge === undefined
        ? [chevron, ...inline]
        : [chevron, h("span", { class: "wgd-node-badge" }, [badge]), ...inline];
    if (isCollapsed && extras?.summary !== undefined) {
      header.push(h("span", { class: "wgd-node-summary" }, [extras.summary]));
    }
    const icons: (Node | string)[] = [...(extras?.icons ?? [])];
    if (moves && moves.count > 1) {
      if (moves.index > 0) {
        const up = h("button", { class: "wgd-icon", type: "button", title: "Move up" }, ["↑"]);
        up.addEventListener("click", () =>
          commit(swapChildren(store.get().template, moves.parent, moves.index, moves.index - 1))
        );
        icons.push(up);
      }
      if (moves.index < moves.count - 1) {
        const down = h("button", { class: "wgd-icon", type: "button", title: "Move down" }, ["↓"]);
        down.addEventListener("click", () =>
          commit(swapChildren(store.get().template, moves.parent, moves.index, moves.index + 1))
        );
        icons.push(down);
      }
    }
    if (removable) {
      const remove = h("button", { class: "wgd-icon", type: "button", title: "Remove" }, ["✕"]);
      remove.addEventListener("click", () =>
        path.length === 0 ? commit("") : commitAt(path, REMOVE)
      );
      icons.push(remove);
    }
    if (icons.length > 0) {
      header.push(h("span", { class: "wgd-node-icons" }, icons));
    }
    const children: (Node | string)[] = [h("div", { class: "wgd-node-row" }, header)];
    // Diagnostics stay visible even on a collapsed node — folding must
    // never hide an error.
    if (errorText !== undefined) children.push(diagnosticLine(errorText));
    if (!isCollapsed) children.push(...body);
    return h("div", { class: "wgd-node", "data-path": key }, children);
  }

  /** Tags the built-in styles and typical widget markup actually use. */
  const TAG_OPTIONS = [
    "div", "span", "p", "section", "article", "header", "footer",
    "h1", "h2", "h3", "h4", "strong", "em", "small", "code", "pre",
    "ul", "ol", "li", "dl", "dt", "dd",
    "table", "thead", "tbody", "tr", "th", "td",
    "img", "a", "figure", "figcaption", "hr", "br", "label"
  ];

  /**
   * Data-path control. With a schema in scope it is a select of the paths
   * that scope actually offers (plus the current value if it is off-schema,
   * and a custom escape); without one it stays a free-text input.
   */
  function pathControl(
    value: string,
    scope: unknown,
    use: PathUse,
    onCommit: (path: string) => void,
    className = "wgd-input wgd-node-value"
  ): HTMLElement {
    const options = isPlainObject(scope) ? pathOptions(scope, use) : [];
    if (options.length === 0) {
      return changeInput(value, onCommit, className);
    }
    const select = h("select", { class: "wgd-select wgd-path" }) as HTMLSelectElement;
    const known = options.includes(value);
    for (const option of known ? options : [value, ...options]) {
      select.append(
        h("option", { value: option }, [
          option === value && !known ? `${option} (off-schema)` : option
        ])
      );
    }
    select.append(h("option", { value: "__custom__" }, ["custom…"]));
    select.value = value;
    fitSelect(select);
    const custom = changeInput(value, onCommit, className);
    custom.hidden = true;
    select.addEventListener("change", () => {
      if (select.value === "__custom__") {
        custom.hidden = false;
        custom.focus();
        return;
      }
      custom.hidden = true;
      onCommit(select.value);
    });
    // The wrap carries the row-shape marker (e.g. wgd-attr-value) so rows
    // read the same whether the value is a select or free text.
    const marker = className.includes("wgd-attr-value") ? " wgd-attr-value" : "";
    return h("span", { class: `wgd-pathwrap${marker}` }, [select, custom]);
  }

  function tagControl(tag: string, onCommit: (tag: string) => void): HTMLElement {
    const select = h("select", { class: "wgd-select wgd-tag" }) as HTMLSelectElement;
    const options = TAG_OPTIONS.includes(tag) ? TAG_OPTIONS : [tag, ...TAG_OPTIONS];
    for (const option of options) {
      select.append(h("option", { value: option }, [option]));
    }
    select.append(h("option", { value: "__custom__" }, ["custom…"]));
    select.value = tag;
    fitSelect(select);
    const custom = changeInput(tag, onCommit, "wgd-input wgd-tag-custom");
    custom.hidden = true;
    select.addEventListener("change", () => {
      if (select.value === "__custom__") {
        custom.hidden = false;
        custom.focus();
        return;
      }
      custom.hidden = true;
      onCommit(select.value);
    });
    return h("span", { class: "wgd-tagwrap" }, [select, custom]);
  }

  function slotEditor(
    label: string,
    parentPath: Path,
    slot: "template" | "empty" | "else",
    node: unknown,
    required: boolean,
    errorPath: string | undefined,
    scope: unknown
  ): HTMLElement {
    const slotPath = [...parentPath, slot];
    if (node === undefined) {
      const menu = menuButton(
        `+ ${label}`,
        `Set '${label}' to a node`,
        Object.keys(NODE_PRESETS),
        (name) => {
          const preset = NODE_PRESETS[name];
          if (preset) commitAt(slotPath, preset());
        }
      );
      return required
        ? h("div", { class: "wgd-slot" }, [
            diagnosticLine(`Missing required '${label}'.`),
            menu
          ])
        : h("div", { class: "wgd-slot wgd-slot-unset" }, [menu]);
    }
    return h("div", { class: "wgd-slot" }, [
      h("span", { class: "wgd-slot-label" }, [label]),
      renderNode(node, slotPath, errorPath, !required, undefined, scope)
    ]);
  }

  function renderNode(
    node: unknown,
    path: Path,
    errorPath: string | undefined,
    removable = true,
    moves?: { parent: Path; index: number; count: number },
    scope?: unknown
  ): HTMLElement {
    const here = pathString(path);
    const errorHere =
      errorPath !== undefined &&
      (errorPath === here ||
        ((errorPath.startsWith(here === "" ? "attrs." : `${here}.attrs.`) ||
          errorPath.startsWith(here === "" ? "action" : `${here}.action`)) &&
          isPlainObject(node) &&
          typeof node.tag === "string"))
        ? currentError
        : undefined;

    if (typeof node === "string") {
      return nodeShell(
        "text",
        path,
        [changeInput(node, (value) => commitAt(path, value))],
        [],
        errorHere,
        removable,
        moves
      );
    }
    if (!isPlainObject(node)) {
      return nodeShell(
        "invalid",
        path,
        [h("code", undefined, [JSON.stringify(node)])],
        [],
        errorHere ?? "Not a template node.",
        removable,
        moves
      );
    }
    if (typeof node.bind === "string") {
      return nodeShell(
        "bind",
        path,
        [
          pathControl(node.bind, scope, "bind", (value) =>
            commitAt(path, { bind: value })
          )
        ],
        [],
        errorHere,
        removable,
        moves
      );
    }
    if (typeof node.each === "string") {
      return nodeShell(
        "each",
        path,
        [
          pathControl(node.each, scope, "each", (value) =>
            commitAt(path, { ...node, each: value })
          )
        ],
        [
          // Inside an each, the scope becomes the array's item schema.
          slotEditor(
            "template",
            path,
            "template",
            node.template,
            true,
            errorPath,
            itemScope(scope, node.each)
          ),
          slotEditor(
            "empty",
            path,
            "empty",
            node.empty,
            false,
            errorPath,
            scope
          )
        ],
        errorHere,
        removable,
        moves,
        { summary: node.empty !== undefined ? "template · empty" : "template" }
      );
    }
    if (typeof node.when === "string") {
      return nodeShell(
        "when",
        path,
        [
          pathControl(node.when, scope, "when", (value) =>
            commitAt(path, { ...node, when: value })
          )
        ],
        [
          slotEditor("template", path, "template", node.template, true, errorPath, scope),
          slotEditor("else", path, "else", node.else, false, errorPath, scope)
        ],
        errorHere,
        removable,
        moves,
        { summary: node.else !== undefined ? "template · else" : "template" }
      );
    }
    if (typeof node.tag === "string") {
      const attrs = isPlainObject(node.attrs) ? node.attrs : {};
      const binding = isPlainObject(node.action) ? (node.action as ActionBinding) : undefined;
      const attrRows = Object.entries(attrs).map(([name, value]) => {
        const isBind = isPlainObject(value) && typeof value.bind === "string";
        // The bind's transform fields, when present. Every write goes
        // through rebuild() so editing one field never drops the others.
        const bindValue = isBind
          ? (value as {
              bind: string;
              prefix?: string;
              map?: Record<string, string>;
              default?: string;
            })
          : undefined;
        const rebuild = (fields: {
          bind: string;
          prefix?: string | undefined;
          map?: Record<string, string> | undefined;
          default?: string | undefined;
        }): Record<string, unknown> => {
          const out: Record<string, unknown> = { bind: fields.bind };
          if (fields.map !== undefined) {
            out.map = fields.map;
            if (fields.default !== undefined && fields.default !== "") {
              out.default = fields.default;
            }
          } else if (fields.prefix !== undefined && fields.prefix !== "") {
            out.prefix = fields.prefix;
          }
          return out;
        };
        const setAttr = (nextValue: unknown): void => {
          commitAt(path, { ...node, attrs: { ...attrs, [name]: nextValue } });
        };
        const nameInput = changeInput(
          name,
          (nextName) => {
            const entries = Object.entries(attrs).map(([k, v]) =>
              k === name ? ([nextName, v] as const) : ([k, v] as const)
            );
            commitAt(path, { ...node, attrs: Object.fromEntries(entries) });
          },
          "wgd-input wgd-attr-name"
        );
        const mode = h("select", { class: "wgd-select wgd-attr-mode" }) as HTMLSelectElement;
        mode.append(h("option", { value: "literal" }, ["literal"]));
        mode.append(h("option", { value: "bind" }, ["bind"]));
        mode.value = isBind ? "bind" : "literal";
        fitSelect(mode);
        // Literal: free text. Bind: the same path dropdown the bind/each/when
        // nodes use (observed live: img src/alt binds were plain text boxes).
        const literalInput = changeInput(String(isBind ? "" : value), (next) => setAttr(next), "wgd-input wgd-attr-value");
        const valueInput: HTMLElement = isBind
          ? pathControl(
              bindValue!.bind,
              scope,
              "bind",
              (next) => setAttr(rebuild({ ...bindValue!, bind: next })),
              "wgd-input wgd-attr-value"
            )
          : literalInput;
        mode.addEventListener("change", () => {
          // Switching modes carries the current text across as a starting point.
          const current = isBind ? bindValue!.bind : literalInput.value;
          setAttr(mode.value === "bind" ? { bind: current || "." } : current);
        });
        const removeAttr = h("button", { class: "wgd-icon", type: "button", title: "Remove attribute" }, ["✕"]);
        removeAttr.addEventListener("click", () => {
          const { [name]: _gone, ...rest } = attrs;
          commitAt(path, { ...node, attrs: rest });
        });

        const row: (Node | string)[] = [nameInput, mode, valueInput];
        const hasMap = bindValue?.map !== undefined;
        const hasPrefix =
          bindValue?.prefix !== undefined && bindValue.prefix !== "";
        if (isBind && !hasMap) {
          // Literal prefix (mailto:/tel: links). Hidden while a map is
          // active — one transform per value, mirroring the validator.
          const prefixInput = changeInput(
            bindValue?.prefix ?? "",
            (next) => setAttr(rebuild({ ...bindValue!, map: undefined, prefix: next })),
            "wgd-input wgd-attr-prefix"
          );
          prefixInput.placeholder = "prefix";
          prefixInput.title = "Literal prefix, e.g. mailto: — emitted only when the bound value is non-empty";
          row.push(prefixInput);
        }
        if (isBind && !hasMap && !hasPrefix) {
          const addMap = h(
            "button",
            { class: "wgd-icon", type: "button", title: "Map values to authored literals (e.g. status → class)" },
            ["map"]
          );
          addMap.addEventListener("click", () =>
            setAttr(rebuild({ ...bindValue!, prefix: undefined, map: {} }))
          );
          row.push(h("span", { class: "wgd-node-icons" }, [addMap, removeAttr]));
        } else {
          row.push(removeAttr);
        }

        const parts: (Node | string)[] = [h("div", { class: "wgd-attr-row" }, row)];
        if (isBind && hasMap) {
          // The map block: data value → authored literal rows, plus the
          // miss default. Emptying the record drops the transform.
          const mapEditor = createRecordEditor(
            bindValue!.map,
            { key: "data value", value: "authored literal", add: "+ mapping" },
            (nextMap) => {
              setAttr(
                nextMap === undefined
                  ? { bind: bindValue!.bind }
                  : rebuild({ ...bindValue!, map: nextMap })
              );
            }
          );
          const defaultInput = changeInput(
            bindValue!.default ?? "",
            (next) => setAttr(rebuild({ ...bindValue!, default: next })),
            "wgd-input wgd-attr-map-default"
          );
          defaultInput.placeholder = "default (on miss)";
          parts.push(
            h("div", { class: "wgd-attr-map" }, [
              mapEditor.element,
              h("div", { class: "wgd-rec-row" }, [
                h("span", { class: "wgd-st-colon" }, ["↳"]),
                defaultInput
              ])
            ])
          );
        }
        return parts.length === 1
          ? (parts[0] as HTMLElement)
          : h("div", { class: "wgd-attr" }, parts);
      });
      const childNodes = Array.isArray(node.children) ? (node.children as unknown[]) : [];
      // One add menu per element covers attributes and every child form —
      // the tree carries no persistent per-form button rows.
      const addMenu = menuButton(
        "+",
        "Add attribute or child node",
        // Actions belong on activatable elements: buttons and links.
        [
          "attribute",
          ...(binding === undefined && (node.tag === "button" || node.tag === "a") ? ["action"] : []),
          ...Object.keys(NODE_PRESETS)
        ],
        (choice) => {
          collapsedPaths.delete(pathString(path)); // never add into a fold
          const preset = NODE_PRESETS[choice];
          if (choice === "attribute") {
            commitAt(path, { ...node, attrs: { ...attrs, "": "" } });
          } else if (choice === "action") {
            const first = actionContext.actions[0];
            commitAt(path, {
              ...node,
              action: first !== undefined ? { ref: first.name } : { definition: { kind: "prompt", text: ["Tell me more"] } }
            });
          } else if (preset) {
            commitAt([...path, childNodes.length], preset());
          }
        }
      );
      const body: (Node | string)[] = [];
      if (attrRows.length > 0) body.push(h("div", { class: "wgd-attrs" }, attrRows));
      // Action binding: the element becomes activatable in Apps hosts. The
      // editor commits the whole binding; `undefined` drops the key.
      const scopePaths = isPlainObject(scope) ? pathOptions(scope, "when") : [];
      const bindingEditor = createBindingEditor(
        binding,
        {
          ...actionContext,
          scopePaths,
          // The widget's effective data schema drives output-map targets.
          getDataSchema: () => effectiveDataSchema(store.get(), actionContext.schemas)
        },
        (next) => {
          if (next === undefined) {
            const { action: _gone, ...rest } = node;
            commitAt(path, rest);
          } else {
            commitAt(path, { ...node, action: next });
          }
        }
      );
      if (binding !== undefined) {
        body.push(h("div", { class: "wgd-attrs wgd-node-action" }, [
          h("span", { class: "wgd-slot-label" }, ["action"]),
          bindingEditor.element
        ]));
      }
      if (childNodes.length > 0) {
        body.push(
          h(
            "div",
            { class: "wgd-children" },
            childNodes.map((child, index) =>
              renderNode(
                child,
                [...path, index],
                errorPath,
                true,
                { parent: path, index, count: childNodes.length },
                scope
              )
            )
          )
        );
      }
      const summaryParts: string[] = [];
      if (attrRows.length > 0) {
        summaryParts.push(`${attrRows.length} attr${attrRows.length === 1 ? "" : "s"}`);
      }
      if (binding !== undefined) summaryParts.push("action");
      if (childNodes.length > 0) {
        summaryParts.push(
          `${childNodes.length} ${childNodes.length === 1 ? "child" : "children"}`
        );
      }
      return nodeShell(
        undefined, // the tag select is the node's label
        path,
        [tagControl(node.tag, (value) => commitAt(path, { ...node, tag: value }))],
        body,
        errorHere,
        removable,
        moves,
        { icons: [addMenu], summary: summaryParts.join(" · ") }
      );
    }
    return nodeShell(
      "unknown",
      path,
      [h("code", undefined, [JSON.stringify(node)])],
      [],
      errorHere ?? "Unknown template node form.",
      removable,
      moves
    );
  }

  let currentError: string | undefined;
  let lastDraft: WidgetDraft | undefined;
  let lastErrorPath: string | undefined;

  /** Rebuild the tree from the last refresh inputs (collapse toggles). */
  function renderTree(): void {
    if (lastDraft === undefined) return;
    // Shared refs resolve like inline schemas — a ref-based widget gets
    // the same path completions (observed live: plain text boxes otherwise).
    treeHost.replaceChildren(
      renderNode(
        lastDraft.template,
        [],
        lastErrorPath,
        true,
        undefined,
        effectiveDataSchema(lastDraft, actionContext.schemas)
      )
    );
  }

  function refresh(draft: WidgetDraft, diagnostics: DesignerDiagnostics): void {
    currentError = diagnostics.template
      ? `${diagnostics.template.code}: ${diagnostics.template.message}`
      : undefined;
    lastDraft = draft;
    lastErrorPath = diagnostics.template?.path;
    templateDiag.hidden = diagnostics.template === undefined;
    templateDiag.textContent = diagnostics.template
      ? `${diagnostics.template.code}: ${diagnostics.template.message}` +
        (diagnostics.template.path !== undefined && diagnostics.template.path !== ""
          ? ` (at ${diagnostics.template.path})`
          : "")
      : "";
    if (!treeHost.hidden || treeHost.childNodes.length === 0) {
      renderTree();
    }
    if (document.activeElement !== jsonArea) {
      jsonArea.value = JSON.stringify(draft.template, null, 2);
      repaintHighlight(jsonArea);
    }
  }

  refreshers.push(() => undefined); // template refresh runs via refresh() below

  return { element, refresh, dispose: () => element.remove() };
}
