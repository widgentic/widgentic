## Why

Hosts embedding the designers cannot make them look like their own product. The chrome is painted through 18 `--wgd-*` custom properties declared on `.wgd-root`, but those names are internal, typography (`system-ui`, `ui-monospace`, a 13/12/11/10 px scale) and radii are hardcoded, and the only knob is `appearance: auto | light | dark`. The widgentic.dev app had to re-skin its designers with a host-side override of the internal class and token names (a `#app-view .wgd-root { --wgd-*: … }` block) — brittle by construction and documented there as interim. A host that ships its own palette and typeface needs a supported way to hand them to the designers.

## What Changes

- The chrome tokens become public API: a documented, exported list (`CHROME_TOKENS`, type `ChromeToken`) covering the 18 existing colour tokens plus typography, shape and elevation tokens: two families (`font`, `font-mono`), a three-step size scale (`font-size`, `font-size-sm`, `font-size-xs`), three radii (`radius-sm`, `radius`, `radius-lg`), the root `gap` and the menu `shadow` — 28 tokens.
- Every factory (`createDesigner`, `createThemeDesigner`, `createSchemaDesigner`, `createActionDesigner`) accepts `options.chrome`: a partial token map applied as inline custom properties on the designer root, so it wins over the built-in light/dark blocks. Values may be `var()` references to the host's own properties, which is how a host's colour-scheme switching flows through without the designer knowing about it. CSS-wide keywords (`inherit`, `initial`, `unset`, `revert`) are not token values and are ignored — a host that wants the designers in its own typeface passes its font variable with a fallback stack.
- The custom elements accept the same map as a `chrome` attribute (JSON), read when the element connects.
- The stylesheet uses tokens for every colour, typeface, font size, radius and shadow; no literal remains outside the token declaration blocks. Dead `var(--…, #hex)` fallbacks are removed (the root and the widget base stylesheet define every token they fall back for). Defaults are unchanged, so hosts that pass nothing see no difference.
- `appearance` keeps its meaning (which built-in scheme the defaults follow); `chrome` layers on top of it.
- Not in scope: theming widget PREVIEWS (that is `--wg-*`, the widget-theming capability); changing the chrome's layout, spacing scale beyond `gap`, or the syntax-highlight colours' semantics.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `widget-designer`: ADDS a requirement that the designers' chrome is themeable by the host through a public token set and a `chrome` option/attribute; the programmatic-surface requirement is unchanged.

## Impact

- `packages/designer/src/dom.ts` (token block, stylesheet literals → tokens, `applyChrome`, `parseChromeAttribute`), `shell.ts`, `theme-designer.ts`, `schema-designer.ts`, `action-designer.ts` (option), `element.ts` (attribute), `index.ts` (exports: `CHROME_TOKENS`, `ChromeToken`, `ChromeOptions`); `tools/exports.test.ts` snapshot; designer tests; `packages/designer/README.md` ("Theming the chrome"); `examples/designer` gains a chrome preset toggle; `TESTING.md` entry; changeset (minor — the linked group moves to 0.2.0).
- Downstream: `widgentic/apps` bumps the range and replaces its override with `chrome: { bg: "var(--host-bg)", …, font: "var(--host-font, system-ui, sans-serif)" }`.
