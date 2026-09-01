// @vitest-environment happy-dom
/**
 * The authoring guide: derived facts equal their sources, the boundary is
 * taught, and — the test the change exists for — an "agent" that follows
 * ONLY the guide produces a widget and theme that import cleanly.
 */
import { describe, expect, it } from "vitest";
import {
  PATTERN_MAX_LENGTH,
  PROPERTY_NAME,
  UNSAFE,
  createCatalog,
  formatBoundValue
} from "@widgentic/core";
import { ACTION_NAME, CUSTOM_VARIABLE, TOKEN_SPECS, validateTheme } from "@widgentic/core";
import {
  CURRENCY_DISPLAYS,
  DATE_PATTERN_MAX,
  DATE_TOKENS,
  DEFAULT_FORMAT_LOCALE,
  FORMAT_DECIMALS_MAX,
  FORMAT_DECIMALS_MIN,
  FORMAT_TYPES
} from "@widgentic/core";
import {
  checkStoredAction,
  checkStoredTheme,
  checkStoredWidget,
  DEFAULT_LIMITS,
  SAFE_IDENTIFIER
} from "../../store/index.js";
import { buildAuthoringGuide, handleGetAuthoringGuide } from "../guide.js";

describe("authoring guide content", () => {
  const guide = buildAuthoringGuide() as {
    workflow: { summary: string; boundary: string; related: string };
    widget: { reservedKinds: string[]; identifierPattern: string };
    theme: { tokens: { name: string; type: string; use: string }[] };
    rules: Record<string, unknown>;
    limits: Record<string, number | string>;
  };

  it("carries every top-level section as parseable JSON through the handler", () => {
    const result = handleGetAuthoringGuide();
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(
      (result.content[0] as { text?: string })?.text ?? ""
    ) as Record<string, unknown>;
    for (const section of [
      "workflow",
      "widget",
      "sharedSchema",
      "sharedAction",
      "theme",
      "rules",
      "limits"
    ]) {
      expect(parsed[section], section).toBeDefined();
    }
  });

  it("derives reserved kinds, limits, and tokens from the live sources", () => {
    expect(guide.widget.reservedKinds).toEqual(createCatalog().kinds());
    expect(guide.widget.identifierPattern).toBe(SAFE_IDENTIFIER.source);
    expect(guide.limits.maxWidgetsPerUser).toBe(DEFAULT_LIMITS.maxWidgets);
    expect(guide.limits.maxThemesPerUser).toBe(DEFAULT_LIMITS.maxThemes);
    expect(guide.limits.maxEntryBytes).toBe(DEFAULT_LIMITS.maxEntryBytes);
    expect(guide.limits.maxTemplateNodes).toBe(DEFAULT_LIMITS.maxTemplateNodes);
    expect(guide.theme.tokens.map((t) => t.name).sort()).toEqual(
      Object.keys(TOKEN_SPECS).sort()
    );
    for (const token of guide.theme.tokens) {
      expect(token.type).toBe(TOKEN_SPECS[token.name as keyof typeof TOKEN_SPECS].type);
      expect(token.use.length).toBeGreaterThan(0);
    }
  });

  it("teaches the write boundary", () => {
    expect(guide.workflow.boundary).toMatch(/NO MCP tool to register/i);
    expect(guide.workflow.summary).toContain("widgentic.dev");
    expect(guide.workflow.related).toContain("list_widgets");
  });
});

