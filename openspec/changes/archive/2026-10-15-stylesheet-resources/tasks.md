## 1. The rule (`@widgentic/core`)

- [x] 1.1 Add `parseResource`, `resourceCovered` and `RESOURCE_LIMIT = 8` beside the resource-domain rule (D2).
  - The parser is a runtime-neutral grammar: no `URL` global.
  - It accepts an `https://` host in the domain host grammar with no wildcard, no port, no userinfo, then an optional path, query and fragment, in at most 2,048 characters.
  - It refuses whitespace, control characters, quotes, `<`, `>` and backslash.
  - `integrity` is one or more `sha256|sha384|sha512-<base64>` values; the type is `"stylesheet"` only; unknown keys are refused.
  - The host is lowercased, the rest kept as written.
- [x] 1.2 Unit tests for every accepted and refused form in the widget-store scenarios, and for coverage: exact, wildcard, and the wildcard not covering its apex. Update the exports snapshot.

## 2. The store (`@widgentic/mcp/store`)

- [x] 2.1 `settings-rules.ts`:
  - the `resources` section in `PrincipalSettings` and `SETTINGS_SECTIONS`;
  - `readSettings` keeps the entries passing the rule and covered by the record's own domains, reporting each dropped one by name;
  - `checkResources` (shape and rule, `INVALID_RESOURCE` / `INVALID_SHAPE`, limit, dedupe by `href`) wired into `checkSettings`, shape-only, as D3 says.
- [x] 2.2 `settings.ts`: `applySettingsUpdate` handles `resources` (an empty list removes it). After every section of the update is applied, it refuses with `UNDECLARED_DOMAIN` any stored or written stylesheet the resulting `resourceDomains` do not cover. That covers a domain removal and `resourceDomains: null`.
- [x] 2.3 `composeResources(store, principalId, { settings })` in `compose.ts`, exported from `./store` and covered by the exports snapshot.
- [x] 2.4 Tests through the shared adapter suite (memory, file, SQLite, Cosmos fake) for every scenario of "Stylesheet resources are a settings section". Add the old-shape regression test: a record holding only `defaultThemes` and `resourceDomains` reads back unchanged in every adapter.

## 3. The authoring route

- [x] 3.1 Map `INVALID_RESOURCE` and `UNDECLARED_DOMAIN` to `422` (the default branch probably does already; pin it with a test), and test the new "Settings have their own route" scenario through `PUT /settings` and `GET /settings`.

## 4. Delivery (`@widgentic/mcp`)

- [x] 4.1 `createWidgenticServer({ resources })`: re-read each entry with `parseResource`, drop the uncovered ones against the declared domains (D3), and pass the kept list to the render, preview, `execute_action` and `list_themes` handlers.
- [x] 4.2 Handlers:
  - `structuredContent.resources` on render, preview and `execute_action` results, absent when empty;
  - `page` documents link them, attribute-escaped, before their styles;
  - the `html` fragment and the payload block never carry them;
  - `list_themes` carries `resources: [{ type, href }]` when present, explained in the result's `rules` (D6, revised).
- [x] 4.3 The bridge (`app-template.ts`), per D4: `applyResources` next to each of the three CSS applications.
  - It syncs `link[rel=stylesheet]` elements by `href`, in order, before `#wg-dynamic-css`.
  - It adds `integrity` with `crossorigin="anonymous"` only when an integrity value is given.
  - It ignores non-stylesheet and non-`https://` entries, and treats a missing key as none.
  - It stays inside the size budget; if it cannot, add the MODIFIED "App template size budget" delta and record it (D7).
- [x] 4.4 Tests:
  - every scenario of "Stylesheet resources reach the frame and the page", the bridge ones through the `bootTemplate()` harness: order, placement, element identity across results, removal, ignored entries, preview paths;
  - the new scenarios of "Structured content for app templates" and "Named theme listing tool";
  - the size test.
