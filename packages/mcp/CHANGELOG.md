# @widgentic/mcp

## 0.11.1

### Patch Changes

- 1ea7d3d: Tools declare MCP tool annotations.
  
  - Every exported tool definition carries `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`), all four set, typed as the new `McpToolAnnotations`. `McpToolDefinition.annotations` is optional, so definitions built elsewhere still compile.
  - The discovery tools (`list_widgets`, `list_theme_tokens`, `list_themes`, `list_schemas`, `list_actions`, `get_authoring_guide`) and `preview_widget` are read-only, non-destructive, idempotent and closed-world. `render_widget` is the same but open-world, since the server inlines agent-supplied images. `execute_action` alone declares a write: not read-only, possibly destructive, not idempotent and open-world.
  - `createWidgenticServer` registers each tool with its definition's annotations, so `tools/list` carries them. The `./host` bundle's `definitions()` returns them for embedding hosts.

## 0.11.0

### Minor Changes

- 677134b: `@widgentic/mcp/sdk` registers every tool with its exported definition's input schema, and lets the handlers validate the arguments.
  
  - **Wire schemas are the exported definitions.** `tools/list` now carries `RENDER_WIDGET_TOOL.inputSchema` and the rest exactly as exported, with nothing added or removed. These are the schemas the `./host` bundle, and with it `Widgentic.Mcp`, already serves. Compared with 0.10, the three formerly zod-backed schemas (`render_widget`, `execute_action`, `preview_widget`) drop the `$schema` stamp and gain the definitions' own details, such as `additionalProperties: false`. The six tools without input advertise their exported empty-object schema.
  - **One validation path on every host.** The assembly no longer validates arguments before the handler, so a malformed call gets the handler's structured error (`MISSING_FIELD`, `INVALID_TYPE`, …, in the tool's own vocabulary) instead of the SDK's generic input-validation message. That is the same answer the .NET host gives.
  - **The `kind`/`widget` mix-up is named.** A `render_widget` or `preview_widget` call that omits `widget` but carries a string `kind` gets the `MISSING_FIELD` error on `widget`. Its message says that `kind` is the payload's field and that the value belongs in `widget`.
  - **`execute_action` refuses mistyped optional arguments.** These are a non-object `args`, or a non-string `at` or `item`; they used to be silently ignored. They now get `INVALID_TYPE` on that path, before anything runs.
  - **`zod` is no longer a peer.** The assembly imports no schema library. `@modelcontextprotocol/ext-apps` 2 still requires `zod` 4.2+ as its own peer.
- 7d7a66b: Field labels reach agents and previews.
  
  - `get_authoring_guide` states `LABEL_STYLE_RULE` for the labels a template writes and the built-ins' `hints.labels`.
  - `render_widget`'s description asks for `widget` first and any `hints` before `data`, so a streaming host previews labels, columns and image places from the first row.
  - The app template's client-built card and table previews apply `hints.labels` as the renderers do.
  - The host bundle renders labels through the same core renderers; its conformance corpus gains labelled card and table cases.
- a3ca42b: The `./host` bundle takes default themes from a settings record, so an embedding host such as the `Widgentic.Mcp` NuGet package can choose them.
  
  - **Input.** `createWidgenticHost` accepts an optional `settings` record in the store's shape, `{ defaultThemes?: { light?, dark? } }`. An absent or `null` record means no settings.
  - **Checks.** The record is checked with the store's own settings rules against the configured themes that composed. An unknown section, an unknown mode, or a name that isn't a string gives `INVALID_SHAPE`. A default naming a theme the host doesn't serve gives `UNKNOWN_THEME`; that includes a built-in name and a configured theme that was refused. Each refused setting keeps its mode on the built-in and is listed by `problems()` under the section `settings`, never thrown.
  - **Effect.** The defaults that pass apply exactly as a principal's stored defaults do in the Node assembly: `render_widget`, `preview_widget`, `widgetPage(kind)` and `list_themes`' `defaults`. Without settings, every output is unchanged.
  - **Problem shape.** `problems()` entries carry `name` beside `section`, `index`, `code` and `message`, as they already did.
  - **Internal.** The settings rules moved to a Node-free module that the store and the bundle share, so the store's refusals are unchanged.
