# Built-in meta chrome, table formats, and links

## Why

Two reproducible agent findings against the built-ins: `meta.title`/`meta.subtitle` render on cards but are silently dropped by the table (and tree), and the table has no `fieldFormat` equivalent — so agents pre-format currency caller-side and the machine-readable payload block carries `"11,471,334.78"` as text instead of a typed number, contradicting the card descriptor's own "send values typed" guidance. Alongside those: no built-in can render a hyperlink, even though custom template widgets got links in v30 and the v29 `ui/open-link` interception already handles any anchor inside the app frame.

## What Changes

- The table renders `meta.title`/`meta.subtitle` as a semantic `<caption>`; the tree renders `meta.title` as a title line. Card behavior is unchanged.
- `hints.fieldFormat` works on the table, keyed by column, with the card's exact pattern semantics (`{value}` substitution, escaping, image-wins-on-same-key).
- New opt-in `hints.links: Record<key, boolean>` on card fields and table cells: a `true` key renders its string value as an anchor when the value passes the existing URL scheme guard (http, https, mailto, tel); anything else stays plain text. No auto-linking — existing renders never change without the hint.
- The hint-coherence analyzer learns all of it: `fieldFormat` validated against table columns for `kind: "table"`, `links` key/value/target checks (new `UNSAFE_LINK_TARGET` code), and the requirement text catches up with the group hint vocabularies shipped in v32.
- Descriptors document the new hints; the base stylesheet styles the new chrome classes from existing tokens.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `widget-catalog`: table/tree data handling gain meta chrome; table gains `fieldFormat`; card and table gain `links`; hint-coherence analysis extended (links, table-aware fieldFormat, group vocabularies formalized).

## Impact

- `src/catalog/widgets/table.ts`, `tree.ts` — meta chrome; `table.ts`, `card.ts` — links + (table) fieldFormat.
- `src/catalog/hints.ts` — links/table-fieldFormat branches, new diagnostic code.
- `src/catalog/descriptors.ts` — hint docs; `src/theming/stylesheet.ts` — `wg-table-title`/`wg-table-subtitle`/`wg-tree-title`/`wg-link` rules, no new tokens.
- No wire changes, no new tools, no designer surface.
