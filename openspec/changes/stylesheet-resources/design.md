## Context

See proposal.md for the motivation. Current state:

- **Settings.** The record has two sections, `defaultThemes` and `resourceDomains`. Their rules live in `packages/mcp/src/store/settings-rules.ts`, which is Node-free and shared with the host bundle; the write path is `store/settings.ts` (`applySettingsUpdate`). The resource-domain rule itself is in `@widgentic/core` (`parseResourceDomain`, `matchesResourceDomain`, `RESOURCE_DOMAIN_LIMIT`). That is what the settings designer checks with.
- **Declaration.** `createWidgenticServer({ resourceDomains })` declares the union the edge composes (the operator's list, then the principal's) on the app resource as `_meta.ui.csp.resourceDomains`. Hosts map that declaration to `img-src`, `style-src`, `font-src` and `media-src`. The 2026-10-15 probe showed Claude and ChatGPT honor it for a stylesheet and its fonts.
- **The frame.** The app template's bridge applies `structuredContent.css` to `#wg-dynamic-css` in three places: the final result (`mountResult`), the server preview of a streamed stored kind, and the theme-CSS preview of a streamed built-in. The template is 43,653 bytes against a 45,056-byte raw budget ("App template size budget").
- **The island.** The designers' preview frame (`GET /preview-frame`) already grants the person's domains in `style-src` and `font-src`. The designer sends `{ tree, css, payload }` per revision.
- **The host bundle.** `packages/mcp/src/host/index.ts` checks `config.settings` with `checkSettings` and declares the configuration's domains followed by the settings' domains. `Widgentic.Mcp` passes startup and per-principal settings through it (Merge and Replace by section).

## Goals / Non-Goals

**Goals:**
- **Load where hosts load it.** A person's stylesheet loads in every frame that renders their widgets, and in their designer preview, exactly where the hosts' policy lets it.
- **Refused at the door.** Nothing the frame policy would block is stored. The store refuses it, and the server never delivers it.
- **Unchanged without stylesheets.** For anyone without a stylesheet, outputs stay byte for byte as today.

**Non-Goals:**
- Scripts, web components, `@import` or `url(` in theme or widget styles.
- Per-theme or per-widget stylesheets.
- Detecting a stylesheet's font domain. The person declares it, and the designer says so.
- Agent-supplied stylesheets. There is no agent write path, and render inputs cannot add one.

## Decisions

### D1. A settings section, one list per person

