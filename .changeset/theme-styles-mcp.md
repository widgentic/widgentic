---
"@widgentic/mcp": minor
---

Theme styles in every styled output, and per-principal settings with default themes.

- **Theme styles in output.** A named theme's `styles` reach the template channel's `css`, the `page`/`app` documents and `preview_widget`, before the rendered kinds' styles.
- **Default themes from settings.** A render that names no theme uses the caller's default themes: the light default under `:root:not([data-theme="dark"])` and the dark default under `:root[data-theme="dark"]`, with styles scoped by `:where()`. Documents use the light default. With no defaults set, output is byte-identical.
- **Settings in the store.** Stores keep one settings record per principal: `settings` / `putSettings`, with section-level replace and unknown sections refused on write and ignored on read. Its `defaultThemes` section must name stored themes (`UNKNOWN_THEME`), and a theme named there cannot be removed (`THEME_IN_USE`). Memory, file, SQLite and Cosmos all store it. `composeThemes` applies the defaults and reports a dangling one. Stored themes may carry `styles`; a malformed map is refused with `INVALID_THEME`.
- **Authoring surface.** It serves the record at `/settings` (`GET`, and `PUT` with section-level replace; `THEME_IN_USE` maps to 409). Theme writes carry `styles`.
- **Agents.** `list_themes` reports each theme's `styles` and the effective `defaults`; the authoring guide documents theme styles.
