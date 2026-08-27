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
} from "@widgentic/core";
import { ALLOWED_SCHEMES } from "@widgentic/core";
import {
  DEFAULT_MAX_NODES,
  MAX_TEMPLATE_DEPTH,
  URL_ATTRS
} from "@widgentic/core";
import { CUSTOM_VARIABLE, TOKEN_SPECS } from "@widgentic/core";
import { DEFAULT_LIMITS, SAFE_IDENTIFIER } from "../store/index.js";
import type { McpToolResult } from "../output/index.js";

export function buildAuthoringGuide(): Record<string, unknown> {
  return {
    workflow: {
      summary:
        "You (the agent) draft the JSON; your user publishes it. Produce a " +
        "widget or theme following this guide, hand the JSON to your user, " +
        "and direct them to https://widgentic.dev — sign in, open the " +
        "widget, theme, or Data schemas designer, use Import, review, " +
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
    sharedSchema: {
      shape: {
        description:
          "A shared data schema is one JSON object: { name, label?, " +
          "description?, schema } — defined once, referenced by many " +
          "widgets via descriptor.dataSchemaRef. The user imports it in " +
          "the Data schemas section at widgentic.dev.",
        name: `String identifier matching ${SAFE_IDENTIFIER.source}.`,
        label: "OPTIONAL human-readable display name.",
        schema:
          "The schema object itself, in the same subset as " +
          "descriptor.dataSchema (see rules.dataSchema)."
      },
      workflow:
        "Draft the entry, hand it to your user for Import in the Data " +
        "schemas section, THEN draft widgets referencing it by name — the " +
        "reference validates against the saved schema when the user saves " +
        "the widget."
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
          "PATHS — dot paths against the current scope (each item inside EACH). Escapes: '$meta.x' reads payload.meta; '$root.x' reads the top-level data from any depth; '$parent.x' steps out of one enclosing EACH per token ('$parent.$parent.x'); '$index' is the zero-based position in the innermost EACH",
          "EACH — { \"each\": \"path.to.array\", \"template\": <node>, \"empty\"?: <node> } repeats template with each item as scope",
          "WHEN — { \"when\": \"path\", \"template\": <node>, \"else\"?: <node> } renders template when the value is truthy",
          "ELEMENT — { \"tag\": \"div\", \"attrs\"?: { \"class\": \"x\", \"src\": { \"bind\": \"path\" } }, \"children\"?: [<node>...] }",
          "ATTR MAP — { \"bind\": \"status\", \"map\": { \"do-not-contact\": \"wg-status wg-status-danger\", \"active\": \"wg-status wg-status-success\" }, \"default\": \"wg-status\" } — the bound value SELECTS one of your literals (semantic classes from data values); a miss emits default, or empty without one",
          "ATTR PREFIX — { \"bind\": \"email\", \"prefix\": \"mailto:\" } — emits prefix+value only when the value is non-empty (mailto:/tel: links; both schemes are allowed on href). One transform per attr value: map OR prefix, never both",
          "ACTION — an element may carry \"action\": { \"ref\": \"<shared action name>\" } or an inline { \"definition\": { \"kind\": \"prompt\", \"text\": [\"Show the forecast for \", { \"bind\": \"city\" }] } } / { \"definition\": { \"kind\": \"http\", \"method\": \"GET\", \"url\": \"https://…\", \"input\": <schema>, \"output\": <schema> } }, plus \"input\": { \"<field>\": \"<path>\" | { \"const\": <value> } } and \"output\": { \"mode\"?: \"replace\"|\"merge\"|\"patch\", \"path\"?, \"map\"? }. Bindings resolve at render time; buttons and links (never both href and action) become activatable in Apps hosts. A widget-level \"load\" (http GET only) runs once when the widget first renders"
        ],
        actions: {
          kinds:
            "prompt — proposes a message the user reviews and sends from their composer (works with any key); " +
            "http — a server-side GET/POST to a fixed https URL with an input schema (GET → query, POST → JSON body) and an output schema the response must satisfy; headers/query values may reference the user's secrets by name ({ \"secret\": \"<name>\" }).",
          binding:
            "Put \"action\": { \"ref\": \"<shared action name>\" } or { \"definition\": <inline definition> } on a button or link (never together with href), plus \"input\": { \"<field>\": \"<data path>\" | { \"const\": <value> } } resolved at render time in the element's scope ($root/$parent/$index available) and \"output\": { \"mode\": \"merge\"|\"replace\"|\"patch\", \"path\"?, \"map\"? }. Arguments must be declared in the action's input schema and must not share a name with a fixed query parameter.",
          limits:
            "http targets must be public https hosts (no private/loopback/link-local, no redirects); the whole request has an 8 s deadline and a 256 KiB response cap; the response must be application/json (or application/*+json); a 204/empty body arrives as null. Design the output schema for exactly that response.",
          execution:
            "http actions run only in Apps hosts that proxy widget tool calls AND under an API key carrying the 'execute' scope (opt-in when the key is created). A render for a read-only key marks them disabled: \"scope\" (the key lacks execute), \"unresolved\" (a referenced shared action does not exist). The frame calls execute_action itself; agents never do. After each http action the widget posts its new payload to the model's context.",
          secrets:
            "Secrets are named, write-only, envelope-encrypted, and injected server-side at execution; they never appear in templates, results or logs."
        },
        safety: {
          eventHandlers:
            "Attribute names matching on* and srcdoc are forbidden (FORBIDDEN_ATTRIBUTE).",
          tags:
            "script, iframe, frame, frameset, object, embed, style, link, meta, base, template and noscript are forbidden (FORBIDDEN_TAG) — a template is data, never active content.",
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
