---
"@widgentic/designer": minor
---

Designers accept `chrome`: a host passes a partial map over the exported `CHROME_TOKENS` (28 `--wgd-*` tokens — the 18 colours plus `font`, `font-mono`, `font-size`, `font-size-sm`, `font-size-xs`, `radius-sm`, `radius`, `radius-lg`, `gap`, `shadow`) to every factory (`options.chrome`) and custom element (`chrome` attribute, JSON). Values are applied inline on the designer root and may be `var()` references to the host's own properties; unknown tokens, non-strings and CSS-wide keywords are ignored. Typography, radii and the menu shadow are now tokens with unchanged defaults, and the stylesheet's dead `var(…, #hex)` fallbacks are gone.
