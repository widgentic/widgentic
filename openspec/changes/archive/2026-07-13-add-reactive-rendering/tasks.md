## 1. Module scaffolding

- [x] 1.1 Create `src/reactive/` with `index.ts` (public exports), `mount.ts` (`mountWidget`, `WidgetMount`, `MountOptions`, `UpdateResult`), `diff.ts` (tree diff/patch), and `build.ts` (private DOM builder for new subtrees)
- [x] 1.2 Add `./reactive` entry to `package.json` `exports`

## 2. Diff and patch

- [x] 2.1 Implement the private DOM builder (`WidgetNode` → DOM via `ownerDocument`, text as text nodes)
- [x] 2.2 Implement text-node patching: same-position strings update `nodeValue` only when changed
- [x] 2.3 Implement element patching for same-tag nodes: set changed/new attributes, remove attributes absent from the next tree, recurse into children by index
- [x] 2.4 Implement child-list reconciliation: pairwise patch, build-and-append extras, remove surplus from the end
- [x] 2.5 Implement subtree replacement for tag/type mismatches (`replaceChild` with a freshly built subtree)

## 3. Mount handle

- [x] 3.1 Implement `mountWidget(payload, container, options?)`: resolve catalog (`options.catalog` or fresh `createCatalog()`), run the initial update, expose its outcome as `initial`
- [x] 3.2 Implement `update(payload)`: `catalog.render` → on failure return the error with DOM and retained tree untouched; on success patch (first success mounts, later ones diff) and retain the new tree
- [x] 3.3 Implement `node()` (current tree or `undefined`) and `dispose()` (empty container, drop tree, idempotent; subsequent `update` throws a disposed error)

## 4. Tests (happy-dom)

- [x] 4.1 Surface tests: mount renders, `initial` on success and on invalid payload (container empty, handle recovers), `options.catalog` with a registered custom kind
- [x] 4.2 Identity-preservation tests: changed cell keeps `<table>` and sibling cell identity (`===` on DOM nodes), appended record keeps existing row identity, `expandDepth` change patches `data-expanded` in place
- [x] 4.3 Replacement and safety tests: kind change replaces the root subtree, patched text with `<b>markup</b>` stays inert
- [x] 4.4 Failure tests: invalid update and unknown kind return structured errors with DOM unchanged, recovery patches from last good state
- [x] 4.5 Lifecycle tests: `node()` before/after renders, idempotent `dispose`, update-after-dispose throws
- [x] 4.6 Type tests (`types.test-d.ts`): `WidgetMount`, `UpdateResult` narrowing, `MountOptions.catalog`
- [x] 4.7 Integration test through package entries: `widgentic/mapper` payload mounted via `widgentic/reactive`, streamed updates (append rows) patch in place

## 5. Verification

- [x] 5.1 Run `npm run typecheck`, `npm test`, and `npm run test:types` — all green
- [x] 5.2 Confirm `widgentic/reactive` resolves via package exports (import through the package entry in a test)