describe("agent simulation: drafts built only from the guide import cleanly", () => {
  // Everything below is constructed strictly from guide statements:
  // shapes from widget.shape/theme.shape, forms from rules.template.forms,
  // kind charset from widget.identifierPattern (avoiding reservedKinds),
  // token names from theme.tokens, styles from rules.styles.
  const agentWidget = {
    kind: "team-roster", // matches ^[a-zA-Z0-9._-]+$, not a reserved kind
    template: {
      tag: "div",
      attrs: { class: "wg-roster" },
      children: [
        { tag: "h3", children: [{ bind: "$meta.title" }] },
        {
          each: "members",
          template: {
            tag: "div",
            attrs: { class: "wg-roster-row" },
            children: [
              { tag: "img", attrs: { src: { bind: "avatar" }, class: "wg-img wg-img-avatar" } },
              { tag: "span", children: [{ bind: "name" }] },
              { when: "lead", template: { tag: "em", children: ["lead"] } }
            ]
          },
          empty: { tag: "p", children: ["No members yet."] }
        }
      ]
    },
    descriptor: {
      description: "A team roster with avatars and lead markers.",
      dataShape: "{ members: [{ name, avatar, lead? }] }",
      dataExample: {
        members: [
          { name: "Ada", avatar: "https://cdn.example/ada.png", lead: true },
          { name: "Lin", avatar: "https://cdn.example/lin.png" }
        ]
      },
      styles: {
        ".wg-roster-row": {
          display: "flex",
          gap: "var(--wg-spacing)",
          "align-items": "center"
        },
        ".wg-roster": {
          background: "var(--wg-surface)",
          "border-radius": "var(--wg-radius)"
        }
      },
      dataSchema: {
        type: "object",
        required: ["members"],
        properties: {
          members: {
            type: "array",
            items: {
              type: "object",
              required: ["name"],
              properties: { name: { type: "string" }, avatar: { type: "string" } }
            }
          }
        }
      }
    }
  };

  const agentTheme = {
    name: "roster-brand",
    label: "Roster Brand",
    tokens: {
      accent: "#7c3aed",
      surface: "#f7f5ff",
      "x-roster-badge": "#ede9fe"
    }
  };

  it("the widget passes store validation unchanged", () => {
    expect(checkStoredWidget(agentWidget)).toBeUndefined();
  });

  it("the theme passes store and theme validation unchanged", () => {
    expect(checkStoredTheme(agentTheme)).toBeUndefined();
    expect(validateTheme(agentTheme.tokens).ok).toBe(true);
  });

  it("the widget renders its own dataExample through the real catalog", async () => {
    const { registerTemplate } = await import("@widgentic/core");
    const catalog = createCatalog();
    registerTemplate(
      catalog,
      agentWidget.kind,
      agentWidget.template,
      agentWidget.descriptor
    );
    const rendered = catalog.render({
      kind: agentWidget.kind,
      data: agentWidget.descriptor.dataExample,
      meta: { title: "Team" }
    });
    expect(rendered.ok).toBe(true);
  });

  it("the designer accepts both without corrections", async () => {
    const { createDesigner, createThemeDesigner } = await import(
      "@widgentic/designer"
    );
    const host = document.createElement("div");
    document.body.append(host);
    const designer = createDesigner(host);
    expect(designer.loadWidget(agentWidget).ok).toBe(true);
    designer.dispose();

    const themeHost = document.createElement("div");
    document.body.append(themeHost);
    const themeDesigner = createThemeDesigner(themeHost);
    expect(themeDesigner.loadTheme(agentTheme).ok).toBe(true);
    themeDesigner.dispose();
  });
});

describe("guide facts are derived, never restated", () => {
  it("quotes the validators' own constants", () => {
    const guide = buildAuthoringGuide() as {
      theme: { customVariables: { namePattern: string } };
      rules: {
        styles: { banned: string; propertyNames: string };
        dataSchema: { pattern: string };
      };
    };
    // Each of these shadowed a real constant as prose and would have
    // lied silently the moment the validator moved.
    expect(guide.theme.customVariables.namePattern).toBe(CUSTOM_VARIABLE.source);
    expect(guide.rules.styles.banned).toContain(UNSAFE.source);
    expect(guide.rules.styles.propertyNames).toContain(PROPERTY_NAME.source);
    expect(guide.rules.dataSchema.pattern).toContain(String(PATTERN_MAX_LENGTH));
  });

  it("states the property ALLOWLIST, not just the banned characters", () => {
    const guide = buildAuthoringGuide() as {
      rules: { styles: { propertyNames: string } };
    };
    // A property with a digit contains nothing banned yet is dropped —
    // an agent following the ban list alone would emit vanishing styles.
    expect(PROPERTY_NAME.test("grid-template")).toBe(true);
    expect(PROPERTY_NAME.test("grid2")).toBe(false);
    expect(guide.rules.styles.propertyNames).toBeTruthy();
  });
});

