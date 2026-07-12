## Why

The `widget-catalog` capability is specified but not implemented — payloads can be parsed, mapped, and validated, but nothing can render them. The catalog is the last core piece before `mcp-widget-output`: it supplies the built-in widgets (`card`, `table`, `tree`, `custom`), the registration API hosts use to extend them, and the known-kinds list the contract validator was designed to consult.

## What Changes

- Add `src/catalog/` with `createCatalog()`: pre-registers the four built-ins and exposes `register(kind, renderer)`, `has/resolve(kind)`, `kinds()`, and `render(payload)`.
- Keep the core renderer-agnostic: renderers are pure functions `WidgetPayload → WidgetNode` (a plain-data render tree), with separate output layers — `renderToHtml(node)` (escaped serialization) and `mountNode(node, container)` (thin DOM layer via `container.ownerDocument`).
- Implement built-in renderers:
  - `card`: renders `{ title?, subtitle?, fields? }`; arbitrary plain objects fall back to entries-as-fields; primitives render as a single value.
  - `table`: one row per record, columns detected as the union of record keys in first-seen order; `hints.columns` overrides selection/order.
  - `tree`: nested `{ label, children[] }` nodes honoring `hints.expandDepth`; non-conforming nodes get a safe label fallback.
  - `custom`: generic escape hatch rendering `data` as pretty-printed JSON.
- `render(payload)` validates via the contract (`validateWidgetPayload` with `knownKinds` from the registry) and returns the contract's discriminated result pattern; duplicate registration throws a clear `DuplicateKindError` (host programming error, per spec "raise").
- All text is escaped at the HTML/DOM boundary; the render tree has no raw-HTML injection point.
- Export the catalog from a new package entry `./catalog`; add a DOM test environment (`happy-dom`, dev-only) for the DOM-layer tests.
- Add Vitest coverage for every scenario in `openspec/specs/widget-catalog/spec.md` plus the new programmatic-surface requirements.

No breaking changes. Reactive updates (Arrow JS direction) stay out of scope — rendering is static in this change; re-render by re-mounting.

## Capabilities

### New Capabilities
<!-- None. This change implements an existing capability. -->

### Modified Capabilities
- `widget-catalog`: add requirements for the programmatic TypeScript surface (`createCatalog`, registration/lookup, `render`), the pure `WidgetNode` render tree with HTML and DOM output layers, built-in data-shape handling and hint vocabulary (`columns`, `expandDepth`), escaping guarantees, and duplicate-registration error shape. Existing behavioral requirements are unchanged.

## Impact

- New code: `src/catalog/` with `index.ts`, registry, node types, built-in renderers, output layers, and `__tests__/`.
- New package entry: `./catalog` in `package.json` `exports`.
- New devDependency: `happy-dom` (test-only DOM environment). No new runtime dependencies.
- Depends on: `widgentic/contract` (payload types + validation); composes with `widgentic/mapper` (mapper output renders directly).
- Downstream: unblocks `mcp-widget-output` (serializable HTML + known-kinds validation) and a future reactivity change.