- 34c0ad5: Per-principal resource domains: a person can declare the domains their MCP Apps frames may load images from directly.
  
  - **Settings.** The settings record gains a `resourceDomains` section: up to 20 domains, stored as canonical `https://` origins and deduplicated. A refused entry is `INVALID_DOMAIN` (new store code, `422` on the authoring surface), a non-list or a list over the limit `INVALID_SHAPE`, and an empty list removes the section. Writing it checks no theme. On read, a refused stored entry is dropped with a diagnostic naming it. The rules live in the runtime-neutral settings rules the host bundle shares.
  - **Composition.** `composeResourceDomains(store, principalId, { settings? })` yields the caller's list (empty for anonymous callers, and empty with a diagnostic when the record cannot be read). `readPrincipalSettings` reads the record once per request, and `composeThemes` accepts the same `{ settings }`, so one read serves the default themes and the domains.
  - **Declaration.** `createWidgenticServer({ resourceDomains })` takes the operator's list followed by the caller's. Entries go through the core rule, refused ones are dropped, and the rest are declared as canonical origins in `_meta.ui.csp.resourceDomains`, on the declaration and the read content. **Behavior change:** operator entries used to be declared as given (bare hostnames).
  - **Inlining.** Sources on declared domains are no longer skipped. They rank after every undeclared source, which has no other route, and are inlined with the cap and budget left over. One left external keeps its URL, which a host honoring the declaration loads directly. A host that ignores the declaration, or still holds an old one, never shows fewer images than before. The overflow note counts declared leftovers separately.
  - **Host bundle.** `createWidgenticHost`'s config takes the embedding server's own `resourceDomains`, and its `settings` take the new section. Refusals are listed in `problems()` (under `resourceDomains` or `settings`), and `resources()` reports the app template's declared list, absent when empty.
- 7c68517: Theme styles in every styled output, and per-principal settings with default themes.
  
  - **Theme styles in output.** A named theme's `styles` reach the template channel's `css`, the `page`/`app` documents and `preview_widget`, before the rendered kinds' styles. They survive `execute_action` re-renders: a named theme with styles rides the payload as `themeName` and resolves again from the caller's registry.
  - **Default themes from settings.** A render that names no theme uses the caller's default themes. The light default's tokens go under `:root:not([data-theme="dark"])` and the dark default's under `:root[data-theme="dark"]`. Styles are scoped by mode (with `:where()`) only when both modes have their own default; a lone default's styles apply in both modes. Documents and the `ui://widgentic/page/{kind}` page use the light default. A theme name still streaming previews with no theme. With no defaults set, output is byte-identical.
  - **Settings in the store.** Stores keep one settings record per principal: `settings` / `putSettings`, which custom adapters now implement (until they do, `composeThemes` keeps the built-in defaults; a settings read that fails keeps them too, with a diagnostic), with section-level replace and unknown sections refused on write and ignored on read. Its `defaultThemes` section must name stored themes (`UNKNOWN_THEME`), and a theme named there cannot be removed (`THEME_IN_USE`). Memory, file, SQLite and Cosmos all store it. Cosmos runs settings writes and theme removal as transactional batches (`ifMatch` on the settings etag, retried), so a default never names a deleted theme under races; `CosmosClientLike`'s `items.batch` is optional. `composeThemes` applies the defaults and reports a dangling one. Stored themes may carry `styles`; a malformed map is refused with `INVALID_THEME`.
  - **Themes stored under the old token rules.** On read, the file, SQLite and Cosmos adapters pass a stored theme through `normalizeStoredTheme` (exported from `./store` for custom adapters). A token value the stricter token rules refuse is dropped with a diagnostic, and the rest of the theme is still served, including as a default. Writes still refuse such values.
  - **Cosmos.** A permission refusal from a transactional batch, whose SDK error carries no status code, now surfaces as `FORBIDDEN` rather than `STORE_ERROR`; throttling and outages stay `STORE_ERROR` and are logged with the first line of the service's message. A batch request that fails as a whole reports no operation's outcome, so a request-level 404 never reads as "already gone". `putSettings` checks only the defaults its update writes.
  - **Default theme styles** are scoped by mode only when both defaults carry styles; otherwise the one default's styles serve both modes.
  - **`list_theme_tokens`** states the token-value rule from core's `TOKEN_VALUE_RULE`.
  - **MCP Apps border preference.** The app template resource now declares `_meta.ui.prefersBorder: false`, on the declaration and on its `resources/read` content, so hosts draw no border or background around a widget, which draws its own surface. The value is explicit, as the MCP Apps specification recommends, since hosts' defaults differ. Configured `resourceDomains` now also ride on the read content's `_meta.ui.csp`.
  - **Authoring surface.** It serves the record at `/settings` (`GET`, and `PUT` with section-level replace; `THEME_IN_USE` maps to 409). Theme writes carry `styles`.
  - **Agents.** `list_themes` reports each theme's `styles` and the effective `defaults`. Its description and `render_widget`'s `theme` description tell agents to leave `theme` out to use the user's defaults. The authoring guide documents theme styles from one rules object shared with widget styles.
  - **Breaking, with core's removal of theme `extends`:** a stored theme carrying `extends` is still served, but renders with its own tokens and styles only. Copy the base's tokens into it to keep its look.

