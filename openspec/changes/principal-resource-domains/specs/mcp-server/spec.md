## MODIFIED Requirements

### Requirement: Formal Apps declaration at the wiring layer
The server assembly SHALL declare the tool↔UI linkage per the MCP Apps specification using the official `@modelcontextprotocol/ext-apps` server helpers: `render_widget` registered with `_meta.ui.resourceUri: "ui://widgentic/app.html"`, and the app template registered as a resource with mime type `"text/html;profile=mcp-app"` whose `_meta.ui` — on the resource declaration and on its `resources/read` content alike — SHALL carry `prefersBorder: false`, since widgets draw their own surface; the value is explicit because hosts' defaults differ, and it comes from the shared app-template resource descriptor. The assembly MAY be given `resourceDomains`: the domains the frame may load assets from directly. The list is the union of the operator's configuration and the caller's `resourceDomains` setting, which the transport edge composes. Each entry SHALL be read by the store's resource-domain rule. The app resource SHALL declare the accepted entries as `_meta.ui.csp.resourceDomains` (the Apps CSP block), in canonical `https://` origin form, deduplicated in first-seen order. An entry the rule refuses SHALL be dropped from the declaration and from the inliner's ranking alike, and the same accepted list SHALL govern the inliner's declared-domain ranking. With no entries given, or none accepted, nothing is declared and every external image faces inlining first. Only the operator and a person, through their settings, can extend the list; stored widgets and render inputs SHALL have no way to extend it. The assembly SHALL detect the client's Apps capability (`extensions["io.modelcontextprotocol/ui"]`) after initialization and note the outcome on stderr. SDK and host-flavor specifics SHALL live only behind the `@widgentic/mcp/sdk` entry; the base `@widgentic/mcp` entry remains SDK-free (per the server-assembly requirement).

#### Scenario: Tool declares its template
- **WHEN** an SDK client lists tools
- **THEN** `render_widget` SHALL carry `_meta.ui.resourceUri` pointing at the app template resource

#### Scenario: Non-Apps hosts keep working
- **WHEN** a client without the Apps capability connects
- **THEN** all tools SHALL behave exactly as before (text/page/widget outputs), with the template simply unmounted

#### Scenario: Declared domains reach the resource metadata
- **WHEN** the assembly is created with `resourceDomains: ["cdn.example.com"]` and an SDK client lists and reads the app resource
- **THEN** the declaration and the read content SHALL both carry `_meta.ui.csp.resourceDomains: ["https://cdn.example.com"]`
- **AND** with no domains configured the key SHALL be absent

#### Scenario: The host is asked for no border
- **WHEN** an SDK client lists resources and reads the app resource, with or without configured `resourceDomains`
- **THEN** the declaration and the read content SHALL both carry `_meta.ui.prefersBorder: false`, with the same `_meta.ui`

#### Scenario: Refused domains are not declared
- **WHEN** the assembly is created with `resourceDomains: ["cdn.example.com", "http://old.example.com", "https://*.example.org", "CDN.example.com"]`
- **THEN** the app resource SHALL declare exactly `["https://cdn.example.com", "https://*.example.org"]`
- **AND** an image on `old.example.com` SHALL rank as undeclared