describe("guide teaches shared-schema references", () => {
  it("documents dataSchemaRef and steers to list_schemas over inline copies", () => {
    const guide = buildAuthoringGuide() as {
      widget: { shape: { descriptor: Record<string, string> } };
      rules: { template: { dataModeling: string } };
      workflow: { related: string };
    };
    const ref = guide.widget.shape.descriptor.dataSchemaRef ?? "";
    expect(ref).toContain("list_schemas");
    expect(ref).toContain("IN PLACE of");
    expect(guide.rules.template.dataModeling).toContain("dataSchemaRef");
    expect(guide.rules.template.dataModeling).toContain("do NOT reconstruct");
    expect(guide.workflow.related).toContain("list_schemas");
  });

  it("documents the schema entry shape and its import path", () => {
    const guide = buildAuthoringGuide() as {
      sharedSchema: {
        shape: { description: string; name: string };
        workflow: string;
      };
    };
    // The exact hand-off the live test exposed: the agent drafts this
    // entry; the user needs to know where it goes.
    expect(guide.sharedSchema.shape.description).toContain("{ name, label?");
    expect(guide.sharedSchema.shape.description).toContain("Data schemas section");
    expect(guide.sharedSchema.workflow).toContain("Import");
    expect(guide.sharedSchema.workflow).toContain("THEN draft widgets");
  });
});

describe("a guide-only agent using the attr transforms", () => {
  /**
   * Built following ONLY the guide's ATTR MAP / ATTR PREFIX form lines —
   * the person-card shape the transforms exist for: semantic status
   * coloring and mailto/tel links.
   */
  const contactCard = {
    kind: "contact-card",
    template: {
      tag: "div",
      attrs: { class: "wg-card" },
      children: [
        { tag: "h3", attrs: { class: "wg-card-title" }, children: [{ bind: "name" }] },
        {
          tag: "span",
          attrs: {
            class: {
              bind: "status",
              map: {
                active: "wg-status wg-status-success",
                "do-not-contact": "wg-status wg-status-danger"
              },
              default: "wg-status"
            }
          },
          children: [{ bind: "status" }]
        },
        {
          tag: "a",
          attrs: { href: { bind: "email", prefix: "mailto:" } },
          children: [{ bind: "email" }]
        },
        {
          tag: "a",
          attrs: { href: { bind: "phone", prefix: "tel:" } },
          children: [{ bind: "phone" }]
        }
      ]
    },
    descriptor: {
      description: "A contact with semantic status and actionable links.",
      dataShape: "{ name, status, email, phone }",
      dataExample: {
        name: "Marcus Oyelaran",
        status: "do-not-contact",
        email: "m.oyelaran@example.org",
        phone: "+1 250-555-0163"
      },
      dataSchema: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          status: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" }
        }
      }
    }
  };

  it("passes store validation and the designer import unchanged", async () => {
    expect(checkStoredWidget(contactCard)).toBeUndefined();
    const { createDesigner } = await import("@widgentic/designer");
    const host = document.createElement("div");
    document.body.append(host);
    const designer = createDesigner(host);
    expect(designer.loadWidget(contactCard).ok).toBe(true);
    designer.dispose();
  });

  it("renders with the selected class and working links", async () => {
    const { registerTemplate } = await import("@widgentic/core");
    const { renderToHtml } = await import("@widgentic/core");
    const catalog = createCatalog();
    registerTemplate(catalog, contactCard.kind, contactCard.template, contactCard.descriptor);
    const rendered = catalog.render({
      kind: contactCard.kind,
      data: contactCard.descriptor.dataExample
    });
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;
    const html = renderToHtml(rendered.node);
    expect(html).toContain('class="wg-status wg-status-danger"');
    expect(html).toContain('href="mailto:m.oyelaran@example.org"');
    expect(html).toContain('href="tel:+1 250-555-0163"');
  });

  it("the guide's form lines actually teach the transforms", () => {
    const guide = buildAuthoringGuide() as {
      rules: { template: { forms: string[] } };
    };
    const forms = guide.rules.template.forms.join("\n");
    expect(forms).toContain("ATTR MAP");
    expect(forms).toContain("ATTR PREFIX");
    expect(forms).toContain("mailto:");
    // the mutual-exclusion rule states itself, rather than riding on the
    // ACTION line's unrelated "never both href and action"
    expect(forms).toContain("ONE TRANSFORM PER VALUE");
    expect(forms).toMatch(/map, prefix and format are mutually exclusive/);
  });
});

