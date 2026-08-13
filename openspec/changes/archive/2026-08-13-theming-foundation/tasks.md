# Tasks — Theming Foundation

## 1. Extended token registry

- [x] 1.1 `src/theming/tokens.ts`: add `accent-fg`, `danger`, `success`, `warning`, `info`, `font-mono`, `font-size-sm`, `font-size-lg`, `line-height`, `radius-sm`, `radius-lg`, `spacing-sm`, `spacing-lg`, `border-width` with light defaults
- [x] 1.2 `src/theming/stylesheet.ts`: consume `line-height` (text density) and `font-mono` (`.wg-custom`); keep every `var()` reference registry-backed with a fallback
- [x] 1.3 `src/theming/apply.ts`: extend `darkTheme` with the new color tokens so the preset stays complete
- [x] 1.4 Tests: registry contents, every token has a default, stylesheet consumption, registry-only `var()` rule still holds

## 2. Custom variables (`x-*`)

- [x] 2.1 `validateTheme`: accept keys matching `^x-[a-z0-9][a-z0-9-]*$`, reject malformed ones as `UNKNOWN_TOKEN`, run the existing value guard on them
- [x] 2.2 `applyTheme` / `themeToCss`: emit custom variables as `--wg-x-<name>`; replace semantics must clear them too
- [x] 2.3 Tests: acceptance, malformed-name rejection, unsafe-value rejection, application and removal, CSS emission

## 3. Named theme registry

- [x] 3.1 `src/theming/registry.ts`: `createThemeRegistry()` (`register/get/list/names`), `ThemeEntry` type, `DuplicateThemeError`, registration-time `extends` merge, validation on register; built-in `light` + `dark`
- [x] 3.2 Export from the `./theming` entry
- [x] 3.3 Tests: built-ins present, register/retrieve, `extends` merge keeps the base's tokens and the override, duplicate + invalid-token refusals

## 4. Themes over the wire

- [x] 4.1 `handleRenderWidget`: accept `theme` as a string resolved through a registry (threaded like the catalog), `UNKNOWN_THEME` at `path: "theme"` listing available names; payload carries the resolved map
- [x] 4.2 `LIST_THEMES_TOOL` definition + `handleListThemes(registry)`; widen `render_widget`'s `theme` input schema to `string | Record<string,string>`
- [x] 4.3 `handleListThemeTokens`: document the `x-*` custom-variable rule
- [x] 4.4 `examples/mcp-server/server.ts`: build the registry, register `list_themes`, pass it into the render handler
- [x] 4.5 Tests: name resolution (page + payload), unknown-name error shape, tool listing, existing object-theme contracts unchanged

## 5. Theme designer split

- [x] 5.1 `src/designer/theme-designer.ts`: `createThemeDesigner(container, options)` — identity fields, token controls (swatches for colors), custom-variable rows (add/rename/remove), preview-kind selector, reusing the existing preview controller
- [x] 5.2 Export/import the registry entry shape; `defineThemeDesignerElement()` in `element.ts`; export both from `src/designer/index.ts`
- [x] 5.3 Widget designer: replace the Theme panel with a preview-theme selector fed by `options.themes`; narrow the draft's theme to a selection; keep export theme-free
- [x] 5.4 Tests: standalone mount/dispose, custom-variable editing → preview, unsafe value withheld, entry round-trip, widget-designer selection applied + absent from export, legacy object-theme drafts ignored on load

## 6. Demo, docs, verification

- [x] 6.1 `examples/designer/`: tabs for "Widget designer" and "Theme designer"; themes created in the theme tab feed the widget designer's selector (localStorage, host-side)
- [x] 6.2 README + TESTING.md: new tokens, custom variables, named themes (`theme: "dark"`), `list_themes`, the two designer entry points
- [x] 6.3 Full `npm test` + typecheck green; deploy `v8`; curl-verify `theme: "dark"` and `list_themes` through `mcp.widgentic.dev`
- [x] 6.4 Live check: design a theme in the theme designer, select it in the widget designer, then render a widget with that theme by name from Copilot or basic-host; record in TESTING.md

## 7. Token-system review follow-up

- [x] 7.1 `TOKEN_SPECS`:each token `default` + `type` + `use`; `TOKEN_DEFAULTS` derived; exported
- [x] 7.2 Stylesheet consumes every token (border-width hairlines, radius/spacing/font-size steps, `font-weight-bold` replacing the hard-coded 600)
- [x] 7.3 Status families gain `-fg` partners and `.wg-status-*` utility classes
- [x] 7.4 Designer picks controls from `type` (no default-shape guessing) and shows `use` as help; `list_theme_tokens` carries type + use; tests incl. a no-decorative-tokens guard

