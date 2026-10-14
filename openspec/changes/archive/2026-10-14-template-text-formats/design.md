## Context

See proposal.md for the motivation. Current state:

- **The format engine.** `packages/core/src/catalog/widgets/value-format.ts` holds a closed `FORMAT_TYPES` (`number`, `currency`, `date`).
  - `parseFormatSpec` narrows a spec, and `compileFormat` builds one formatter per spec object, cached in a `WeakMap` that holds configuration only.
  - Every surface formats through `formatBoundValue`: server render, designer preview, the host bundle, and .NET on V8.
- **The validator.** `templates/validate.ts`'s `checkFormat` refuses malformed specs with messages built from the same exported constants. `TRANSFORM_KEYS`/`activeTransform` enforce one transform per value.
- **The interpreter.**
  - `templates/compile.ts`'s `interpretNode` turns a text bind into exactly one string node, one budget unit.
  - Attribute values go through the URL guard (`isSafeUrl`, `isSafeImageSrc`) after any transform.
  - Element output is plain `WidgetNode` data, serialized by `renderToHtml` or patched in the frame.
- **Template previews.** Template kinds preview through `preview_widget` (server-side compile). The app template builds only the built-ins itself, so no client-side copy of the template interpreter exists.
- **The designer.** `template-panel.ts`'s `formatEditor` offers `FORMAT_TYPES` with per-type fields and commits complete specs on a type switch.
- **The guides.** Both the MCP guide (`guide.ts`) and the WebMCP guide derive their format text from the exported constants and render examples through `formatBoundValue`.
- **Styles.** Widget and theme style selectors must name a `.wg-` class in some compound of each part, so `.wg-md p` is a legal selector.

## Goals / Non-Goals

**Goals:**

- **The engine decides.** The four text formats and the Markdown bind live in core's existing engine and validator, so every renderer (Node, browser, the host bundle on V8) runs the same code.
- **Derived, never restated.** Every bound and vocabulary is an exported constant read by the validator, the designer and both guides.
- **Data never steers.** No template or value can produce a tag, attribute or URL that the existing guards would refuse.

**Non-Goals:**

- **`hints.fieldFormat` for the built-in card and table.** It is an agent-supplied `{value}` pattern string, a different mechanism with its own client-side copy in the app template. Giving it these types is a separate decision.
- **CommonMark compliance.** The parser implements the documented subset and nothing more. It is not a general Markdown renderer.
- **Locale-aware list joining (`Intl.ListFormat`).** The author's literal separators are deterministic across ICU builds and already cover the sentence case.
- **Grapheme-cluster truncation.** `truncate` counts code points. A family emoji (several code points joined by ZWJ) can be cut inside the cluster. `Intl.Segmenter` would fix that, but its availability and data differ across embedded engines.

## Decisions

### D1. Text formats join the existing `format` vocabulary

`count`, `join`, `truncate` and `pluralize` extend `FORMAT_TYPES` and the `FormatSpec` union rather than adding new transform keys.

- They inherit for free:
  - the one-transform-per-value rule;
  - attribute and text positions;
  - the designer's format control, the guides' format section and the corpus pattern;
  - totality: a value the format cannot read renders as its plain text.
- **Alternative: separate keys** (`{ bind, count: true }`, `{ bind, join: {…} }`). Rejected: each new key would need its own exclusivity rules, designer control and guide section, for transforms that are all "present this value as text".

New exported constants sit beside the existing ones in `value-format.ts`:
- `JOIN_SEPARATOR_MAX = 16`, `JOIN_DEFAULT_SEPARATOR = ", "`;
- `TRUNCATE_LENGTH_MIN = 1`, `TRUNCATE_LENGTH_MAX = 1000`, `TRUNCATE_ELLIPSIS_MAX = 8`, `TRUNCATE_DEFAULT_ELLIPSIS = "…"`;
- `PLURAL_CATEGORIES` (`zero, one, two, few, many, other`), `PLURAL_FORM_MAX = 80`, `PLURAL_COUNT_PLACEHOLDER = "{count}"`.

`parseFormatSpec` narrows each spec, and `buildFormatter` builds it once per spec object as today.

### D2. The format semantics

