## ADDED Requirements

### Requirement: Keyed each in the template tree
The template tree editor SHALL let an author set and clear an `each` node's optional `key` path from that node's row, with the same path completions the editor offers for binds INSIDE that `each` (the item schema's paths). Clearing the input SHALL remove `key` from the draft rather than store an empty string. The JSON pane and the tree SHALL stay projections of one model, so a `key` typed in either appears in the other, and the validators SHALL run on every edit exactly as for the node's other fields.

#### Scenario: An author keys an each from its row
- **WHEN** an author types `sku` into an `each` row's key input
- **THEN** the draft template's node SHALL carry `key: "sku"` and the JSON pane SHALL show it

#### Scenario: Clearing the key removes it
- **WHEN** the author empties the key input of an `each` that carried `key`
- **THEN** the draft's node SHALL have no `key` property

#### Scenario: Key completions follow the item scope
- **WHEN** the draft's data schema describes `lines` as an array of objects with `sku` and `name`
- **THEN** the key input of `{ each: "lines" }` SHALL offer `sku` and `name`

#### Scenario: A bad key surfaces beside the node
- **WHEN** the author enters a key with invalid path syntax
- **THEN** the validator's `INVALID_PATH` error SHALL appear beside that `each` row
