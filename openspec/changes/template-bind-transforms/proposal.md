# Template bind transforms: value→class maps and literal prefixes

## Why

Live agent authoring hit two DSL walls, reported verbatim from the field:
a `status` value cannot select a status class (`attrs.class` takes a
literal or one bind; `when` tests truthiness only, so
`status: "do-not-contact"` cannot become `.wg-status-danger` — both cards
ship a neutral pill), and binds cannot be concatenated, so `email` and
`phone` render as dead text instead of `mailto:`/`tel:` links even though
both schemes are already in the render allowlist. Two small, serializable
attr-level transforms close both gaps without opening an expression
language.

## What Changes

- **Value→class mapping**: an attr value may be
  `{ bind, map: { "<data-value>": "<literal>" }, default? }` — the
  resolved value *selects a key*; every emitted string is an
  author-written literal. A miss emits `default`, or empty without one.
  Data can never inject output; it only chooses among authored options.
- **Literal prefix**: an attr value may be `{ bind, prefix: "<literal>" }`
  — emitted as `prefix + value` when the resolved value is non-empty, and
  as empty when it is not (no dead `mailto:` hrefs). The composed value
  still runs the existing URL scheme guard; `mailto` and `tel` are
  already allowed, so this is purely syntax.
- `map` and `prefix` are **mutually exclusive** in this change — one
  transform per attr, obvious semantics, no combination table to teach.
- Validation grows precise rejections (malformed map, non-string
  prefix/default, both-at-once) with the usual dotted paths; the
  interpreter stays total and the safety guards run on composed output.
- The **designer's attr rows** author both forms (prefix input and a
  map editor on bind-mode attrs), so imported templates round-trip in
  the tree.
- The **authoring guide** teaches both forms with the two motivating
  recipes (status→class, `mailto:`/`tel:` links), and the
  guide-simulation test grows a fixture using them.

## Impact

- `template-widgets`: node forms, validation, and safety requirements
  extend; interpreter and validator implement.
- `widget-designer`: attr-row editing covers the new forms.
- `mcp-server`: the guide teaches them (derived where a constant exists).
- **Ordering**: this change's widget-designer and mcp-server deltas build
  on `shared-data-schemas`' pending delta text — archive that change
  first.

## Capabilities

### New Capabilities

*(none)*

### Modified Capabilities

- `template-widgets`: attr-level `map`/`prefix` transforms — forms,
  validation, safety.
- `widget-designer`: attr rows author the transforms.
- `mcp-server`: the authoring guide documents them.