- **`count`** reads arrays only. A count of an object's keys or a string's characters has no clear presentation use, and the totality rule makes the narrow choice safe. The number goes through `Intl.NumberFormat(locale)` with default options, with the same no-break-space normalization as `number`.
- **`join`** reads items through `formatValue` and skips `null`, `undefined` and empty items, so sparse data never produces `", ,"`.
  - `field` is a plain dotted path (`parsePath` with base `scope`, no `$`-prefixed tokens, at least one segment), read in each item's scope. It covers the common array-of-objects case (`tags: [{ name }]`) without `each`, which cannot place separators.
  - `last` replaces only the final separator, which gives "a, b and c".
- **`truncate`** reads `formatValue(value)`, counts code points with `Array.from`, cuts to `length`, trims trailing whitespace and appends the ellipsis. The ellipsis is extra: `length` bounds the text kept, not the output. Authors then think in "how much of the text", and a one-character default ellipsis keeps the visual width predictable.
- **`pluralize`** accepts a number, a numeric string (the same `toFiniteNumber` as `number`) or an array's length.
  - **Category:** `zero` wins for exactly 0 when the author supplied it, a convention authors expect ("No items"). Otherwise `new Intl.PluralRules(locale).select(n)` chooses, falling back to `other`.
  - **`{count}`:** replaced by the grouped number. The placeholder follows `fieldFormat`'s `{value}` convention: an author literal with one marked slot, never an expression.
  - **Determinism:** the `PluralRules` instance is built once per spec. Plural data comes from CLDR through ICU on both Node and V8, and the corpus pins it (D7).

### D3. Markdown is a text-bind mode, not a format

`markdown: true` is a separate key on text binds rather than `format: { type: "markdown" }`.
- Formats produce text and are valid on attributes, and Markdown produces elements and has no attribute meaning. As a format type it would need a position exception inside the format vocabulary.
- The validator gives text binds a three-way exclusion (`map`, `format`, `markdown`) and refuses `markdown` on attribute values, so an author learns the rule instead of seeing it ignored.
- `markdown: false` passes and means plain text, so hand-written JSON that toggles the flag is never refused.

### D4. An in-house, two-pass parser that emits `WidgetNode`s

A new module `packages/core/src/templates/markdown.ts` exports `parseMarkdown(text, budget)` and the constant `MARKDOWN_SOURCE_MAX = 20_000`.
- **Block pass:** a line scanner sorts lines into paragraphs and flat lists.
- **Inline pass:** one left-to-right scan finds code spans and escapes first, then links, then emphasis.
  - Emphasis uses a delimiter stack with the intraword-underscore rule, so `snake_case` stays text.
  - An unmatched delimiter is emitted as text.
