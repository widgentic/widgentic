## Why

The foundation renders statically: `mountNode` rebuilds the entire DOM subtree on every payload change, losing scroll position, selection, and any host-applied state, and wasting work when an agent streams incremental updates (a growing table, a progress card). The project's stated UI runtime direction — lightweight reactive rendering in the Arrow JS spirit — is the one piece of the architecture diagram not yet realized. `WidgetNode` was deliberately designed as pure, diffable data to enable exactly this layer.

## What Changes

- Add `src/reactive/` with a mount-handle API: `mountWidget(payload, container, options?)` returns `{ update(payload), node(), dispose() }` — the first render mounts, subsequent `update` calls patch the existing DOM in place.
- Implement `WidgetNode` tree diffing and DOM patching:
  - same tag → patch attributes (set changed, remove absent) and recurse into children
  - text node changes → update text content only
  - different tag or node type → replace that subtree only
  - child lists reconciled by index (keyed reconciliation is a non-goal for now)
- Re-render flows through the widget catalog: `update` maps payload → renderer → new `WidgetNode` tree → diff against the previous tree → minimal DOM mutations. Uses a caller-provided catalog (`options.catalog`) or a default instance.
- Invalid payloads on `update` return the contract's structured error (mirroring `catalog.render`) and leave the previously rendered DOM untouched.
- `dispose()` empties the container and releases the retained tree so hosts can clean up deterministically.
- Keep it dependency-free and framework-free: plain diff/patch over `WidgetNode`, standard DOM APIs via `container.ownerDocument` (same discipline as `mountNode`).
- Export from a new package entry `./reactive`; add Vitest coverage (happy-dom) proving in-place patching — element identity preserved across updates, minimal mutations, state survival.

No breaking changes: `mountNode` (static, one-shot) remains as spec'd; the reactive layer builds on top of it conceptually but does not modify the catalog's requirements.

## Capabilities

### New Capabilities
- `reactive-rendering`: In-place DOM updates for widget payloads — mount-handle lifecycle (`mount`/`update`/`dispose`), `WidgetNode` diffing rules, patch semantics (attribute/text/subtree-replace), error behavior on invalid updates, and integration with the widget catalog.

### Modified Capabilities
<!-- None. widget-catalog requirements are unchanged; the reactive layer consumes its public surface. -->

## Impact

- New code: `src/reactive/` with `index.ts`, mount handle, diff, patch, and `__tests__/` (happy-dom).
- New package entry: `./reactive` in `package.json` `exports`.
- Depends on: `widgentic/catalog` (`WidgetCatalog`, `WidgetNode`, renderers) and `widgentic/contract` (error shape). No new dependencies.
- Downstream: hosts (including future MCP host examples) can stream payload updates without losing DOM state; a future keyed-reconciliation or fine-grained-signal change can build on the same handle API.
