# @widgentic/designer

## 0.2.0

### Minor Changes

- e79291b: Designers accept `chrome`: a host passes a partial map over the exported `CHROME_TOKENS` (28 `--wgd-*` tokens — the 18 colours plus `font`, `font-mono`, `font-size`, `font-size-sm`, `font-size-xs`, `radius-sm`, `radius`, `radius-lg`, `gap`, `shadow`) to every factory (`options.chrome`) and custom element (`chrome` attribute, JSON). Values are applied inline on the designer root and may be `var()` references to the host's own properties; unknown tokens, non-strings and CSS-wide keywords are ignored. Typography, radii and the menu shadow are now tokens with unchanged defaults, and the stylesheet's dead `var(…, #hex)` fallbacks are gone.

## 0.1.0

### Minor Changes

- c157db8: First published versions: `@widgentic/core` (contract, adapters, mapper, catalog, theming, templates, actions, reactive rendering), `@widgentic/designer` (widget, theme, schema and action designers, custom elements, browser bundle) and `@widgentic/mcp` (tool-output convention, server building blocks and official-SDK assembly, per-principal store and secrets with Cosmos and Key Vault adapters behind subpaths).

### Patch Changes

- Updated dependencies [c157db8]
  - @widgentic/core@0.1.0
