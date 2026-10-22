## 1. Core (`@widgentic/core`)

- [x] 1.1 `catalog/descriptors.ts`: `themes?: { light?: string; dark?: string }` on `WidgetDescriptor`. `catalog.register` copies it like `styles`.
- [x] 1.2 The runtime-neutral shape check `checkWidgetThemes` (D2):
  - only `light`/`dark` keys;
  - names matching `SAFE_IDENTIFIER`;
  - messages naming `descriptor.themes`.

  Export it and update the exports snapshot.
- [x] 1.3 Tests: the three "Descriptors may name the widget's themes" scenarios.

## 2. The store (`@widgentic/mcp/store`)

- [x] 2.1 `store/validate.ts`: `checkStoredWidget` runs the shape check (`INVALID_SHAPE` on write, a skip with a diagnostic on read).
- [x] 2.2 `putWidget` in memory, SQLite and Cosmos (the file store is read-only) refuses an unknown theme name (not `light`/`dark`, not stored for the principal) with `UNKNOWN_THEME`, naming the mode and the theme.
- [x] 2.3 `refs.ts` `widgetsUsingTheme` over raw entries. `removeTheme` in the three writable adapters refuses with `THEME_IN_USE`, naming the widgets beside any settings default (D3). The authoring handler maps `UNKNOWN_THEME` on a widget save to 422.
- [x] 2.4 Composition: `composeCatalogEntries` reports a widget naming a theme the principal's stored themes lack (D5), and the host bundle shares it. Dropped during apply; see the D5 revision. The render's `Theme notes:` and the designer's "missing" option report it.
- [x] 2.5 Tests in the shared adapter suite (the writable adapters; the file store's read path too):
  - every "Widgets that name themes keep them resolvable" scenario;
  - an old-shape widget (no `themes`) read and rendered byte-identically;
  - a raw-entry scan protecting a theme named by a currently invalid widget.

## 3. Rendering (`@widgentic/mcp`)

- [x] 3.1 `handlers.ts`: `renderThemes(explicit, registry, widgetThemes?)` with per-mode precedence (D4). `handleRenderWidget`, `handlePreviewWidget` and the widget page pass `catalog.describe(kind)?.themes`; action re-renders inherit it.
- [x] 3.2 Groups: per-mode agreement over the items' names (D6). Missing names fall back (D5). `Theme notes:` joins the text result after the hint notes, wherever hint notes ride, and never enters a `page` document.
- [x] 3.3 Steering (D7):
  - the `render_widget` `theme` field description;
  - both guides' descriptor field list.
- [x] 3.4 Tests:
  - every scenario of "A widget's own themes take priority over the defaults";
  - the MODIFIED "Default themes from settings stand in for the built-ins" scenarios, still passing;
  - byte-identity for widgets without `themes`.
- [x] 3.5 Corpus: a widget naming a stored theme, a built-in opt-out, a widget naming one mode, an agreeing group, a disagreeing group, and a missing name. Run `npm run conformance:generate`, then `dotnet test`.

## 4. The designer (`@widgentic/designer`)

- [x] 4.1 Light-theme and dark-theme selects in the widget designer's descriptor area (D8):
  - options are Settings default, the built-ins and the supplied themes;
  - a missing name is kept and marked;
  - Settings default omits the mode, and both omitted removes `themes`;
  - choosing a supplied light theme selects it as the preview theme.

  The designers' import runs `checkWidgetThemes`.
- [x] 4.2 Tests: the three "The widget designer sets the widget's themes" scenarios, and an export carrying `descriptor.themes`.

- [x] 4.3 The preview opens on the widget's own theme (D10):
  - `defaultPreviewTheme` option;
  - initial selection order: `previewTheme`, then the draft's own theme for the scheme, then `defaultPreviewTheme`;
  - `loadWidget` switches to the definition's own theme.
- [x] 4.4 Tests:
  - the modified "Preview theme selection in the widget designer" scenarios ("A widget's own theme opens as the preview theme", "Loading a widget switches to its own theme", "Loading a widget keeps the preview theme");
  - the self-host app opening the seeded person card on `acme` while other widgets open on the light default.
- [x] 4.5 The self-host app (`examples/docker/main.ts`) passes the Settings light default as `defaultPreviewTheme`, and the person's remount pick as `previewTheme`. Note for the apps adoption: the same switch.

## 5. Docs, seed and release notes

- [x] 5.1 Docs:
  - the theming page (precedence: explicit, then widget, then default, then built-in);
  - `groups-and-hints.mdx` (the group rule and the theme note);
  - the widget-designer page;
  - the README capability rows.

  Regenerate the reference pages.
- [x] 5.2 Demo seed (Migration Plan 2):
  - the `acme`/`acme-night` themes;
  - the person card names them;
  - the project status names `light`/`dark`.

  Owner request (2026-10-22): the person card also gains richer data:
  - an email (`mailto:`);
  - an optional title;
  - an optional company block (name, website and industry);
  - optional tags.

  Optional parts render only when present. Update the seed tests (entry counts) and regenerate the .NET sample seed.
- [x] 5.3 Changesets: core, designer and mcp minor, webmcp patch. Add a dated `TESTING.md` entry.

## 6. Gates and staging

- [x] 6.1 Run the gates: typecheck, `npm test`, build, `pack:check`, `docs:check`, `openspec validate --strict widget-themes` and `--specs`, and `dotnet test`.
- [x] 6.2 Read-only production scan (counts only): stored widget descriptors already carrying a `themes` key (expected 0). Result 2026-10-22: 25 widgets, 0 with `themes`.
- [x] 6.3 Deploy the branch to staging and check from the served bytes. Staging ran `widget-themes-1597397` (ACR cj43, revision `--0000038`); `4253eff` was checked first, then the note punctuation fix. After the owner's designer finding (D10) it runs `widget-themes-34e1813` (ACR cj44, revision `--0000039`), and the served `/app.bundle.js` carries `defaultPreviewTheme`. Checked:
  - a keyed render of the person card carries `acme`'s light-scoped tokens and `acme-night`'s dark-scoped tokens;
  - the inbox carries the Google defaults;
  - a disagreeing group's text carries the theme note;
  - `list_widgets` shows `themes`.

  Results:
  - the person card wears `acme`/`acme-night`, and the inbox the Google pair;
  - the project status carries no token declarations, since it opted out to the built-ins;
  - a person card plus inbox group wears `acme` with no note;
  - a person card plus project status group wears the Google defaults, with a note for each mode;
  - `list_widgets` carries `themes`.
- [x] 6.4 Owner leg in each host (fresh chat), plus the designer and the app's refused theme deletion (Migration Plan 3). PASSED 2026-10-22. The owner confirmed, with screenshots:
  - the person card in Acme (dark), the inbox in Google, the project status in the built-ins;
  - the agreeing group in Acme, and the disagreeing group in the Google defaults with the note;
  - the designer previewing every widget in its own theme;
  - `THEME_IN_USE` naming `person-card-widget` when deleting `acme-night`.

  Follow-up: the group note now also advises rendering the items separately (design D6). It is restaged as `widget-themes-d86c8fd` (ACR cj45, revision `--0000040`), and the served note closes with that advice once.