- **Literal syntax:** a code fence is recognized at block level and its lines (fences and info string included) become one literal paragraph. An image is matched before a link and emitted as its whole source text. Both stay outside the subset with every character preserved (PR #41 review).
- **Output:** plain `{ tag, attrs?, children? }` objects and strings. It never touches HTML strings, so the existing serializer and patcher handle it unchanged.
- **Links:**
  - The URL passes `isSafeUrl` from `templates/guards.ts`, the same guard as a bound `href`, or the link degrades to its text.
  - `rel="noopener noreferrer"` is set. The bridge's capture-phase `ui/open-link` handling already covers every anchor in the frame.
- **Cost:**
  - Linear in the source length, which `MARKDOWN_SOURCE_MAX` bounds.
  - Nesting depth is bounded by the delimiter stack over a bounded source, so no recursion grows with input.
  - Each emitted element and text node decrements the render's budget. On exhaustion the parser returns what it built and the render is marked `data-truncated`, as for `each`.
- **Over the cap:** the source renders as one paragraph without parsing. No data is hidden, and the cost is constant.
- **Alternative: a library** (markdown-it, micromark). Rejected: core has zero runtime dependencies, must run in the bare-realm host bundle, and libraries emit HTML strings, which would need sanitizing. Building to `WidgetNode` makes the safety property structural.

### D5. One `div.wg-md` wrapper, styled by the base stylesheet

The bind renders one `div.wg-md` so that:
- authors and themes have one class to scope rules (`.wg-md p`, `.wg-md a`);
- the bind keeps its single position in the parent's children for the keyed patcher.

`stylesheet.ts` gains a small block built from tokens:
- paragraph and list margins (`spacing`);
- `code` in `font-mono`;
- links in `accent`;
- the first and last child's outer margins removed.

The block is tested by computed value in a real browser rig, per the repository's CSS rule.

Inline-only text still gets the wrapper, so a Markdown bind placed in a `span` puts a `div` inside a `span`. The guide tells authors to place Markdown binds in a block container. The DOM accepts the nesting, so the frame renders it either way.

### D6. Validator messages and paths

The new checks reuse `INVALID_TEMPLATE_NODE` with dotted paths. No new error code is added: the existing format checks use it, and a new code would change `TemplateErrorCode`, a public type, for no consumer benefit. Messages name the field and quote the bound from the constant, as `checkFormat` does today.

### D7. The corpus pins cross-runtime agreement

`tools/conformance-generate.ts` gains a `corpus-text` widget with six data sets:
- the example;
- zero, one and many;
- pluralize in Polish;
- a hostile Markdown value: literal HTML, a refused link, unmatched delimiters, an image and a code fence.

Each runs as a render, and the example and the hostile value also run as a page and a preview. The .NET V8 run must reproduce them byte for byte, which is where a plural-rules or code-point difference between engines would show.

Two cases from the plan were left out during apply, because each multiplies the corpus without exercising engine data:
- **An oversized source.** It would have added about 120 KB, and string length is identical in every engine. Core tests cover it.
- **A page and a preview for every data set.** Each page carries the whole stylesheet.

### D8. Release as a minor of the linked group

New template forms are new behavior in core, so this is core minor, which takes designer and mcp to 0.12.0. Webmcp gets a patch for its guide text. `Widgentic.Mcp` 0.12.0 follows the npm publish with its pin, per the major.minor rule.

### D9. A seeded demo widget carries the new forms

Added during apply. Agents cannot send templates, so checking the new forms on staging, and in a host, needs a stored widget that uses them. The demo seed (`examples/docker/seed/demo.json`) gains `project-status-widget`:
- a pluralized open-task count;
- owners joined with `field` and `last`;
- a truncated summary whose full text rides in `title`;
- Markdown notes.

The generator copies it into the .NET sample's seed. The seed tests' counts move from 8 to 9 entries.

### D10. List-reading formats complete array paths in the designer

An owner finding on staging. The designer's bind path dropdowns offered scalar paths only, because a list bound raw renders as JSON, so the seeded widget's `tasks` and `owners` binds showed "(off-schema)" although `count`, `join` and `pluralize` read lists by design.
- Core exports `LIST_FORMAT_TYPES` (`count`, `join`, `pluralize`).
- A bind carrying one of those formats, in a text or attribute position, completes the scope's array paths as well as its scalars. Every other bind keeps scalar paths.
- Switching the format re-renders the row, so the list follows the choice.
- The requirement "Schema-driven path completion descends arrays" carries the rule and a regression scenario.

## Risks / Trade-offs

- **[A template using the new forms is refused by a reader on 0.11]** → Stores re-validate on read, so an older server would skip such a widget with a diagnostic, never serve it broken. The apps repo adopts the server and the designer together, so production never mixes versions.
- **[Agent text that looks like Markdown but is not]** (a line starting `- ` meant literally, `*` used as a footnote mark) → The author opts in per bind, so only fields the author chose are parsed. Unmatched delimiters stay literal.
- **[Plural data drift between ICU builds]** → The corpus covers `en-US` and `pl`, and the .NET run compares bytes. A future drift would fail the gate rather than reach a user.
- **[Markdown in a narrow cell]** → Block margins could crowd a table cell. The base margins are small and token-driven, and `.wg-md` selectors let a widget's styles tighten them.
- **[Parser bugs as a safety surface]** → The parser emits only fixed tags with literal text children. Even a wrong parse yields wrong structure, never markup or an unguarded URL. Tests assert rendered content for each construct and for hostile inputs.

## Migration Plan

No stored shape changes and no migration.
1. Apply on `feature/template-text-formats`, deploy to staging, and test in a host (a widget with a pluralized count, a joined list and a Markdown notes field).
2. Merge to `staging`, promote to `main`, and release 0.12.0 (core, designer, mcp) and the webmcp patch.
3. `Widgentic.Mcp` 0.12.0: bump the pin and the version and write the CHANGELOG.
4. Bump the apps repo to `^0.12.0` and deploy when the owner chooses.
