/**
 * Structured editor for the dataSchema subset — the property-card pattern
 * from the React schema-builder ecosystem, sized to widgentic's six
 * keywords (type/properties/required/items/enum/pattern) so it stays a
 * dependency-free couple hundred lines.
 */
import { errorMessage } from "./internal.js";
import { isPlainObject } from "@widgentic/core";
import type { DataSchema } from "@widgentic/core";
import { diagnosticLine, fitSelect, h } from "./dom.js";

const TYPES = ["object", "array", "string", "number", "integer", "boolean", "null", "any"] as const;

/**
 * Types the builder offers `enum` for. The validator accepts `enum` on any
 * type (deep JSON comparison, per JSON Schema), but enumerating whole
 * objects/arrays belongs in the JSON tab, not a form.
 */
const ENUM_TYPES = new Set(["string", "number", "integer", "any"]);

export interface SchemaBuilder {
  element: HTMLElement;
  getValue(): DataSchema | undefined;
  setValue(schema: DataSchema | undefined): void;
}

export function createSchemaBuilder(
  initial: DataSchema | undefined,
  onChange: (schema: DataSchema | undefined) => void
): SchemaBuilder {
  let current: DataSchema | undefined = initial;
  const element = h("div", { class: "wgd-schemabuilder" });

  function commit(next: DataSchema | undefined, rerender = true): void {
    current = next;
    onChange(current);
    if (rerender) render();
  }

  /** Rebuild a node with one key changed/removed (undefined removes). */
  function withKey(node: DataSchema, key: string, value: unknown): DataSchema {
    const copy: DataSchema = { ...node };
    if (value === undefined) delete copy[key];
    else copy[key] = value;
    return copy;
  }

  /**
   * One schema node. `lead`/`trail` let a parent put the property name and
   * its required/remove controls on the SAME row as the type select.
   */
  function renderNode(
    node: DataSchema,
    apply: (next: DataSchema) => void,
    depth: number,
    lead: (Node | string)[] = [],
    trail: (Node | string)[] = []
  ): HTMLElement {
    const rows: (Node | string)[] = [];

    const typeSelect = h("select", { class: "wgd-select wgd-sb-type" });
    for (const t of TYPES) typeSelect.append(h("option", { value: t }, [t]));
    // Nullable type arrays ([<type>, "null"], either order) present as the
    // PRIMARY type + a nullable toggle — never collapsing to "any", which
    // silently hid pattern/enum for agent-authored nullable fields.
    const rawType = node.type;
    const typeList = Array.isArray(rawType)
      ? rawType.filter((t): t is string => typeof t === "string")
      : undefined;
    const nullable = typeList?.includes("null") ?? false;
    const currentType =
      typeof rawType === "string"
        ? rawType
        : (typeList?.find((t) => t !== "null") ?? (nullable ? "null" : "any"));
    typeSelect.value = TYPES.some((type) => type === currentType)
      ? currentType
      : "any";
    fitSelect(typeSelect);
    const nullBox = h("input", {
      type: "checkbox",
      title: "Also allows null"
    });
    nullBox.checked = nullable;
    nullBox.disabled = typeSelect.value === "any" || typeSelect.value === "null";
    /** The `type` value the current controls describe. */
    function typeValue(selected: string, allowNull: boolean): unknown {
      if (selected === "any") return undefined;
      return allowNull && selected !== "null" ? [selected, "null"] : selected;
    }
    nullBox.addEventListener("change", () => {
      apply(withKey(node, "type", typeValue(typeSelect.value, nullBox.checked)));
    });
    typeSelect.addEventListener("change", () => {
      let next = withKey(node, "type", typeValue(typeSelect.value, nullBox.checked));
      if (typeSelect.value !== "object") {
        next = withKey(withKey(next, "properties", undefined), "required", undefined);
      }
      if (typeSelect.value !== "array") next = withKey(next, "items", undefined);
      if (typeSelect.value !== "string") next = withKey(next, "pattern", undefined);
      if (!ENUM_TYPES.has(typeSelect.value)) next = withKey(next, "enum", undefined);
      apply(next);
    });
    // Header row: [name?] [type] [nullable] [required?] [remove?]
    rows.push(
      h("div", { class: "wgd-sb-row" }, [
        ...lead,
        typeSelect,
        h("label", { class: "wgd-sb-req wgd-sb-null", title: "Also allows null" }, [
          nullBox,
          "null"
        ]),
        ...trail
      ])
    );

    // Constraints row — only the ones this type can actually use.
    const constraints: (Node | string)[] = [];
    if (typeSelect.value === "string") {
      const pattern = h("input", {
        type: "text",
        class: "wgd-input wgd-sb-constraint",
        placeholder: "pattern (regex, optional)"
      });
      pattern.value = typeof node.pattern === "string" ? node.pattern : "";
      pattern.addEventListener("change", () =>
        apply(withKey(node, "pattern", pattern.value === "" ? undefined : pattern.value))
      );
      constraints.push(h("span", { class: "wgd-sb-label" }, ["pattern"]), pattern);
    }
    const enumError = diagnosticLine(undefined);
    // `enum` is type-agnostic in the validator, but enumerating whole
    // objects/arrays is a JSON-tab affair — the builder offers it where
    // it is actually useful.
    if (ENUM_TYPES.has(typeSelect.value)) {
      const enumInput = h("input", {
        type: "text",
        class: "wgd-input wgd-sb-constraint",
        placeholder: 'enum ["a","b"] (optional)'
      });
      enumInput.value = Array.isArray(node.enum) ? JSON.stringify(node.enum) : "";
      enumInput.addEventListener("change", () => {
        if (enumInput.value.trim() === "") {
          enumError.hidden = true;
          apply(withKey(node, "enum", undefined));
          return;
        }
        try {
          const parsed: unknown = JSON.parse(enumInput.value);
          if (!Array.isArray(parsed)) throw new Error("must be a JSON array");
          enumError.hidden = true;
          apply(withKey(node, "enum", parsed));
        } catch (error) {
          enumError.hidden = false;
          enumError.textContent = `enum ignored: ${errorMessage(error)}`;
        }
      });
      constraints.push(h("span", { class: "wgd-sb-label" }, ["enum"]), enumInput);
    }
    if (constraints.length > 0) {
      rows.push(h("div", { class: "wgd-sb-row wgd-sb-constraints" }, constraints), enumError);
    }

    // Object: property cards + required toggles
    if (typeSelect.value === "object") {
      const properties = isPlainObject(node.properties) ? node.properties : {};
      const required = Array.isArray(node.required)
        ? node.required.filter((k): k is string => typeof k === "string")
        : [];
      const cards = h("div", { class: "wgd-jt-children" });
      for (const [name, sub] of Object.entries(properties)) {
        const nameInput = h("input", {
          type: "text",
          class: "wgd-input wgd-sb-prop",
          placeholder: "property name"
        });
        nameInput.value = name;
        nameInput.addEventListener("change", () => {
          const entries = Object.entries(properties).map(([k, v]) =>
            k === name ? ([nameInput.value, v] as const) : ([k, v] as const)
          );
          const nextRequired = required.map((k) => (k === name ? nameInput.value : k));
          apply(
            withKey(
              withKey(node, "properties", Object.fromEntries(entries)),
              "required",
              nextRequired.length > 0 ? nextRequired : undefined
            )
          );
        });
        const requiredBox = h("input", { type: "checkbox", title: "required" });
        requiredBox.checked = required.includes(name);
        requiredBox.addEventListener("change", () => {
          const nextRequired = requiredBox.checked
            ? [...required, name]
            : required.filter((k) => k !== name);
          apply(withKey(node, "required", nextRequired.length > 0 ? nextRequired : undefined));
        });
        const removeProp = h("button", { class: "wgd-icon", type: "button", title: "Remove property" }, ["✕"]);
        removeProp.addEventListener("click", () => {
          const { [name]: _gone, ...rest } = properties;
          apply(
            withKey(
              withKey(node, "properties", Object.keys(rest).length > 0 ? rest : undefined),
              "required",
              required.filter((k) => k !== name).length > 0
                ? required.filter((k) => k !== name)
                : undefined
            )
          );
        });
        // Name, type, required and remove all share the property's first row.
        cards.append(
          renderNode(
            isPlainObject(sub) ? (sub as DataSchema) : {},
            (nextSub) =>
              apply(withKey(node, "properties", { ...properties, [name]: nextSub })),
            depth + 1,
            [nameInput],
            [
              h("label", { class: "wgd-sb-req", title: "required" }, [requiredBox, "req"]),
              removeProp
            ]
          )
        );
      }
      const addProp = h("button", { class: "wgd-button wgd-add", type: "button" }, [
        "+ property"
      ]);
      addProp.addEventListener("click", () => {
        let name = "field";
        for (let i = 1; name in properties; i++) name = `field${i}`;
        apply(withKey(node, "properties", { ...properties, [name]: { type: "string" } }));
      });
      cards.append(h("div", { class: "wgd-toolbar" }, [addProp]));
      rows.push(cards);
    }

    // Array: items node
    if (typeSelect.value === "array") {
      rows.push(
        h("div", { class: "wgd-slot" }, [
          renderNode(
            isPlainObject(node.items) ? (node.items as DataSchema) : {},
            (nextItems) => apply(withKey(node, "items", nextItems)),
            depth + 1,
            [h("span", { class: "wgd-sb-label" }, ["items"])]
          )
        ])
      );
    }

    return h("div", { class: depth === 0 ? "wgd-sb-root" : "wgd-sb-node" }, rows);
  }

  function render(): void {
    if (current === undefined) {
      const start = h("button", { class: "wgd-button wgd-add", type: "button" }, [
        "+ add a data schema"
      ]);
      start.addEventListener("click", () => commit({ type: "object" }));
      element.replaceChildren(
        h("div", undefined, [
          h("span", { class: "wgd-sb-label" }, [
            "No schema — data is accepted leniently."
          ]),
          h("div", { class: "wgd-toolbar" }, [start])
        ])
      );
      return;
    }
    const clear = h("button", { class: "wgd-button wgd-add wgd-remove", type: "button" }, [
      "remove schema"
    ]);
    clear.addEventListener("click", () => commit(undefined));
    element.replaceChildren(
      renderNode(current, (next) => commit(next), 0),
      h("div", { class: "wgd-toolbar" }, [clear])
    );
  }

  render();

  return {
    element,
    getValue: () => current,
    setValue(schema) {
      if (element.contains(document.activeElement)) return;
      current = schema;
      render();
    }
  };
}