### Requirement: Server-side image inlining for iframe surfaces
Because Apps-host sandboxes block external `img-src` while permitting `data:`, the runnable server SHALL, when inlining is enabled (the default; `WIDGENTIC_INLINE_IMAGES=0` disables), rewrite `img` sources on the iframe-facing surfaces of a `render_widget` result — the `structuredContent` HTML fragment, the `structuredContent.tree` render tree (element nodes with `tag: "img"`), and the `ui://widgentic/page/<kind>` embedded resource — replacing each `http(s)` source whose fetch succeeds with a `data:<content-type>;base64,` URI; the tree and HTML projections SHALL be rewritten from the same fetch results and never disagree. The model-facing HTML text block and `format: "page"` output SHALL keep original URLs. Each unique URL SHALL be fetched at most once per render. The fetch SHALL be guarded: `https` scheme only; hostnames resolving to loopback, private (RFC1918), link-local (including 169.254.169.254), carrier-grade NAT, or IPv6 unique-local/link-local addresses SHALL be rejected, re-validated on every redirect hop (at most 3); the connection SHALL be made to the exact address that passed validation — the fetch SHALL NOT perform its own name resolution, so a DNS answer that changes between validation and connection has no effect — while TLS server-name and the `Host` header keep the original hostname; the response `Content-Type` MUST be `image/*`; per-image size SHALL be capped (1 MiB) and the fetch SHALL time out (~4 s); at most 24 unique sources SHALL be fetched per render, chosen in PRIORITY order: every source on an undeclared host before any source on a declared resource domain, and within each of those two groups, sources used by a `wg-img-hero` image first; then sources used by a `wg-img-thumb` or `wg-img-avatar` image or by an image carrying no `wg-img-*` shape class; then sources used only by `wg-img-icon` images — each source ranked by its highest-priority occurrence, ties broken by its first occurrence in document order. Fetched sources SHALL then be admitted in that same order while the bytes they SUBSTITUTE stay within a per-render budget of 3 MiB, where a source costs the length of its `data:` URI times the number of `img` occurrences it has in the render tree (in the fragment when no tree is present); a source that would exceed the remaining budget SHALL keep its original URL, while later sources that still fit SHALL be admitted. A render that leaves fetchable sources external, under either bound, SHALL write one note to stderr carrying counts only (no URLs), with the sources on declared domains counted apart from the rest; nothing about it SHALL reach the model-facing output. A source is on a declared resource domain when its hostname equals a declared host, or lies under a wildcard entry: `https://*.example.com` covers `a.example.com` and `a.b.example.com`, not `example.com`. Such a source has a second route, since a host honoring the declaration loads it directly, so it is inlined only with the cap and budget the undeclared sources leave, and when left external it keeps its URL. Any failure SHALL leave the original URL in place (alt-text fallback) without failing the render.

#### Scenario: External image becomes a data URI in iframe surfaces only
- **WHEN** `render_widget` renders a table whose cell is a fetchable `https` image URL and inlining is enabled
- **THEN** the `structuredContent` fragment and the `ui://` resource SHALL carry the image as `data:image/...;base64,` with no `http(s)` `img` source remaining
- **AND** the plain HTML text block SHALL still reference the original URL

#### Scenario: The tree is rewritten in lockstep with the html
- **WHEN** inlining succeeds for a render that carries `structuredContent.tree`
- **THEN** every `img` element node in the tree SHALL carry the same `data:` URI as the corresponding `img` in `structuredContent.html`

#### Scenario: Private-network targets are refused
- **WHEN** a widget value is `https://169.254.169.254/latest/meta-data.png` or an `https` URL whose hostname resolves to a private address
- **THEN** no request body SHALL be consumed from the target and the original URL SHALL remain in the output

#### Scenario: Rebinding between validation and connection is ineffective
- **WHEN** a hostname's resolution passes validation but a subsequent resolution of the same name would return a private address
- **THEN** the connection SHALL still be made to the validated address
- **AND** no request SHALL ever reach the privately-resolved address

#### Scenario: Non-image and oversized responses are not inlined
- **WHEN** the fetched response has a non-`image/*` content type, or exceeds the size cap
- **THEN** the original URL SHALL remain and the render SHALL still succeed

#### Scenario: Declared resource domains are not inlined
- **WHEN** `cdn.example.com` is a declared resource domain and a render carries 30 distinct fetchable thumbnail sources of a few kilobytes each, the first 10 in document order on `https://cdn.example.com/` and the other 20 on undeclared hosts
- **THEN** all 20 undeclared sources SHALL be fetched and inlined, and so SHALL the first 4 declared sources in document order
- **AND** the other 6 declared sources SHALL keep their URLs in all surfaces, with no fetch made for them

#### Scenario: Inlining can be disabled
- **WHEN** `WIDGENTIC_INLINE_IMAGES=0` is set
- **THEN** all surfaces SHALL keep original image URLs

#### Scenario: Overflow beyond the cap is deterministic
- **WHEN** a render carries more unique fetchable image sources than the cap
- **THEN** the 24 highest-priority sources (document order within a priority) SHALL be fetched and the rest SHALL keep their original URLs (alt-text fallback in sandboxed frames)

