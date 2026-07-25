import type { WidgetKind } from "../contract/types.js";

/**
 * Agent-facing documentation for a widget kind. Descriptors make the
 * catalog reflectable: tooling (e.g. the widgentic MCP server's
 * `list_widgets`) lists them so agents can pick a widget and shape their
 * `data` without reading source.
 */
export interface WidgetDescriptor {
  kind: WidgetKind;
  /** What the widget is for. */
  description: string;
  /** Human-readable description of the expected `data` input. */
  dataShape: string;
  /** Small example `data` value an agent can imitate. */
  dataExample?: unknown;
  /** Supported hint keys and what they do. */
  hints?: Record<string, string>;
}

/** Descriptor as supplied at registration; `kind` is filled by the catalog. */
export type WidgetDescriptorInput = Omit<WidgetDescriptor, "kind">;

/**
 * Honest documentation of the built-ins' actual (lenient) behavior. Every
 * `dataExample` is asserted by tests to render successfully.
 */
export const BUILTIN_DESCRIPTORS: Record<
  "card" | "table" | "tree" | "custom",
  WidgetDescriptorInput
> = {
  card: {
    description:
      "Key/value details for a single entity, with optional title and subtitle.",
    dataShape:
      "A plain object. `title`, `subtitle`, and `fields` are used when present; " +
      "other entries become field key/value pairs. Primitives render as a single " +
      "value line. `meta.title`/`meta.subtitle` fill in missing chrome. Field " +
      "values render as given — pre-format display strings yourself (e.g. " +
      "'$9.99', '2.56 / 5'); there are no formatting hints.",
    dataExample: {
      title: "Essence Mascara",
      subtitle: "beauty",
      fields: { price: "$9.99", rating: "2.56 / 5", stock: 99 }
    }
  },
  table: {
    description: "Rows and columns for arrays of records.",
    dataShape:
      "An array of records (plain objects). Columns are the union of record keys " +
      "in first-seen order; missing cells render empty; non-array data becomes a " +
      "single row.",
    dataExample: [
      { name: "Ada", role: "eng" },
      { name: "Lin", role: "ops" }
    ],
    hints: {
      columns: "string[] — overrides column selection and order"
    }
  },
  tree: {
    description: "Collapsible hierarchy of labeled nodes.",
    dataShape:
      "Nested `{ label, children[] }` nodes — a single root object or an array of " +
      "them. Nodes without a usable `label` get a JSON fallback label.",
    dataExample: {
      label: "root",
      children: [{ label: "leaf", children: [] }]
    },
    hints: {
      expandDepth:
        "number — branches at depth < value start expanded (default: " +
        "unlimited). Presentational only: the full subtree is always in the " +
        "markup; `data-expanded` appears only on nodes with children, and " +
        "the widgentic base stylesheet hides collapsed children via CSS."
    }
  },
  custom: {
    description:
      "Generic escape hatch: renders any data as pretty-printed JSON. Best " +
      "for raw inspection and debugging — for human-legible output, reshape " +
      "the data and use card, table, or tree instead (e.g. join values with " +
      "their units: '24.4 °C').",
    dataShape: "Any JSON value, rendered verbatim (value-exact, not byte-exact).",
    dataExample: { anything: ["goes", 42] }
  }
};
