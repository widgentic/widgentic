## ADDED Requirements

### Requirement: Keyed each
An `each` node MAY carry `key: <path>`, a path in the same grammar as `bind`, resolved against each item's scope (so `"sku"` reads the item's `sku`, and the escapes `$root`, `$parent`, `$meta` and `$index` resolve as they do in a bind inside that `each`). Validation SHALL refuse a `key` that is not a string (`INVALID_TEMPLATE_NODE`) or that fails path syntax (`INVALID_PATH`), at the node's path. During interpretation, an iteration whose output is exactly one element node and whose key path resolves to a string or a finite number SHALL give that element the key's string form; an iteration rendering zero nodes, several nodes, or text, or whose key resolves to anything else, SHALL emit its nodes without a key. The `empty` branch's output SHALL never be keyed. A `key` adds no output a reader sees and SHALL NOT change the rendered HTML. Templates without `key` SHALL render exactly as before.

#### Scenario: Keyed iterations carry their item keys
- **WHEN** `{ each: "lines", key: "sku", template: { tag: "li", children: [{ bind: "name" }] } }` renders `{ lines: [{ sku: "A1", name: "Bolt" }, { sku: 42, name: "Nut" }] }`
- **THEN** the two `li` elements SHALL carry keys `"A1"` and `"42"`

#### Scenario: A keyed template widget reorders in place
- **WHEN** a template kind with a keyed `each` is mounted through `mountWidget` and updated with its items in a new order
- **THEN** each item element SHALL keep its DOM identity at its new position

#### Scenario: Multi-node iterations stay unkeyed
- **WHEN** a keyed `each` whose item template renders two sibling elements per item is interpreted
- **THEN** none of its output elements SHALL carry a key

#### Scenario: Invalid key paths are refused at the door
- **WHEN** a template's `each` carries `key: 5` or `key: "a..b"`
- **THEN** `validateTemplate` SHALL fail with `INVALID_TEMPLATE_NODE` or `INVALID_PATH` respectively, at that node's path

#### Scenario: The key never changes the HTML
- **WHEN** the same template renders with and without `key` on its `each`
- **THEN** `renderToHtml` of both results SHALL be identical
