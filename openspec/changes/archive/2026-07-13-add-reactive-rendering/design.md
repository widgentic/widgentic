## Context

The catalog's `mountNode` is one-shot: every payload change rebuilds the whole subtree, destroying scroll position, focus, and text selection. `WidgetNode` is pure, JSON-comparable data precisely so two trees can be diffed and the DOM patched minimally. This change adds that layer — the "lightweight reactive rendering (Arrow JS direction)" from the project's tech direction — as a new module consuming only public surfaces (`WidgetCatalog`, `WidgetNode`, the contract error shape).

## Goals / Non-Goals

**Goals:**
- Mount-handle lifecycle: one `mountWidget` call, many in-place `update`s, deterministic `dispose`.
- Minimal DOM mutation: unchanged elements keep their identity across updates (observable via `===` on DOM nodes and preserved interactive state).
- Same safety and totality discipline as the rest of the codebase: structured errors for bad payloads, no exceptions on data paths, text via text nodes only.
- Zero dependencies; works against any DOM via `container.ownerDocument`.

**Non-Goals:**
- No keyed reconciliation — children pair by index; reorders degrade to per-item patches, not moves. A future change can add key hints on the same handle API.
- No fine-grained signals/observables inside `data` — updates are whole-payload; Arrow JS remains a direction, not a dependency.
- No event/interactivity system, no animation or transition hooks.
- No changes to `widget-catalog` requirements; `mountNode` stays the static one-shot API.

## Decisions

### Decision 1: Handle API with an `initial` result
`mountWidget(payload, container, options?)` returns a `WidgetMount`:
`{ readonly initial: UpdateResult; update(payload: unknown): UpdateResult; node(): WidgetNode | undefined; dispose(): void }` where `UpdateResult = { ok: true } | { ok: false; error: WidgetContractError }`.

The first render is just an internal `update`; exposing its outcome as `initial` keeps one code path while letting callers observe a failed first mount without a special return shape for `mountWidget` itself. `node()` returns the currently rendered tree (`undefined` before the first successful render), which is also the natural test seam.

*Alternative considered*: `mountWidget` returning a discriminated `{ ok, mount | error }` — rejected: an invalid first payload should not cost the caller the handle; with `initial`, they keep it and can `update` with corrected data.

### Decision 2: `update` validates through the catalog and leaves the DOM untouched on failure
`update(payload)` runs `catalog.render(payload)` (contract validation with the catalog's live kinds, then the renderer). On `ok: false` the error is returned as-is and neither the DOM nor the retained tree changes — a bad streamed update never blanks a previously good widget. On success the new tree is diffed against the retained one and patched.

### Decision 3: Structural diff with subtree replacement as the escape hatch
Pairwise walk of previous vs next `WidgetNode`:
- both strings → update the text node's data if different
- both elements, same `tag` → patch attributes (set changed/new from `next.attrs`, remove ones absent from it), then recurse into children by index; build-and-append extras, remove surplus from the end
- anything else (tag change, string↔element) → build the new subtree and `replaceChild` — identity is only preserved where shape genuinely matches

This is the smallest algorithm that delivers identity-preserving updates for the dominant cases (cell text changes, appended table rows, toggled attributes). No virtual-DOM bookkeeping beyond retaining the last `WidgetNode` tree, which is already plain data.

### Decision 4: The reactive module owns a private DOM builder
`patch` needs to materialize new subtrees; the catalog's `toDom` is private to `dom.ts`. Duplicating the ~15-line builder inside `src/reactive/` was chosen over exporting the catalog's — it avoids widening a spec'd module's public API for an internal need, and matches the repo's precedent of small per-module private helpers (`isPlainObject`). If a third consumer appears, promotion into the catalog becomes a deliberate spec change.

### Decision 5: `dispose` is terminal; `update` after `dispose` throws
`dispose()` empties the container (`replaceChildren()`) and drops the retained tree. Calling `update` afterwards throws a plain `Error` — using a disposed handle is a host programming error, and the codebase's established split is: data problems return results, programmer errors throw (`DuplicateKindError` precedent). `dispose` itself is idempotent.

### Decision 6: Catalog injection with a per-mount default
`options.catalog` accepts a `WidgetCatalog` so hosts with registered custom kinds reuse their instance; omitted, the mount creates its own `createCatalog()`. A module-level shared default was rejected — it would couple unrelated mounts through registration state, the exact leak instance-based catalogs were designed to prevent.

## Risks / Trade-offs

- [Index pairing degrades on list reorders/prepends — every shifted row patches] → correctness is unaffected (worst case equals today's full rebuild, scoped to the shifted items); keyed reconciliation is explicitly deferred.
- [Mixed text/element children can mispair across updates] → the type-mismatch rule replaces those positions outright; still correct, just less minimal.
- [Retained `WidgetNode` tree assumes renderers return fresh trees; a renderer mutating its previous output would corrupt diffing] → renderers are spec'd pure; the retained tree is also the *previous* render's output, never handed back out except via `node()` (documented read-only).
- [happy-dom fidelity for `replaceChild`/`nodeValue`/attribute removal] → exactly the operations already exercised by catalog DOM tests; covered again by identity-preservation tests here.
- [`options.catalog` and default-catalog divergence: payload kinds valid in one mount, invalid in another] → per-mount validation via the owning catalog is the intended semantic; documented.
