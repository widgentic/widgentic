---
"@widgentic/designer": minor
---

The widget designer gains **Light theme** and **Dark theme** selects that edit `descriptor.themes`. Each offers Settings default, the built-ins and the supplied themes. A name the designer was not given stays selected, marked missing, and choosing a supplied light theme also makes it the preview theme. Import refuses a malformed `themes` field in the store's terms.

The preview opens on the widget's own theme. The new `defaultPreviewTheme` option (one name, or `{ light?, dark? }`) carries the host's fallback, and `previewTheme` stays the person's pick. On open, the person's pick comes first, then the widget's own theme for the designer's scheme, then the fallback. `loadWidget` switches to a definition's own theme.
