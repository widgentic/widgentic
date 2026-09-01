---
"@widgentic/mcp": minor
---

The app template's streaming preview mirrors the tree's new markup: branches render
as always-open `details.wg-tree-branch` disclosures (partial input has no meaningful
collapse state, and an open branch keeps the preview's shape identical to the
result, so the result patch lands on matching structure), and a node's `icon`
previews as text before the label — like card fields and table cells, the preview
never emits images, since server-side inlining runs over the result.

A visitor's expand/collapse survives an action's re-render of the branches it
leaves in place: the bridge's inline patcher diffs the previous render tree, never
the live DOM, so an unchanged branch's `open` attribute is never rewritten while a
newly appended branch mounts with its computed initial state. The diff is
positional — a reordering result re-pairs states by index.

`list_widgets` and the authoring guide's `reservedKinds` follow the catalog, which
no longer carries the removed `custom` kind.
