## Context

See proposal.md for the motivation. Current state:

- **Defaults.** Settings record `defaultThemes: { light?, dark? }` per principal. `composeThemes` (`store/compose.ts`) builds a request-scoped `ThemeRegistry`: the built-ins, the principal's stored themes, and `setDefault` per mode, where a missing default keeps the built-in and is reported.
- **Rendering.** `handlers.ts` `renderThemes(explicit, registry)` turns that into `RenderThemes { explicit?, light?, dark? }`.
  - A mode whose default is its built-in contributes nothing.
  - One theme for both modes becomes `explicit`.
  - `templateCss` scopes the token blocks under `:root:not([data-theme="dark"])` and `:root[data-theme="dark"]`, with the style-scoping rules of "Default themes from settings stand in for the built-ins".
  - `composePage` uses `explicit ?? light`.
  - `handlePreviewWidget` and action re-renders (`actions.ts` → `handleRenderWidget`) go through the same function.
- **Descriptors.** A stored widget is `{ kind, template, descriptor, load? }`. `catalog.register` copies selected descriptor fields (`dataExample`, `hints`, `dataSchema`, `styles`) and validates none of them; the store (`store/validate.ts` `checkStoredWidget`) and the importers do.
- **References.** `dataSchemaRef` is checked on write (`UNKNOWN_SCHEMA`), guarded on delete (`SCHEMA_IN_USE`) and resolved at composition. `refs.ts` scans raw entries for action and secret references. `refuseThemeInUse` (`store/settings.ts`) refuses a theme removal while a settings default names it.
- **Rendering notes.** The text result carries `Hint notes:` (diagnostics) and `Action notes:`. `format: "html"` returns the fragment alone.
- **The designer.** `options.themes` (named entries) feeds a preview-theme selector.

## Goals / Non-Goals

**Goals:**
- A widget dresses itself in its own light and dark themes, ahead of the person's defaults, everywhere it renders.
- Stored references stay resolvable: they are refused on write when unknown, guarded on delete, and degrade on read.
- A group never wears a look that one of its items did not choose.

**Non-Goals:**
- Inline token maps in `descriptor.themes`. Only names are allowed, so a theme stays one entry edited in one place.
- Per-item theming inside a group. A frame has one `:root`, and per-item scoping would need a token-scoping model the template does not have.
- Theme inheritance or merging between a widget's theme and the default.
- Agents setting widget themes. There is no agent write path, so people choose themes through the designer.

## Decisions

### D1. The names live in the descriptor

`descriptor.themes: { light?, dark? }`, beside `dataSchemaRef` and `styles`.

- **Why the descriptor.** It travels with the import and export JSON (`{ kind, template, descriptor }`), reaches `list_widgets` without new plumbing, and is what `catalog.describe(kind)` hands the renderer.
- **Rejected: a top-level `themes` beside `load`.** It would need its own path through the catalog and the host bundle, and agents would not see it.
- **Rejected: resolving names at composition, as `dataSchemaRef` is.** The theme registry is composed separately per request, so the names must reach render time, where the registry is.

### D2. One shape check in core, existence checks at the store

Core exports a runtime-neutral `checkWidgetThemes(value)`. It allows only the keys `light` and `dark`, and each name must match `SAFE_IDENTIFIER`, the theme-name grammar. `catalog.register` copies `themes` like `styles`.

The store calls the check:
- on write, giving `INVALID_SHAPE`;
- on read, giving a skip with a diagnostic.

The designers' import and the host bundle call it too.

Existence is a principal fact, so the store checks it on write:
- the name must be `light`, `dark` or a stored theme of that principal;
- otherwise the write fails with `UNKNOWN_THEME`, naming the mode and the theme.

### D3. Delete guard: `THEME_IN_USE` names widgets too

`refs.ts` gains `widgetsUsingTheme(widgets, name)` over raw entries. `removeTheme` in all four adapters refuses while either settings defaults or widgets name the theme, and one message names both: "'acme' is your default light theme and is named by widgets promo, report — …". The authoring handler already maps `THEME_IN_USE` to 409, and `UNKNOWN_THEME` on a widget save maps to 422, as for settings.

**Cosmos.** The existing theme-delete path reads settings in the same partition, and the widget scan reads the principal's widgets the same way. A race between a widget save and a theme delete is the "arrives by other means" case: composition reports it and the render falls back (D5).

### D4. Precedence per mode, in one function

`renderThemes(explicit, registry, widgetThemes?)`:
1. **Explicit** wins outright.
2. **Otherwise, per mode,** `name = widgetThemes?.[mode] ?? registry.defaults()[mode]`.
3. **Built-in.** If `name` is that mode's built-in (`light` for light, `dark` for dark), the mode contributes nothing, exactly as a built-in default does today.
4. **Stored.** Otherwise the registry entry dresses the mode.
5. **Same theme twice.** If both modes resolve to the same non-built-in name, the result is `explicit`.

Callers pass the widget's names from `catalog.describe(kind)?.themes`:
- `handleRenderWidget`, which covers every format and, through it, action re-renders;
- `handlePreviewWidget`;
- the widget page.

The streaming rule stands: a preview whose `theme` input does not resolve previews with no theme.

**Byte-identity.** With no widget names, the result equals today's for every input, so outputs for existing widgets are unchanged.

### D5. Missing names fall back, with a note

A widget name the registry does not hold makes that mode use the default. The renderer collects `Theme notes:`, joined into the text result after `Hint notes:`:
- the missing case: "widget 'promo' names light theme 'acme', which is not available; the default applies";
- the group disagreements of D6.