### Patch Changes

- Updated dependencies [7d7a66b]
- Updated dependencies [34c0ad5]
- Updated dependencies [7c68517]
- Updated dependencies [7c68517]
  - @widgentic/core@0.11.0

## 0.10.0

### Minor Changes

- 5985483: `@widgentic/mcp/sdk` moves to the MCP TypeScript SDK 2.x and serves protocol revision 2026-07-28 next to the 2025-era revisions. **Breaking for `./sdk` hosts:**
  
  - `createWidgenticServer()` now returns a 2.x `McpServer` from `@modelcontextprotocol/server`.
  - The optional peers are now `@modelcontextprotocol/server` `^2.3.0`, `@modelcontextprotocol/ext-apps` `^2` and `zod` `^4.2.0`. `@modelcontextprotocol/sdk` (1.x) is no longer one: the two SDKs share no classes, so a 1.x transport cannot carry a 2.x server.
  
  The base entry and every other subpath are unchanged.
  
  Moving a host:
  
  - **stdio.** Replace `await server.connect(new StdioServerTransport())` with `serveStdio(() => createWidgenticServer(options))`, imported from `@modelcontextprotocol/server/stdio`. One factory serves both eras, pinned per connection.
  - **Streamable HTTP.** Replace the per-request `StreamableHTTPServerTransport` with one `createMcpHandler(factory)` from `@modelcontextprotocol/server`, wrapped with `toNodeHandler` from `@modelcontextprotocol/node` on Node.
    - The factory runs once per request and receives the inbound `Request` as `requestInfo`. Read the API key there, compose, and return `createWidgenticServer(...)`.
    - Pass an already-read body as the adapter's third argument.
    - Allow the `Mcp-Method` and `Mcp-Name` headers in CORS for browser hosts.
    - 2025-era clients are still served statelessly, now with single-event SSE responses.
  
  Slimming is now decided per call:
  
  1. the capabilities a 2025-era session negotiated at `initialize`;
  2. otherwise the capabilities a 2026-07-28 request carries in `_meta["io.modelcontextprotocol/clientCapabilities"]`;
  3. otherwise `WIDGENTIC_ASSUME_UI`.
  
  Before this release, an MCP Apps host on 2026-07-28 would have received the full HTML in model context. Tool names, descriptions and input properties are unchanged. The input schemas now declare JSON Schema 2020-12. Two behaviors come from SDK 2.x itself:
  - A call to an unregistered tool is answered with JSON-RPC `-32602`, where it used to be an `isError` result.
  - `CallToolResult.structuredContent` is typed as any JSON value.

## 0.9.0

### Minor Changes

