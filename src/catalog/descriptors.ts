import type { WidgetKind } from "../contract/types.js";
import type { DataSchema } from "./schema.js";
import type { WidgetStyles } from "./styles.js";

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
  /**
   * Optional JSON-Schema subset for `data` (see schema.ts). When present,
   * `catalog.render` validates data against it before rendering; kinds
   * without one keep their lenient fallback behavior.
   */
  dataSchema?: DataSchema;
  /**
   * Optional CSS-as-data for the kind's `.wg-` classes (see styles.ts).
   * Included in `page` output and exposable by hosts; guarded like themes.
   */
  styles?: WidgetStyles;
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
      "value line. `meta.title`/`meta.subtitle` fill in missing chrome. Send " +
      "field values typed (e.g. price: 9.99, not '$9.99') and use " +
      "hints.fieldFormat for display formatting — the payload keeps the " +
      "typed value while the render gets its unit. Field values that are " +
      "image URLs render as images (see hints.images).",
    dataExample: {
      title: "Essence Mascara",
      subtitle: "beauty",
      fields: { price: 9.99, rating: 2.56, stock: 99 }
    },
    hints: {
      fieldFormat:
        "Record<fieldKey, pattern> — formats matching field values by " +
        "substituting {value} in the pattern (e.g. { price: '${value}', " +
        "rating: '{value} / 5' }); a pattern without {value} is prefixed " +
        "to the value. Output is escaped like any text.",
      images:
        "Record<fieldKey, 'avatar' | 'thumb' | 'hero' | true | false> — " +
        "field values that are https image URLs (image extension) or " +
        "data:image/* URIs auto-render as images (default shape: thumb); " +
        "a shape forces image treatment (use for extensionless URLs), " +
        "true forces the default shape, false keeps the URL as text. " +
        "Unsafe sources always render as text; image treatment wins over " +
        "fieldFormat for the same key."
    }
  },
  table: {
    description: "Rows and columns for arrays of records.",
    dataShape:
      "An array of records (plain objects). Columns are the union of record keys " +
      "in first-seen order; missing cells render empty; non-array data becomes a " +
      "single row. Cell values that are image URLs render as avatars (see " +
      "hints.images).",
    dataExample: [
      { name: "Ada", role: "eng", avatar: "https://picsum.photos/id/64/64/64.jpg" },
      { name: "Lin", role: "ops", avatar: "https://picsum.photos/id/65/64/64.jpg" }
    ],
    hints: {
      columns: "string[] — overrides column selection and order",
      images:
        "Record<columnKey, 'avatar' | 'thumb' | 'hero' | true | false> — " +
        "cell values that are https image URLs (image extension) or " +
        "data:image/* URIs auto-render as images (default shape: avatar); " +
        "a shape forces image treatment (use for extensionless URLs), " +
        "true forces the default shape, false keeps the URL as text. " +
        "Unsafe sources always render as text."
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
