# Design — Interactive tree, node icons, and the custom kind's removal

## Context

See proposal.md — Why. What shapes the approach:

- The tree today: `ul.wg-tree > li.wg-tree-node > span.wg-tree-label (+ ul.wg-tree-children)`,
  with `data-expanded` on branches and one stylesheet rule hiding collapsed children.
  Explicitly "state only, no behavior".
- Both in-place patchers — core `reactive/diff.ts` and the app template's inline
  `patch()` — diff the PREVIOUS render tree against the next, not against the live DOM:
  an attribute is written only when `prev !== next` and removed only when present in
  `prev` but not `next`. A user-made DOM change to an attribute the server emits stably
  is therefore never touched. This is the property the whole interactivity design rests
  on, so it becomes a spec scenario with a test, not an observation.
- Card and table already own the image mechanism: `isSafeImageSrc`, the extension /
  `data:image/*` detection rule, `wg-img wg-img-<shape>` classes, `loading="lazy"` /
  `decoding="async"`, and server-side inlining over the rendered result. The tree icon
  reuses all of it and adds only a shape.
- The app template contains a client-side preview mirror of each built-in
  (`previewTreeNode`) for streaming partial input; any markup change to a built-in must
  land there too or previews and results diverge.
- Nothing depends on the `custom` kind: the mapper's precedence is tree → table → card
  with `card` as the fallback; `RESERVED_KIND` and the guide's `reservedKinds` derive
  from `createCatalog().kinds()`; the only consumers are tests using it as a convenient
  built-in and one stylesheet block.

## Goals / Non-Goals

**Goals:** branches a person can open and close in every rendering context; a small
per-node visual anchor; one fewer misleading kind.

**Non-Goals:** arbitrary per-node templates (that is what template widgets are for);
expand/collapse state reaching the model or the payload (it is presentation, not data);
a hint to force/suppress icon detection (card/table's `hints.images` keys by
field/column — the tree has one icon slot and the safety gate is the rule); keeping
`custom` reserved after removal (reserved kinds exist to prevent shadowing built-ins;
there is no built-in left to shadow).

## Decisions

**D1 — Native `<details>`/`<summary>`, not bridge JavaScript.** A `summary` toggles by
platform behavior: it works identically in the Apps iframe, in a `format: "page"`
document, and in any host that renders the fragment — contexts where the bridge does
not exist. It is keyboard-operable and focusable for free. The alternative — a click
handler in the app template flipping `data-expanded` — would be interactive only inside
Apps hosts and dead everywhere else, which is the wrong trade for a server-rendered
widget.
*Structure:* branch `li.wg-tree-node > details.wg-tree-branch[open?] > summary.wg-tree-label + ul.wg-tree-children`;
leaf unchanged (`span.wg-tree-label`). The label class stays on the summary so existing
label styling holds for both shapes.

**D2 — `open` replaces `data-expanded`; one source of truth.** Keeping `data-expanded`
beside the native `open` would let the two disagree after the first user toggle. The
stylesheet rule hiding `[data-expanded="false"]` children goes; hiding is the
disclosure's own semantics. The stylesheet styles the marker (a token-colored chevron
via `summary::marker` / `[open]` rotation), keeps the children indent and left border,
and removes the default marker double-styling across browsers. BREAKING for a host
styling `[data-expanded]`: accepted — we control the deployed hosts, none does, and the
attribute was documented as presentation-only.

**D3 — Toggle survival is the patchers' existing contract, now pinned.** The initial
`open` set is a pure function of data + hints, so an unchanged branch re-emits the same
attributes and the prev-vs-next diff writes nothing — the visitor's toggles stand. New
branches appended by a data change mount with their computed initial state. This is
tested through the `bootTemplate()` harness (toggle in the DOM, patch the same tree,
assert the toggle stands) and in core's reactive mount tests.

**D4 — One `icon` field, the shared safety gate, decorative semantics.** A single
string field: safe image source → `img.wg-img.wg-img-icon` with empty `alt` (the label
is the accessible name; a repeated alt would be read twice), lazy/async, inlined
server-side like every other widget image; anything else → `span.wg-tree-icon` text
(emoji and glyph icons need no allowlist). Detection reuses card/table's rule verbatim
rather than a new one — one gate to audit. `icon` joins `children` in the
JSON-snippet-fallback exclusion so an icon-only node does not print its own icon URL as
its label.

**D5 — The preview mirror renders branches as always-open disclosures.** Streaming
partial input has no meaningful collapse state; `open` on every preview branch keeps
the preview honest and the markup shape identical to the result, so the result patch
lands on matching structure.

