# Design — multi-widget single render

## D1. A built-in kind, not a wire change

The contract `{ kind, data, hints?, meta? }` already carries everything a multi-widget response needs: `group` is a kind whose data holds sub-widgets. `render_widget`'s signature, the resource block, the app template, and every adapter stay untouched — hosts that predate `group` treat it as any other kind. The alternative (an array-accepting tool input) would fork the wire contract and every downstream extractor.

## D2. Recursion lives in the catalog dispatch

Renderers are pure `(payload) => WidgetNode` functions and never see the catalog, so `group` cannot be an ordinary renderer without either a closure over the catalog or throwing to signal item errors. Instead `render()` special-cases `group` after payload validation: it validates the group envelope (items array, cap, no nested groups), then re-enters `render()` per item and prefixes any failure's path with `data.items[<i>]`. This keeps per-item errors structured (same codes, dotted paths) instead of mangling them through `RENDER_FAILED`, and means composed catalogs (per-principal customs) work with zero extra wiring — the re-entry sees whatever the catalog instance has registered.

Cap: 20 items. The template node budget stays per-item (each item's render is budgeted as if top-level), so the cap bounds total work.

## D3. Layout hints select author-controlled presets

`hints.layout` (`stack` | `row` | `grid`, default `stack`), `hints.gap` (`none` | `sm` | `md` | `lg`, default `md`), `hints.columns` (grid only, clamped 1–4). Hints only ever select from fixed `wg-group*` class names — the same data-selects/author-supplies principle the v30 attr transforms established. Unknown values fall back to defaults and surface through the existing hint-coherence diagnostics (the group descriptor advertises all three hints). Spacing uses plain CSS in the base class rules; no new theme tokens (nothing needs to be themeable per-token yet — a `--wg-gap` token can come later without breaking classes).

## D4. CSS union in the output assembly

`handleRenderWidget` currently emits `catalog.describe(kind)?.styles` for the one rendered kind. For a group it unions the styles of `group` plus every distinct item kind, in first-appearance order, each block once. The item kinds are read from the validated payload (`data.items[].kind`) — no new channel from the render result is needed.

## D5. Diagnostics keep their channels

Group-level hints are analyzed against the group descriptor exactly like any kind. Per-item hints are analyzed against each item kind's descriptor with paths prefixed `data.items[<i>].hints.…`, appended to the same diagnostics array (text `Hint notes:` + `structuredContent.diagnostics`). No new surface.

## D6. No designer or guide surface

`group` is a composition callers assemble at render time, not an authorable artifact: the widget designer keeps editing single custom widgets, and the authoring guide is about authoring. Discovery happens where render-time callers already look — `list_widgets` (the descriptor documents `data.items` and the layout hints) and the `render_widget` tool description, which gains one steering sentence. The theme designer's preview-kind selector picks `group` up automatically from the descriptor list.

## Risks

- **Result-size growth**: 20 rich items in one response can produce a large `html`/`tree`. Accepted — the cap bounds it, and callers control item count.
- **Apps hosts and heights**: one group in one iframe sizes better than N iframes, but very tall grids may scroll inside the frame. Observe on the rig before tuning defaults.
- **Item errors fail the whole render**: refuse-at-door is consistent with every other kind (no partial renders today). If live testing wants best-effort per-item placeholders, that is a follow-up requirement, not a silent behavior change.