describe("guide teaches the format transform", () => {
  const guide = buildAuthoringGuide() as {
    rules: { template: { forms: string[]; actions: { binding: string } } };
  };
  const forms = guide.rules.template.forms.join("\n");

  it("derives the vocabulary and bounds from the validator's own constants", () => {
    expect(forms).toContain("FORMAT");
    for (const type of FORMAT_TYPES) expect(forms).toContain(type);
    for (const display of CURRENCY_DISPLAYS) expect(forms).toContain(display);
    for (const token of DATE_TOKENS) expect(forms).toContain(token);
    expect(forms).toContain(`${FORMAT_DECIMALS_MIN}-${FORMAT_DECIMALS_MAX}`);
    expect(forms).toContain(String(DATE_PATTERN_MAX));
    expect(forms).toContain(DEFAULT_FORMAT_LOCALE);
    // The example outputs are RENDERED by the engine, not typed by hand.
    expect(forms).toContain(
      formatBoundValue("3206.9905920000", { type: "currency", currency: "COP", decimals: 0 })
    );
    expect(forms).toContain(
      formatBoundValue("2026-09-01T02:04:47", { type: "date", pattern: "dd-MM-yyyy HH:mm" })
    );
    // the currency recipe that motivated it
    expect(forms).toContain("$3,207");
    expect(forms).toContain("dd-MM-yyyy HH:mm");
  });

  it("teaches that a list response projects per item", () => {
    expect(guide.rules.template.actions.binding).toContain("per ITEM");
    expect(forms).toContain("EACH ITEM");
  });

  /** A ticker widget an agent could draft from the guide alone. */
  const ticker = {
    kind: "usdc-cop-ticker",
    template: {
      tag: "ul",
      children: [
        {
          each: ".",
          template: {
            tag: "li",
            children: [
              { bind: "book" },
              " ",
              { bind: "ask", format: { type: "currency", currency: "COP", decimals: 0 } },
              " @ ",
              { bind: "date", format: { type: "date", pattern: "dd-MM-yyyy HH:mm" } }
            ]
          }
        }
      ]
    },
    descriptor: {
      description: "A currency ticker: one row per book with its ask price and time.",
      dataShape: "[{ ask, bid, book, date }]",
      dataExample: [
        {
          ask: "3206.9905920000",
          bid: "3179.4300000000",
          book: "usdc_cop",
          date: "2026-09-01T02:04:47.257871358"
        }
      ],
      dataSchema: {
        type: "array",
        items: {
          type: "object",
          properties: {
            ask: { type: "string" },
            bid: { type: "string" },
            book: { type: "string" },
            date: { type: "string" }
          }
        }
      }
    }
  };

  it("a widget drafted with a currency and a date format passes store validation", () => {
    expect(checkStoredWidget(ticker)).toBeUndefined();
  });

  it("and renders the formatted values", async () => {
    const { registerTemplate, renderToHtml } = await import("@widgentic/core");
    const catalog = createCatalog();
    registerTemplate(catalog, ticker.kind, ticker.template, ticker.descriptor);
    const rendered = catalog.render({ kind: ticker.kind, data: ticker.descriptor.dataExample });
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;
    const html = renderToHtml(rendered.node);
    expect(html).toContain("$3,207");
    expect(html).toContain("01-09-2026 02:04");
    // the payload keeps the typed value
    expect(ticker.descriptor.dataExample[0]?.ask).toBe("3206.9905920000");
  });

  it("the designer imports it unchanged", async () => {
    const { createDesigner } = await import("@widgentic/designer");
    const host = document.createElement("div");
    document.body.append(host);
    const designer = createDesigner(host);
    expect(designer.loadWidget(ticker).ok).toBe(true);
    designer.dispose();
  });
});

