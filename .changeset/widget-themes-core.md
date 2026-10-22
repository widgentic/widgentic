---
"@widgentic/core": minor
---

A widget can name its own themes: `descriptor.themes: { light?, dark? }`, each a theme name (a built-in `light`/`dark` included). The catalog keeps them and returns them from `describe` and `list`. Whether a name exists is the caller's registry's business.

New exports:
- `checkWidgetThemes`, the one runtime-neutral shape check that the store, the designers' import and the host bundle all use;
- `WIDGET_THEMES_RULE`, the rule text every guide and designer derives from;
- the `WidgetThemes` type.
