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

## 8. Review findings (PR #29, two reviews, deduplicated)

- [x] 8.1 Theme styles survive `execute_action` re-renders: `themeName` on the payload for named themes with styles; resolve it again, falling back to the held tokens (both reviews).
- [x] 8.2 Style guards: ban comment markers and `image-set(`/`src(` (styles and token values); require a `.wg-` class outside pseudo-class arguments and attribute tests; refuse combinator-led parts; the guides derive the rules from one object built from the constants (review 2).
- [x] 8.3 Scoping: split on top-level commas; scope root-anchored parts on their root compound (both reviews).
- [x] 8.4 Scope styles by mode only when both modes have their own default (review 1).
- [x] 8.5 Cosmos `putSettings` / `removeTheme` as transactional batches with `ifMatch` and retries; the fake gains batch and etags; race tests (both reviews).
- [x] 8.6 `composeThemes` keeps the built-ins with a diagnostic when settings are missing or unreadable (review 2).
- [x] 8.7 Designer: `loadTheme` drops the previous preview styles; the JSON tab admits only the styles shape and maps `{}` to none; `setThemes` and the element's `themes` property; preview scope ids salted per bundle; shared `clone` (both reviews).
- [x] 8.8 Steering: `list_themes` and `render_widget.theme` descriptions name the defaults; WebMCP `theme_get`/`theme_load` describe `styles` (both reviews).
- [x] 8.9 Widget pages take the light default; a still-streaming theme previews with none; `undefined` sections count as absent in every adapter; settings reads report dropped values; diagnostics name the skipped theme (both reviews).
- [x] 8.10 Example: preview themes compose `extends`; unread settings open read-only without Save; demo seed date patterns `HH:mm`.
- [x] 8.11 Docs and headers: storage layouts list the settings record; "five designers"; README; the host-bundle and guard requirements in the deltas.
- [x] 8.12 Test gaps: exact built-in dark comparison; light-scope computed check; unsafe entries across app format and defaults; registered-legacy assertion; invalid-theme default; anonymous defaults; mixed-section refusal; file store without `settings.json`; seed token values; dark choices in the app test; settings designer in the chrome factories.
- [x] 8.13 WebMCP agent findings: `draft_load`/`definition_check` refuse invalid and built-in kinds and `theme_load` invalid and built-in names (`SAFE_IDENTIFIER` moves to core); a missing `dataShape` warns instead of passing silently, and the guides say "strongly recommended"; `widget_theme_set` with empty tokens no longer selects "Light"; the demo seed's date patterns use `HH:mm`.
- [x] 8.14 WebMCP agent retest: `widget_theme_set` / `loadTheme` layer tokens over the person's chosen preview theme (the draft's `previewTheme`) instead of replacing it, and `{}` returns to it; `auditDataSchema` / `DATA_SCHEMA_TYPES` in core, with warnings in the schema designer, `schema_load`, the widget designer and `definition_check`; the guides derive the type list (D14, D15).
- [x] 8.15 Second review round at `6c7eace` (two re-reviews, deduplicated): quote-aware scanner and balanced brackets/strings for selectors, style values and token values; token values refuse `\\`; selectors held through `:is()`/`:where()`; `STYLE_RULES`/`TOKEN_VALUE_RULE` in core; `normalizeStoredTheme` on read with old-shape tests; Cosmos batch 403 → `FORBIDDEN`; Cosmos `putSettings` checks only written defaults; styles scoped only when both defaults carry them; identity checks only on change (WebMCP reload tools, demo restore); example Settings retry; settings element pre-upgrade `themes`; Styles panel error clears; docs, comments and changeset fixes (D16).
- [x] 8.16 Third review round at `5969a8b`, triaged for the normal flow (D17): newlines end strings in the CSS scanner; `:is()`/`:where()` nesting capped at 16; the self-host remount keeps the draft through `initialWidget`; Cosmos 403 detection anchored and other batch failures logged; `list_theme_tokens` derives its rule; spec placement and wording fixes; old-shape test gaps; `loadTheme` layering documented; THM-3 queued.
- [x] 8.17 Browser agent: shared `dataSchemaRef`s reported as unknown by WebMCP. The designer handle gains `getDiagnostics()` and `checkWidget(definition)`, resolved against the host's schemas and actions; `draft_get`, the editing tools and `definition_check` use them; without a designer, references are unverified, not unknown; a descriptor with both schema forms is refused at load (D18).
- [x] 8.18 Fourth review round at `8841d0a` (D19): `widgetIfMounted` so `definition_check` never shows or remounts; the examples remount only on entering a section and keep the preview pick; the designer passes the host's schemas through; a thrown Cosmos request reports no operation outcome; malformed `dataSchemaRef`/`dataSchema` refused at load; corrupt demo autosave recovered; docs and tests.
- [x] 8.19 Re-review at `b0f0e74`: `widgetIfMounted` answers only while the widget section is shown (no stale shared schemas in the check); a malformed `dataSchemaRef` refused with the store's `INVALID_SHAPE`; spec wording for a non-object `dataSchema`; the demo drops a bad autosave only after a fresh mount succeeds; an unread Settings record retries on any click (D19).
- [x] 8.20 Reviewer 1 at `1fbce0e` (ready to merge), non-blocking notes: an app-level test of the check's WebMCP wiring; the self-host delta's "never" scoped to the person being in another section.
- [x] 8.21 Browser agent on staging: theme tools return `diagnostics.styles` (the Styles panel's audit, `auditStyles` now exported); style messages name the part at fault; load-time link/host warnings queued as BACKLOG AGT-5 (`extends`: see 8.22) (both predate this change).
- [x] 8.22 Theme `extends` removed (owner decision, D20): the registry holds entries as registered and ignores an `extends` field; specs, docs, the .NET options comment and the example preview themes follow; BACKLOG THM-4 closed by this.
- [x] 8.23 Reviewer 1 at `b889ac5`: the theme designer drops a retired `extends` from what it opens or loads; the changesets mark the removal as breaking, with the migration step; the apps change no longer mentions merging `extends`.
