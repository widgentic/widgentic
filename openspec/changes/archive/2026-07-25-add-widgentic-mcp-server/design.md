## Context

Every layer exists for the *convention* path (tool emits, host renders). The Widgentic MCP server adds the *service* path: widgentic itself is the MCP endpoint, so clients without a widgentic-aware UI still get value (server-side HTML), and agents get machine-readable widget documentation to choose from. Two prerequisites are missing today: catalogs carry no metadata (only `kind → renderer`), and nothing binds widgentic to a live MCP server. The zero-runtime-dependency invariant must survive both.

## Goals / Non-Goals

**Goals:**
- Agent-facing discovery: `list_widgets` gives enough metadata (purpose + expected data shape + example) for an agent to select a widget and construct valid `data` without reading widgentic docs.
- Server-side validation with correctable errors: bad `widget` or `data` comes back as a structured, machine-readable error result, not a protocol failure.
- Dual-format render results so both plain and widgentic-aware clients are first-class.
- Handlers spec'd and tested independently of any SDK.

**Non-Goals:**
- No per-kind `data` schema *validation* (descriptors document shape; enforcing arbitrary schemas is a future JSON-Schema-per-descriptor change — the contract validator still guards payload structure).
- No remote/HTTP transport, auth, or multi-catalog routing; one catalog per server process.
- No `register_widget`/`register_template` MCP tool (registration over the wire is a security decision deserving its own change).
- No reactive output over MCP (HTML string is the served format; native mounting remains the host-side convention).

## Decisions

### Decision 1: Descriptors live in the catalog, not the server
`WidgetDescriptor` (`kind`, `description`, `dataShape` prose, optional `dataExample`, optional `hints` doc map) is stored by `register(kind, renderer, descriptor?)` alongside the renderer, with `describe(kind)` / `list()` accessors. The MCP server then *reflects*; it holds no widget knowledge of its own, so registered custom kinds and template widgets appear in `list_widgets` automatically. A registration without a descriptor gets a minimal generated one (`kind` + generic description) rather than being invisible — listing must reflect renderability, not documentation diligence.

*Alternative considered*: a metadata registry inside `src/mcp-server/` — rejected: it would drift from the catalog and double-register every kind. The catalog spec already required built-ins to "document the shape of `data` and supported `hints`"; descriptors make that requirement machine-readable at last.

### Decision 2: Tool handlers are pure functions over a catalog; SDK wiring is a leaf
`src/mcp-server/` exports tool *definitions* (names, descriptions, JSON-Schema input schemas as plain objects) and *handlers* (`handleListWidgets(catalog)`, `handleRenderWidget(catalog, input: unknown)`) that return MCP-shaped results using the existing structural types from `widgentic/mcp`. The runnable `examples/mcp-server/main.ts` merely maps definitions+handlers onto SDK `registerTool` calls. Consequences: the capability is testable without the SDK; the SDK remains a devDependency; and any other server framework (Azure Functions MCP, fluent API) can host the same handlers — the reference patterns from `reference-links.md` become drop-in targets.

### Decision 3: `render_widget` returns HTML *and* the widgentic block
Success results carry `content: [text(html), resource(widgentic payload)]`. Plain clients read styled-markup-as-text (or inject it); widgentic-aware clients extract the payload and mount natively (keeping reactivity client-side). This reuses `toWidgetResult`'s dual-block philosophy with the text slot upgraded from JSON dump to rendered HTML. The HTML is *unstyled markup* by default; `render_widget` input accepts `theme?` — deferred, NOT in scope (theming is host-side; noted as future extension, keeping the input surface minimal now).

### Decision 4: Failures are `isError` results with the existing error vocabulary
Unknown `widget` → `UNKNOWN_KIND`; malformed input (missing `widget`/`data`, wrong types) → `MISSING_FIELD`/`INVALID_TYPE` — the same `WidgetContractError` codes, serialized as JSON in an `isError: true` result. Agents get a correctable signal in the vocabulary the rest of the stack already uses; no new error taxonomy. Handlers are total: any `input` shape produces either a success or an `isError` result, never a throw (protocol errors are reserved for the SDK layer itself).

### Decision 5: Input schemas are hand-written JSON Schema data, converted at the wiring layer
Definitions carry plain JSON-Schema objects (`{ type: "object", properties: { widget: { type: "string" }, ... } }`). If the installed SDK requires zod shapes for `registerTool`, the wiring file converts or declares the zod schema locally — schema-as-data stays the source of truth in the dependency-free module. (Verified against the installed SDK during apply; zod added as devDependency only if required.)

### Decision 6: Built-in descriptors are honest and example-driven
Each built-in's descriptor states purpose, the lenient data contract it actually implements (e.g. table: "array of records; non-arrays become a single row; hints.columns overrides column order"), and a small `dataExample` an agent can imitate. Examples are the highest-leverage field for agent correctness, so they are required for built-ins even though optional in the type.

## Risks / Trade-offs

- [Two error vocabularies reach agents: the wire schema's validation errors (verbose zod unions, e.g. missing `data`) and the handler's compact `code/path/message` results — the handler's missing-field branch is unreachable through SDK wiring and serves direct callers as a backstop] → deliberate: the typed union prevents the string-marshalling bug class, which outweighs error uniformity; both layers give a correct `path`. Surfaced by live agent testing.
- [Marshalling coercion is deliberately ambiguous in one direction: a caller wanting the *literal text* of a JSON object/array as `data` cannot express it, since object/array-shaped strings are parsed (commit-only-on-structured limits this to exactly that shape)] → inherent to in-band recovery; the out-of-band fix is per-kind `dataSchema` in the follow-up change, which makes coercion schema-aware (string-typed kinds skip peeling). Surfaced by live agent testing.

- [SDK API drift since knowledge cutoff (registerTool signature, capability accessors, zod requirement)] → all SDK contact confined to `examples/mcp-server/main.ts` + interop test; verified against the installed version at apply time.
- [Dual-format results are larger (HTML + JSON payload)] → acceptable at widget scale; a `format?: "html" | "widget" | "both"` input is a compatible future extension if size matters.
- [Descriptors can lie (prose diverges from renderer behavior)] → built-in descriptors are asserted in tests against actual rendering of their own `dataExample` (example renders ok ⇒ example is honest).
- [Auto-generated minimal descriptors make undocumented custom kinds look sparse in `list_widgets`] → intended pressure: visible but obviously undocumented beats invisible.
- [No data-schema enforcement means `render_widget` can succeed with semantically odd data (mapper-style leniency)] → consistent with the totality philosophy; the structured-error path covers structural problems, and per-descriptor JSON Schema validation is the designed future extension.
