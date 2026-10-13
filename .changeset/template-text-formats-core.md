---
"@widgentic/core": minor
---

Text formats and Markdown text binds in the template DSL.

- The closed `format` vocabulary gains `count` (a list's length), `join` (a list's items with author separators, an optional last separator and an optional per-item `field`), `truncate` (code points kept, author ellipsis) and `pluralize` (author forms chosen by the locale's plural rules, `{count}` replaced by the number). They work on text binds and attribute values alike, under the one-transform-per-value rule. A value a format cannot read renders as its plain text.
- `{ bind, markdown: true }` parses the bound text as a fixed Markdown subset into one `div.wg-md`: paragraphs, line breaks, emphasis, strong, inline code, links and flat lists. The parser, not the value, chooses tags; raw HTML and other syntax stay literal, link URLs face the template URL guard, every emitted node spends the render budget, and a value over `MARKDOWN_SOURCE_MAX` renders as one plain paragraph. Text binds only, exclusive with `map` and `format`.
- The base stylesheet styles `.wg-md` paragraphs, lists, code and links from the theme tokens.
- New exported constants: `JOIN_SEPARATOR_MAX`, `JOIN_DEFAULT_SEPARATOR`, `TRUNCATE_LENGTH_MIN`, `TRUNCATE_LENGTH_MAX`, `TRUNCATE_ELLIPSIS_MAX`, `TRUNCATE_DEFAULT_ELLIPSIS`, `PLURAL_CATEGORIES`, `PLURAL_FORM_MAX`, `PLURAL_COUNT_PLACEHOLDER`, `MARKDOWN_SOURCE_MAX`, `MARKDOWN_TAGS`, `LIST_FORMAT_TYPES` (the formats that read a list), with `isPluralCategory` and `isPlainDottedPath`. Every existing template validates and renders unchanged.
