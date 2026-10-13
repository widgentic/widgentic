## 1. Text formats in the engine and validator (core)

- [x] 1.1 `value-format.ts`: add `count`, `join`, `truncate` and `pluralize` to `FORMAT_TYPES` and the `FormatSpec` union, with the D1 constants exported. Extend `parseFormatSpec` and `buildFormatter` per D2: one `Intl.NumberFormat`/`Intl.PluralRules` per spec, no-break spaces normalized, and totality kept.
- [x] 1.2 `validate.ts` `checkFormat`: refuse every malformed text format listed in the delta. Messages name the field and quote the bound from its constant. `join.field` must be a plain dotted path.
- [x] 1.3 Tests for the "Text presentation formats" scenarios and "Malformed text formats are located", plus the node-forms scenario (a text format on a text bind and an attribute). Existing format tests must pass unchanged.

## 2. Markdown text binds (core)

- [x] 2.1 New `templates/markdown.ts`: an in-house two-pass parser to `WidgetNode`s inside `div.wg-md`, per D4.
  - The block pass handles paragraphs with `br`, flat `ul`/`ol` with `start`, and continuation lines.
  - The inline pass handles code spans, escapes, links through `isSafeUrl` with `rel`, and emphasis/strong with the intraword-underscore rule. Literal text covers everything else.
  - Export `MARKDOWN_SOURCE_MAX`. Every emitted node costs budget, and a source over the cap renders as one plain paragraph.
- [x] 2.2 `compile.ts`: a text bind with `markdown: true` renders through the parser on the render's budget; an empty value renders nothing. `validate.ts`: accept boolean `markdown` on text binds, refuse it with `map`/`format`, refuse non-booleans, and refuse `markdown` on attribute values.
- [x] 2.3 `stylesheet.ts`: the `.wg-md` block from tokens (D5).
- [x] 2.4 Tests:
  - every Markdown scenario in the delta (the subset, line breaks and identifiers, empty and oversized values, the budget);
  - "A misplaced Markdown mode is refused" and "Markdown cannot smuggle markup";
  - hostile-input cases asserting rendered content (unmatched and nested delimiters, `javascript:`/`data:` links, raw HTML, a 20 000-character source of delimiters finishing promptly);
  - a computed-value check that a Markdown link takes the theme's `accent` (the repository's real-browser CSS rule).
- [x] 2.5 Update the core exports snapshot (`tools/exports.test.ts`) for the new constants.

## 3. Designer

- [x] 3.1 `template-panel.ts` `formatEditor`: offer the four new types. Commit a complete valid spec on switch (`count`; `join` with `", "`; `truncate` with length 80; `pluralize` with `one`/`other` forms), and reveal each type's fields. Plural edits keep categories and `locale` the row does not show.
- [x] 3.2 A text bind row's Markdown toggle hides `map` and `format` while on, and restores `{ bind }` when switched off. Every new control is reachable under the row's existing reveal rule.
- [x] 3.3 Tests for the three designer scenarios and the modified "Bind rows offer the transforms their position allows".

## 4. Guides, docs and the corpus

- [x] 4.1 MCP guide (`guide.ts`): teach the text formats with rendered examples (`formatBoundValue`) and their bounds and categories from the constants. Teach the Markdown bind with its subset, the "parser chooses tags" rule, the URL guard, the source bound and the block-container advice. Add tests for the modified guide scenarios, including drafts with a join, a pluralize and a Markdown bind passing the store's write validation.
- [x] 4.2 WebMCP guide and tool summaries: the same derived text. Add tests for the summary and guide scenarios.
- [x] 4.3 `tools/conformance-generate.ts`: add the D7 cases and regenerate the corpus. The bare-realm and .NET runs reproduce it.
- [x] 4.4 Regenerate the docs Reference pages (`npm run docs:generate`).
- [x] 4.5 Add changesets: core, designer and mcp minor; webmcp patch (D8). Add a dated `TESTING.md` verification-log entry and a README capability note where the DSL is listed. Remove DSL-1 and DSL-2 from `BACKLOG.md`.

## 5. Gates and staging

- [x] 5.1 Run the gates: typecheck, `npm test`, build, `pack:check`, docs check, `openspec validate --strict template-text-formats` and `--specs`, and `dotnet test`.
- [x] 5.2 Deploy the branch to staging. Check from the served bytes that `get_authoring_guide` teaches the new forms and that a stored widget with a pluralized count, a joined list and a Markdown notes field renders them. Hand the owner a host probe prompt.
