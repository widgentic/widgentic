## Why

A .NET integration ran into three limits, all about what a widget may load beyond its own CSS:
- `@font-face` cannot be declared;
- an external stylesheet cannot be used;
- web components cannot be loaded from an external script.

Theme and widget styles are inline rules behind a guard that refuses `url(`, `@` and anything that reaches outside the widget. So an icon font like Material Icons, or a brand font, cannot reach a widget. The person's declared resource domains already let a frame load images from those origins directly.

- **The probe (2026-10-15).** Claude and ChatGPT also honor declared domains for `style-src` and `font-src`. A Material Icons stylesheet from Google Fonts rendered a mail icon and an event icon in both. Copilot could not be tested: a host update had broken it that day.
- **The island is in place.** The designer preview now runs in the same document under the same frame policy (`designer-preview-island`), so a stylesheet the person adds previews exactly as it renders in a conversation.

Owner decision, 2026-10-15: stylesheets now, behind the person's declared domains. Scripts and web components wait, because they change the trust model: widgets are data, and nothing the person adds runs code in a frame.

## What Changes

- **A `resources` settings section.**
  - **Entries.** `[{ type: "stylesheet", href, integrity? }]`, stored per principal beside `defaultThemes` and `resourceDomains`.
  - **The rule.** It lives in `@widgentic/core`, shared by the store, the host bundle and the settings designer. An entry is an `https` URL with no credentials, an optional Subresource Integrity value, at most 8 entries, deduplicated in order.
  - **Covered by the person's domains.** Its host must be covered by the same record's `resourceDomains`: a stylesheet the frame policy would block is refused at the door with `UNDECLARED_DOMAIN`. That includes a write that removes a domain a stylesheet still needs.
  - **Unsupported types.** A type other than `stylesheet` is refused with `INVALID_RESOURCE`, and skipped with a diagnostic on read.
- **Delivery.**
  - **The result.** `render_widget` and `preview_widget` results carry `structuredContent.resources`, the caller's stylesheets, only those covered by the declared domains, and only when there are any.
  - **The bridge.** It keeps one `<link rel="stylesheet">` per entry in its document, before the widget CSS so author rules still win. It adds `integrity` and `crossorigin="anonymous"` when given. It syncs the list on every result and every preview.
  - **`page` documents.** They carry the same links in their head.
  - **Not delivered.** The `html` fragment and the payload block do not carry them: both land in a host's own page, where an external stylesheet would restyle the page.
  - **`list_themes`.** It lists the caller's stylesheets, so an agent drafting a template knows that, say, `material-icons` is available.
- **The settings designer** gains a **Stylesheets** subsection. Entries are checked as they are typed by the core rule, an entry whose host is not among the resource domains is marked, and adding stops at the limit.
- **The preview island.** The widget and theme designers take a `resources` option and send it in each preview's structured content, so the island loads the person's stylesheets under the frame policy that already grants their domains. The in-page preview ignores the option, so an external stylesheet never reaches the host page.
- **Hosts.**
  - **Node.** `createWidgenticServer` takes `resources`, alongside `resourceDomains`, and the store gains `composeResources`.
  - **Host bundle and `Widgentic.Mcp`.** They read them from the settings record they already accept.
  - **The self-host example.** It composes them per request and hands them to its designers.
- **Release.** Minors for core (the rule), designer and mcp, so the linked group stays on the unreleased 0.14.0. webmcp takes a patch. `Widgentic.Mcp` goes to 0.14.0 with its pin. The apps repo adopts it together with the island, in its own change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `widget-store`:
  - A new requirement, "Stylesheet resources are a settings section", covers the rule, the limit, the cross-check against `resourceDomains`, the read side and `composeResources`.
  - "Principal settings are one record per principal" now names three sections.
- `authoring-api`: `PUT /settings` maps `INVALID_RESOURCE` and `UNDECLARED_DOMAIN` to `422` ("Settings have their own route").
- `mcp-server`:
  - A new requirement, "Stylesheet resources reach the frame and the page", covers the `resources` option and coverage filter, `structuredContent.resources` on renders and previews, the bridge's links, `page` documents, and the host bundle's settings.
  - "Structured content for app templates" gains the key.
  - "Named theme listing tool" gains `resources`.
- `widget-designer`:
  - "Settings designer" gains the Stylesheets subsection.
  - A new requirement, "The island loads the person's stylesheets", covers the `resources` option.
- `dotnet-host`: a new requirement, "Stylesheets come from settings": `Widgentic.Mcp` serves the settings' stylesheets through the bundle, at startup and per principal.
- `self-host-example`: a new requirement, "Stylesheets reach the endpoint and the designers".

## Impact

- **Code.**
  - `packages/core/src/contract`: the resource rule and its limit, new exports.
  - `packages/mcp/src/store` (`settings-rules.ts`, `settings.ts`, `compose.ts`), `server/handlers.ts`, `server/server.ts`, `server/app-template.ts` (the bridge, within its size budget), the page document composition and `host/index.ts`.
  - `packages/designer/src`: the settings designer, `preview.ts` and the widget and theme designer options.
  - `examples/docker`, and the conformance corpus with a stylesheet case.
  - `dotnet/` tests and `CHANGELOG`.
- **Surface.** One settings section, two refusal codes, one server option, one compose function, one structured-content key, one `list_themes` field and one designer option. Nothing existing changes for a person with no stylesheets: their results and documents stay byte for byte as today.
- **Persisted shape.** One new optional section. Records without it read as before. The normalization seam is the lenient read, which keeps the entries that pass and skips the rest, with an old-shape regression test.
- **Docs.** The person-facing Settings section in `docs/design/themes.mdx`; `embed-the-designers.mdx` (the Stylesheets subsection and the `resources` option); `run-your-own-server.mdx` (the store section and `composeResources`); `inline-rendering.mdx` (`structuredContent.resources`); the .NET docs; and the READMEs.
- **Out of scope.**
  - Scripts and web components (a trust-model change, queued).
  - Per-theme stylesheets.
  - Operator-level stylesheets, beyond what a host passes to `createWidgenticServer`.
  - Fonts referenced from theme styles through `url(`, which stay refused: a stylesheet carries its own `@font-face`.
  - The apps adoption.
