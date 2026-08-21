# Design — create from base

## D1. Seeding, not inheritance

A seed is a copy at creation time with a new identity; the source is never linked, referenced, or mutated. This was decided when the feature was queued and everything here follows from it: editing the seed never touches the base, deleting the base never breaks the seed, and there is no propagation machinery to build or explain. (Shared data schemas already cover the one case where propagation IS wanted — a seeded widget keeps its `dataSchemaRef`, so schema-level reuse survives seeding.)

## D2. Pure helpers in the library, wiring in the app

`seedWidgetDraft(source, taken?)` and `seedThemeEntry(source, taken?)` are pure functions in `widgentic/designer` — testable without DOM, reusable by the demo designer later. The app's only new work is buttons: `Use as base` on stored rows enters the existing NEW-mode flow with the seeded value (exactly the path `New` + import already exercises), so Save-to-catalog, collision handling at the store, and read-only rules all come for free.

## D3. Built-in seeds are starter templates wearing the built-in's classes

Built-ins are code renderers with no template to copy, so seeding "from card" means a maintained starter template that approximates it. Two deliberate choices: the starters reuse the built-in `wg-*` classes (`wg-card`, `wg-table`, `wg-tree` structure), so themes and the base stylesheet make the seed look like the original from the first preview — the x-post experience showed custom templates wearing `wg-*` classes inherit the whole theming system; and the table/tree starters bind the FIXED example columns/fields from the built-in's `dataExample` — the template DSL binds named properties and cannot reproduce the built-in table's dynamic column union, which is fine: a seed is a starting point the user immediately reshapes, not a re-implementation. `custom` (JSON dump) and `group` (not authorable) get no starters.

## D4. Identity collisions are the helper's job

The store keys widgets by kind and themes by name per principal, and saving an existing key OVERWRITES it — a seeded draft that kept the source identity would destroy the source on first save. Helpers therefore always produce a distinct identity (`<base>-copy`, then `-copy2`, …) against a caller-supplied taken set (the app passes the loaded lists); theme seeds also refuse the reserved `light`/`dark` names (the `RESERVED_THEME` lesson). Deterministic, no randomness — same inputs, same seed.

## D5. No agent surface

Agents draft imports from the guide and cannot write; seeding is a human designer affordance. No guide, tool, or wire changes. If live testing shows agents being asked to "make me a widget like X", the existing path already covers it: `list_widgets` exposes X's descriptor and the guide teaches drafting — the import lands in the same designer where `Use as base` lives.

## Risks

- **Starter drift**: built-in renderers evolve (this week: captions, links); starters approximate a moment in time. Accepted — a seed is a starting point, and the starters live next to the descriptors where changes are visible in review.
- **Copy sprawl**: users may accumulate near-identical widgets. Out of scope — the list UI already supports delete, and per-principal limits bound totals.
