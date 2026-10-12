## 1. Core theming

- [x] 1.1 `ThemeEntry.styles?` and the `ThemeMode` type. The registry checks the `styles` shape on `register` (throws carrying `INVALID_THEME`) and merges `extends` styles per selector, then per property (design D5).
- [x] 1.2 Registry defaults: `setDefault(mode, name)` (throws for an unregistered name), `getDefault(mode)`, `defaults()`; built-ins until set (design D2).
- [x] 1.3 `themeStylesToCss(styles, scope?)` reusing the widget-styles guards; `:where(<scope>) ` prefix on every selector part (design D3). Export from `./theming` and update the `tools/exports.test.ts` snapshots.
- [x] 1.4 Tests for every widget-theming scenario, including the computed-value check that a scoped rule applies only inside its scope and loses a tie to a later widget rule.

## 2. Store

- [x] 2.1 `checkStoredTheme`: refuse a malformed `styles` with `INVALID_THEME`; count `styles` in the entry's byte size.
- [x] 2.2 The `PrincipalSettings` type. `settings` on the read port, `putSettings` on the writable port: section-level replace, `null` removes a section, unknown sections refused on write (`INVALID_SHAPE`) and ignored on read; `defaultThemes` key and value checks, and stored-name check over raw entries (`UNKNOWN_THEME`) (design D1).
- [x] 2.3 `removeTheme` refuses `THEME_IN_USE` while `defaultThemes` names the theme, naming the mode(s) (design D6).
- [x] 2.4 Adapters: memory (a map), file (`<dir>/<principal>/settings.json`), SQLite (an `entries` row, kind `settings`, name `principal`), Cosmos (document `settings` in the principal's partition).
- [x] 2.5 `composeThemes` applies `settings.defaultThemes` to the registry and drops a dangling name with a diagnostic; anonymous composition keeps the built-ins.
- [x] 2.6 Contract-suite tests for every widget-store scenario, run against all four adapters. Include old-shape tests (a pre-change theme entry and a missing record load as no styles and `{}`) and a listing of every kind after settings are written, which must return no stray entries.

## 3. Authoring surface

- [x] 3.1 `PUT /themes/<name>` carries `styles` into the entry; `GET /themes` returns it.
- [x] 3.2 `GET` / `PUT /settings` through `putSettings`. `rejectionStatus` maps `THEME_IN_USE` to `409`; `UNKNOWN_THEME` and `INVALID_SHAPE` stay in the `422` family.
- [x] 3.3 Tests for every authoring-api scenario, through the core handler and the Node adapter.

## 4. Server output

- [x] 4.1 CSS composition in `handlers.ts`: theme styles, then kind styles, then token declarations, for the template channel, `page`/`app` documents and `preview_widget` (design D4).
- [x] 4.2 Default themes when no `theme` is given: the light default under `:root:not([data-theme="dark"])` and the dark default under `:root[data-theme="dark"]`, with styles scoped by `:where()`. One theme serving both modes is emitted unscoped; documents use the light default only; built-in defaults emit nothing (design D3, D8).
- [x] 4.3 `handleListThemes`: `styles` on entries, `defaults: { light, dark }`, and the rules text naming the `styles?` entry shape. Update the `list_theme_tokens` rules text the same way.
- [x] 4.4 Authoring guide: `styles` in the theme entry shape and the theme-styles rules derived from `UNSAFE` / `PROPERTY_NAME`, with defaults described as a setting. Mirror both in `packages/webmcp/src/guide.ts`.
- [x] 4.5 Tests for every mcp-server scenario:
  - byte-identical output with no defaults, in every format;
  - the app-template computed check (light default on a light host, built-in behavior on a dark host) through the `bootTemplate()` harness;
  - `preview_widget` parity with the render.
- [x] 4.6 Host bundle: add one render under a styled theme to the conformance corpus, then run `npm run conformance:generate` and `dotnet test --solution Widgentic.slnx -c Release` (design D10).

## 5. Designer

- [x] 5.1 Theme designer Styles section: reuse `createStylesEditor` with the Tree/JSON tabs and the style audit from `panels.ts`/`validate.ts`, factoring the shared panel builder out rather than copying it. Export/import carry `styles`, and `checkThemeEntry` checks the shape.
- [x] 5.2 Theme designer preview applies the theme's styles beneath the previewed kind's styles.
- [x] 5.3 Widget designer preview applies the selected preview theme's styles beneath the draft's.
- [x] 5.4 Settings designer: `createSettingsDesigner` (handle `getSettings`, `loadSettings`, `setReadOnly`, `subscribe`, `dispose`; options `themes`, `initialSettings`, `readOnly`, `chrome`, `appearance`) and `defineSettingsDesignerElement` (`widgentic-settings-designer`). The Default themes subsection has a select per mode, an "unavailable" entry for missing names, and passes unedited sections through (design D7). Export from the entry, the browser bundle and the custom-element module; update the `tools/exports.test.ts` snapshots.
- [x] 5.5 Tests for every widget-designer scenario, with computed-value checks for the two preview-styling scenarios.
- [x] 5.6 WebMCP: confirm `<prefix>_theme_load` / `<prefix>_theme_get` round-trip `styles` (test). The settings designer gets no tools (design D9).
- [x] 5.7 `createDesigner` `previewTheme` option: open with the named supplied entry selected (tokens and styles), ignore an unknown name; `loadWidget` keeps `themeStyles` beside `theme` (design D12). Tests for both new scenarios; embed docs.

## 6. Self-host example

- [x] 6.1 `examples/shared` authoring client: `getSettings` / `putSettings`.
- [x] 6.2 Settings section: mount the settings designer with the stored themes and settings, save through `/settings`, and show refusals.
- [x] 6.3 Themes list marks the default themes; a `THEME_IN_USE` delete refusal is shown.
- [x] 6.4 Seed: optional `settings`, applied section by section after the entries, only where the principal lacks the section; refusals logged. Set `google-light` / `google-dark` as defaults in `seed/demo.json`, and keep the conformance generator ignoring the new key.
- [x] 6.5 Tests for every self-host-example scenario (seed tests on the SQLite store; the Settings and Themes behavior through the example's tests).
- [x] 6.6 The example's widget designer opens with the light default preselected (`previewTheme`); app test for the scenario.

## 7. Docs, gate and staging

- [x] 7.1 Docs: theme styles and default themes on the theming/design pages; Settings on the self-hosting page; README capability rows; regenerate the reference pages (`tools/docs-generate.ts`).
- [x] 7.2 Changesets: core, designer and mcp minor; webmcp patch.
- [x] 7.3 Dated `TESTING.md` entry. `BACKLOG.md`: queue the .NET default-themes option and dark mode for documents.
- [x] 7.4 Gate: typecheck, `npm test`, `npm run build`, `npm run pack:check`, `npm run conformance:generate` with no diff afterwards, `dotnet test`, `openspec validate --strict theme-styles-and-defaults`, `openspec validate --specs`, `npm run docs:check`.
- [ ] 7.5 Stage on `demo.widgentic.dev` from this branch and check in fresh conversations in at least two hosts:
  - a widget using a theme class;
  - the light/dark defaults following the host's theme;
  - Settings saving and the Themes list updating.

## 8. widgentic.dev (apps repository, after the release)

- [ ] 8.1 Companion change in `widgentic/apps` (its `widgentic-app` spec): a Settings section in `apps/web` mounting the settings designer against `/api/settings`; the widget designer opened with `previewTheme` set to the light default; the Themes list showing defaults; `THEME_IN_USE` through the feedback banner (design D11).
- [ ] 8.2 Bump the `@widgentic/*` ranges to the released versions, implement, run the apps gate (typecheck, tests, `check:theme`), merge, and deploy `vNN` (on the owner's "deploy vNN"). Verify the served bundle carries the settings designer and that a signed-in session saves defaults.
