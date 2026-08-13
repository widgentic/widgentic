# Theming Foundation: Extended Tokens, Custom Variables, Named Themes

## Why

This is step one of the widgentic.dev arc (app + site), sequenced first because everything downstream needs it and it costs no infrastructure decisions. The app will persist **themes as first-class user-owned entities** and the widget designer must "load available themes for preview" — neither is expressible today: a theme is an anonymous flat token map with no name, no metadata, and no registry. The token set is also thin for real widgets (the `x-post` example had to hand-roll status colors and derive sizes with `calc()`), and custom widgets have no sanctioned way to expose their own knobs. Getting the theme *model* right before accounts and persistence exist means the app stores the final shape rather than migrating it.

## What Changes

- **Extended standard tokens**: status colors (`danger`, `success`, `warning`, `info`) and `accent-fg` for text on accent fills; `font-mono`, `font-size-sm`, `font-size-lg`, `line-height`; scale steps `radius-sm`, `radius-lg`, `spacing-sm`, `spacing-lg`, `border-width`. Every addition is consumed by the base stylesheet or documented for custom widgets; existing themes keep working because every token has a default.
- **Custom variables**: theme keys matching `x-*` are accepted as author-defined variables and emitted as `--wg-x-*`, validated by the same value guard. Custom widgets can expose knobs (`--wg-x-xcard-media-radius`) without begging for registry additions; unprefixed unknown keys still fail `UNKNOWN_TOKEN`.
- **Named themes + registry**: `createThemeRegistry()` holding `{ name, label?, description?, tokens }` entries with registration-time `extends` merging (a brand theme plus its dark variant), mirroring the widget catalog's shape. Ships `light` and `dark` as built-ins.
- **Themes over the wire**: `render_widget`'s `theme` input accepts a **registered theme name** as well as an inline token map; a new `list_themes` tool exposes the registry so agents can ask for "the dark theme" by name instead of pasting tokens.
- **Theme designer detached**: `createThemeDesigner(container, options)` + opt-in `<widgentic-theme-designer>` — a standalone editor for named themes (identity + tokens + custom variables + live preview against any catalog kind), exporting the registry entry shape. The widget designer keeps a *preview theme selector* fed by `options.themes` instead of owning theme editing.

## Capabilities

### New Capabilities

_None — this extends existing capabilities rather than adding a surface._

### Modified Capabilities

- `widget-theming`: extended registry, custom `x-*` variables, named-theme registry with `extends`, base stylesheet consuming the new tokens.
- `mcp-server`: `theme` accepts a registered name; `list_themes` tool; theme resolution documented for agents.
- `widget-designer`: theme designer split into its own factory/element; widget designer gains theme selection from supplied named themes.

## Impact

- `src/theming/` (tokens, stylesheet, apply, new `registry.ts`), `src/mcp-server/` (definitions + handlers), `src/designer/` (new `theme-designer.ts`, `theme-panel.ts` reduced to a selector, `element.ts`, `index.ts`).
- `examples/mcp-server/` registers the theme registry and the new tool; `examples/designer/` demo hosts both designers.
- Tests: token/stylesheet coverage, custom-variable validation and CSS emission, registry + `extends`, named-theme resolution in `render_widget`, `list_themes`, theme-designer DOM suite, widget-designer theme selection.
- Downstream (later changes): the app persists registry entries verbatim; per-user catalogs resolve both widgets and themes from the same store.
