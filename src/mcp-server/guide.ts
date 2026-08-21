/**
 * The authoring guide: everything an external agent needs to DRAFT valid
 * widget and theme JSON for its user — who then imports, validates, and
 * saves it in the authenticated designer at widgentic.dev.
 *
 * Two rules govern this module (design D2/D3):
 *   - Facts with a live source of truth are DERIVED at call time —
 *     reserved kinds from the catalog, limits from the store defaults,
 *     tokens from the registry, patterns from the validators' own
 *     constants. Curated prose exists only where no constant does.
 *   - The guide teaches the write boundary: there is no MCP registration
 *     tool, deliberately. Saving is the user's authenticated act.
 */
import {
  PATTERN_MAX_LENGTH,
  PROPERTY_NAME,
  UNSAFE,
  createCatalog
} from "../catalog/index.js";
import { ALLOWED_SCHEMES } from "../contract/index.js";
import {
  DEFAULT_MAX_NODES,
  MAX_TEMPLATE_DEPTH,
  URL_ATTRS
} from "../templates/index.js";
import { CUSTOM_VARIABLE, TOKEN_SPECS } from "../theming/index.js";
import { DEFAULT_LIMITS, SAFE_IDENTIFIER } from "../store/index.js";
import type { McpToolResult } from "../mcp/index.js";