- 37634b5: New `@widgentic/mcp/host` entry: the runtime-neutral host bundle, for MCP servers that
  are not Node. `createWidgenticHost(configJson)` returns a host whose every argument and result
  is a string: `definitions()` (the render-side tool definitions, as exported), `call(name,
  argsJson, slim)` (the same handlers the Node assembly wires), `appTemplate()`,
  `widgetPage(kind)`, `problems()` and `version()`. Widgets, themes and shared schemas arrive in
  the designer's export shapes and go through the store's own composition and checks; refused
  entries are listed, never thrown. The host is render-only: http actions compile disabled, no
  `load` is emitted, and `execute_action`/`list_actions` are not served.
  
  The entry's default condition is one self-contained ES module with no imports that needs
  nothing beyond ECMAScript and `Intl` — no Node modules, no web APIs — and never touches the
  realm's globals; `URL` resolves to the platform's implementation, or to a bundled
  spec-compliant one where the engine has none. The `Widgentic.Mcp` NuGet package runs it on V8.
  
  Internally, composition now runs synchronously over entry lists with structured problems;
  `composeCatalog` and `composeThemes` keep their signatures and diagnostic lines. The store limits
  moved to a module without Node imports (same exported names), and the entry-size check counts
  UTF-8 bytes without `Buffer`.

## 0.8.1

### Patch Changes

- 3a38993: Streaming previews no longer show image URLs as text. Wherever the result will draw an
  image (a tree icon, a card field, a table cell, decided exactly as the built-in renderers
  decide, `hints.images` included), the app template's preview shows a placeholder of the
  same shape (`wg-img wg-img-<shape> wg-img-pending`); server previews from `preview_widget`
  mount every non-`data:` image as such a placeholder instead of a source the sandbox would
  block. A URL still arriving at the end of a partial snapshot is left out of the preview and
  of any `preview_widget` request until another value follows it. The result's images
  replace the placeholders.

## 0.8.0

### Minor Changes

- c2aba69: New app-only tool `preview_widget` (hidden from the model like `execute_action`): while a
  render's input streams, the app template asks it to render the partial payload of a
  stored widget through the caller's catalog, skipping the data-schema check, and shows
  the answer as an in-progress preview instead of a skeleton. One request in flight per
  frame; any failure keeps the skeleton. `createWidgenticServer` takes a
  `previewRateLimit` gate, and `DEFAULT_PREVIEWS_PER_MINUTE` (240) is exported for edges
  that wire a per-principal limiter. The template's patcher pairs keyed siblings exactly as
  `@widgentic/core` does, and the served template drops comment lines and indentation from
  its script (41,038 → 37,430 bytes) under a size budget pinned in the test suite.
  Image inlining now fetches in priority order (card heroes, then thumbnails, avatars and
  template images, then tree icons) and admits sources while the bytes they substitute,
  charged per occurrence, fit 3 MiB per render: one icon repeated across a large tree no
  longer multiplies into the result, and a hero after many icons is no longer starved.
  Sources left external are counted on stderr, never by URL.

### Patch Changes

- Updated dependencies [c2aba69]
  - @widgentic/core@0.8.0

## 0.7.0

### Minor Changes

- c07dcb9: The authoring guide teaches the `format` transform and per-item array projection.

  `rules.template.forms` gains a `FORMAT` line documenting `{ bind, format }` with its number,
  currency and date specs and the currency recipe that motivated it (a numeric-string price as
  COP with 0 decimals), plus an explicit one-transform-per-value line. The recipe's example outputs
  are rendered by the engine at guide-build time, never typed. Every
  bound in that text — the decimals range, the currency-display vocabulary, the date tokens, the
  pattern length cap and the default locale — is READ from the constants the validator enforces,
  so a change to the engine cannot leave the guide lying.

  The action-output rules now state that a `map` over an ARRAY response resolves against each
  item and projects the array of per-item results (pair it with `replace` or `patch`), that a `"."`
  target selects first (alone it is the projection; beside other entries it names the value they
  map, so an enveloped list projects per item), that index-addressed sources still address the
  response root, and — on the BIND line — that a text bind may carry `map` (value → label) or
  `format`, never `prefix`.

- 3e84d9e: The app template's streaming preview mirrors the tree's new markup: branches render
  as always-open `details.wg-tree-branch` disclosures (partial input has no meaningful
  collapse state, and an open branch keeps the preview's shape identical to the
  result, so the result patch lands on matching structure), and a node's `icon`
  previews as text before the label — like card fields and table cells, the preview
  never emits images, since server-side inlining runs over the result.

  A visitor's expand/collapse survives an action's re-render of the branches it
  leaves in place: the bridge's inline patcher diffs the previous render tree, never
  the live DOM, so an unchanged branch's `open` attribute is never rewritten while a
  newly appended branch mounts with its computed initial state. The diff is
  positional — a reordering result re-pairs states by index.

  `list_widgets` and the authoring guide's `reservedKinds` follow the catalog, which
  no longer carries the removed `custom` kind.

