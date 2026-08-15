# Tasks — Authoring Guidance

## 1. The authoring guide (MCP)

- [x] 1.1 Export the needed constants from their owners: the store's `SAFE_IDENTIFIER` pattern (as source-of-truth string), the contract's URL scheme list — whatever the guide needs that exists but isn't public yet
- [x] 1.2 `src/mcp-server/guide.ts`: `handleGetAuthoringGuide()` (pure, SDK-free) assembling `{ widget, theme, rules, limits, workflow }` — reserved kinds from `createCatalog().kinds()`, limits from `DEFAULT_LIMITS`, tokens from `TOKEN_SPECS`, identifier pattern and scheme lists from the exported constants; curated grammar prose only for the DSL node forms and the workflow statement
- [x] 1.3 `definitions.ts`: `GET_AUTHORING_GUIDE_TOOL` (name, agent-facing description saying when to use it, empty input schema); export both from the base entry
- [x] 1.4 `server.ts`: register the tool in the assembly
- [x] 1.5 Tests: guide parses with the five sections; derived facts equal their sources (kinds/limits/token names+types); the workflow section names the boundary; tools/list now shows five tools (update the interop assertion)
- [x] 1.6 Agent-simulation test: build a widget and a theme using only what the guide says (its shapes, charset, DSL forms, token names) and assert `checkStoredWidget`/`checkStoredTheme` pass and designer `loadWidget`/`loadTheme` accept them unchanged

## 2. Widget designer preview cleanup

- [x] 2.1 `theme-panel.ts`: remove the "Preview kind" select; `shell.ts`/`preview.ts`: delete the non-draft render path (`previewKind` threading, `sampleFor`) — the preview renders the draft, period
- [x] 2.2 Token reference listing in the theme panel: effective tokens (selected entry over defaults) as name + value + swatch for color-typed tokens (from `TOKEN_SPECS`); updates on theme selection; read-only
- [x] 2.3 Tests: no kind selector in the mounted designer; token listing shows the selected entry's override and falls back to defaults on "none"; existing preview/theme tests updated for the removed selector

## 3. Verify and ship

- [x] 3.1 Full `npm test` + typecheck green; change validates strict
- [x] 3.2 Designer rig check (`npm run designer`): panel renders, tokens listed, styles authoring can read values
- [x] 3.3 Live agent check against local `mcp:http`: call `get_authoring_guide`, build a widget from it, import via the designer — the loop the change exists for
- [x] 3.4 Build v16, deploy (standing parameter set, live secrets); smoke `get_authoring_guide` on production; README/TESTING tool lists; memory

## 4. Refinements (post-review, user feedback)

