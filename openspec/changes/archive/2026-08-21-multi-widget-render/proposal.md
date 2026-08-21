# Multi-widget single render

## Why

Showing several widgets today takes one `render_widget` call per widget — five cards mean five results with five duplicated style payloads, five iframes on Apps hosts, and no control over how they sit together. Live agent sessions hit this immediately (the person-card iterations rendered card-by-card). One response should be able to carry several widgets — mixed kinds included — with a predictable, customizable layout.

## What Changes

- A new built-in `group` widget kind: `data.items` is an array of sub-widgets `{ kind, data, hints?, meta? }`, rendered through the same catalog (built-ins, registered kinds, and the caller's stored custom widgets all compose).
- Group-level `hints` select the layout from author-controlled presets: `layout` (`stack` | `row` | `grid`), `gap` (`none` | `sm` | `md` | `lg`), `columns` (grid only). Data never contributes class characters — the same principle as the v30 attr transforms.
- Per-item validation errors surface with `data.items[i].…` dotted paths; nested groups are refused; the item count is capped.
- `render_widget` CSS assembly unions the descriptor styles of the group and every distinct item kind, so custom template widgets keep their styles inside a group.
- The render tool description steers agents: several widgets at once → one `group` render, not N calls.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `widget-catalog`: the built-in kind set gains `group`; a new requirement covers group composition rendering (items recursion, layout hints, error paths, nesting refusal, item cap).
- `mcp-server`: the rendering tool renders groups of mixed kinds (stored customs included) and the structured-content CSS channel unions item-kind styles.

## Impact

- `src/catalog/` — group renderer + dispatch recursion, descriptor, hints docs; base class names `wg-group*`.
- `src/mcp-server/handlers.ts` — CSS union for group renders; `definitions.ts` — steering line.
- Base stylesheet (`src/catalog/styles.ts` or theming stylesheet) — layout preset classes; no new theme tokens.
- No wire or tool-signature changes; renderers keep their `(payload) => WidgetNode` shape.