### Patch Changes

- Updated dependencies [c07dcb9]
- Updated dependencies [3e84d9e]
  - @widgentic/core@0.7.0

## 0.5.0

### Minor Changes

- c3428fd: Agents can discover shared actions: a new `list_actions` tool serves the
  principal's saved actions as their CONTRACT — name, label, description, kind,
  and for http the method and the input/output schemas (a prompt entry instead
  carries `binds`, the data paths its text references — a prompt ref takes no
  input mapping) — so a draft can bind one with `action: { "ref": "<name>" }`
  instead of guessing a name or inventing an inline definition. The URL, headers and query stay on the server: a binding
  needs none of them, and a read-only key travels into prompt-injectable hosts.
  Wire it with the new `sharedActions` option (lazy; omitted means an empty list).

  `get_authoring_guide` gains a `sharedAction` section — the entry shape, the
  action name pattern (stricter than other identifiers, read from the constant
  that enforces it), the Actions-section import path, and the rule that an action
  the user has not saved is described for the designer, never drafted with an
  invented URL. Its `limits` now also publish `maxSchemasPerUser` and
  `maxActionsPerUser`.

  Fix: the `node:http` authoring adapter now contains a host `resolveContext`
  that throws or rejects — a store rejection keeps its mapped status and code,
  anything else answers the surface's structured `INTERNAL` with the trace on the
  log sink — instead of letting the rejection escape into the host's server.

## 0.4.1

### Patch Changes

- eb40c8e: Testing a standalone http action no longer applies a widget's output fold.

  `testHttpAction` validated the response and then folded it with the
  binding-level default (`merge`), which requires object shapes — but `mode`
  and `map` belong to a WIDGET'S binding, authored later; no binding exists at
  action-authoring time. An action whose API returns an array or scalar could
  therefore never pass its test (and, behind a test-gated save, never be
  saved). The test now validates against the action's own output schema and
  hands back the redacted response; binding-time folding keeps its own
  validation where the mode is actually authored.

  Designer: the action editor's Kind and Method selects share one row. Secrets:
  the value refusals say "characters (UTF-8 bytes)" instead of bare "bytes".

## 0.4.0

### Minor Changes

- 535d8e7: Two new entries make widgentic self-hostable without a cloud account.

  `@widgentic/mcp/store/sqlite` — `createSqliteStore(path, options?)`, a full
  `WritableWidgetStore` over a single SQLite database file using the Node
  runtime's built-in SQLite: zero dependencies, WAL mode so a read-only MCP
  process and a writing authoring app can share the file, one transaction per
  write, and the same contract suite the memory and Cosmos implementations
  pass. The database holds key digests and secret ciphertext, never raw
  material.

  `@widgentic/mcp/authoring` — the authoring surface the widgentic.dev app
  runs on, extracted: widgets, themes, schemas, shared actions, the guarded
  action test call, write-only secrets and API keys, as a pure
  `handleAuthoringRequest({ method, path, body, context })` core plus a
  `node:http` adapter (`createAuthoringHttpHandler`). Authentication stays with
  the host — it resolves a principal and hands it in; a presented API key is
  refused with `401 KEY_NOT_A_SESSION` before any store access, and identity
  routes exist only when the host supplies an authenticated subject.

## 0.1.0

### Minor Changes

- c157db8: First published versions: `@widgentic/core` (contract, adapters, mapper, catalog, theming, templates, actions, reactive rendering), `@widgentic/designer` (widget, theme, schema and action designers, custom elements, browser bundle) and `@widgentic/mcp` (tool-output convention, server building blocks and official-SDK assembly, per-principal store and secrets with Cosmos and Key Vault adapters behind subpaths).

### Patch Changes

- Updated dependencies [c157db8]
  - @widgentic/core@0.1.0
