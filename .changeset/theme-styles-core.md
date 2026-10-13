---
"@widgentic/core": minor
---

Themes gain shared styles and a default per host mode.

- **`ThemeEntry.styles`.** A theme may carry `styles` in the same shape as a widget descriptor's: shared `.wg-` classes (`.wg-btn`, say) that any widget rendered under the theme can use. The registry refuses a malformed map with `INVALID_THEME`. Unsafe entries inside a well-shaped map are kept and dropped when CSS is generated, as for widgets.
- **`themeStylesToCss(styles, scope?)`** (`./theming`) generates them under the widget-style guards. A `scope` prefixes every selector part with `:where(<scope>) `, so a scoped rule applies only inside the scope and keeps its author's weight.
- **Registry defaults.** `setDefault(mode, name)`, `getDefault(mode)` and `defaults()` hold the theme each `ThemeMode` (`"light" | "dark"`) uses when a render names none. Both start as the built-ins.
- **`isStyleMap(value)`** (`./catalog`) is the one shape check for widget and theme styles.
- **Stricter style and token guards (widget styles included).**
  - Each selector part must be held to `.wg-` classes: one of its compounds names a `.wg-` class itself, or through `:is()`/`:where()` whose every argument does. So `:is(.wg-btn, .wg-link):hover` and `:where(.wg-card) h3` are kept, while `body:not(.wg-x)`, `body:has(.wg-x)` and `:is(.wg-a, body)` are dropped.
  - A part may not open with a combinator, and `:is()`/`:where()` may nest at most 16 levels, so the generator never throws.
  - Brackets and quotes are read as CSS: a parenthesis inside an attribute value can no longer hide a comma or close a pseudo-class, and a newline ends a string unclosed.
  - Selectors, properties and values may not hold comment markers (`/*`, `*/`) or an unclosed bracket or string.
  - Values and theme token values may not call `image-set(` or `src(`, which carry URLs like `url(`. Token values also refuse `\`, whose escapes can spell any refused call.
  - Scoped theme styles split on top-level commas and scope a root-anchored part (`:root[…] .wg-x`, `html .wg-x`) on its root compound.
- **The rules as data.** `UNSAFE_FUNCTIONS` and `STYLE_RULES` (`./catalog`), and `TOKEN_VALUE_UNSAFE` and `TOKEN_VALUE_RULE` (`./theming`), let guides and tools derive the rules instead of restating them.
- **Breaking: theme `extends` is removed.** `ThemeEntry.extends` and the `UNKNOWN_BASE_THEME` code are gone, and an entry is complete as registered. No designer, seed, guide or tool ever set it; "a theme based on another" is a one-time copy (`seedThemeEntry`).
  - **TypeScript:** an entry literal that sets `extends` no longer compiles.
  - **JSON:** an entry carrying `extends` is registered without its base, since the field is ignored like any unknown one.
  - **Migration:** merge the base's tokens and styles into the entry before registering, for example `{ ...base.tokens, ...own.tokens }`.