#### Scenario: A hero outranks earlier icons
- **WHEN** a `group` renders a tree with 30 distinct image icons followed by a card whose hero image is a fetchable `https` URL
- **THEN** the hero SHALL be fetched and inlined
- **AND** exactly 23 of the icons, the first 23 in document order, SHALL be fetched

#### Scenario: Repeated sources are charged per occurrence
- **WHEN** one icon URL appears on 200 tree nodes and its `data:` URI is 20,000 characters, and the same render carries a 100 KB hero image
- **THEN** the icon SHALL keep its original URL on all 200 nodes (4,000,000 characters exceed the 3 MiB budget)
- **AND** the hero SHALL still be inlined

#### Scenario: Overflow stays out of the model's view
- **WHEN** a render leaves fetchable sources external under either bound
- **THEN** stderr SHALL carry one note with the counts and no URL
- **AND** the model-facing text and `structuredContent.diagnostics` SHALL be unchanged by it

#### Scenario: Declared sources are inlined when room remains
- **WHEN** `cdn.example.com` is a declared resource domain and a render carries one fetchable image on it among 5 sources in all
- **THEN** that image SHALL be inlined as a `data:` URI, exactly as an undeclared one is

#### Scenario: A wildcard declaration covers subdomains only
- **WHEN** `https://*.example.com` is declared and a render carries more sources than the cap, including ones on `a.example.com`, `a.b.example.com` and `example.com`
- **THEN** the sources on `a.example.com` and `a.b.example.com` SHALL rank as declared, and the one on `example.com` SHALL rank as undeclared

#### Scenario: Declared leftovers are counted apart
- **WHEN** a render leaves 6 declared sources and 2 undeclared sources external
- **THEN** the stderr note SHALL report the 6 apart from the 2, with no URL

### Requirement: Runtime-neutral host bundle
The package SHALL export from a `./host` entry `createWidgenticHost(config: string)`. Its default import condition SHALL resolve to ONE self-contained ES module with no `import` statements. Evaluating it SHALL require nothing beyond ECMAScript 2022 and ECMA-402 (`Intl`): no `node:` module, no `process`, no `Buffer`, no `require`, and no web API, so any embedded JavaScript engine with `Intl` can host widgentic.

