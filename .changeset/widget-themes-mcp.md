---
"@widgentic/mcp": minor
---

A widget's own themes take priority over the Settings defaults.
- **Precedence per mode.** With no `theme` input, each host mode wears the theme the widget's `descriptor.themes` names, else the caller's default, else the built-in. This applies to renders in every format, previews, action re-renders and widget pages.
- **Groups.** A group wears the theme its naming items agree on per mode. When they disagree, it wears the default and adds a `Theme notes:` line.
- **Missing names.** A name the registry lacks falls back to the default, with a note.
- **Store.** `putWidget` refuses an unknown theme name with `UNKNOWN_THEME`. `removeTheme` refuses with `THEME_IN_USE` while a widget names the theme, naming the widgets.
- **Steering.** The `render_widget` `theme` description and the authoring guide describe the precedence.
