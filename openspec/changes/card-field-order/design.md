## Context

See proposal.md for the motivation. Current state:

- **The renderer.** `renderCard` (`packages/core/src/catalog/widgets/card.ts`) takes its field entries from `Object.entries(data.fields)`, or from `data` minus `title` and `subtitle`. JavaScript keeps string-key insertion order, so the render follows the arguments as parsed.
- **The table.** `renderTable` replaces its detected columns with `hints.columns` when that is an array of strings. `analyzeHints` reports `columns` entries that match no record key as `NO_MATCH`, and a non-array as `INVALID_VALUE`.
- **The preview.** The app template's `previewCard` walks fields with `for…in`, and `previewTable` already applies `hints.columns`.
- **Steering.** `LABEL_STYLE_RULE` is the existing pattern for one exported rule that the descriptors and guides read.

## Goals / Non-Goals

**Goals:**

- An agent can fix the card's field order with data that survives any serializer: an array.
- The card's hint mirrors the table's `columns`, so one mental model covers both.
- The steering travels with `list_widgets`, where agents read it before rendering.

**Non-Goals:**

- Detecting or working around host reordering. The hint makes order explicit wherever it matters.
- Reordering by `labels`. An object cannot carry order through the same serializers (D2).
- Template widgets. Their structure is explicit in the template, so object order never decides them.

## Decisions

### D1. `hints.fields` selects and orders, like `columns`

A valid `fields` replaces the card's field list, as `columns` replaces the table's.
- **Missing keys are skipped.** The table renders an empty column for a listed key that no row carries, because columns are structure shared across rows. A card has one record, and an empty labelled row would read as data saying "nothing", so the key is skipped and analysis reports it `NO_MATCH`.
- **Repeated keys render once,** at their first position, since a field shown twice has no use.
- **Malformed values are ignored,** and the card renders in data order. This keeps the renderer total, and analysis reports `INVALID_VALUE`.
- **The name.** `fields` mirrors `columns` and the card's own `data.fields`. The rejected alternative, `fieldOrder`, would hide that the hint also selects fields.

### D2. Order is an array, never an object

The other option was to read the order from the keys of `hints.labels`. Rejected, because the same serializer that sorts `data.fields` sorts `labels`. An ordered `labels` would need a new array shape, which is a breaking change to a hint released in 0.11, and it would tie naming a field to placing it. Arrays are the only JSON structure whose order every parser and serializer keeps.

### D3. One exported field-order rule

`FIELD_ORDER_RULE`, beside `LABEL_STYLE_RULE` in `packages/core/src/catalog/descriptors.ts`:

> Object key order is not preserved by every host: list the keys here whenever their order matters.

It ends the card's `fields` hint and the table's `columns` hint, so `list_widgets` and the host bundle's definitions carry it. The guides teach templates, where the rule does not apply, so they do not repeat it.

### D4. The preview mirrors the renderer

`previewCard` applies `fields` with the same rules, skipping keys not yet streamed, so a listed field appears in its slot once its value arrives. `render_widget` already asks agents to write `hints` before `data`, so the order is known from the first field.

### D5. Release

A new hint is new behavior in core and mcp, so the linked group takes a minor (0.13.0). Designer has no changeset and stays at 0.12.0 unless something else releases it. `Widgentic.Mcp` 0.13.0 follows with its pin, per the major.minor rule.

## Risks / Trade-offs

- **[Agents keep relying on object order]** → The rule sits in the hint descriptions that `list_widgets` returns. A card without `fields` still renders in data order, which is right whenever the host preserves it.
- **[An agent lists fields and expects the rest to append]** → The table's `columns` selects in the same way, the descriptor says "selection and order", and a missing key is reported.
- **[Name clash with `data.fields`]** → The descriptor names the hint `hints.fields` and gives an example.

## Migration Plan

No stored data and no migration.
1. Apply on `feature/card-field-order`, deploy to staging, and run the owner's host check (a card with deliberately non-alphabetical `fields`).
2. Merge to `staging`, promote to `main`, and release 0.13.0.
3. `Widgentic.Mcp` 0.13.0, then adopt in the apps repo.