`config` is a JSON string carrying optional `widgets` (designer-exported widget definitions `{ kind, template, descriptor, load? }`), `themes` (theme entries `{ name, label?, description?, tokens, styles? }`) `schemas` (shared schema entries `{ name, label?, description?, schema }`) and `resourceDomains` (the embedding server's own list of domains the app frame may load assets from, as `createWidgenticServer` takes it). Every entry SHALL be validated with the same checks and structured codes the store applies on write, and built-in kinds and the `light`/`dark` theme names stay reserved. An invalid entry SHALL be skipped and reported, never served and never thrown. A `resourceDomains` entry SHALL be read by the store's resource-domain rule, and one it refuses SHALL be reported under the section `resourceDomains` with code `INVALID_DOMAIN` and skipped.

`config` MAY also carry `settings`, a principal settings record in the store's shape (`{ defaultThemes?: { light?, dark? }, resourceDomains?: string[] }`), so a host can choose its default themes and declare its resource domains. An absent or `null` record means no settings. Any other value SHALL be checked with the store's write rules for settings:
- An unknown section, an unknown mode, or a name that is not a string SHALL be reported as `INVALID_SHAPE`.
- A default naming a theme the host does not serve SHALL be reported as `UNKNOWN_THEME`. That covers a built-in name, a theme the config does not carry, and a configured theme that was refused.
- A `resourceDomains` value that is not an array of strings, or that holds more than the limit, SHALL be reported as `INVALID_SHAPE`, and an entry the resource-domain rule refuses as `INVALID_DOMAIN`, naming it.

A reported setting SHALL be skipped, and SHALL be listed by `problems()` under the section `settings`, never thrown. A skipped default leaves its mode on the built-in, and a skipped domain is not declared. The defaults a valid record sets SHALL apply exactly as the Node assembly applies a principal's stored defaults: to `render_widget` and `preview_widget` output, to `widgetPage(kind)`, and to `list_themes`' `defaults`. Without `settings`, every output SHALL be byte-identical to a host created before settings existed.

The returned host SHALL take and return strings only, apart from the boolean `slim` flag of `call`:
- `version()`: the `@widgentic/mcp` version the bundle was built from, taken from its manifest at build time.
- `problems()`: a JSON array of `{ section, index, name, code, message }`, one per refused entry or setting.
- `definitions()`: the JSON of the tool definitions this host serves, taken from the same exported definitions as the Node assembly, with name, description and JSON-Schema `inputSchema`. The tools are `list_widgets`, `render_widget`, `list_theme_tokens`, `list_themes`, `list_schemas` and `get_authoring_guide`, plus the template's own `preview_widget`, which is marked `visibility: ["app"]` as the Node assembly registers it.
- `call(name, argsJson, slim)`: the MCP tool result JSON of that tool's handler, with the slim flag passed through to `render_widget`. `preview_widget` SHALL be answered by the same handler as in the Node assembly, through the host's composed catalog and themes, with no rate gate: rate-limiting previews belongs to the embedding server's transport. An unknown tool name SHALL return an `isError` result, never throw.
- `resources()`: the JSON of the served documents (the app template and the preview-page template) with name, URI or URI template, MIME type and description, taken from the same constants the Node assembly registers them with. For the app template it also gives `prefersBorder` and `resourceDomains`. `resourceDomains` lists the accepted entries of `config.resourceDomains` followed by those of `settings.resourceDomains`, in canonical `https://` origin form and deduplicated in first-seen order: the list the Node assembly declares for the same operator list and settings. The key SHALL be absent when no entry is accepted.
- `appTemplate()`: exactly `buildAppTemplate()`.
- `widgetPage(kind)`: the preview page the Node assembly serves for `ui://widgentic/page/{kind}`.

The host SHALL be render-only. Templates SHALL be compiled with http actions disabled for the `unresolved` reason. No `structuredContent.load` or `structuredContent.loads` SHALL be emitted. `execute_action` and `list_actions` SHALL NOT be served. Prompt action descriptors SHALL be unchanged. The bundle SHALL perform no network access, so server-side image inlining is not part of it.

Inside the bundle, `URL` SHALL resolve to the platform's implementation when the global exists, and otherwise to a bundled, spec-compliant WHATWG URL implementation. Evaluating the bundle SHALL NOT create or modify any global binding, and the host SHALL keep no data from one call to the next.

The repository SHALL keep a generated conformance corpus: render inputs paired with the exact Node-path outputs. It SHALL cover every served tool, `preview_widget` included, plus the built-in kinds, a group, named and inline themes (a named theme with styles included, as a render, a page and a preview), default themes from `settings` (a light default only, a dark default only, two defaults with styles, and one theme for both modes, each as a render, a page, a preview and `list_themes`), resource domains (operator entries, a settings section, and the two combined, each as `resources()`; a refused entry is covered by each runtime's host tests instead, because an embedding host may refuse such a configuration at startup), contract errors, hint diagnostics, number and currency formats including non-English locales, URL edge cases, and the example template widgets (with and without actions). The default gate SHALL fail when the committed corpus differs from the current Node output, or when the bundle evaluated in a bare realm (no globals beyond ECMAScript and `Intl`) produces any output that differs from the corpus.

#### Scenario: The bundle evaluates in a bare realm
- **WHEN** the built `./host` bundle is evaluated in a JavaScript context that exposes only ECMAScript built-ins and `Intl` (no `URL`, `process`, `Buffer` or `require`)
- **THEN** evaluation SHALL succeed, `createWidgenticHost("{}")` SHALL return a host, and its `problems()` SHALL be `[]`

#### Scenario: Bare-realm output equals the Node path
- **WHEN** every corpus input is run through the bundle in a bare realm
- **THEN** each output string SHALL be byte-identical to the corpus output recorded from the Node path

#### Scenario: The corpus cannot go stale
- **WHEN** a change alters any handler output for a corpus input without regenerating the corpus
- **THEN** the default gate SHALL fail naming the input

#### Scenario: Template http actions need URL and get it
- **WHEN** a bare-realm host is created with the example weather widget, whose template binds an http action to an absolute https URL
- **THEN** `problems()` SHALL be `[]` and the widget SHALL be listed by `list_widgets`

#### Scenario: Http actions render disabled; prompt actions do not
- **WHEN** a host renders a widget whose template binds one http action and one prompt action
- **THEN** the http action's descriptor SHALL carry `disabled: "unresolved"`, the prompt action's descriptor SHALL carry no `disabled` key, and `structuredContent` SHALL have no `load` or `loads` key

#### Scenario: Invalid entries are refused at the door
- **WHEN** the config carries a widget whose template uses a forbidden tag, a widget whose kind is `card`, and a theme named `dark`
- **THEN** none of the three SHALL be served, and `problems()` SHALL list three entries naming their section, index and structured code

#### Scenario: Definitions are the exported ones
- **WHEN** `definitions()` is parsed
- **THEN** each tool's `name`, `description` and `inputSchema` SHALL deep-equal the corresponding exported tool definition, `preview_widget` alone SHALL carry `visibility: ["app"]`, and the list SHALL contain no `execute_action` and no `list_actions`

#### Scenario: The preview tool is the Node assembly's
- **WHEN** a host configured with the example invoice widget calls `preview_widget` with `{ widget: "invoice", data: { customer: "Ada" } }`
- **THEN** the result SHALL equal `handlePreviewWidget` over the same composed catalog and themes: `structuredContent` carrying only `tree` (rendering `Ada`) and `css`, with no payload, no diagnostics and no `load`

#### Scenario: Unknown tools are results
- **WHEN** `call("execute_action", "{}", false)` runs
- **THEN** it SHALL return an `isError` result with a structured `UNKNOWN_TOOL` code and SHALL NOT throw

#### Scenario: No global is touched
- **WHEN** the names of the global object's own properties are recorded before evaluating the bundle in a bare realm and again after creating a host and rendering every corpus input
- **THEN** the two lists SHALL be identical, and `URL` SHALL still be undefined after a render that parsed URLs

#### Scenario: Calls carry no state
- **WHEN** a host renders payload A and then payload B
- **THEN** B's output SHALL be byte-identical to B rendered by a freshly created host, and SHALL contain no string that appears only in A

#### Scenario: Settings choose the host's default themes
- **WHEN** a host is created with a configured theme `brand` and `settings: { defaultThemes: { light: "brand" } }`, and `render_widget` runs with no `theme`
- **THEN** the output SHALL equal the Node assembly's for a principal whose stored settings choose `brand` as the light default
- **AND** `list_themes` SHALL report `defaults: { "light": "brand", "dark": "dark" }`

#### Scenario: A default naming no served theme is reported
- **WHEN** `settings` names `ghost` as the dark default and the config carries no theme `ghost`
- **THEN** `problems()` SHALL list one entry with section `settings` and code `UNKNOWN_THEME`, the host SHALL be created, and the dark default SHALL stay the built-in

#### Scenario: Malformed settings are reported, not thrown
- **WHEN** `settings` carries an unknown section, or a mode other than `light` and `dark`
- **THEN** `problems()` SHALL list `INVALID_SHAPE` under section `settings`, and the host SHALL be created with the built-in defaults

#### Scenario: Declared domains are reported canonical
- **WHEN** a host is created with `resourceDomains: ["assets.example.org"]` and `settings: { resourceDomains: ["CDN.example.com", "https://*.example.net/", "https://assets.example.org"] }`
- **THEN** `resources()` SHALL give the app template `resourceDomains: ["https://assets.example.org", "https://cdn.example.com", "https://*.example.net"]`, and `problems()` SHALL be `[]`
- **AND** a host created with neither SHALL give no `resourceDomains` key, with `resources()` byte-identical to a host created before resource domains existed

#### Scenario: Refused domains are reported, not declared
- **WHEN** a host is created with `resourceDomains: ["http://old.example.com"]` and `settings: { resourceDomains: ["cdn.example.com", "localhost"] }`
- **THEN** `problems()` SHALL list `INVALID_DOMAIN` under section `resourceDomains` naming `http://old.example.com` and `INVALID_DOMAIN` under section `settings` naming `localhost`, the host SHALL be created, and `resources()` SHALL declare only `https://cdn.example.com`

