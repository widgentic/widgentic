## Why

Two findings against the native widgets. The `tree` is static and bare: `data-expanded`
is deliberately "state only, no behavior" — a visitor cannot open or close a branch —
and a node is a label and nothing else, so a file listing, an org chart or a category
tree cannot carry the small visual anchor (an icon, an avatar) that makes it scannable.
And the `custom` kind is a misleading leftover: it pretty-prints JSON in a `<pre>`, is
not styleable, adds nothing an agent cannot do better in its own reply, and its name
collides with what "custom widgets" actually means in this product — template widgets
built in the designer. Owner decision: remove it. The research confirms nothing depends
on it — the mapper's fallback is `card`, reserved kinds derive from the catalog, and the
only consumers are tests that use it as a convenient built-in.

## What Changes

- **Tree branches become native `<details>`/`<summary>`** — interactive expand/collapse
  everywhere the HTML renders (the Apps iframe, `format: "page"`, a plain fragment),
  with zero script: `summary` is keyboard-operable by the platform. `hints.expandDepth`
  keeps selecting the INITIAL state, now as the `open` attribute; leaves stay plain
  labels with no disclosure affordance. The `data-expanded` attribute and its CSS
  hiding rule are replaced by the native semantics (**BREAKING** for hosts styling
  `[data-expanded]`; we control the deployed hosts and none does).
- **A visitor's toggles survive action re-renders** — pinned as behavior, not luck:
  both patchers (core `reactive` and the app template's inline one) diff the previous
  render tree against the next and touch only attributes that changed, so a stable
  server-emitted initial state leaves the user's `open`/closed choices alone.
- **Per-node `icon`**: a tree node gains one optional string field. A safe image source
  (the exact `isSafeImageSrc` + extension/data-URI gate card and table already use)
  renders as `img.wg-img.wg-img-icon` (decorative — empty `alt`, the label carries the
  meaning; `loading="lazy"`, `decoding="async"`, riding the existing server-side
  inlining); any other string renders as a text span before the label (emoji, glyphs);
  an unsafe URL degrades to text like everywhere else. The `icon` field joins
  `children` in being excluded from the JSON-snippet fallback label.
- The app template's streaming tree preview mirrors the new markup (branches as
  always-open `details`).
- **The `custom` kind is REMOVED**: registry, descriptor, `.wg-custom` stylesheet
  block, its requirement and scenarios. Catalogs pre-register `card`, `table`, `tree`,
  `group`. Reserved kinds, the guide's `reservedKinds` and the generated docs derive
  from the catalog and follow automatically; an old prompt naming `custom` gets the
  self-correcting `UNKNOWN_KIND` error with the available list; the freed name becomes
  claimable by a user's template widget (no built-in left to shadow).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `widget-catalog`: the tree requirement gains interactivity and icons; the built-in
  enumerations drop `custom` (and say `group`, which they predate); the custom
  escape-hatch requirement is REMOVED.
- `mcp-server`: the widget-listing scenario's enumeration drops `custom`.
- `widget-theming`: the base stylesheet's class enumeration follows the catalog —
  `wg-custom` becomes the neutral `wg-code` monospace utility (keeping `font-mono`
  consumed and the token registry at 32), `wg-img-icon` joins the image shapes, and
  the tree rules style the disclosure instead of hiding children by CSS.
- `reactive-rendering`: the patch scenario names the `open` attribute, and the
  prev-vs-next diff's guarantee — a visitor's DOM change to a stably-emitted
  attribute survives — becomes stated behavior with its own scenario.

## Impact

- `packages/core/src/catalog/widgets/tree.ts` (renderer), `widgets/custom.ts`
  (deleted), `registry.ts`, `descriptors.ts` (tree shape/hints text feeds the guide;
  custom entry deleted), `theming/stylesheet.ts` (`.wg-tree-*` rework, `.wg-custom`
  deleted); tests across core.
- `packages/mcp/src/server/app-template.ts` (preview mirror) and the `bootTemplate()`
  harness tests — including the toggle-survives-re-render behavior.
- Tests in eight files use kind `custom` as a convenience — they migrate to real kinds.
- `openspec/specs/widget-catalog/spec.md` Purpose line (edited directly at archive, per
  the workflow's rule for purposes).
- Generated docs (descriptors feed the guide and reference pages), README rows,
  `TESTING.md` entry; changesets: minor `@widgentic/core` + minor `@widgentic/mcp`
  (template bytes); designer rides the dependency bump (`^0.1.0` on core stops being
  satisfiable — changesets handles the cascade).
- `openspec/specs/widget-theming/spec.md` and `openspec/specs/reactive-rendering/spec.md`
  (deltas added during apply — see design D8).
- Downstream: the apps repo redeploys on the next bump; hosts styling
  `[data-expanded]` (none of ours) would need the new selectors.
