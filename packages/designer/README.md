# @widgentic/designer

Hostable designers for widgentic: the widget designer (template tree, data
schema, sample data, styles, action bindings, live preview), plus standalone
theme, schema and action designers. Each is a function taking a container, and
each is also a custom element. Runs in the browser; depends only on
`@widgentic/core`.

```sh
npm install @widgentic/designer
```

```ts
import { createDesigner } from "@widgentic/designer";

const designer = createDesigner(document.querySelector("#host")!, { themes: [] });
designer.subscribe((draft) => save(draft));
```

Without a bundler, load the single-file bundle and use the elements:

```html
<script type="module" src="/node_modules/@widgentic/designer/dist/browser/widgentic-designer.js"></script>
<widgentic-designer></widgentic-designer>
```

## Theming the chrome

The designers paint their own UI — panels, inputs, buttons, tags, menus —
through 28 `--wgd-*` custom properties, the chrome tokens (`CHROME_TOKENS`).
The widget PREVIEW inside them is not chrome: it follows the selected theme's
`--wg-*` tokens from `@widgentic/core/theming`.

By default the designers wear the **widgentic palette**, light and dark, so an
embedded designer looks like widgentic with nothing configured. Every colour
sits on the logo mark's hue and is contrast-checked in both schemes — text at
WCAG AA (4.5:1), and the borders that identify an input, a focused tag or a
banner at 3:1. Typography is deliberately not branded: a library must never
default to a webfont it cannot serve.

`appearance: "auto" | "light" | "dark"` picks which scheme's defaults the
chrome follows. `chrome` layers a host's values on top of them, applied
inline on the designer root, so they win over the light and dark blocks:

```ts
import { createDesigner } from "@widgentic/designer";

createDesigner(host, {
  chrome: {
    bg: "var(--app-bg)",            // var() references follow the host's own scheme switching
    panel: "var(--app-panel)",
    accent: "#40a0c8",
    font: "var(--app-font, system-ui, sans-serif)",
    radius: "8px"
  }
});
```

The elements take the same map as JSON:

```html
<widgentic-designer chrome='{"accent":"#40a0c8","font-size":"14px"}'></widgentic-designer>
```

| Group | Tokens | Default |
|--|--|--|
| Surfaces | `bg`, `panel`, `hover` | light/dark palette |
| Lines | `border`, `line` | light/dark palette |
| Text | `text`, `muted` | light/dark palette |
| Accent | `accent`, `accent-bg`, `accent-line` | light/dark palette |
| Danger | `danger`, `danger-bg`, `danger-line` | light/dark palette |
| JSON highlight | `hl-key`, `hl-str`, `hl-num`, `hl-bool`, `hl-punct` | light/dark palette |
| Typeface | `font` (labels, buttons, controls), `font-mono` (code panes, code-like values) | `system-ui, sans-serif` / `ui-monospace, monospace` |
| Size | `font-size` (base), `font-size-sm` (compact rows), `font-size-xs` (badges, tags, meta) | `13px` / `12px` / `11px` |
| Shape | `radius-sm`, `radius`, `radius-lg`, `gap` | `4px` / `6px` / `8px` / `16px` |
| Elevation | `shadow` (menus) | `0 8px 24px -12px rgba(11, 27, 38, 0.35)` |

Rules: values are CSS values; CSS-wide keywords (`inherit`, `initial`,
`unset`, `revert`) are ignored — on a custom property they act on the token
itself, not on what reads it — so to follow the host's typeface pass its
variable with a fallback stack (`font: "var(--app-font, system-ui,
sans-serif)"`). Unknown tokens, non-string values and unparseable attribute
JSON are ignored, never thrown. The attributes are read when the element
connects. With no `chrome`, you get the widgentic palette.

`CHROME_DEFAULTS` is not a description of the defaults — it IS them: the
injected stylesheet is generated from it, so a host that paints its own page
from the same object cannot drift. `chromeCss(CHROME_DEFAULTS, { prefix:
"--app" })` returns the light and dark declaration blocks for that. There is
one default palette and no second one to fall back to: a host that wants a
different look passes its own values through `chrome`, and `chromeCss` renders
them for the surrounding page just the same.

MIT © Diego Hoyos
