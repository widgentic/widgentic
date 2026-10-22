## Why

Some widgets are designed for a specific brand theme. Today a widget can only wear its theme when the agent passes `theme` on every render, or when the person makes that theme their Settings default, which then dresses every other widget too. The owner asked (2026-10-21) for widget-level theme settings: a widget names its own light and dark themes, and those take priority, while a widget that names none falls back to the Settings defaults.

**Owner decisions (2026-10-21):**
- **Precedence.** An explicit render `theme` wins, then the widget's themes, then the Settings defaults, then the built-ins. An agent that is asked for a different look can still pass `theme`.
- **Groups.** A group uses its items' themes only where every item that names a theme agrees. Otherwise it uses the Settings defaults and says so in a note.

## What Changes

- **The descriptor names the widget's themes:** `descriptor.themes: { light?: <theme name>, dark?: <theme name> }`.
  - Each mode is optional. A widget that names only `light` takes the Settings default in dark mode.
  - A name may be a stored theme or a built-in (`light`, `dark`), so a widget can opt out of a brand default.
  - Core validates the shape. The descriptor travels in import and export JSON and in `list_widgets`, so agents can see that a widget dresses itself.
- **Rendering.**
  - **Precedence per mode.** With no `theme` input, each mode wears the widget's theme for that mode, else the Settings default, else the built-in. One theme for both modes is emitted as an explicit theme is, exactly like defaults today.
  - **Where it applies.** This covers `render_widget` in every format, `preview_widget`, action re-renders, and the documents and `ui://widgentic/page/{kind}` pages, which wear the widget's light theme.
  - **A missing theme.** A widget naming a theme the caller's registry lacks (removed out of band) falls back to the default for that mode, with a theme note.
  - **Groups,** per mode: when every item that names a theme for the mode names the same one, the group wears it; when they disagree, the Settings default applies and the text result carries a `Theme notes:` line naming the items and their themes.
- **The store guards references.**
  - **On write.** `putWidget` refuses a theme name that is neither a built-in nor one of the principal's stored themes, with `UNKNOWN_THEME`.
  - **On delete.** `removeTheme` refuses while a widget names the theme, with `THEME_IN_USE` naming the widgets. The scan runs over raw entries, as the existing reference guards do.
  - **On read.** A malformed `themes` field is skipped with a diagnostic, like any invalid descriptor.
  - **In every implementation:** memory, file, SQLite and Cosmos.
- **The authoring API** carries these codes: `UNKNOWN_THEME` 422 on a widget save, and the existing 409 for `THEME_IN_USE`, now naming widgets too.
- **The widget designer** gains two selects (light and dark):
  - each offers "Settings default" (which omits the mode), the built-ins and the supplied themes;
  - they edit `descriptor.themes`;
  - choosing a supplied theme for light also makes it the preview theme, so the person sees what they chose.
- **Steering.**
  - The `render_widget` `theme` field and `list_widgets` say that a widget naming its own themes wears them, and that `theme` overrides them only when the user asks for another look.
  - The authoring guides list `themes` among the import JSON's descriptor fields.
- **Release.** Core, designer and mcp minor, webmcp patch, then `Widgentic.Mcp` follows the pin, then the apps adoption.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `widget-catalog`: ADDED "Descriptors may name the widget's themes" (the shape, names only, and built-ins allowed).
- `widget-store`: ADDED "Widgets that name themes keep them resolvable":
  - `UNKNOWN_THEME` on write;
  - `THEME_IN_USE` on delete;
  - skip on read;
  - every adapter.
- `mcp-server`:
  - MODIFIED "Default themes from settings stand in for the built-ins": the defaults apply where the widget names no theme for the mode.
  - ADDED "A widget's own themes take priority over the defaults" (precedence, group agreement, the theme note, the missing-theme fallback, previews, re-renders and documents).
- `widget-designer`: ADDED "The widget designer sets the widget's themes".

## Impact

- **Core.**
  - `catalog/descriptors.ts`: the `themes` field and its type.
  - Descriptor shape validation, plus a theme-name check shared with the store.
  - The exports snapshot, if a type or helper is exported.
- **MCP.**
  - `server/handlers.ts`: `renderThemes` takes the widget's names, plus the group agreement and the notes.
  - `server/definitions.ts`: the `theme` field steering.
  - `server/guide.ts`.
  - `store/validate.ts`, `store/refs.ts`, and the writable adapters' `putWidget`/`removeTheme` (memory, SQLite, Cosmos; the file store is read-only).
  - `authoring/handler.ts` (the status mapping).
  - `store/compose.ts`: a composition note for a widget naming an unavailable theme.
  - The host bundle, through the shared composition.
  - The corpus.
- **Designer.** `template-panel.ts` or the descriptor panel (the theme selects), and the preview selection.
- **Webmcp.** The guide copy.
- **.NET.** No code change: the bundle carries composition and rendering. `dotnet test` runs the regenerated corpus, and the sample seed may gain a widget naming a theme.
- **Stored data.** No migration. Old widgets have no `themes` and render exactly as before. Before deploying, a read-only production scan confirms that no stored descriptor already carries a `themes` key, which would now be validated.
- **Docs.** The theming pages (precedence), `groups-and-hints.mdx` (the group rule), the designer page, and the README capability rows.
