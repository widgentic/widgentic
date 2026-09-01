/**
 * Seeding: start a new draft as a COPY of something that exists — a stored
 * widget, a stored theme, a built-in kind, or a theme preset. A seed is a
 * copy at creation time with a distinct identity; it never links back to
 * its source and never mutates it. Pure functions: the app wires buttons,
 * the demo designer can reuse them, tests need no DOM.
 */
import { TOKEN_DEFAULTS, darkTheme } from "@widgentic/core";
import type { ThemeEntry } from "@widgentic/core";
import type { WidgetDraft } from "./store.js";
import { cloneDraft } from "./store.js";

/** Built-in kinds that have a starter template (custom/group do not). */
export const SEEDABLE_BUILTINS = ["card", "table", "tree"] as const;
export type SeedableBuiltin = (typeof SEEDABLE_BUILTINS)[number];

const RESERVED_THEME_NAMES = new Set(["light", "dark"]);

/**
 * Deterministic distinct identity: `<base>-copy`, then `-copy2`, … The
 * base itself is never returned — a seed keeping its source's identity
 * would OVERWRITE the source on first save (the store keys by kind/name).
 */
function distinctIdentity(base: string, taken: ReadonlySet<string>): string {
  let candidate = `${base}-copy`;
  for (let n = 2; taken.has(candidate); n++) candidate = `${base}-copy${n}`;
  return candidate;
}

/** Fresh identity for a from-scratch starter (`my-card`, `my-card2`, …). */
function starterIdentity(base: string, taken: ReadonlySet<string>): string {
  let candidate = `my-${base}`;
  for (let n = 2; taken.has(candidate); n++) candidate = `my-${base}${n}`;
  return candidate;
}

/**
 * Starter drafts approximating the renderable built-ins. They wear the
 * built-in `wg-*` classes so the base stylesheet and themes make the seed
 * look like the original from the first preview. Fixed bindings stand in
 * for the built-ins' dynamic behavior (the template DSL binds NAMED
 * properties — a seed is a starting point, not a re-implementation).
 */
