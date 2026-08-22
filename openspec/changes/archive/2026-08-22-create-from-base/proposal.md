# Create widgets and themes from a base

## Why

Starting a custom widget today means the generic starter draft or a blank import — there is no way to say "like the catalog card, but mine" even though that is how users actually think. The same for themes: a user who wants "dark, but with our accent" has to export dark's tokens and re-import them by hand. Both are seeding problems (copy at creation time), and the third original designer feature plus this round's scope addition.

## What Changes

- The designer library gains pure seeding helpers: a widget draft seeded from a stored definition (identity made distinct, everything else copied — `dataSchemaRef` included) or from a built-in kind name (`card`, `table`, `tree`) via new starter templates that reuse the built-in `wg-*` classes so the seed renders like the original immediately; a theme entry seeded from a stored entry or a preset name (`light` = token defaults, `dark` = the dark preset) with a distinct, non-reserved name.
- The widgentic.dev app grows a `Use as base` action on stored widget and theme rows, and `New from card/table/tree` / `New from light/dark` starters — both open the designer in NEW mode with the seeded draft, so `Save to my catalog` creates a new entry and the source is never touched.
- Seeded identities avoid collisions with the principal's existing names (deterministic suffixing), because saving an existing kind/name would silently overwrite it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `widget-designer`: new requirement — draft/theme seeding helpers and built-in starter templates (seeding is copy-at-creation, never a live link).
- `widgentic-app`: the designing-and-publishing requirement gains the `Use as base` flow for widgets and themes.

## Impact

- `src/designer/store.ts` (or a new `seed.ts`): `seedWidgetDraft`, `seedThemeEntry`, starter templates for the three renderable built-ins; exported from `widgentic/designer`.
- `apps/web/main.ts`: `Use as base` row action + from-starter menu on both tabs, wiring into the existing new-mode flow.
- No store, wire, MCP, or guide changes — saving a seeded draft is the existing create path, and agents keep drafting via the guide as before.