export function buildAuthoringGuide(): Record<string, unknown> {
  return {
    workflow: {
      summary:
        "You (the agent) draft the JSON; your user publishes it. Produce a " +
        "widget or theme following this guide, hand the JSON to your user, " +
        "and direct them to https://widgentic.dev — sign in, open the " +
        "widget or theme designer, use Import, review the live preview, " +
        "and save. The entry appears in their own MCP catalog on the next " +
        "tool call with their API key.",
      boundary:
        "There is deliberately NO MCP tool to register widgets or themes: " +
        "API keys are read-only credentials that travel into third-party " +
        "hosts, so writes require the user's authenticated session in the " +
        "designer. Do not look for or request a registration tool.",
      related:
        "Call list_widgets to see what already exists (avoid kind " +
        "collisions), list_schemas for the user's saved shared data " +
        "schemas, list_themes for registered themes, and " +
        "list_theme_tokens for token semantics and presets."
    },
    widget: {
      shape: {
        description:
          "A widget is one JSON object: { kind, template, descriptor }.",
        kind: `String identifier matching ${SAFE_IDENTIFIER.source}; must not collide with a reserved kind.`,
        template: "A template DSL node (see rules.template).",
        descriptor: {
          description: "REQUIRED string — what the widget shows, for agents.",
          dataShape: "REQUIRED string — a compact sketch of the expected data, e.g. '{ title, lines: [{ item, amount }] }'.",
          dataExample:
            "RECOMMENDED — an example the widget renders well; shown to agents and used as the designer's preview data.",
          dataSchemaRef:
            "OPTIONAL string — the NAME of one of the user's saved shared " +
            "schemas (discover with list_schemas), used IN PLACE of an " +
            "inline dataSchema: carrying both is refused. Use this when " +
            "the user names a saved schema ('use my person schema') — the " +
            "server resolves it at render time, so one shared schema " +
            "serves every widget that references it and edits propagate.",
          hints: "OPTIONAL record documenting supported hint keys.",
          styles:
            "OPTIONAL nested record: selector → { cssProperty: value } " +
            "(NOT css strings — no ';' anywhere; see rules.styles).",
          dataSchema: "OPTIONAL structural schema (see rules.dataSchema)."
        }
      },
      reservedKinds: createCatalog().kinds(),
      identifierPattern: SAFE_IDENTIFIER.source
    },
    theme: {
      shape: {
        description:
          "A theme entry is one JSON object: { name, label?, description?, tokens }.",
        name: `String identifier matching ${SAFE_IDENTIFIER.source}.`,
        label: "OPTIONAL human-readable display name.",
        tokens:
          "Record of registry token names (bare, no --wg- prefix) and/or " +
          "custom variables to string values."
      },
      tokens: Object.entries(TOKEN_SPECS).map(([name, spec]) => ({
        name,
        type: spec.type,
        use: spec.use,
        default: spec.default
      })),
      customVariables: {
        namePattern: CUSTOM_VARIABLE.source,
        appliedAs:
          "A custom variable x-foo becomes --wg-x-foo on the themed scope; " +
          "reference it from widget styles as var(--wg-x-foo)."
      },
      valueSafety:
        "Token values are plain CSS values. Rejected: ';', '{', '}', '<', " +
        "'>', 'url(' and 'expression(' (case-insensitive, " +
        "whitespace-tolerant). Keep values to colors, lengths, and font " +
        "stacks."
    },
    rules: {
      template: {
        forms: [
          "STRING — a text node: \"Hello\"",
          "BIND — { \"bind\": \"path.to.value\" } renders the value as text; '.' binds the scope itself",
          "EACH — { \"each\": \"path.to.array\", \"template\": <node>, \"empty\"?: <node> } repeats template with each item as scope",
          "WHEN — { \"when\": \"path\", \"template\": <node>, \"else\"?: <node> } renders template when the value is truthy",
          "ELEMENT — { \"tag\": \"div\", \"attrs\"?: { \"class\": \"x\", \"src\": { \"bind\": \"path\" } }, \"children\"?: [<node>...] }"
        ],
        safety: {
          eventHandlers:
            "Attribute names matching on* are forbidden (FORBIDDEN_ATTRIBUTE).",
          urlAttributes: `On ${[...URL_ATTRS].join(", ")}: only ${[...ALLOWED_SCHEMES].join(", ")} schemes or relative references survive rendering.`,
          images:
            "Exception: an img element's src additionally accepts base64 " +
            "data:image/*;base64, URIs.",
          markup:
            "Bindings only ever produce text and attribute strings — bound " +
            "values can never inject markup."
        },
        bounds: {
          maxDepth: MAX_TEMPLATE_DEPTH,
          maxInterpretedNodes: DEFAULT_MAX_NODES,
          note: "Validation rejects deeper nesting; interpretation stops at the node budget and marks the render truncated."
        },
        dataModeling:
          "PREFER binding only properties declared in descriptor.dataSchema " +
          "— schema-declared data is validated with dotted paths, so agents " +
          "get correctable errors instead of silently blank output. A " +
          "'$meta.x' bind path exists (reads the payload's meta) but meta " +
          "is NOT covered by dataSchema validation: avoid it, or reserve " +
          "it for genuinely out-of-band display like a caller-supplied " +
          "heading. If the widget needs a title, declare `title` as an " +
          "optional schema property instead. When the user names a SAVED " +
          "schema, set descriptor.dataSchemaRef to its name (shape from " +
          "list_schemas) and bind those properties — do NOT reconstruct " +
          "the schema inline: the copy forks the moment the user edits " +
          "the shared one."
      },
      styles: {
        shape:
          "descriptor.styles is { \"<selector>\": { \"<cssProperty>\": " +
          "\"<value>\" } } — each declaration is a separate key/value " +
          "pair, e.g. { \".wg-roster-row\": { \"display\": \"flex\", " +
          "\"gap\": \"var(--wg-spacing)\" } }.",
        selectors:
          "Every selector (and every comma-separated part) must target a " +
          ".wg- class, e.g. '.wg-card .wg-xcard-head'.",
        // Derived: the guard's own character class, plus the two
        // function forms the value check rejects on top of it.
        banned:
          `Selectors, properties, or values matching ${UNSAFE.source} — or ` +
          "containing 'url(' or 'expression(' — are dropped.",
        // The property rule is an ALLOWLIST, not merely "no banned
        // characters": a property with a digit or underscore is dropped
        // even though it contains nothing banned.
        propertyNames:
          `Property names must match ${PROPERTY_NAME.source} (letters and ` +
          "hyphens, optionally leading '-'); anything else is dropped.",
        tokens:
          "Reference theme tokens with var(--wg-<token>) and custom " +
          "variables with var(--wg-x-<name>); prefer tokens over literals " +
          "so themes restyle the widget. Every registry token is always " +
          "DEFINED at render time (defaults, overridden by the active " +
          "theme), so bare var(--wg-<token>) is safe — no fallback needed. " +
          "Custom x-* variables are defined only by themes that set them, " +
          "so give those a fallback: var(--wg-x-foo, <value>)."
      },
      dataSchema: {
        keywords:
          "Supported subset: type (object/array/string/number/integer/" +
          "boolean/null, or an array of those), properties, required, " +
          "items, enum, pattern. Unknown keywords are ignored.",
        pattern:
          `pattern is a bounded regex: max ${PATTERN_MAX_LENGTH} chars, no nested ` +
          "quantifiers, applied only to strings and capped input length; " +
          "unsafe or invalid patterns are ignored rather than enforced.",
        effect:
          "Kinds with a dataSchema fail fast with dotted paths (e.g. " +
          "data.lines.0.amount); schema-less kinds render leniently."
      }
    },
    limits: {
      maxWidgetsPerUser: DEFAULT_LIMITS.maxWidgets,
      maxThemesPerUser: DEFAULT_LIMITS.maxThemes,
      maxEntryBytes: DEFAULT_LIMITS.maxEntryBytes,
      maxTemplateNodes: DEFAULT_LIMITS.maxTemplateNodes,
      note:
        "maxTemplateNodes bounds the template's STRUCTURE as stored " +
        "(countTemplateNodes), distinct from the interpretation budget."
    }
  };
}

/** Pure handler: the guide as an MCP tool result. */
export function handleGetAuthoringGuide(): McpToolResult {
  return {
    content: [
      { type: "text", text: JSON.stringify(buildAuthoringGuide(), null, 2) }
    ]
  };
}
