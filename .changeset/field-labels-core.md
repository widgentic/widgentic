---
"@widgentic/core": minor
---

Field and column labels for the built-in `card` and `table`: `hints.labels` maps a field's or column's key to the label the reader sees.

- The card's field keys, the table's headers (including the columns `hints.columns` selects) and image `alt` text show the label. A key without one, or with a blank one, shows the key, so a render without `labels` is byte-identical.
- Labels are escaped text; the data, the payload and every other hint keep addressing fields by key.
- `analyzeHints` reports a label whose key matches no field or column (`NO_MATCH`), and one that is not a non-empty string (`INVALID_VALUE`).
- `LABEL_STYLE_RULE`, the one steering text for labels (Title Case unless the user asks for another style or language, keys left as they are), is exported and included in the card and table descriptors' `labels` hint.
