/**
 * Schema-driven data form: generates controls from widgentic's dataSchema
 * subset (type/properties/required/items/enum/pattern). This is the
 * @json-editor/json-editor interaction model, sized to the six keywords
 * the subset actually has — which is what makes an in-house generator a
 * few hundred lines instead of a 150 KB dependency.
 */
import type { DataSchema } from "widgentic/catalog";
import { h } from "./dom.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstType(schema: DataSchema): string | undefined {
  const type = schema.type;
  if (typeof type === "string") return type;
  if (Array.isArray(type) && typeof type[0] === "string") return type[0];
  return undefined;
}

function seedFor(schema: DataSchema): unknown {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  switch (firstType(schema)) {
    case "object": {
      const seed: Record<string, unknown> = {};
      if (isPlainObject(schema.properties) && Array.isArray(schema.required)) {
        for (const key of schema.required) {
          if (typeof key === "string" && isPlainObject(schema.properties[key])) {
            seed[key] = seedFor(schema.properties[key] as DataSchema);
          }
        }
      }
      return seed;
    }
    case "array":
      return [];
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return false;
    case "null":
      return null;
    default:
      return "";
  }
}

export interface SchemaForm {
  element: HTMLElement;
  getValue(): unknown;
  setValue(value: unknown): void;
}

export function createSchemaForm(
  schema: DataSchema,
  initial: unknown,
  onChange: (value: unknown) => void
): SchemaForm {
  let current: unknown = initial ?? seedFor(schema);
  const element = h("div", { class: "wgd-schemaform" });

  type Path = (string | number)[];

  function setAt(root: unknown, path: Path, value: unknown, remove = false): unknown {
    if (path.length === 0) return value;
    const [step, ...rest] = path as [string | number, ...Path];
    if (Array.isArray(root)) {
      const copy = [...root];
      if (rest.length === 0 && remove) copy.splice(step as number, 1);
      else copy[step as number] = setAt(copy[step as number], rest, value, remove);
      return copy;
    }
    const holder = isPlainObject(root) ? { ...root } : {};
    if (rest.length === 0 && remove) delete holder[step as string];
    else holder[step as string] = setAt(holder[step as string], rest, value, remove);
    return holder;
  }

  function commit(path: Path, value: unknown, rerender = false): void {
    current = setAt(current, path, value);
    onChange(current);
    if (rerender) render();
  }

  function control(node: DataSchema, value: unknown, path: Path, label: string): HTMLElement {
    if (Array.isArray(node.enum)) {
      const select = h("select", { class: "wgd-select" }) as HTMLSelectElement;
      for (const option of node.enum) {
        select.append(h("option", { value: JSON.stringify(option) }, [JSON.stringify(option)]));
      }
      select.value = JSON.stringify(value ?? node.enum[0]);
      select.addEventListener("change", () =>
        commit(path, JSON.parse(select.value) as unknown)
      );
      return field(label, select);
    }
    switch (firstType(node)) {
      case "boolean": {
        const box = h("input", { type: "checkbox" }) as HTMLInputElement;
        box.checked = value === true;
        box.addEventListener("change", () => commit(path, box.checked));
        return field(label, box);
      }
      case "number":
      case "integer": {
        const input = h("input", { type: "number", class: "wgd-input" }) as HTMLInputElement;
        input.value = typeof value === "number" ? String(value) : "0";
        input.addEventListener("change", () => {
          const parsed = Number(input.value);
          commit(path, Number.isFinite(parsed) ? parsed : 0);
        });
        return field(label, input);
      }
      case "object": {
        const body = h("div", { class: "wgd-jt-children" });
        const properties = isPlainObject(node.properties) ? node.properties : {};
        const required = Array.isArray(node.required) ? node.required : [];
        const holder = isPlainObject(value) ? value : {};
        for (const [name, sub] of Object.entries(properties)) {
          if (!isPlainObject(sub)) continue;
          const isRequired = required.includes(name);
          body.append(
            control(
              sub as DataSchema,
              holder[name] ?? (isRequired ? seedFor(sub as DataSchema) : undefined),
              [...path, name],
              isRequired ? `${name} *` : name
            )
          );
        }
        return h("fieldset", { class: "wgd-sf-object" }, [
          h("legend", { class: "wgd-field-label" }, [label]),
          body
        ]);
      }
      case "array": {
        const itemsSchema = isPlainObject(node.items) ? (node.items as DataSchema) : {};
        const items = Array.isArray(value) ? value : [];
        const body = h("div", { class: "wgd-jt-children" });
        items.forEach((item, index) => {
          const row = h("div", { class: "wgd-jt-entry" }, [
            control(itemsSchema, item, [...path, index], `#${index}`)
          ]);
          const remove = h("button", { class: "wgd-icon", type: "button", title: "Remove item" }, ["✕"]);
          remove.addEventListener("click", () => {
            current = setAt(current, [...path, index], undefined, true);
            onChange(current);
            render();
          });
          row.append(remove);
          body.append(row);
        });
        const add = h("button", { class: "wgd-button wgd-add", type: "button" }, ["+ item"]);
        add.addEventListener("click", () =>
          commit([...path, items.length], seedFor(itemsSchema), true)
        );
        body.append(h("div", { class: "wgd-toolbar" }, [add]));
        return h("fieldset", { class: "wgd-sf-object" }, [
          h("legend", { class: "wgd-field-label" }, [label]),
          body
        ]);
      }
      default: {
        const input = h("input", { type: "text", class: "wgd-input" }) as HTMLInputElement;
        if (typeof node.pattern === "string") {
          input.setAttribute("placeholder", `pattern: ${node.pattern}`);
          input.setAttribute("title", `Must match ${node.pattern}`);
        }
        input.value = typeof value === "string" ? value : value === undefined ? "" : String(value);
        input.addEventListener("change", () => commit(path, input.value));
        return field(label, input);
      }
    }
  }

  function field(label: string, controlEl: Node): HTMLElement {
    return h("label", { class: "wgd-field" }, [
      h("span", { class: "wgd-field-label" }, [label]),
      controlEl
    ]);
  }

  function render(): void {
    element.replaceChildren(control(schema, current, [], "data"));
  }

  render();

  return {
    element,
    getValue: () => current,
    setValue(value) {
      if (element.contains(document.activeElement)) return;
      current = value ?? seedFor(schema);
      render();
    }
  };
}