- [x] 4.5 The conformance corpus: add a stylesheet case (a render, a page and a preview for a configuration with a covered stylesheet). Run `npm run conformance:generate`. Existing cases may change only for the app template (the bridge).

## 5. The host bundle and `Widgentic.Mcp`

- [x] 5.1 `host/index.ts`: read `settings.resources` through `checkSettings`, drop the uncovered ones against the declared list with an `UNDECLARED_DOMAIN` problem, and pass the rest to the handlers. Add tests for the host-bundle scenario.
- [x] 5.2 `.NET`: confirm that Merge/Replace combine `resources` by section with no new C# surface (D10). Add tests for the three "Stylesheets come from settings" scenarios, and an `Unreleased` entry in `dotnet/src/Widgentic.Mcp/CHANGELOG.md`. The version and pin move at release.

## 6. The designers (`@widgentic/designer`)

- [x] 6.1 `resources` on `createDesigner` and `createThemeDesigner`. In island mode, the entries passing `parseResource` ride each preview's structured content; in page mode the option is ignored (D8). Test both scenarios of "The island loads the person's stylesheets".
- [x] 6.2 The settings designer's Stylesheets subsection (D9):
  - rows of address and integrity with remove, an add input, and add disabled at the limit;
  - a rule-reason mark, and a coverage mark naming the domain that clears when the domain is listed;
  - the derived note, including the fonts domain and the trust;
  - `getSettings` and `loadSettings` handling, and inert in read-only mode.
  Test every new "Settings designer" scenario; the existing scenarios pass unchanged.

## 7. The self-host example and the demo seed

- [x] 7.1 `principal-server.ts` composes `composeResources` from the same settings read, and `main.ts` passes the person's `resources` to the widget and theme designers.
- [x] 7.2 The seed (D12):
  - `fonts.googleapis.com` and `fonts.gstatic.com` in `resourceDomains`;
  - the Material Icons stylesheet in `resources`;
  - the mail icon in the inbox widget and the event icon in the agenda widget, with their `.wg-` styles.
  Update the seed test.
- [x] 7.3 Example tests for both "Stylesheets reach the endpoint and the designers" scenarios.

## 8. Real browser, docs and release notes

- [x] 8.1 Chrome, with the example served locally and the seed loaded:
  - the frame (`tools/probe-template.ts` or the island) links the stylesheet before the result CSS and renders the icon glyphs;
  - a second result keeps the same link element;
  - the settings designer marks an uncovered stylesheet and clears the mark when its domain is added;
  - a save that removes the domain is refused with `UNDECLARED_DOMAIN`.
- [x] 8.2 Docs:
  - `docs/design/themes.mdx`, the person-facing Settings section: Stylesheets, the fonts domain, the trust, `integrity`, and the reload note for claude.ai;
  - `docs/develop/embed-the-designers.mdx`: the subsection and the `resources` option;
  - `docs/develop/run-your-own-server.mdx`: the store section, `composeResources` and the server option;
  - `docs/how-it-works/inline-rendering.mdx` and `docs/develop/mcp-tools.mdx`: `structuredContent.resources` and `list_themes`;
  - the .NET docs and the package READMEs.
  Regenerate the reference pages.
- [x] 8.3 Changesets: core, designer and mcp minor (the linked group stays on the unreleased 0.14.0). Add a dated `TESTING.md` entry.

## 9. Gates and staging

- [x] 9.1 Run the gates: typecheck, `npm test`, build, `pack:check`, the docs check, `openspec validate --strict stylesheet-resources` and `--specs`, and `dotnet test`. The host bundle changes, so `dotnet test` is required.
- [x] 9.2 Deploy the branch to staging and check the served bytes:
  - the settings record and a keyed render's `structuredContent.resources`;
  - a `page` document's link;
  - the frame bundle carries `applyResources`.

  Then hand the owner the host check (Claude, ChatGPT and Copilot render the seeded icons from settings), the Settings refusal and the designer preview.
