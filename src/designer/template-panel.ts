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
import { diagnosticLine, h } from "./dom.js";
import { attachJsonHighlight, repaintHighlight } from "./highlight.js";
import type { DraftStore, WidgetDraft } from "./store.js";
import type { DesignerDiagnostics } from "./validate.js";

type Path = (string | number)[];

/** What a data path is being used for — decides which paths are offered. */
type PathUse = "bind" | "each" | "when";

function schemaType(schema: unknown): string | undefined {
  if (!isPlainObject(schema)) return undefined;
  const type = schema.type;
  if (typeof type === "string") return type;
  if (Array.isArray(type) && typeof type[0] === "string") return type[0];
  return undefined;
}

/**
 * Dotted paths reachable from a scope schema, with the schema at each
 * path. Arrays are offered as themselves (for `each`); descending into
 * their items needs an `each` first, so we stop there.
 */
function collectPaths(
  schema: unknown,
  prefix: string,
  out: { path: string; schema: unknown }[],
  depth = 0
): void {
  if (!isPlainObject(schema) || depth > 3) return;
  if (schemaType(schema) !== "object" || !isPlainObject(schema.properties)) return;
  for (const [name, sub] of Object.entries(schema.properties)) {
    const path = prefix === "" ? name : `${prefix}.${name}`;
    out.push({ path, schema: sub });
    collectPaths(sub, path, out, depth + 1);
  }
}

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

export function mountTemplatePanel(
  store: DraftStore,
  refreshers: ((draft: WidgetDraft) => void)[]
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
   * One node = one header row: badge, the node's own value control(s), then
   * move/remove icons. Sub-structure (attrs, children, slots) nests below.
   */
  function nodeShell(
    /** Omitted for elements — their tag select already names the node. */
    badge: string | undefined,
    path: Path,
    inline: (Node | string)[],
    body: (Node | string)[],
    errorText: string | undefined,
    removable: boolean,
    moves?: { parent: Path; index: number; count: number }
  ): HTMLElement {
    const header: (Node | string)[] =
      badge === undefined
        ? [...inline]
        : [h("span", { class: "wgd-node-badge" }, [badge]), ...inline];
    const icons: (Node | string)[] = [];
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
    if (errorText !== undefined) children.push(diagnosticLine(errorText));
    children.push(...body);
    return h("div", { class: "wgd-node", "data-path": pathString(path) }, children);
  }

  /** One-click toolbar — no select-then-confirm dance. */
  function addChildRow(parentPath: Path, childCount: number): HTMLElement {
    const buttons = Object.entries(NODE_PRESETS).map(([name, preset]) => {
      const button = h(
        "button",
        { class: "wgd-button wgd-add", type: "button", title: `Add ${name} child` },
        [`+ ${name}`]
      );
      button.addEventListener("click", () =>
        commitAt([...parentPath, childCount], preset())
      );
      return button;
    });
    return h("div", { class: "wgd-toolbar wgd-add-child" }, buttons);
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
    onCommit: (path: string) => void
  ): HTMLElement {
    const options = isPlainObject(scope) ? pathOptions(scope, use) : [];
    if (options.length === 0) {
      return changeInput(value, onCommit);
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
    const custom = changeInput(value, onCommit);
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
    return h("span", { class: "wgd-pathwrap" }, [select, custom]);
  }

  function tagControl(tag: string, onCommit: (tag: string) => void): HTMLElement {
    const select = h("select", { class: "wgd-select wgd-tag" }) as HTMLSelectElement;
    const options = TAG_OPTIONS.includes(tag) ? TAG_OPTIONS : [tag, ...TAG_OPTIONS];
    for (const option of options) {
      select.append(h("option", { value: option }, [option]));
    }
    select.append(h("option", { value: "__custom__" }, ["custom…"]));
    select.value = tag;
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
      const buttons = Object.entries(NODE_PRESETS).map(([name, preset]) => {
        const button = h(
          "button",
          { class: "wgd-button wgd-add", type: "button", title: `Set ${label} to a ${name} node` },
          [`+ ${label}: ${name}`]
        );
        button.addEventListener("click", () => commitAt(slotPath, preset()));
        return button;
      });
      const toolbar = h("div", { class: "wgd-toolbar" }, buttons);
      return required
        ? h("div", { class: "wgd-slot" }, [
            diagnosticLine(`Missing required '${label}'.`),
            toolbar
          ])
        : toolbar;
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
        (errorPath.startsWith(here === "" ? "attrs." : `${here}.attrs.`) &&
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
        moves
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
        moves
      );
    }
    if (typeof node.tag === "string") {
      const attrs = isPlainObject(node.attrs) ? node.attrs : {};
      const attrRows = Object.entries(attrs).map(([name, value]) => {
        const isBind = isPlainObject(value) && typeof value.bind === "string";
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
        const valueInput = changeInput(
          isBind ? String((value as { bind: string }).bind) : String(value),
          (next) => {
            const nextValue = mode.value === "bind" ? { bind: next } : next;
            commitAt(path, { ...node, attrs: { ...attrs, [name]: nextValue } });
          },
          "wgd-input wgd-attr-value"
        );
        mode.addEventListener("change", () => {
          const current = valueInput.value;
          const nextValue = mode.value === "bind" ? { bind: current } : current;
          commitAt(path, { ...node, attrs: { ...attrs, [name]: nextValue } });
        });
        const removeAttr = h("button", { class: "wgd-icon", type: "button", title: "Remove attribute" }, ["✕"]);
        removeAttr.addEventListener("click", () => {
          const { [name]: _gone, ...rest } = attrs;
          commitAt(path, { ...node, attrs: rest });
        });
        // Name, mode and value share one row (no wrapping).
        return h("div", { class: "wgd-attr-row" }, [
          nameInput,
          mode,
          valueInput,
          removeAttr
        ]);
      });
      const addAttr = h("button", { class: "wgd-button wgd-add", type: "button" }, ["+ attr"]);
      addAttr.addEventListener("click", () => {
        commitAt(path, { ...node, attrs: { ...attrs, "": "" } });
      });
      const childNodes = Array.isArray(node.children) ? (node.children as unknown[]) : [];
      return nodeShell(
        undefined, // the tag select is the node's label
        path,
        [tagControl(node.tag, (value) => commitAt(path, { ...node, tag: value }))],
        [
          ...attrRows,
          h("div", { class: "wgd-toolbar" }, [addAttr]),
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
          ),
          addChildRow(path, childNodes.length)
        ],
        errorHere,
        removable,
        moves
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

  function refresh(draft: WidgetDraft, diagnostics: DesignerDiagnostics): void {
    currentError = diagnostics.template
      ? `${diagnostics.template.code}: ${diagnostics.template.message}`
      : undefined;
    templateDiag.hidden = diagnostics.template === undefined;
    templateDiag.textContent = diagnostics.template
      ? `${diagnostics.template.code}: ${diagnostics.template.message}` +
        (diagnostics.template.path !== undefined && diagnostics.template.path !== ""
          ? ` (at ${diagnostics.template.path})`
          : "")
      : "";
    if (!treeHost.hidden || treeHost.childNodes.length === 0) {
      treeHost.replaceChildren(
        renderNode(
          draft.template,
          [],
          diagnostics.template?.path,
          true,
          undefined,
          draft.descriptor.dataSchema
        )
      );
    }
    if (document.activeElement !== jsonArea) {
      jsonArea.value = JSON.stringify(draft.template, null, 2);
      repaintHighlight(jsonArea);
    }
  }

  refreshers.push(() => undefined); // template refresh runs via refresh() below

  return { element, refresh, dispose: () => element.remove() };
}
