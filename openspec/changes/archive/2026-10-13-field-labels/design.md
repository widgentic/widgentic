## Context

See proposal.md for the motivation. Current state:

- **Card and table renderers** (`packages/core/src/catalog/widgets/card.ts` and `table.ts`).
  - `dt.wg-card-field-key` and `th.wg-table-header` show the data key.
  - `fieldFormat`, `images` and `links` are per-key hints that address fields and columns by
    key.
  - Images carry the key as `alt` (`images.ts`).
- **Hint analysis** (`hints.ts`). `analyzeHints` advertises a kind's hints from its
  descriptor's `hints` keys and checks each known hint's per-key entries against the data
  (`NO_MATCH`, `INVALID_VALUE`).
- **The app template** (`app-template.ts`) carries its own client-side copies of the card and
  table renderers (`previewCard`, `previewTable`) for streaming previews. They mirror the core
  renderers' classes and content.
- **Agent steering.** Agents learn hints from `list_widgets` (the descriptors' `hints` texts).
  `render_widget`'s description already asks for `widget` before `data`. The authoring guide
  covers custom templates, whose labels are literals the author writes.
- **Styling.** The base stylesheet does not change the case of `.wg-table-header` or
  `.wg-card-field-key`. A theme may: the seed's Google themes uppercase the headers. A label is
  text, and its display case is the theme's choice.

## Goals / Non-Goals

**Goals:**

- A reader sees "First Name", not `first_name`, whenever the agent supplies labels. Agents
  are steered to supply them in Title Case by default.
- No render without `labels` changes, in any format or runtime.

**Non-Goals:**

- Humanizing keys automatically (D2).
- Labels for `tree` (nodes carry their own `label`) or for `group` (each item has its own
  hints).
- Localizing the steering text. The rule says to follow the user's language when they ask for
  one.
- A label editor in the designers. Built-in kinds' render hints are an agent's or host's
  input, not stored entries.

## Decisions

### D1. Labels are a hint, keyed like the other per-key hints

`hints.labels: Record<key, string>`, applied by the card and table renderers.

**Alternatives:**
- **Labels in the data**, as `fields: [{ label, value }]` or a `data.labels` block. Rejected:
  - it changes the payload contract that models read as data;
  - it breaks `extractWidgetPayload` consumers, which expect key/value data;
  - it diverges from `fieldFormat`, `images` and `links`, which already live in hints and are
    keyed by data key.
- **Keys renamed by the agent** (`"First Name": "Ada"`). Rejected: data keys become display
  strings, and every other hint then has to address them that way.

### D2. No automatic humanizing of keys

A fallback that turns `first_name` into "First Name" was considered and rejected.
- It would change every existing render, which breaks the byte-identical promise and every
  recorded corpus output.
- It mangles keys a person would never write that way: `sku` → "Sku", `iphone_model` →
  "Iphone Model", `url` → "Url".
- It cannot follow the user's language.

The agent knows the user's words, so it writes the labels. A key without a label keeps
today's output.

### D3. One exported steering rule

Core exports one rule from `catalog/descriptors.ts`:
`LABEL_STYLE_RULE = 'Labels are what the reader sees: write them in Title Case ("First Name", "Order Total") unless the user asks for another style or language, and keep the data's keys as they are.'`

The rule is derived wherever agents read it:
- the card and table descriptors' `labels` hint text, which `list_widgets` serves;
- the MCP authoring guide, for template literals and the built-ins' `labels`;
- the WebMCP guide.

Following "derived, never restated", no surface rewords it.

### D4. Labels reach `alt` text

An image field's `alt` uses the label when one is given. A screen reader then says "Avatar"
rather than `avatar_url`. Inlining is unaffected: it rewrites `src` only.

### D5. Previews apply labels, and agents send hints first

- **Previews.** `previewCard` and `previewTable` look up `hints.labels` as the core renderers
  do, so the preview and the result agree.
- **Argument order.** `render_widget`'s description changes from "write `widget` before
  `data`" to "write `widget` first and any `hints` before `data`". Hints then arrive before the
  first row, so labels, `columns` and image places are right from the start. Previews already
  re-read hints on every partial, so a host or agent that sends hints last still converges: it
  shows keys until the hints arrive.

**Alternative:** previews ignore labels. Rejected: a streaming render would show `first_name`
and then switch, which is the very thing observed in testing.

### D6. Diagnostics follow the existing pattern

`analyzeHints` gains a `labels` branch:
- a non-object `labels` is `INVALID_VALUE`;
- a key matching no field (card) or column (table) is `NO_MATCH`;
- a value that is not a non-empty string is `INVALID_VALUE`.

The key check comes first, as for `images`. Renderers ignore invalid entries and show the
key; the diagnostic is how the agent finds out.

### D7. One code path for every runtime

- The host bundle renders through the core renderers, so `Widgentic.Mcp` gets labels without
  C# changes.
- The corpus gains a labelled card and table, as a render, a page and a preview.
- The new `render_widget` description changes `definitions()` in the corpus, so the corpus
  is regenerated.

### D8. Built-in previews ask the server for the theme's CSS (added during apply)

This is an owner finding from the default-themes testing on claude.ai. A streaming `card`,
`table` or `tree` previewed with the base styling, then switched to the person's default
theme when the result arrived.
- **Why:** the frame builds built-in previews itself, and the default themes live only on
  the server, per principal. The app template is global, so it cannot carry them. Custom
  kinds already preview through `preview_widget`, whose `css` carries the defaults.
- **Fix:** once a built-in widget name settles, the frame calls `preview_widget` with only the
  widget (a `group` with `{ items: [] }`) and the settled `theme`, if any. It applies the
  answer's `css` and keeps building the tree itself. It asks again only when a different
  `theme` settles.
- **State:** the CSS request keeps its own per-run state, apart from the custom-kind preview
  queue, so neither delays the other.
- **Cost:** one extra call per streamed render, within the per-principal preview limit.
- **Hosts:** those that send only the complete input right before the result (Copilot,
  ChatGPT) see no difference. The late answer is discarded, so the result's `css` wins.

**Alternatives:**
- A dedicated theme-CSS tool: rejected, as more surface (a tool, a spec, .NET) for the same
  answer.
- Building theme CSS in the template: rejected, because it would duplicate core's theme
  validation in the inline script.

## Risks / Trade-offs

- **[Agents skip the labels]** → Output stays as today: no regression. The rule sits in the
  descriptor text agents read before rendering, and in both guides.
- **[A theme restyles the case]** → For example, the Google themes uppercase table headers. A
  Title Case label then reads in capitals there, which is the theme's design choice. The card's
  field keys keep their case under the shipped themes.
- **[Long labels]** → A label wraps like any text. Nothing caps its length beyond the payload
  limits.
- **[The first streamed chunk can show the base theme]** → The CSS request goes out when
  the widget name settles, so chunks drawn before its answer use the base styling, and then
  the preview switches. The owner accepted this on claude.ai (2026-10-13).
- **[Hints after data]** → An agent that ignores the new argument order gets keys in its
  preview until the hints arrive. The result is unaffected.

## Migration Plan

The change is additive, with no stored shape involved. It releases in the 0.11 batch:
- core minor (the rule and the renderers);
- mcp minor (the description, the guide, the previews);
- webmcp patch (the guide).

`Widgentic.Mcp` 0.11.0 embeds the bundle that carries it. Verify on staging with a labelled
card and table in a new conversation.
