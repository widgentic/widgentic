## Why

Template authors present lists and long text badly today.
- **Lists.** An item count, a list joined into a sentence, a shortened description and a pluralized label ("3 items", "1 item") all need logic the DSL deliberately lacks. Authors work around it with `each` and hand-written separators, or not at all.
- **Long text.** Long-form text (notes, descriptions, an agent's summary) renders as one text node, so its paragraphs, lists, emphasis and links collapse into a single run.

This picks up two backlog items from the A2UI and json-render comparisons:
- **DSL-1 (P2):** presentational `format` types.
- **DSL-2 (P3):** a Markdown bind mode.

Both keep the product invariant that templates are data: data selects and flows through author-written literals, and nothing evaluates.

## What Changes

- **Four text formats in the closed `format` vocabulary.** Like the existing number, currency and date formats, each presents a bound value at render time while the payload keeps the typed value. The author supplies every literal, a value the format cannot read renders as its plain text, and a format never throws.
  - `{ type: "count", locale? }`: an array's length, as a grouped number.
  - `{ type: "join", separator?, last?, field? }`: an array's items as one string, with an author separator, an optional last separator (`", "` and `" and "` give "a, b and c") and an optional per-item `field` path for arrays of objects.
  - `{ type: "truncate", length, ellipsis? }`: text longer than `length` characters (code points) is cut and ends with the author's ellipsis (default `…`).
  - `{ type: "pluralize", forms, locale? }`: a number, numeric string or array length selects one of the author's forms by the locale's plural rules. The forms are keyed `zero`, `one`, `two`, `few`, `many` and `other`, and `other` is required. `{count}` in a form is replaced by the formatted number.
  - All seven formats work on text binds and attribute values alike, under the existing one-transform-per-value rule.
- **A Markdown text bind.**
  - `{ bind: "notes", markdown: true }` parses the bound text with an in-house parser into ordinary render-tree nodes inside one `div.wg-md`.
  - The subset is paragraphs, line breaks, `*em*`/`_em_`, `**strong**`/`__strong__`, inline code, `[text](url)` links, and flat bullet and numbered lists.
  - The parser, not the value, chooses tags. Raw HTML and any syntax outside the subset render as literal text; nothing reaches `innerHTML`.
  - Link URLs face the template URL guard, and a refused link renders as its text.
  - Every emitted node costs budget, and a source over a fixed length bound renders as one plain paragraph without parsing.
  - The mode is for text binds only, exclusive with `map` and `format`, and refused on attribute values.
- **Base styles.** The stylesheet styles `.wg-md` paragraphs, lists, code and links from existing tokens; widget and theme styles can restyle them through `.wg-md` selectors.
- **Designer.** The format control offers the four new types with their fields. A text bind row offers a Markdown toggle, which hides `map` and `format` while it is on.
- **Guides and docs.**
  - The MCP authoring guide, the WebMCP guide and tool summaries, and the generated Reference pages teach the new formats and the Markdown mode.
  - Everything they state derives from the validator's exported constants.
- **Conformance.** The host corpus gains format and Markdown cases, so the .NET host proves the same output on V8, plural rules included.
- **Release.** Minor for core, designer and mcp (linked group, 0.12.0), and a patch for webmcp. `Widgentic.Mcp` follows with 0.12.0 after the npm publish.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `template-widgets`:
  - Node forms admit the text formats and the Markdown text bind.
  - Validation refuses malformed specs and a misplaced `markdown`.
  - The safety rule "bindings only ever produce text" becomes "a Markdown bind's parser, not the value, chooses tags".
  - Two new requirements define the text formats and Markdown binds precisely.
- `widget-designer`: a text bind row offers the Markdown toggle, and the format control covers every format type.
- `mcp-server`:
  - The authoring guide teaches the text formats and the Markdown bind.
  - The host bundle's conformance corpus covers them.
- `designer-webmcp`: the tool descriptions' DSL summary and the authoring-guide tool cover the text formats and the Markdown bind.

## Impact

- **Code.**
  - `packages/core`:
    - `catalog/widgets/value-format.ts`: the new format types, their constants and formatters.
    - `templates/validate.ts`, `templates/compile.ts`, and a new in-house Markdown parser module under `templates/`.
    - `theming/stylesheet.ts`: the `.wg-md` rules.
  - `packages/designer/src/template-panel.ts`.
  - `packages/mcp/src/server/guide.ts` and `packages/webmcp/src/guide.ts`.
  - `tools/conformance-generate.ts`, and the docs generator's output.
- **Surface.** New exported constants from `@widgentic/core`, so the exports snapshot changes. No breaking change: every existing template validates and renders byte-identically.
- **Stored data.** No existing shape changes. Templates using the new forms are refused by readers on older packages, so the apps repo adopts the server and the designer together, as it always does.
- **Out of scope.**
  - The built-in kinds' `hints.fieldFormat`: an agent-side `{value}` pattern, not the template `format` vocabulary.
  - Markdown headings, code blocks, images, tables and nested lists.
  - DSL-3 (contract version marker).
