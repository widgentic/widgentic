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
  createCatalog
} from "../../catalog/index.js";
import { CUSTOM_VARIABLE, TOKEN_SPECS, validateTheme } from "../../theming/index.js";
import {
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

  it("carries the five sections as parseable JSON through the handler", () => {
    const result = handleGetAuthoringGuide();
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(
      (result.content[0] as { text?: string })?.text ?? ""
    ) as Record<string, unknown>;
    for (const section of ["workflow", "widget", "theme", "rules", "limits"]) {
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
    const { registerTemplate } = await import("../../templates/index.js");
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
      "../../designer/index.js"
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