describe("guide teaches standalone shared actions", () => {
  const guide = buildAuthoringGuide() as {
    sharedAction: {
      shape: { description: string; name: string; definition: string };
      workflow: string;
    };
    rules: { template: { forms: string[]; actions: { binding: string } } };
    workflow: { related: string };
    limits: Record<string, number | string>;
  };

  it("documents the entry shape, the name rule and the import path", () => {
    // The DSL binds { ref }; this section is where an agent learns what
    // the referenced entry IS and where it comes from.
    expect(guide.sharedAction.shape.description).toContain("{ name, label?");
    expect(guide.sharedAction.shape.description).toContain("Actions section");
    expect(guide.sharedAction.shape.definition).toContain('"kind": "prompt"');
    expect(guide.sharedAction.shape.definition).toContain('"kind": "http"');
    expect(guide.sharedAction.workflow).toContain("list_actions");
  });

  it("quotes the action name pattern from the constant that enforces it", () => {
    expect(guide.sharedAction.shape.name).toContain(ACTION_NAME.source);
    // Stricter than the identifier every other entry uses — a guide that
    // restated the wrong one would teach names the store then refuses.
    expect(ACTION_NAME.test("Weather_1")).toBe(false);
    expect(SAFE_IDENTIFIER.test("Weather_1")).toBe(true);
  });

  it("steers to list_actions and forbids inventing one", () => {
    expect(guide.workflow.related).toContain("list_actions");
    expect(guide.rules.template.actions.binding).toContain("list_actions");
    expect(guide.rules.template.actions.binding).toContain("DESCRIBE");
    expect(guide.sharedAction.workflow).toContain("do NOT");
    expect(guide.rules.template.forms.join("\n")).toContain('"ref"');
    // The widget-level load is part of the binding vocabulary being taught.
    expect(guide.rules.template.actions.binding).toContain('"load"');
    expect(guide.rules.template.actions.binding).toContain("GET only");
  });

  it("publishes the caps on every entry an agent drafts", () => {
    expect(guide.limits.maxSchemasPerUser).toBe(DEFAULT_LIMITS.maxSchemas);
    expect(guide.limits.maxActionsPerUser).toBe(DEFAULT_LIMITS.maxActions);
  });
});

describe("a guide-only agent binding a saved action", () => {
  /**
   * Drafted from the guide alone: the shared entry the user imports, and a
   * widget that BINDS it by ref rather than inlining a definition.
   */
  const refreshAction = {
    name: "weather-current",
    label: "Current weather",
    definition: {
      kind: "http" as const,
      method: "GET" as const,
      url: "https://api.example.com/v1/current.json",
      input: {
        type: "object",
        required: ["city"],
        properties: { city: { type: "string" } }
      },
      output: {
        type: "object",
        properties: { temp_c: { type: "number" } }
      }
    }
  };
  const weatherCard = {
    kind: "weather-card",
    template: {
      tag: "div",
      attrs: { class: "wg-card" },
      children: [
        { tag: "h3", attrs: { class: "wg-card-title" }, children: [{ bind: "city" }] },
        { tag: "p", children: [{ bind: "reading.temp_c" }, " °C"] },
        {
          tag: "button",
          action: {
            ref: "weather-current",
            input: { city: "city" },
            output: { mode: "patch" as const, path: "reading" }
          },
          children: ["Refresh"]
        }
      ]
    },
    descriptor: {
      description: "A city's current reading with a refresh.",
      dataShape: "{ city, reading }",
      dataExample: { city: "Vancouver", reading: { temp_c: 23 } },
      dataSchema: {
        type: "object",
        required: ["city"],
        properties: {
          city: { type: "string" },
          reading: { type: "object", properties: { temp_c: { type: "number" } } }
        }
      }
    }
  };

  it("both entries pass the store's write validation unchanged", () => {
    expect(checkStoredAction(refreshAction, DEFAULT_LIMITS)).toBeUndefined();
    expect(checkStoredWidget(weatherCard)).toBeUndefined();
  });

  it("the drafted name obeys the pattern the guide published", () => {
    expect(ACTION_NAME.test(refreshAction.name)).toBe(true);
  });
});