- [x] 4.1 Guide: `$meta` removed from the BIND form line; new `rules.template.dataModeling` section — prefer schema-declared properties, `$meta.*` is outside `dataSchema` validation (avoid, or reserve for out-of-band display); delta spec gained the steering scenario
- [x] 4.2 Starter draft: binds only schema-declared properties (`title` optional + `message` required, both in a shipped `dataSchema`); no `$meta`; tests updated (starter-declares-what-it-binds assertion; the tree→schema-form switch test now loads a schema-less widget explicitly)
- [x] 4.3 v17 built + deployed; production guide verified: dataModeling present, no `$meta` in the bind form
- [x] 4.4 Live-test finding (Claude Desktop/Sonnet): the agent built and rendered a theme correctly but defaulted to the one-render inline map — save-path steering added to `list_theme_tokens` and `list_themes` rules ("a theme worth keeping → the { name, label?, description?, tokens } entry for Import at widgentic.dev, see get_authoring_guide"); delta scenario + tests added; v18 deployed and verified live
- [x] 4.5 Live-test finding (currency-conversion widget, DevTools-confirmed): the agent's definition was flawless — every var(--wg-…) named a real token — but NOTHING defined registry tokens where widgets render; any token the active theme didn't set silently invalidated custom-style declarations (jammed layout). Fix: `baseStylesheet` now opens with a generated `:root` block defining all 32 tokens from `TOKEN_DEFAULTS` (themes override; fixes designer preview, app-template iframe, and page format in one mechanism); widget-theming delta added (all 7 scenarios carried + "Every token is defined for custom styles"); guide's styles.tokens now states bare var() is safe for registry tokens and x-* customs need fallbacks; v19 deployed, page format verified to carry the defaults block
- [x] 4.6 Layer 2 of the token gap (fresh-chat re-test): defaults are LIGHT literals and the host bridge maps only 8 tokens, so on dark hosts an unbridged `surface` rendered a white card under the host's near-white bridged `fg`. Fix: the app template appends a `:root[data-theme="dark"]` block flipping the dark preset's UNBRIDGED tokens (surface, accent-fg, status colors) — bridged tokens stay host-exact — and `structuredContent.css`'s theme block selector is doubled (`:root, :root[data-theme="dark"]`) so an explicit render theme still wins in both modes; loader requirement MODIFIED in the delta (all 8 scenarios carried + "Unbridged tokens follow the host theme"); v20 deployed, dark block verified live
- [x] 4.7 Live-test finding (Nord render): the agent inlined a full token map for a theme the user referenced BY NAME — reconstruction from its own context, which drifts once the saved theme is edited. The schema already allowed names (type ["object","string"]); the theme input's description now mandates the NAME when the user names a saved theme ("do NOT reconstruct the tokens from memory") while keeping inline maps for one-off styling; test added; v21 deployed, steering verified in the live tools/list
- [x] 4.8 The real root cause behind 4.7: the assembly registers render_widget with a hand-built zod schema, and definitions.ts descriptions NEVER reached the wire — agents saw a bare anyOf for theme (and undescribed hints/meta/format). Fix: the zod fields now take their .describe() text FROM RENDER_WIDGET_TOOL.inputSchema (one source of truth) and a wire-level interop test asserts descriptions survive the SDK conversion into tools/list; v22 deployed, steering verified on the live wire schema

## 5. Template tree ergonomics (user feedback: crowded, hard to read)

- [x] 5.1 Delta spec: MODIFIED "Custom widget draft editing" — flat/slim rows, one add-menu control (children, attrs, slots), collapsible structural nodes with path-keyed state surviving re-renders, attrs grouped under distinct chrome
- [x] 5.2 `dom.ts`: `menuButton` component (toggle button + popover listing options; closes on pick, outside click, Escape) and the menu styles
- [x] 5.3 `template-panel.ts`: element header gains one add menu (attribute + node forms) replacing `+ attr` and the `wgd-add-child` toolbar; unset slots get one `+ <slot>` menu replacing the five preset buttons
- [x] 5.4 `template-panel.ts`: collapsible element/each/when nodes — chevron toggle in the row, collapse Set keyed by node path in the panel closure, collapsed rows show a muted summary (counts / set slots)
- [x] 5.5 Styles: attrs grouped in `.wgd-attrs` with distinct border/color/typography from `.wgd-children`; tree inputs/selects flat (transparent chrome until hover/focus); tighter indent and row gaps
- [x] 5.6 Tests: menu opens/lists/inserts and closes on outside click + Escape; slot menus set `empty`/`else`; collapse hides sub-structure and survives a draft edit; `.wgd-attrs` distinct from `.wgd-children`; rewrite the old toolbar test
- [x] 5.7 Rig check on :8082 (invoice-sized template reads flat and calm); full test + typecheck green
- [x] 5.8 Dropdowns fit their SELECTED value (fitSelect: ch + em + fixed-px caret term; re-fits on change) so carets hug the text instead of drifting with leftover row width — tag select's 14ch cap and path select's flex-stretch removed; delta scenario + width tests; caret region is fixed-px in the UA, so a pure em term clips small-font selects (11px tags)