Theme notes ride the text result exactly where hint notes do: the default and `html` texts and the `app` line. They never enter a `page` document, which is browser-facing. (The plan had said they never enter `html`; the code shows hint notes do, so theme notes follow them.)

**Revision during apply (2026-10-22): no composition diagnostic.** The plan had `composeCatalogEntries` also report the dangling name, given the theme names. In practice:
- store-backed `composeCatalog` runs in parallel with `composeThemes` and has no names, so reading them would add a store read to every request;
- the host bundle lists only refusals and drops warnings, so its `problems()` would never show it.

The render's `Theme notes:` line and the designer's marked "missing" option are the reports. The widget-store requirement says so.

### D6. Groups: per-mode agreement

For each mode, take the names that the items' descriptors give for that mode, ignoring items that name none:
- **One distinct name:** the group's widget theme for that mode is that name.
- **Two or more distinct names:** that mode uses the default, and a note lists the item indices with their names: "group light theme: items name different themes (data.items[0] 'acme', data.items[1] 'ledger'); the default applies". One closing note then advises, once for both modes: "pass 'theme' to choose one look for the whole group, or, when the user wants each widget in its own theme, render them as separate widgets instead of one group". This is the owner's addition from the staging check (2026-10-22): one frame wears one theme per mode, so separate renders are the only way each widget keeps its own look.

The group kind itself never names themes; it is a built-in.

### D7. Steering lives in the tool texts

- **`render_widget`'s `theme` field description** gains one sentence: "A widget whose descriptor names themes wears them when you omit theme; pass theme only when the user asks for a different look."
- **`list_widgets`** needs no new text, since the descriptor shows `themes`.
- **The authoring guide's descriptor field list** gains `themes`, with the rule that names must be built-ins or the person's saved themes. It lives in both guides.

The corpus regenerates.

### D8. The designer: two selects in the descriptor area

The widget designer's descriptor section gains "Light theme" and "Dark theme" selects.
- **Options:** "Settings default", `light`, `dark` and each `options.themes` entry name. A loaded name matching none is kept as a "missing" option.
- **Edits:** they write `descriptor.themes`, and omit it when both selects are on "Settings default".
- **Preview:** choosing a supplied entry for light also selects it in the preview-theme selector. This is a person's choice, consistent with "Only the person's choice in the selector changes the selection" (choosing in the light-theme select is choosing). The island and the in-page preview then show it.

### D10. The preview opens on the widget's own theme (owner finding, 2026-10-22)

The owner checked staging: opening a widget that names its themes still previewed it in the Settings default. The self-host app passes the Settings light default as `previewTheme` for every widget, and the designer kept that pick, as its spec said.

**The fix separates the person's pick from the host's fallback.** The new option `defaultPreviewTheme` carries the fallback, and `previewTheme` stays the person's pick. On open, the preview selects the first that applies:
1. the person's pick (`previewTheme`, which a remount carries);
2. the theme the draft names for the designer's scheme (its pinned appearance, else the page's, else the system's);
3. `defaultPreviewTheme`.

Each must be a supplied entry. `loadWidget` switches to the definition's own theme for the scheme when it names one, and otherwise keeps the selection as before.

**Why this split.** If the designer always preferred the widget's theme, a remount (Edit from read-only) would undo a pick the person had just made. A designer that preferred it only when the host passed nothing would push the decision back onto every host.

**Hosts.** The self-host app moves the Settings default to `defaultPreviewTheme`. The apps repo does the same at adoption, and until it does, it keeps today's behavior.

### D9. Release and adoption

Core, designer and mcp get a minor release (a new descriptor field, render behavior, new exports); webmcp gets a patch (its guide copy). `Widgentic.Mcp` follows the pin. The .NET host composes through the bundle, so a widget JSON naming themes works there with no .NET code. The apps adoption bumps the ranges, and its scan confirms that no stored descriptor carries `themes` before the deploy.

## Risks / Trade-offs

- **[A brand theme's styles leak into a group's other items]** → A group wears a widget theme only where its items agree, so an item that names no theme accepts the look its siblings chose. This matches the owner's decision.
- **[The person deletes a theme their widgets use]** → `THEME_IN_USE` names the widgets, and the designer shows the store's message.
- **[An agent passes `theme` out of habit]** → It replaces the widget's look. The `theme` field description steers away from that, and the person can still ask.
- **[Cosmos race]** → Fallback plus a composition diagnostic (D3, D5).
- **[Old engines]** → An engine older than this release ignores `descriptor.themes` (unknown descriptor fields are copied selectively) and renders with the defaults.

## Migration Plan

No stored data changes.
1. Apply on `feature/widget-themes`.
2. **The demo seed.** Its defaults are already `google-light`/`google-dark`. It gains a small brand pair (`acme`, `acme-night`), which the person card names. The project status widget names the built-ins `light`/`dark`, opting out of the Google defaults.
3. Stage it. The owner checks in each host, in a fresh chat:
   - the person card wears `acme`;
   - the project status wears the built-ins;
   - the inbox wears the Google defaults;
   - a group of the person card and the inbox wears `acme` (the only item naming a theme);
   - a group of the person card and the project status wears the defaults, with a theme note;
   - the designer's selects and preview work;
   - deleting `acme` in the app is refused.
4. Merge into staging, then release 0.15.0 with the encoding and date-zone changes, then `Widgentic.Mcp` 0.15.0, then the apps adoption (bump, scan, `deploy vNN`).
