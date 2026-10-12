## Why

A theme today is only a token map. A person who wants every widget's buttons, badges or
section headings to look alike has to copy the same style rules into each widget, and a
change means editing every copy. Hosts also always fall back to the built-in light and
dark themes when a render names no theme, so a person's own brand never shows unless the
agent remembers to pass it on every call. And there is nowhere to keep a person's
account-wide preferences: default themes are the first such preference, not the last.

## What Changes

- **Theme styles.** A theme entry gains an optional `styles` section beside `tokens`: the
  same `selector → { property: value }` map a widget's descriptor carries, under the same
  guards (every selector part targets a `.wg-` class; no braces, semicolons, angle
  brackets, `@`, backslashes, `url(` or `expression(`). Theme styles define shared classes
  any widget can use (`.wg-btn`, `.wg-badge-ok`). `extends` merges them like tokens.
- **Theme styles at runtime.** Wherever a theme's tokens are emitted — the template
  channel's `css`, `format: "page"` and `format: "app"` documents, `preview_widget` — its
  styles are emitted too, before the rendered kinds' own styles, so a widget's own rule
  wins a tie.
- **Principal settings.** Each principal gains one settings record made of named sections,
  so later account-wide preferences have a home. This version defines one section,
  `defaultThemes: { light?, dark? }`. A write replaces the sections it carries and keeps
  the rest, so a client that knows only some sections never erases the others.
- **Default themes.** A person picks, in Settings, one of their themes as the default for
  light hosts and one for dark hosts (the same theme may serve both). Because the section
  holds one name per mode, picking a theme for a mode replaces the previous choice.
- **Defaults at runtime.** A render that names no `theme` uses the light default on light
  hosts and the dark default on dark hosts (tokens and styles, each scoped to its mode),
  and keeps today's built-in behavior for a mode with no default. Documents with no host
  theme (`page`, `app`) use the light default. An explicit `theme` still wins in both
  modes. With no defaults set, output is byte-identical to today.
- **The registry knows its defaults.** `@widgentic/core`'s theme registry gains a default
  per mode (built-ins until set), so every surface that receives a registry — server,
  handlers, the host bundle — resolves defaults the same way.
- **Store and authoring.** Stores keep the record (`settings` / `putSettings`), refuse
  unknown sections and a default naming no stored theme (`INVALID_SHAPE`,
  `UNKNOWN_THEME`), and refuse removing a theme a setting names (`THEME_IN_USE`).
  Composition applies the defaults and drops a dangling one with a diagnostic. The
  authoring surface serves the record at `/settings`.
- **Designer.** The theme designer gains a Styles section — the widget designer's styles
  panel (Tree and JSON tabs, the same audit of entries the renderer would drop) — and its
  preview applies the theme's styles; export and import carry `styles`. A fifth designer,
  the settings designer, edits the settings record, starting with a "Default themes"
  subsection: one choice per mode among the built-in and the person's themes. The widget
  designer's preview applies the selected preview theme's styles, so shared classes are
  visible while authoring, and a host can preselect the preview theme
  (`previewTheme`); the apps preselect the light default.
- **Agents.** `list_themes` reports each theme's styles and the effective default per
  mode; `get_authoring_guide` and the WebMCP guide describe theme styles, derived from
  the same constants as widget styles. Settings are not part of any entry agents draft.
- **Self-host example.** A Settings section mounts the settings designer; the Themes list
  shows which themes are defaults; the seed may carry `settings`, and the demo seed sets
  its two Google-inspired themes as defaults.
- **widgentic.dev.** The hosted app gains the same Settings section with its Default
  themes subsection, adopted from the released packages in a companion change in the
  apps repository (its `widgentic-app` spec).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `widget-theming`: theme entries carry `styles`; scoped theme-style CSS generation; the
  registry holds a default per mode.
- `widget-store`: the per-principal settings record, its validation, composition and the
  in-use refusal; stored theme styles' shape check.
- `authoring-api`: the settings route; theme styles through the theme routes.
- `widget-designer`: the theme designer's Styles section; the settings designer; theme
  styles in both designers' previews.
- `mcp-server`: theme styles in every styled output; default themes standing in for the
  built-ins; `list_themes` and the authoring guide describe both.
- `self-host-example`: the Settings section and settings in the seed.
- `widget-catalog`: the style guards both widget and theme styles share refuse comment
  markers, `image-set()`/`src()` URLs and `.wg-` classes hidden in pseudo-class arguments
  (found in review; theme styles reach every render, so the gaps mattered more).

The `widgentic-app` capability (Settings section on widgentic.dev) changes in the apps
repository's companion change.

## Impact

- `packages/core` (theming registry, `ThemeEntry`, a scoped styles generator),
  `packages/mcp` (handlers' CSS composition, `list_themes`, guide, store adapters —
  memory, file, SQLite, Cosmos — compose, authoring routes),
  `packages/designer` (theme designer, settings designer, previews), `packages/webmcp`
  (guide copy), `examples/docker` and `examples/shared` (Settings section, authoring
  client, seed), docs; then `widgentic/apps` (`apps/web` Settings section).
- Persisted shapes: theme entries gain an optional field, and stores gain one settings
  record per principal. Both are absent on existing data, which keeps loading unchanged.
- Changesets: core, designer and mcp minor; webmcp patch. The host bundle's output stays
  byte-identical without default themes; a .NET option for them follows separately.
- The parallel change `derived-input-schemas` (already on `staging`) touches
  `packages/mcp/src/server/handlers.ts` and `server.ts`; this branch is based on
  `staging`, so it builds on that work.
