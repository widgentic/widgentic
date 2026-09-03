/**
 * The authoring contract as the agent in the browser reads it: what a valid
 * widget, theme, schema or action IS, in the same terms the designers'
 * validators enforce. It mirrors the MCP server's `get_authoring_guide`
 * (packages/mcp/src/server/guide.ts) on purpose — that package is Node-only
 * and this one runs in the page — with one difference in the workflow: here
 * the agent LOADS into the designer the person has open, instead of handing
 * JSON over for import. Facts with a live source are derived from
 * @widgentic/core's exported constants; the two store constants below are
 * copied because the store lives in the Node package.
 */
import {
  ACTION_NAME,
  ALLOWED_SCHEMES,
  CURRENCY_DISPLAYS,
  CUSTOM_VARIABLE,
  DATE_PATTERN_MAX,
  DATE_TOKENS,
  DEFAULT_FORMAT_LOCALE,
  DEFAULT_MAX_NODES,
  FORMAT_DECIMALS_MAX,
  FORMAT_DECIMALS_MIN,
  FORMAT_TYPES,
  MAX_TEMPLATE_DEPTH,
  PATTERN_MAX_LENGTH,
  PROPERTY_NAME,
  TOKEN_SPECS,
  UNSAFE,
  URL_ATTRS,
  createCatalog,
  formatBoundValue
} from "@widgentic/core";

/** Copied from @widgentic/mcp's store (SAFE_IDENTIFIER, DEFAULT_LIMITS): keep in step when they move. */
export const SAFE_IDENTIFIER = /^[a-zA-Z0-9._-]+$/;
export const STORE_LIMITS = {
  maxWidgets: 100,
  maxThemes: 50,
  maxSchemas: 50,
  maxActions: 50,
  maxEntryBytes: 65_536,
  maxTemplateNodes: 2_000
} as const;

const FORMAT_EXAMPLES = {
  currency: formatBoundValue("3206.9905920000", { type: "currency", currency: "COP", decimals: 0 }),
  date: formatBoundValue("2026-09-01T02:04:47", { type: "date", pattern: "dd-MM-yyyy HH:mm" })
};

/**
 * The rules an agent must hold while drafting, short enough to ride on every
 * editing tool's description — the full guide is one tool call away.
 */
export function dslCheatSheet(prefix: string): string {
  return (
    `TEMPLATE DSL (data, not code): nodes are a STRING, { bind } (text of a dot path; '.' = the scope; $root.x, $parent.x, $index, $meta.x), ` +
    `{ each: "path", template, empty? }, { when: "path", template, else? }, or { tag, attrs?, children? }. ` +
    `Value transforms, ONE per value and always with bind: map { "<value>": "<your literal>", default? } (the value SELECTS a literal you wrote — semantic classes, status wording), ` +
    `prefix "mailto:" (attribute values only), format { type: ${FORMAT_TYPES.join("|")}, decimals?, locale?, currency?, currencyDisplay?, pattern? } (render-time presentation, payload keeps the typed value). ` +
    `Forbidden: script/iframe/object/embed/style/link/meta/base/template/noscript tags, on*/srcdoc attributes, non-https URLs (mailto:/tel: allowed on href), expressions of any kind. ` +
    `descriptor.description is REQUIRED; give dataShape and dataExample; dataSchema (type/properties/required/items/enum/pattern) makes bad data fail with a path instead of rendering blank. ` +
    `styles: { ".wg-<class>": { "css-property": "value" } } — .wg- selectors only, var(--wg-<token>) for colours and spacing. ` +
    `kind/name: ${SAFE_IDENTIFIER.source}, not a built-in kind. Call ${prefix}_authoring_guide for the full contract and ${prefix}_widget_definition_check to validate before loading.`
  );
}

