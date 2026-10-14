---
"@widgentic/core": minor
---

`hints.fields` for the built-in `card`: an array of field keys that chooses which fields render and in what order, as `hints.columns` does for `table`. Keys the data lacks are skipped, a repeated key renders once, and a malformed value falls back to data order; a card without the hint renders unchanged. `analyzeHints` reports unmatched `fields` entries (`NO_MATCH`) and a malformed value (`INVALID_VALUE`).

`FIELD_ORDER_RULE` is exported and ends the card's `fields` hint and the table's `columns` hint. Object key order does not survive every host's serializer, so agents list the keys whenever their order matters.