Stylesheets are a frame resource, like the domains that gate them, so they sit beside `resourceDomains` in the settings record: one ordered list for every render a person's key makes.
- **Per theme, rejected.** A stylesheet would follow the theme a render resolves (an explicit theme, the per-mode default, a group's single document). Two themes needing the same icon font would each declare it, and built-in kinds under a built-in theme could never use one.
- **Per widget descriptor, rejected.** A frame shows one document, and a group render would have to union its items' lists. Widgets are portable data, so a widget would carry a URL whose domain the importing person may not declare.

Either can come later on top of this list without changing it.

### D2. The rule lives in core and is runtime-neutral

`@widgentic/core` gains:
- `parseResource(entry)`, which returns `{ resource }` or `{ error }`;
- `resourceCovered(href, domains)`;
- `RESOURCE_LIMIT = 8`.

**Who uses it.** The store rules, the host bundle, the server's delivery filter, the settings designer and the designers' island option all apply this one rule.
- **No `URL` global.** The host bundle forbids one; the template's own parser is an injected shim. So `href` is matched by a grammar: `https://`, then a host in the resource-domain host grammar (no wildcard), then optionally `[/?#]` followed by printable characters other than whitespace, quotes, `<`, `>` and backslash.
- **Ports are refused.** A CSP source `https://host` matches only the default port, so a stylesheet on another port would be blocked.
- **Stored form.** The host is lowercased and the rest kept as written. Rewriting a query string could change what a CDN serves.

**`integrity`** is one or more space-separated `sha256|sha384|sha512-<base64>` values.

**Unknown keys** are refused at write. On read, an entry is kept or dropped as a whole. A later version that adds a key changes the rule with it.

**The limit, 8.** Each stylesheet is a render-blocking request in every frame. Eight covers an icon font, a brand font and a couple of libraries.

### D3. Two coverage checks, one code

- **Store write: the record's own `resourceDomains`.** The store knows no operator list. The check runs in `applySettingsUpdate` after every section of the update is applied, so:
  - one `PUT` may add a domain and its stylesheet together;
  - a write that removes a domain a stylesheet needs is refused;
  - both refusals are `UNDECLARED_DOMAIN`, naming the stylesheet and its host.
- **Delivery: the declared list.** `createWidgenticServer` and the host bundle drop any entry the declared list (operator, then principal) does not cover. The frame policy would block it anyway, and dropping it means no host ever sees a dead link. The host bundle reports the drop through `problems()`, and `Widgentic.Mcp` logs it.

  A `.NET` server that lists `fonts.googleapis.com` in `WidgenticOptions.ResourceDomains` and the stylesheet in settings works: the bundle's check reads the declared list, not the record's own.
- **The shared check stays shape-only.** `checkSettings` (store rules, host bundle) checks entries by the rule alone. The record-level coverage is the store's write step, and the declared-list coverage is the host's.
- **Rejected: one code per direction** (`DOMAIN_IN_USE` for removals). The fix is the same either way, "list the stylesheet's domain", and the message says which stylesheet.

### D4. Delivered as structured content, linked by the bridge

**Where the list goes.** `structuredContent.resources` carries `[{ type, href, integrity? }]` on render, preview and `execute_action` results. The key is absent when the list is empty, so the corpus and every existing output are unchanged.

**The bridge's `applyResources(list)`** is called next to each `dynamicCss.textContent = …`:
- **Sync by `href`.** A listed link that exists is kept, so the font does not reload or flash. A new one is inserted. One no longer listed is removed. All of them are kept in list order before `#wg-dynamic-css`, so a theme's or widget's rule wins a tie with the stylesheet's.
- **Absent means none.** A result without the key removes every link. Every structured content comes from one principal's composition, so the server sends the full list on every result and preview, and a missing key is the empty list.
- **Defense in depth.** Only `type === "stylesheet"` with an `href` starting `https://` is linked. Host CSP enforces the domains in any case.
- **`crossorigin="anonymous"` only with `integrity`.** Subresource Integrity needs a CORS fetch. Without integrity, a plain link avoids failing on a server that sends no `Access-Control-Allow-Origin`.

**Rejected alternatives.**
- **An `@import` line in `css`.** The style guard refuses `@`, an import cannot carry integrity, and imports serialize.
- **A per-template link baked in at serve time.** The template is one cached document for all principals.

### D5. `page` documents yes, fragments and payloads no

**Page documents carry the links.** A `page` document is standalone, opened in a browser tab or saved, so its head carries the links (attribute-escaped) before its styles.

**Fragments and payloads do not.** The `html` fragment and the widgentic payload block are placed into a host's own page (`render-in-your-host`), where a stylesheet would restyle that page; that is the isolation the island change just gave the designer. A native host that wants them reads them from structured content or its own settings.

### D6. Agents see them in `list_themes`

`list_themes` gains `resources: [{ type, href }]`, without integrity, which means nothing to an agent. An agent drafting a template for a person can then use `material-icons` and know it will load.

**Where the explanation lives (revised during apply).** The plan was a sentence in the tool's description. It went into the result's `rules` text instead, appended only when `resources` is present: the field and its explanation then travel together, and the corpus's `tools/list` case stays unchanged. The authoring guide is static and principal-independent, so it does not list them.

### D7. The bridge stays inside its budget

The template has 1,403 raw bytes left.
- **Size of the code.** `applyResources` compacts to roughly 450–600 bytes, so it should fit. Measured during apply: 44,631 raw and 11,602 gzipped, inside both budgets, so the budget is unchanged.
- **If it does not fit**, apply raises the raw budget to 46 KiB as a deliberate change: a MODIFIED delta of "App template size budget", recorded here and reviewed in the PR, never a silent bump.
- **Gzip.** The gzip budget (13,312) has more room, and is measured during apply.

### D8. The island takes `resources`; the page never does

**The designers' option.** `createDesigner` and `createThemeDesigner` take `resources`. In island mode the entries passing `parseResource` ride each preview's structured content. The bridge links them, and the preview frame's policy already grants the person's domains.

**No coverage check in the designer.** It does not know the operator's list, and the frame policy enforces the domains anyway.

**The in-page preview ignores the option.** Adding a link to the host page would restyle it.

**No element attribute.** The elements take no `resources` attribute: like `themes`, the list is data the host passes to the factory.

### D9. The settings designer's Stylesheets subsection

Rows of address and integrity inputs with a remove control, an add input, and the limit stated from `RESOURCE_LIMIT`.
- **Marks.** An entry the rule refuses is marked with the rule's reason. A valid entry whose host is not covered is marked "add `<host>` under Resource domains", and the mark clears as soon as the domain is listed; coverage is recomputed on every domain edit.
- **The note.** It says a stylesheet's fonts come from their own domain (for Google Fonts, `fonts.gstatic.com`), which must be listed too.
- **Trust.** A stylesheet styles everything in the frame and may load from the declared domains, so only stylesheets from sources the person trusts belong there, and `integrity` pins one that must not change.

### D10. The host bundle and `Widgentic.Mcp`

**The bundle.**
- `checkSettings` keeps the entries passing the rule.
- The host's index then drops uncovered ones against the declared list, reporting `UNDECLARED_DOMAIN`, and passes the rest to the render, preview and `list_themes` handlers.

**`Widgentic.Mcp`.** It already combines settings by section (Merge/Replace) and logs bundle problems per principal, so `resources` follows with no new C# surface.

**Revised during apply.** The per-principal composition (`CatalogComposer.Compose`) passed the bundle only the catalog sections and the settings record. The operator's `ResourceDomains` went only to the separate domain declaration (`ComposeDomains`). So a principal's stylesheet covered only by `ResourceDomains` would have been dropped. `Compose` now carries the operator's domains too.
- **What it changes.** For render calls this changes nothing else: the bundle reads the declared list only for coverage and for `resources()`.
- **Tests.** The spec scenarios, plus one for this case ("a principal's stylesheet is covered by the operator's domains").
- **Release note.** The `CHANGELOG` names the change.

**Its version** moves to 0.14.0 with the pin at release, not in this change.

### D11. The persisted shape and its seam

One new optional section.
- **Old records.** Records without it (every Cosmos document today) read as before.
- **The seam.** The lenient read: unknown or bad entries are dropped with diagnostics.
- **The regression test** reads a record holding only `defaultThemes` and `resourceDomains` through every adapter and gets exactly those back.
- **An older server** reading a record a newer one wrote ignores the unknown section, as "Principal settings are one record per principal" already requires.

### D12. The example and the demo seed

- **The MCP endpoint.** `principal-server.ts` composes `composeResources` from the same single settings read as themes and domains.
- **The authoring app.** `main.ts` passes `mySettings.resources` to the widget and theme designers.
- **The demo seed.** It gains:
  - `fonts.googleapis.com` and `fonts.gstatic.com`, as the probe had;
  - the Material Icons stylesheet in `resources`;
  - the probe's mail and event icons in the inbox and agenda widgets.

  The demo then shows the feature end to end in every host, now from settings rather than a template hack.

## Risks / Trade-offs

- **[Hosts differ]**
  - **Copilot is unknown.** It was untestable during the probe. → The staging check retests it. If it blocks `style-src`, the icons fall back to their ligature text ("mail"), which is legible, and the docs say so.
  - **claude.ai caches the policy per page session.** → The docs repeat the resource-domains note: reload after adding a domain.
- **[A stylesheet can do anything CSS can inside the frame]** It can hide content, restyle everything, and request images from declared domains, through attribute selectors that could reveal rendered values to that domain's logs. → It is the person's own choice behind their own domains, never an agent's, and the frame holds only the widget. The settings designer states the trust, and `integrity` pins the content.
- **[Fonts flash or load slowly]** → The frame's size observer reports the new height after the fonts arrive. A link kept across results never reloads.
- **[Template size]** → D7.
- **[Google Fonts varies its CSS by user agent]** So `integrity` cannot pin it. → `integrity` is optional, and the docs name this case.

## Migration Plan

No data migration. Records gain the section only when a person saves one.
1. Apply on `feature/stylesheet-resources`.
2. Deploy to staging. The seed then carries the stylesheet and the icons, replacing the earlier island image (`designer-preview-island-7914e25`).
3. The owner checks on staging:
   - Claude, ChatGPT and Copilot render the icons from settings;
   - removing the domain in Settings is refused;
   - the designer previews the icons.
4. Merge, then promote `staging` → `main` together with the island, and release 0.14.0 (core, designer and mcp minors; webmcp patch).
5. Bump `Widgentic.Mcp` to 0.14.0 with the pin.
6. Adopt in `widgentic/apps` (island + stylesheets) in its own change: compose `resources` in its MCP server, pass them and `previewFrame` to its designers, and extend its own frame-policy handling.
7. Delete the probe branch `feature/stylesheet-resources-probe` once staging no longer needs it.
