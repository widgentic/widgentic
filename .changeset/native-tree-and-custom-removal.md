---
"@widgentic/core": minor
---

Tree branches are now native `<details>`/`<summary>` disclosures, and the `custom`
kind is gone. Both are breaking in 0.x.

**Tree interactivity.** A node with children renders as
`li.wg-tree-node > details.wg-tree-branch > summary.wg-tree-label + ul.wg-tree-children`,
so a visitor can expand and collapse branches — by click and by keyboard — in every
context the HTML reaches, with no script: the Apps iframe, a `format: "page"`
document, or a plain fragment. Leaves stay plain labels with no disclosure, so the
presence of the disclosure alone marks an expandable branch. `hints.expandDepth`
keeps selecting the INITIAL state, now through the `open` attribute. **The
`data-expanded` attribute and the stylesheet rule that hid `[data-expanded="false"]`
children are removed** — a host styling `[data-expanded]` must move to
`details.wg-tree-branch` and `[open]`. Because the initial state is a pure function
of data and hints, and the in-place patcher diffs the previous render tree rather
than the live DOM, a visitor's own toggles survive an action's re-render of the
branches it leaves IN PLACE — the diff is positional, so a result that reorders
or prepends siblings re-pairs states by index, as any unkeyed patcher does.

**Node icons.** A tree node takes an optional `icon` string, rendered before its
label. A value passing the same image gate card and table use renders as
`img.wg-img.wg-img-icon` — decorative (empty `alt`), `loading="lazy"`,
`decoding="async"`, participating in server-side image inlining; any other string
(an emoji, a glyph) renders as `span.wg-tree-icon` text; an unsafe source renders as
text, never as an image. `icon` joins `children` in the JSON-snippet fallback's
exclusions.

**The `custom` kind is REMOVED.** It pretty-printed `data` as JSON in a `<pre>` —
not styleable, and its name collided with the product's real custom widgets
(template widgets built in the designer). `createCatalog()` now pre-registers
exactly `card`, `table`, `tree` and `group`; a payload naming `custom` gets the
usual `UNKNOWN_KIND` error listing the available kinds. Reserved kinds derive from
the catalog, so `custom` is now claimable as a stored template kind. Render
structured data through `card`, `table`, `tree` or `group` instead.

**Stylesheet.** The `.wg-custom` block is renamed `.wg-code`, a neutral monospace
block utility no built-in emits (it keeps the `font-mono` token consumed and is a
styling surface template authors can opt into); the theme token registry is
unchanged at 32 tokens. New rules style the branch chevron and size `.wg-tree-icon`
and `.wg-img-icon` to a shared em-box.