**D6 — Remove `custom` outright; nothing keeps its seat warm.** Registry entry,
descriptor, `.wg-custom` block, requirement and scenarios all go. Old prompts get
`UNKNOWN_KIND` with the available list — the same self-correcting error every wrong
kind gets. Tests that used `custom` as "any second kind" migrate to a real built-in or
a registered template kind, whichever each test actually needs.

**D7 — Release shape.** Minor changesets for `@widgentic/core` (renderer + removal) and
`@widgentic/mcp` (app-template preview bytes). `@widgentic/designer` releases through
the dependency cascade: its `^` range on core stops being satisfiable, and the linked
group aligns the released versions.

**D8 — Two more capabilities carry deltas (found during apply).** The drafted specs
covered `widget-catalog` and `mcp-server` only, but two CURRENT specs describe exactly
what this change replaces, and a change that contradicts a live spec without a delta
leaves the archive incoherent:
- `widget-theming` enumerates `.wg-custom` in its stylesheet requirement AND its
  covered-classes scenario, and requires EVERY registry token to be referenced by the
  stylesheet — `--wg-font-mono` is consumed only there. Deleting the block outright
  would orphan the token, and deleting the token would refuse live stored themes that
  set `font-mono` with `UNKNOWN_TOKEN` (a persisted-shape break needing its own
  normalization seam). Owner decision: RENAME the rule to `.wg-code`, a neutral
  monospace block utility no built-in emits — the misleading name goes, the token stays
  consumed, the registry stays at 32 and nothing stored breaks. The delta also records
  the new tree disclosure rules and the shared icon em-box.
- `reactive-rendering` pins "affected nodes' `data-expanded` attributes SHALL change".
  Its delta renames that to `open` and promotes D3 from an observation to stated
  behavior: the diff is taken against the previous render tree, never the live DOM.

**D9 — Review closure (8-angle review on the implementation).** Fixed: the fallback
label's boundary (a node whose ONLY fields are `icon`/`children` printed its whole
subtree as its label — now the exclusion is unconditional, mirrored in the preview);
negative `expandDepth` inverted the semantics (-1 rendered everything OPEN — now
clamped to 0); the core renderer gained the totality bound the header claimed
(depth 64, leaves beyond); the preview's depth cap no longer changes SHAPE (a deep
branch keeps its disclosure with children pending); the designer's tree seed still
emitted `data-expanded` markup (now the disclosure form); `iconNode` re-paired the
gate by hand (now `resolveImage`); the render-only `icon` shape moved from the
hintable union into `RenderImageShape`; the two sanctioned preview divergences
(image-URL icons preview as text; capped recursion) are pinned by NAME in tests
instead of dodged by narrow comparisons; `.wg-code` is documented where template
authors read (the guide's styles rules); stale prose in `emit.ts`, the core README
and the descriptor's icon wording corrected; the premature main-spec Purpose edit
reverted until archive. Qualified rather than fixed: toggle survival is POSITIONAL
(an unkeyed diff re-pairs states when siblings reorder) — stated in both changesets
and below.

## Risks / Trade-offs

- [A host styles `[data-expanded]` today] → none of ours does; the changeset and README
  row name the new selectors (`details.wg-tree-branch`, `open`).
- [`details` inside `li` is unusual markup] → valid HTML (flow content), and the
  existing classes stay on the same conceptual elements; the class contract, not the
  tag nesting, is the styling surface per "Stable class names".
- [Patch across SHAPE changes rebuilds a branch and loses its toggle; a REORDERING
  result re-pairs open states by index (a visitor's toggle can land on a different
  logical branch)] → inherent to identity-by-position patching and out of scope: the
  scenario pins survival for UNCHANGED branches, the changesets state the positional
  qualification plainly, and a keyed tree diff (pairing by node identity) is queued
  in the backlog for when a real payload hits it.
- [Repeated icon URLs amplify server-side inlining] → pre-existing inliner mechanics
  the tree makes likelier: one URL across N nodes is fetched once but its base64 body
  is substituted at EVERY occurrence, and many distinct small icons can exhaust the
  24-unique-URL fetch budget ahead of a hero image. Queued in the backlog (an
  occurrence-aware byte budget and shape-aware priority) rather than absorbed here.
- [An emoji icon and an image icon baseline-misalign] → the stylesheet sizes both to
  the same em-box (`.wg-tree-icon`, `.wg-img-icon`), checked in the computed-value rig
  if eyeballing disagrees.

## Migration Plan

Ships as one release: the tree gains behavior, `custom` disappears. `UNKNOWN_KIND` is
the migration path for stragglers; stored widgets are unaffected (no stored entry can
be named `custom` today — it was reserved). The apps repo adopts by bump + deploy with
no code change; the demo and docker examples re-render the new tree automatically.
