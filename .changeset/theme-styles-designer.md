---
"@widgentic/designer": minor
---

Theme styles in the designers, and a fifth designer for settings.

- **Theme designer.** It edits a theme's `styles` with the widget designer's own Styles panel (Tree and JSON tabs, the same audit). Its preview applies them beneath the previewed kind's styles, and export and import carry them.
- **Widget designer.** The preview applies the selected preview theme's styles beneath the draft's, so a shared class looks in the draft as it will in a render. A new `previewTheme` option opens the designer with one of the supplied themes selected (pass the person's light default), and loading a widget keeps the preview theme's styles as well as its tokens.
- **Settings designer.** `createSettingsDesigner` / `defineSettingsDesignerElement` (`<widgentic-settings-designer>`) edits the principal's settings record. Its Default themes subsection picks the theme light and dark hosts get when a render names none, among the built-in and the themes you pass. A name you did not pass shows as unavailable, and sections it does not edit pass through.
