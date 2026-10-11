---
"@widgentic/core": minor
---

Themes gain shared styles and a default per host mode.

- **`ThemeEntry.styles`.** A theme may carry `styles` in the same shape as a widget descriptor's: shared `.wg-` classes (`.wg-btn`, say) that any widget rendered under the theme can use. The registry refuses a malformed map with `INVALID_THEME`. Unsafe entries inside a well-shaped map are kept and dropped when CSS is generated, as for widgets. `extends` merges styles per selector, then per property.
- **`themeStylesToCss(styles, scope?)`** (`./theming`) generates them under the widget-style guards. A `scope` prefixes every selector part with `:where(<scope>) `, so a scoped rule applies only inside the scope and keeps its author's weight.
- **Registry defaults.** `setDefault(mode, name)`, `getDefault(mode)` and `defaults()` hold the theme each `ThemeMode` (`"light" | "dark"`) uses when a render names none. Both start as the built-ins.
- **`isStyleMap(value)`** (`./catalog`) is the one shape check for widget and theme styles.
