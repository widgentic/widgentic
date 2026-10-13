## Why

The built-in `card` shows each field's data key as its label, and the `table` shows each
column's key as its header. Agents usually name keys in lower case, and keys of more than one
word come out as `first_name` or `order_total`. That is what readers saw during testing. The
only workaround today is to rename the data's keys, which bends the data to suit its display.
A label belongs to the presentation, as a format or an image shape already does.

## What Changes

- **`hints.labels` for card and table.** A `Record<key, string>` maps a card field or a table
  column to the label shown for it.
  - The card's `dt` and the table's `th` show the label, and an image's `alt` text uses it
    too.
  - A key without a label still shows the key, so every existing render stays byte-identical.
  - Labels are plain text, escaped like any value. The data and the payload keep their keys.
- **Hint diagnostics.** `analyzeHints` checks `labels` as it checks the other per-key hints.
  A label whose key matches no field or column is `NO_MATCH`, and one that is not a non-empty
  string is `INVALID_VALUE`.
- **Agents are told to write Title Case labels.** One steering rule, exported from core and
  derived everywhere agents read it:
  - write labels in Title Case ("First Name") unless the user asks for another style or
    language;
  - leave the data's keys as they are.

  It appears in the card and table descriptors' `labels` hint text (what `list_widgets`
  serves), in the authoring guide's guidance for the labels custom templates write, and in the
  WebMCP guide.
- **Streaming previews show labels.** The app template's client-built card and table previews
  apply `hints.labels` once the hints arrive. `render_widget`'s description asks callers to
  write `widget` first and any `hints` before `data`. Then labels, columns and image places are
  right from the first streamed row.
- **Everywhere the renderers run.** The host bundle, and so `Widgentic.Mcp`, renders through
  the same core renderers. The conformance corpus gains labelled card and table cases.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `widget-catalog`:
  - A new requirement covers field and column labels: rendering, fallback, escaping and the
    descriptor's steering.
  - Image rendering's `alt` takes the label.
  - Hint-coherence analysis checks `labels`.
- `mcp-server`:
  - `render_widget`'s description asks for `hints` before `data`.
  - The authoring guide states the label style.
  - A new requirement: client-built previews show labels.
  - The host bundle corpus covers labels.
- `designer-webmcp`: the WebMCP guide states the same label style.

## Impact

- **Code:**
  - `packages/core/src/catalog`: card, table, image `alt`, hints analysis, descriptors, and a
    steering constant.
  - `packages/mcp/src/server`: `definitions.ts`, `guide.ts`, `app-template.ts` previews.
  - `packages/webmcp/src/guide.ts`.
  - `tools/conformance-generate.ts` and the corpus.
- **API surface:** one new core export, the steering text. The `exports.test.ts` snapshot
  changes.
- **Compatibility:** additive. A render without `labels` is byte-identical to today's, in
  every format and runtime. Only the tool description and descriptor texts change, so
  `definitions()` and `list_widgets` output change, and the corpus is regenerated.
- **Releases:** changesets for core, mcp and webmcp. This is the last change before the 0.11
  release batch.
- **Not here:**
  - Automatic humanizing of keys (design D2).
  - Labels for `tree` or `group`. A tree has no field labels, and group items carry their own
    hints.