function builtinStarter(kind: SeedableBuiltin): Omit<WidgetDraft, "kind"> {
  switch (kind) {
    case "card":
      return {
        template: {
          tag: "div",
          attrs: { class: "wg-card" },
          children: [
            {
              when: "title",
              template: {
                tag: "div",
                attrs: { class: "wg-card-title" },
                children: [{ bind: "title" }]
              }
            },
            {
              when: "subtitle",
              template: {
                tag: "div",
                attrs: { class: "wg-card-subtitle" },
                children: [{ bind: "subtitle" }]
              }
            },
            {
              tag: "dl",
              attrs: { class: "wg-card-fields" },
              children: (["price", "rating", "stock"] as const).map((field) => ({
                tag: "div",
                attrs: { class: "wg-card-field" },
                children: [
                  { tag: "dt", attrs: { class: "wg-card-field-key" }, children: [field] },
                  {
                    tag: "dd",
                    attrs: { class: "wg-card-field-value" },
                    children: [{ bind: field }]
                  }
                ]
              }))
            }
          ]
        },
        descriptor: {
          description:
            "Card seeded from the built-in: title/subtitle chrome over fixed " +
            "field rows. Rename the fields to your data.",
          dataShape: "{ title?, subtitle?, price, rating, stock }",
          dataExample: {
            title: "Essence Mascara",
            subtitle: "beauty",
            price: 9.99,
            rating: 2.56,
            stock: 99
          },
          dataSchema: {
            type: "object",
            required: ["price", "rating", "stock"],
            properties: {
              title: { type: "string" },
              subtitle: { type: "string" },
              price: { type: "number" },
              rating: { type: "number" },
              stock: { type: "integer" }
            }
          }
        }
      };
    case "table":
      return {
        template: {
          tag: "table",
          attrs: { class: "wg-table" },
          children: [
            {
              tag: "thead",
              attrs: { class: "wg-table-head" },
              children: [
                {
                  tag: "tr",
                  children: (["name", "role"] as const).map((column) => ({
                    tag: "th",
                    attrs: { class: "wg-table-header" },
                    children: [column]
                  }))
                }
              ]
            },
            {
              tag: "tbody",
              attrs: { class: "wg-table-body" },
              children: [
                {
                  each: "rows",
                  template: {
                    tag: "tr",
                    attrs: { class: "wg-table-row" },
                    children: [
                      {
                        tag: "td",
                        attrs: { class: "wg-table-cell" },
                        children: [{ bind: "name" }]
                      },
                      {
                        tag: "td",
                        attrs: { class: "wg-table-cell" },
                        children: [{ bind: "role" }]
                      }
                    ]
                  }
                }
              ]
            }
          ]
        },
        descriptor: {
          description:
            "Table seeded from the built-in: fixed columns over a named rows " +
            "array (templates bind named properties; the built-in's dynamic " +
            "column union stays with the built-in). Rename the columns to " +
            "your data.",
          dataShape: "{ rows: { name, role }[] }",
          dataExample: {
            rows: [
              { name: "Ada", role: "eng" },
              { name: "Lin", role: "ops" }
            ]
          },
          dataSchema: {
            type: "object",
            required: ["rows"],
            properties: {
              rows: {
                type: "array",
                items: {
                  type: "object",
                  required: ["name", "role"],
                  properties: {
                    name: { type: "string" },
                    role: { type: "string" }
                  }
                }
              }
            }
          }
        }
      };
    case "tree":
      return {
        template: {
          tag: "ul",
          attrs: { class: "wg-tree" },
          children: [
            {
              each: "nodes",
              template: {
                tag: "li",
                attrs: { class: "wg-tree-node" },
                children: [
                  {
                    // The built-in's branch shape: a native disclosure whose
                    // summary carries the label, seeded open.
                    tag: "details",
                    attrs: { class: "wg-tree-branch", open: "" },
                    children: [
                      {
                        tag: "summary",
                        attrs: { class: "wg-tree-label" },
                        children: [
                          {
                            when: "icon",
                            template: {
                              tag: "span",
                              attrs: { class: "wg-tree-icon" },
                              children: [{ bind: "icon" }]
                            }
                          },
                          { bind: "label" }
                        ]
                      },
                      {
                        tag: "ul",
                        attrs: { class: "wg-tree-children" },
                        children: [
                          {
                            each: "children",
                            template: {
                              tag: "li",
                              attrs: { class: "wg-tree-node" },
                              children: [
                                {
                                  tag: "span",
                                  attrs: { class: "wg-tree-label" },
                                  children: [
                                    {
                                      when: "icon",
                                      template: {
                                        tag: "span",
                                        attrs: { class: "wg-tree-icon" },
                                        children: [{ bind: "icon" }]
                                      }
                                    },
                                    { bind: "label" }
                                  ]
                                }
                              ]
                            }
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            }
          ]
        },
        descriptor: {
          description:
            "Tree seeded from the built-in: two fixed levels of labeled nodes " +
            "(templates cannot recurse; the built-in stays the choice for " +
            "arbitrary depth). Reshape the levels to your data.",
          dataShape: "{ nodes: { label, icon?, children: { label, icon? }[] }[] }",
          dataExample: {
            nodes: [
              {
                label: "root",
                icon: "\u{1F4C1}",
                children: [
                  { label: "leaf", icon: "\u{1F4C4}" },
                  { label: "leaf 2", icon: "\u{1F4C4}" }
                ]
              }
            ]
          },
          dataSchema: {
            type: "object",
            required: ["nodes"],
            properties: {
              nodes: {
                type: "array",
                items: {
                  type: "object",
                  required: ["label"],
                  properties: {
                    label: { type: "string" },
                    icon: { type: "string" },
                    children: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["label"],
                        properties: {
                          label: { type: "string" },
                          icon: { type: "string" }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };
  }
}

/**
 * Seed a widget draft from a stored definition or a built-in kind name.
 * The result always carries an identity distinct from the source AND from
 * every entry in `taken`.
 */
export function seedWidgetDraft(
  source: WidgetDraft | SeedableBuiltin,
  taken: Iterable<string> = []
): WidgetDraft {
  const takenSet = new Set(taken);
  if (typeof source === "string") {
    return { kind: starterIdentity(source, takenSet), ...builtinStarter(source) };
  }
  const copy = cloneDraft(source);
  takenSet.add(source.kind);
  copy.kind = distinctIdentity(source.kind, takenSet);
  return copy;
}

/**
 * Seed a theme entry from a stored entry or a preset name. Preset sources:
 * `light` = the token defaults, `dark` = the dark preset. The result's
 * name is distinct from the source, never reserved, and avoids `taken`.
 */
export function seedThemeEntry(
  source: ThemeEntry | "light" | "dark",
  taken: Iterable<string> = []
): ThemeEntry {
  const takenSet = new Set(taken);
  for (const reserved of RESERVED_THEME_NAMES) takenSet.add(reserved);
  if (typeof source === "string") {
    const tokens =
      source === "dark" ? { ...darkTheme } : { ...TOKEN_DEFAULTS };
    return {
      name: starterIdentity(source, takenSet),
      label: source === "dark" ? "My dark theme" : "My light theme",
      tokens
    };
  }
  const copy = JSON.parse(JSON.stringify(source)) as ThemeEntry;
  takenSet.add(source.name);
  copy.name = distinctIdentity(source.name, takenSet);
  return copy;
}
