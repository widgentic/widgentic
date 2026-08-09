/**
 * Generic JSON value editor: collapsible tree with in-place key/value
 * editing, type switching, and add/remove — the NanoJSON/JSONTree
 * interaction pattern, built in-house because the general libraries carry
 * far more (and weigh far more) than the designer needs.
 *
 * Structural operations re-render the tree; text edits commit on change
 * (blur/Enter) so typing is never interrupted.
 */
import { h } from "./dom.js";

type Path = (string | number)[];

const TYPE_OPTIONS = ["string", "number", "boolean", "null", "object", "array"] as const;
type TypeName = (typeof TYPE_OPTIONS)[number];

function typeOf(value: unknown): TypeName {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return (typeof value) as TypeName;
}

function defaultFor(type: TypeName, previous: unknown): unknown {
  switch (type) {
    case "string":
      return typeof previous === "number" || typeof previous === "boolean"
        ? String(previous)
        : "";
    case "number": {
      const parsed = Number(previous);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    case "boolean":
      return previous === "true" ? true : Boolean(previous) && previous !== "false";
    case "null":
      return null;
    case "object":
      return {};
    case "array":
      return [];
  }
}

function setAt(root: unknown, path: Path, value: unknown, remove = false): unknown {
  if (path.length === 0) return value;
  const [step, ...rest] = path as [string | number, ...Path];
  if (Array.isArray(root)) {
    const copy = [...root];
    if (rest.length === 0 && remove) copy.splice(step as number, 1);
    else copy[step as number] = setAt(copy[step as number], rest, value, remove);
    return copy;
  }
  if (typeof root === "object" && root !== null) {
    const copy = { ...(root as Record<string, unknown>) };
    if (rest.length === 0 && remove) delete copy[step as string];
    else copy[step as string] = setAt(copy[step as string], rest, value, remove);
    return copy;
  }
  return root;
}

function renameKey(root: unknown, path: Path, from: string, to: string): unknown {
  const holder = path.reduce<unknown>(
    (node, step) =>
      typeof node === "object" && node !== null
        ? (node as Record<string, unknown>)[step as string]
        : undefined,
    root
  );
  if (typeof holder !== "object" || holder === null || Array.isArray(holder)) return root;
  const entries = Object.entries(holder).map(([k, v]) =>
    k === from ? ([to, v] as const) : ([k, v] as const)
  );
  return setAt(root, path, Object.fromEntries(entries));
}

export interface JsonTreeEditor {
  element: HTMLElement;
  getValue(): unknown;
  /** External update (skipped while the user is editing inside the tree). */
  setValue(value: unknown): void;
}

export function createJsonTreeEditor(
  initial: unknown,
  onChange: (value: unknown) => void
): JsonTreeEditor {
  let current: unknown = initial;
  const element = h("div", { class: "wgd-jsontree" });

  function commit(next: unknown): void {
    current = next;
    render();
    onChange(current);
  }

  function commitText(path: Path, type: TypeName, text: string): void {
    const value =
      type === "number"
        ? Number.isFinite(Number(text))
          ? Number(text)
          : 0
        : text;
    current = setAt(current, path, value);
    onChange(current); // no re-render: in-place text edit
  }

  function typeSelect(value: unknown, path: Path): HTMLSelectElement {
    const select = h("select", { class: "wgd-select wgd-jt-type" }) as HTMLSelectElement;
    for (const option of TYPE_OPTIONS) {
      select.append(h("option", { value: option }, [option]));
    }
    select.value = typeOf(value);
    select.addEventListener("change", () =>
      commit(setAt(current, path, defaultFor(select.value as TypeName, value)))
    );
    return select;
  }

  function valueControl(value: unknown, path: Path): Node {
    const type = typeOf(value);
    if (type === "boolean") {
      const box = h("input", { type: "checkbox" }) as HTMLInputElement;
      box.checked = value as boolean;
      box.addEventListener("change", () => commit(setAt(current, path, box.checked)));
      return box;
    }
    if (type === "null") return h("code", undefined, ["null"]);
    if (type === "string" || type === "number") {
      const input = h("input", { type: "text", class: "wgd-input" }) as HTMLInputElement;
      input.value = String(value);
      input.addEventListener("change", () => commitText(path, type, input.value));
      return input;
    }
    return h("span");
  }

  function entryRow(
    keyLabel: Node,
    value: unknown,
    path: Path,
    removable: boolean
  ): HTMLElement {
    const row = h("div", { class: "wgd-jt-row" }, [keyLabel, typeSelect(value, path)]);
    const type = typeOf(value);
    if (type !== "object" && type !== "array") {
      row.append(valueControl(value, path));
    }
    if (removable) {
      const remove = h("button", { class: "wgd-icon", type: "button", title: "Remove" }, ["✕"]);
      remove.addEventListener("click", () => commit(setAt(current, path, undefined, true)));
      row.append(remove);
    }
    const wrap = h("div", { class: "wgd-jt-entry" }, [row]);
    if (type === "object" || type === "array") {
      wrap.append(renderContainer(value, path));
    }
    return wrap;
  }

  function renderContainer(value: unknown, path: Path): HTMLElement {
    const body = h("div", { class: "wgd-jt-children" });
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        body.append(
          entryRow(h("span", { class: "wgd-jt-key" }, [String(index)]), item, [...path, index], true)
        );
      });
      const add = h("button", { class: "wgd-button wgd-add", type: "button" }, ["+ item"]);
      add.addEventListener("click", () =>
        commit(setAt(current, [...path, value.length], ""))
      );
      body.append(h("div", { class: "wgd-toolbar" }, [add]));
    } else if (typeof value === "object" && value !== null) {
      for (const [key, item] of Object.entries(value)) {
        const keyInput = h("input", {
          type: "text",
          class: "wgd-input wgd-jt-keyinput"
        }) as HTMLInputElement;
        keyInput.value = key;
        keyInput.addEventListener("change", () =>
          commit(renameKey(current, path, key, keyInput.value))
        );
        body.append(entryRow(keyInput, item, [...path, key], true));
      }
      const add = h("button", { class: "wgd-button wgd-add", type: "button" }, ["+ property"]);
      add.addEventListener("click", () => {
        const holder = value as Record<string, unknown>;
        let name = "key";
        for (let i = 1; name in holder; i++) name = `key${i}`;
        commit(setAt(current, [...path, name], ""));
      });
      body.append(h("div", { class: "wgd-toolbar" }, [add]));
    }
    const details = h("details", { class: "wgd-jt-branch", open: "" }, [
      h("summary", { class: "wgd-jt-summary" }, [
        Array.isArray(value)
          ? `[ ${value.length} item${value.length === 1 ? "" : "s"} ]`
          : `{ ${Object.keys(value as object).length} propert${Object.keys(value as object).length === 1 ? "y" : "ies"} }`
      ]),
      body
    ]);
    return details;
  }

  function render(): void {
    element.replaceChildren(
      entryRow(h("span", { class: "wgd-jt-key" }, ["value"]), current, [], false)
    );
  }

  render();

  return {
    element,
    getValue: () => current,
    setValue(value) {
      if (element.contains(document.activeElement)) return;
      current = value;
      render();
    }
  };
}