export function buildDesignerGuide(prefix: string): Record<string, unknown> {
  return {
    workflow: {
      summary:
        "You (the agent) draft; the person you are working with is looking at the same designer. " +
        `Read what is open with ${prefix}_widget_draft_get, validate a candidate with ${prefix}_widget_definition_check, ` +
        `then load it with ${prefix}_widget_draft_load (themes, schemas and actions have their own load tools). ` +
        "The designer shows the draft with a live preview and the same diagnostics you receive. Nothing you load is saved: " +
        "saving is the person's act in the designer (the Save control), and it puts the entry in their MCP catalog for every agent with their key.",
      boundary:
        "No tool here saves, publishes or deletes. If your host lets you operate the page, leave the Save control to the person unless they ask you to press it — " +
        "the draft is meant to be reviewed by a human before it becomes part of their catalog.",
      related:
        `${prefix}_widget_draft_get shows the current draft; ${prefix}_theme_token_specs lists the --wg-* tokens and their types; ` +
        `${prefix}_theme_get, ${prefix}_schema_get and ${prefix}_action_get show the open entries in the other designers.`
    },
    widget: {
      shape: {
        description: "A widget is one JSON object: { kind, template, descriptor, load? }.",
        kind: `String identifier matching ${SAFE_IDENTIFIER.source}; must not collide with a reserved kind.`,
        template: "A template DSL node (see rules.template).",
        descriptor: {
          description: "REQUIRED string — what the widget shows, for agents.",
          dataShape: "REQUIRED string — a compact sketch of the expected data, e.g. '{ title, lines: [{ item, amount }] }'.",
          dataExample: "RECOMMENDED — an example the widget renders well; shown to agents and used as the designer's preview data.",
          dataSchemaRef:
            "OPTIONAL string — the NAME of one of the person's saved shared schemas, used IN PLACE of an inline dataSchema: carrying both is refused. " +
            "Use it when the person names a saved schema; the server resolves it at render time, so one shared schema serves every widget that references it.",
          hints: "OPTIONAL record documenting supported hint keys.",
          styles: "OPTIONAL nested record: selector → { cssProperty: value } (NOT css strings — no ';' anywhere; see rules.styles).",
          dataSchema: "OPTIONAL structural schema (see rules.dataSchema)."
        }
      },
      reservedKinds: createCatalog().kinds(),
      identifierPattern: SAFE_IDENTIFIER.source
    },
    sharedSchema: {
      shape: {
        description:
          "A shared data schema is one JSON object: { name, label?, description?, schema } — defined once, referenced by many widgets via descriptor.dataSchemaRef.",
        name: `String identifier matching ${SAFE_IDENTIFIER.source}.`,
        label: "OPTIONAL human-readable display name.",
        schema: "The schema object itself, in the same subset as descriptor.dataSchema (see rules.dataSchema)."
      },
      workflow:
        `Load the entry with ${prefix}_schema_load in the schema designer and let the person save it, THEN draft widgets referencing it by name — ` +
        "the reference validates against the saved schema when the person saves the widget."
    },
    sharedAction: {
      shape: {
        description:
          "A shared action is one JSON object: { name, label?, description?, definition } — defined once, bound by many widgets via \"action\": { \"ref\": \"<name>\" }. " +
          "An http action must pass a live test call in the action designer before the person can save it.",
        name: `String identifier matching ${ACTION_NAME.source} — stricter than widget, theme and schema names.`,
        label: "OPTIONAL human-readable display name.",
        definition:
          "The action itself: { \"kind\": \"prompt\", \"text\": [...] } or { \"kind\": \"http\", \"method\": \"GET\"|\"POST\", \"url\", \"input\": <schema>, \"output\": <schema>, \"headers\"?, \"query\"? } — see rules.template.actions."
      },
      workflow:
        "Prefer binding a saved action by name over an inline http definition. When nothing saved fits, DESCRIBE the action for the person to create and test; " +
        "do NOT draft an inline http definition with a URL or credentials you cannot know. Secrets are referenced by name only and never pass through these tools."
    },
    theme: {
      shape: {
        description: "A theme entry is one JSON object: { name, label?, description?, tokens }.",
        name: `String identifier matching ${SAFE_IDENTIFIER.source}; light and dark are reserved.`,
        label: "OPTIONAL human-readable display name.",
        tokens: "Record of registry token names (bare, no --wg- prefix) and/or custom variables to string values."
      },
      tokens: Object.entries(TOKEN_SPECS).map(([name, spec]) => ({ name, type: spec.type, use: spec.use, default: spec.default })),
      customVariables: {
        namePattern: CUSTOM_VARIABLE.source,
        appliedAs: "A custom variable x-foo becomes --wg-x-foo on the themed scope; reference it from widget styles as var(--wg-x-foo)."
      },
      valueSafety:
        "Token values are plain CSS values. Rejected: ';', '{', '}', '<', '>', 'url(' and 'expression(' (case-insensitive, whitespace-tolerant). Keep values to colors, lengths, and font stacks."
    },
    rules: {
      template: {
        forms: [
          "STRING — a text node: \"Hello\"",
          "BIND — { \"bind\": \"path.to.value\" } renders the value as text; '.' binds the scope itself. A text bind may carry \"map\": { \"<value>\": \"<authored label>\" } with an optional \"default\" — the value SELECTS a label (status → wording) — or a \"format\" (below), never both; \"prefix\" is an attribute-value transform and is ignored in a text position",
          "PATHS — dot paths against the current scope (each item inside EACH). Escapes: '$meta.x' reads payload.meta; '$root.x' reads the top-level data from any depth; '$parent.x' steps out of one enclosing EACH per token ('$parent.$parent.x'); '$index' is the zero-based position in the innermost EACH",
          "EACH — { \"each\": \"path.to.array\", \"template\": <node>, \"empty\"?: <node> } repeats template with each item as scope",
          "WHEN — { \"when\": \"path\", \"template\": <node>, \"else\"?: <node> } renders template when the value is truthy",
          "ELEMENT — { \"tag\": \"div\", \"attrs\"?: { \"class\": \"x\", \"src\": { \"bind\": \"path\" } }, \"children\"?: [<node>...] }",
          "ATTR MAP — { \"bind\": \"status\", \"map\": { \"do-not-contact\": \"wg-status wg-status-danger\", \"active\": \"wg-status wg-status-success\" }, \"default\": \"wg-status\" } — the bound value SELECTS one of your literals (semantic classes from data values); a miss emits default, or empty without one",
          "ATTR PREFIX — { \"bind\": \"email\", \"prefix\": \"mailto:\" } — emits prefix+value only when the value is non-empty (mailto:/tel: links; both schemes are allowed on href)",
          `FORMAT — { "bind": "ask", "format": { "type": "currency", "currency": "COP", "decimals": 0 } } presents the value at render time while the payload keeps its typed value: a numeric STRING like "3206.9905920000" renders as ${FORMAT_EXAMPLES.currency}. Types: ${FORMAT_TYPES.join(" | ")}. number/currency take decimals (integer ${FORMAT_DECIMALS_MIN}-${FORMAT_DECIMALS_MAX}) and an optional locale (default ${DEFAULT_FORMAT_LOCALE}); currency takes a three-letter uppercase ISO-4217 code and an optional currencyDisplay (${CURRENCY_DISPLAYS.join(" | ")}, default ${CURRENCY_DISPLAYS[0]}). date takes a pattern of the tokens ${DATE_TOKENS.join(" ")} plus separators, at most ${DATE_PATTERN_MAX} characters — { "bind": "date", "format": { "type": "date", "pattern": "dd-MM-yyyy HH:mm" } } turns "2026-09-01T02:04:47" into ${FORMAT_EXAMPLES.date} (an unzoned value is read as UTC and formatted in UTC, so every surface agrees). A value the format cannot parse renders raw — a format never hides data. Works on a text bind and on an attr value alike`,
          "ONE TRANSFORM PER VALUE — map, prefix and format are mutually exclusive on a single attr value; none of them may appear without bind",
          "ACTION — an element may carry \"action\": { \"ref\": \"<shared action name>\" } or an inline { \"definition\": { \"kind\": \"prompt\", \"text\": [\"Show the forecast for \", { \"bind\": \"city\" }] } } / { \"definition\": { \"kind\": \"http\", \"method\": \"GET\", \"url\": \"https://…\", \"input\": <schema>, \"output\": <schema> } }, plus \"input\": { \"<field>\": \"<path>\" | { \"const\": <value> } } and \"output\": { \"mode\"?: \"replace\"|\"merge\"|\"patch\", \"path\"?, \"map\"? }. An output map projects the response before the mode applies; when the response is an ARRAY the map entries resolve against EACH ITEM and the projection is the array of per-item results — pair a per-item projection with mode replace or patch (merge needs an object). A \".\" target SELECTS first: alone it is the whole projection (e.g. { \".\": \"0\" }); beside other entries it names the value they map ({ \".\": \"data\", \"ask\": \"ask\" }). Any source that starts with an index (\"0.ask\") addresses the list itself. Bindings resolve at render time; buttons and links (never both href and action) become activatable in Apps hosts. A widget-level \"load\" (http GET only) runs once when the widget first renders"
        ],
        actions: {
          kinds:
            "prompt — proposes a message for the person's composer (some hosts send it after a confirmation, or directly under the person's permission settings); " +
            "http — a server-side GET/POST to a fixed https URL with an input schema (GET → query, POST → JSON body) and an output schema the response must satisfy; headers/query values may reference the person's secrets by name ({ \"secret\": \"<name>\" }).",
          binding:
            "Put \"action\": { \"ref\": \"<shared action name>\" } or { \"definition\": <inline definition> } on a button or link (never together with href), plus \"input\": { \"<field>\": \"<data path>\" | { \"const\": <value> } } resolved at render time in the element's scope ($root/$parent/$index available) and \"output\": { \"mode\": \"merge\"|\"replace\"|\"patch\", \"path\"?, \"map\"? } whose map projects per ITEM when the response is an array. Arguments must be declared in the action's input schema and must not share a name with a fixed query parameter. Prefer a ref to an inline definition. A widget-level \"load\" accepts http GET only.",
          limits:
            "http targets must be public https hosts (no private/loopback/link-local, no redirects); the whole request has an 8 s deadline and a 256 KiB response cap; the response must be application/json (or application/*+json); a 204/empty body arrives as null.",
          execution:
            "http actions run only in Apps hosts that proxy widget tool calls AND under an API key carrying the 'execute' scope (opt-in when the key is created). A render for a read-only key marks them disabled. The frame calls execute_action itself; agents never do.",
          secrets: "Secrets are named, write-only, envelope-encrypted, and injected server-side at execution; they never appear in templates, results or logs."
        },
        safety: {
          eventHandlers: "Attribute names matching on* and srcdoc are forbidden (FORBIDDEN_ATTRIBUTE).",
          tags: "script, iframe, frame, frameset, object, embed, style, link, meta, base, template and noscript are forbidden (FORBIDDEN_TAG) — a template is data, never active content.",
          urlAttributes: `On ${[...URL_ATTRS].join(", ")}: only ${[...ALLOWED_SCHEMES].join(", ")} schemes or relative references survive rendering.`,
          images: "Exception: an img element's src additionally accepts base64 data:image/*;base64, URIs.",
          markup: "Bindings only ever produce text and attribute strings — bound values can never inject markup."
        },
        bounds: {
          maxDepth: MAX_TEMPLATE_DEPTH,
          maxInterpretedNodes: DEFAULT_MAX_NODES,
          note: "Validation rejects deeper nesting; interpretation stops at the node budget and marks the render truncated."
        },
        dataModeling:
          "PREFER binding only properties declared in descriptor.dataSchema — schema-declared data is validated with dotted paths, so you get correctable errors instead of silently blank output. " +
          "'$meta.x' exists (reads the payload's meta) but meta is NOT covered by dataSchema validation: avoid it. If the widget needs a title, declare `title` as an optional schema property. " +
          "When the person names a SAVED schema, set descriptor.dataSchemaRef to its name and bind those properties — do NOT reconstruct the schema inline."
      },
      styles: {
        shape:
          "descriptor.styles is { \"<selector>\": { \"<cssProperty>\": \"<value>\" } } — each declaration is a separate key/value pair, e.g. { \".wg-roster-row\": { \"display\": \"flex\", \"gap\": \"var(--wg-spacing)\" } }.",
        selectors:
          "Every selector (and every comma-separated part) must target a .wg- class, e.g. '.wg-card .wg-xcard-head'. The base stylesheet also ships a wg-code monospace block utility any template element can opt into via class.",
        banned: `Selectors, properties, or values matching ${UNSAFE.source} — or containing 'url(' or 'expression(' — are dropped.`,
        propertyNames: `Property names must match ${PROPERTY_NAME.source} (letters and hyphens, optionally leading '-'); anything else is dropped.`,
        tokens:
          "Reference theme tokens with var(--wg-<token>) and custom variables with var(--wg-x-<name>); prefer tokens over literals so themes restyle the widget. " +
          "Every registry token is always DEFINED at render time, so bare var(--wg-<token>) is safe. Custom x-* variables are defined only by themes that set them, so give those a fallback: var(--wg-x-foo, <value>)."
      },
      dataSchema: {
        keywords: "Supported subset: type (object/array/string/number/integer/boolean/null, or an array of those), properties, required, items, enum, pattern. Unknown keywords are ignored.",
        pattern: `pattern is a bounded regex: max ${PATTERN_MAX_LENGTH} chars, no nested quantifiers, applied only to strings and capped input length; unsafe or invalid patterns are ignored rather than enforced.`,
        effect: "Kinds with a dataSchema fail fast with dotted paths (e.g. data.lines.0.amount); schema-less kinds render leniently."
      }
    },
    limits: {
      maxWidgetsPerUser: STORE_LIMITS.maxWidgets,
      maxThemesPerUser: STORE_LIMITS.maxThemes,
      maxSchemasPerUser: STORE_LIMITS.maxSchemas,
      maxActionsPerUser: STORE_LIMITS.maxActions,
      maxEntryBytes: STORE_LIMITS.maxEntryBytes,
      maxTemplateNodes: STORE_LIMITS.maxTemplateNodes,
      note: "maxTemplateNodes bounds the template's STRUCTURE as stored, distinct from the interpretation budget."
    }
  };
}
