## 1. Tree renderer

- [x] 1.1 `packages/core/src/catalog/widgets/tree.ts`: branches render `details.wgtree-branch → summary.wg-tree-label + ul.wg-tree-children` with `open` from `expandDepth` (design D1, D2); leaves unchanged; `icon` handling per D4 (safe image → `img.wg-img.wg-img-icon` empty-alt lazy/async; other string → `span.wg-tree-icon`; unsafe → text) reusing card/table's detection helper verbatim; `icon` excluded from the JSON-snippet fallback beside `children`.
- [x] 1.2 `packages/core/src/theming/stylesheet.ts`: drop the `[data-expanded="false"]` rule; style `details.wg-tree-branch`/`summary` (token-colored marker/chevron, `[open]` state, children indent + left border preserved); size `.wg-tree-icon` and `.wg-img-icon` to a shared em-box (design Risks).
- [x] 1.3 `packages/core/src/catalog/descriptors.ts`: the tree descriptor's `dataShape`, `dataExample`, description and hints text teach `icon` and the native disclosure (the guide and generated docs derive from this).
- [x] 1.4 Core tests: rewrite the tree suite for the new markup — recursion, `open` from `expandDepth`, leaves have no disclosure, title line, all four icon scenarios (safe URL, emoji, unsafe → text, fallback exclusion); assert rendered CONTENT (serialized HTML), not chrome classes alone.
- [x] 1.5 Core reactive test: a user-flipped `open` attribute survives a patch of an unchanged tree (design D3) — the prev-vs-next diff writes nothing for unchanged branches.

## 2. Remove the custom kind

- [x] 2.1 Delete `packages/core/src/catalog/widgets/custom.ts`; drop the registration in `registry.ts`, the descriptor entry (and its type union member) in `descriptors.ts`, and the `.wg-custom` block in the stylesheet.
- [x] 2.2 Migrate the tests that used `custom` as a convenient kind (core registry/widgets/mount, mcp emit/app-template/handlers/server-wiring, mapper) to a real built-in or a registered template kind — whichever each test's intent needs; delete the custom-renderer cases outright.
- [x] 2.3 Confirm the derived surfaces followed: `createCatalog().kinds()` has four entries, `RESERVED_KIND` no longer refuses `custom` as a stored kind name, the guide's `reservedKinds` and `list_widgets` reflect the catalog.

## 3. App template

- [x] 3.1 `packages/mcp/src/server/app-template.ts`: `previewTreeNode` mirrors the new markup with every branch `open` (design D5); remove any custom-kind preview branch if one exists (the skeleton path already covers non-built-ins).
- [x] 3.2 `bootTemplate()` harness tests: the streaming preview mounts the new structure; a toggled branch survives a `tool-result` patch of the same tree (design D3, end to end through the bridge's patcher).
- [x] 3.3 Confirm in the real-browser rig (not jsdom) that a collapsed branch opens and closes by click and by keyboard inside the sandboxed frame, and record the check in `TESTING.md`.

## 4. Docs and surface bookkeeping

- [x] 4.1 `npm run docs:generate` — descriptors feed the reference pages; review the diff carries the tree's new shape and no `custom` entry.
- [x] 4.2 Hand-written docs that enumerate built-ins or show tree data (README rows, `docs/` pages naming `custom` as a kind) — sweep with grep, correct each.
- [x] 4.3 `openspec/specs/widget-catalog/spec.md` Purpose line: drop `custom` (direct edit at archive, per the workflow rule for Purposes).
- [x] 4.4 `TESTING.md`: dated verification-log entry (tree interactivity incl. the browser-rig check, custom removal, toggle-survival property).
- [x] 4.5 Spec deltas found during apply (design D8): `widget-theming` (`.wg-custom` → the neutral `.wg-code` monospace utility rather than a delete, since `--wg-font-mono` is consumed only there and dropping the token would refuse live themes setting it; plus the disclosure rules and the shared icon em-box) and `reactive-rendering` (the patch scenario names `open`; the prev-vs-next guarantee becomes stated behavior).
- [x] 4.6 Changesets: minor `@widgentic/core` (breaking-in-0.x: `data-expanded` → native `open`, `custom` removed — say both plainly), minor `@widgentic/mcp` (preview mirror); designer rides the cascade (design D7).

## 5. Gate

- [x] 5.1 `npm run typecheck`, `npm test`, `npm run build`, `npm run pack:check` all green.
- [x] 5.2 `openspec validate --strict native-widgets-refresh` and `openspec validate --specs`.
- [x] 5.3 Protocol smoke: `render_widget` a tree with icons and `expandDepth` through the example server; read the RESULT bytes for `details`/`open`/`wg-img-icon`, and `list_widgets` for four built-ins.

## 6. Review closure (8-angle code review on the implementation — design D9)

- [x] 6.1 Behavior: fallback-label boundary fixed in renderer AND preview mirror (icon/children-only nodes); negative `expandDepth` clamps to 0; core depth bound 64 (leaves beyond, render total); preview depth cap bounds recursion, not shape. Delta scenarios and tests added for each.
- [x] 6.2 Reuse/types: `iconNode` goes through `resolveImage`; `RenderImageShape` separates the render-only `icon` shape from the hintable union with `SHAPES` derived from a typed list; `childrenOf` helper; one `ICON_BOX` constant behind both icon rules.
- [x] 6.3 The designer's tree starter seeds the disclosure markup instead of dead `data-expanded`, and (user follow-up) teaches the `icon` slot like the built-in's documented example: a `when`-guarded `span.wg-tree-icon` before both labels, `icon?` in the shape/example/schema — so "New from tree" renders recognizably like the original, emoji icons included. The seeding requirement's text ("approximates that built-in using ... the built-in's documented data example") already covers it; no spec delta needed.
- [x] 6.4 Honesty: toggle-survival qualified as positional in both changesets and the design risks; the two sanctioned preview divergences pinned by name (image-URL icon as text; capped recursion keeps branch shape); `.wg-code` documented in the guide's styles rules; stale `custom` prose removed from `emit.ts` and the core README; the descriptor's icon wording states the real gate (extension or data:image); the premature Purpose edit reverted until archive.
- [x] 6.5 Routed to backlog: inliner occurrence amplification + icon fetch-budget starvation; keyed tree diff for reordering results.
