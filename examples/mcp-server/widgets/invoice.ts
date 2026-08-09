import type { WidgetDescriptorInput } from "widgentic/catalog";
import type { WidgetTemplate } from "widgentic/templates";
import type { CustomWidget } from "./index.js";

/**
 * The demo `invoice` widget: a template-registered custom kind showing the
 * full designer-widget pipeline — serializable template DSL, strict data
 * schema, registered styles-as-data, and agent-facing descriptor guidance.
 */
const template: WidgetTemplate = {
  tag: "div",
  attrs: { class: "wg-invoice" },
  children: [
    {
      when: "title",
      template: { tag: "h2", children: [{ bind: "title" }] }
    },
    { tag: "p", children: ["Customer: ", { bind: "customer" }] },
    {
      tag: "ul",
      children: [
        {
          each: "lines",
          template: {
            tag: "li",
            children: [
              { bind: "item" },
              " × ",
              { bind: "qty" },
              " — ",
              { bind: "lineTotal" }
            ]
          },
          empty: "No line items."
        }
      ]
    },
    {
      when: "total",
      template: { tag: "p", children: ["Total: ", { bind: "total" }] }
    }
  ]
};

const descriptor: WidgetDescriptorInput = {
  description:
    "Invoice with customer, priced line items, and an optional total.",
  dataShape:
    "{ title?: string, customer: string, lines: { item: string, qty: " +
    "number, lineTotal: string }[], total?: string }. Pre-format money as display strings " +
    "(e.g. '$119.96') — templates render values verbatim, with no " +
    "arithmetic; compute line totals and the total caller-side, on a " +
    "consistent basis (line totals should sum to the total, or include a " +
    "discount line item explaining the difference). An optional `title` " +
    "renders as the heading.",
  dataExample: {
    title: "Invoice #1042",
    customer: "Ada Lovelace",
    lines: [{ item: "widgets", qty: 4, lineTotal: "$119.96" }],
    total: "$119.96"
  },
  styles: {
    ".wg-invoice": {
      background: "var(--wg-bg, #ffffff)",
      border: "1px solid var(--wg-border, #e2e8f0)",
      "border-radius": "var(--wg-radius, 6px)",
      "box-shadow": "var(--wg-shadow, 0 1px 3px rgba(0, 0, 0, 0.12))",
      padding: "calc(var(--wg-spacing, 8px) * 2)",
      "max-width": "28rem"
    },
    ".wg-invoice h2": {
      color: "var(--wg-accent, #2563eb)",
      "margin-top": "0"
    },
    ".wg-invoice li": {
      padding: "calc(var(--wg-spacing, 8px) / 2) 0",
      "border-bottom": "1px solid var(--wg-border, #e2e8f0)"
    }
  },
  dataSchema: {
    type: "object",
    required: ["customer", "lines"],
    properties: {
      // Optional heading — declared in the schema rather than read from
      // `$meta`, so everything the template binds is discoverable data.
      title: { type: "string" },
      customer: { type: "string" },
      lines: {
        type: "array",
        items: {
          type: "object",
          required: ["item", "qty", "lineTotal"],
          properties: {
            item: { type: "string" },
            qty: { type: "number" },
            // Formatted money string, e.g. "$119.96" or "1.234,56 €" —
            // bounded `pattern` keeps agents from sending bare numbers.
            lineTotal: { type: "string", pattern: "^[^<>{}]*[0-9][^<>{}]*$" }
          }
        }
      },
      total: { type: "string", pattern: "^[^<>{}]*[0-9][^<>{}]*$" }
    }
  }
};

export const invoiceWidget: CustomWidget = {
  kind: "invoice",
  template,
  descriptor
};
