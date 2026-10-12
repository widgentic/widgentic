---
"@widgentic/mcp": minor
---

The `./host` bundle takes default themes from a settings record, so an embedding host such as the `Widgentic.Mcp` NuGet package can choose them.

- **Input.** `createWidgenticHost` accepts an optional `settings` record in the store's shape, `{ defaultThemes?: { light?, dark? } }`. An absent or `null` record means no settings.
- **Checks.** The record is checked with the store's own settings rules against the configured themes that composed. An unknown section, an unknown mode, or a name that isn't a string gives `INVALID_SHAPE`. A default naming a theme the host doesn't serve gives `UNKNOWN_THEME`; that includes a built-in name and a configured theme that was refused. Each refused setting keeps its mode on the built-in and is listed by `problems()` under the section `settings`, never thrown.
- **Effect.** The defaults that pass apply exactly as a principal's stored defaults do in the Node assembly: `render_widget`, `preview_widget`, `widgetPage(kind)` and `list_themes`' `defaults`. Without settings, every output is unchanged.
- **Problem shape.** `problems()` entries carry `name` beside `section`, `index`, `code` and `message`, as they already did.
- **Internal.** The settings rules moved to a Node-free module that the store and the bundle share, so the store's refusals are unchanged.
