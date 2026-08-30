# @widgentic/designer

## 0.3.0

### Minor Changes

- 1bfb2b2: The designers now wear the widgentic palette by default, light and dark.

  Every colour sits on the logo mark's hue and is contrast-checked in both
  schemes: text pairs at WCAG AA (4.5:1), and the borders that identify an
  input, a focused tag or a banner at 3:1 — so `border`, `accent-line` and
  `danger-line` are noticeably stronger than before. Typography is unchanged
  (system stacks, 13/12/11px); radii move to 4/6/8px.

  **This is a visual change for hosts that pass no `chrome`.** Nothing in the
  API changed and nothing stops compiling. There is one default palette and no
  second one to fall back to: a host that wants a different look passes its own
  values through `chrome`.

  Also new: `CHROME_DEFAULTS` (the applied palette — the injected stylesheet is
  generated from it, so a host painting its page from the export cannot drift)
  and `chromeCss(palette, options?)`, which renders a palette as light and dark
  custom-property blocks under a prefix you choose.

## 0.2.0

### Minor Changes

- e79291b: Designers accept `chrome`: a host passes a partial map over the exported `CHROME_TOKENS` (28 `--wgd-*` tokens — the 18 colours plus `font`, `font-mono`, `font-size`, `font-size-sm`, `font-size-xs`, `radius-sm`, `radius`, `radius-lg`, `gap`, `shadow`) to every factory (`options.chrome`) and custom element (`chrome` attribute, JSON). Values are applied inline on the designer root and may be `var()` references to the host's own properties; unknown tokens, non-strings and CSS-wide keywords are ignored. Typography, radii and the menu shadow are now tokens with unchanged defaults, and the stylesheet's dead `var(…, #hex)` fallbacks are gone.

## 0.1.0

### Minor Changes

- c157db8: First published versions: `@widgentic/core` (contract, adapters, mapper, catalog, theming, templates, actions, reactive rendering), `@widgentic/designer` (widget, theme, schema and action designers, custom elements, browser bundle) and `@widgentic/mcp` (tool-output convention, server building blocks and official-SDK assembly, per-principal store and secrets with Cosmos and Key Vault adapters behind subpaths).

### Patch Changes

- Updated dependencies [c157db8]
  - @widgentic/core@0.1.0
