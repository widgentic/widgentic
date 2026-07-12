## Context

`widget-catalog` is the rendering half of the pipeline: it resolves a payload's `kind` to a renderer and produces displayable output. Upstream pieces exist (`contract` validates payloads, `adapters` parse input, `mapper` fills `kind`); the contract's `ValidateOptions.knownKinds` injection point was designed for the catalog to populate. The project convention is a renderer-agnostic core — pure data plus a thin DOM layer — with Arrow JS as the eventual reactive direction, not a dependency to adopt now.

## Goals / Non-Goals

**Goals:**
- Instance-based catalog with the four built-ins pre-registered and a host registration API (spec: register without modifying the core, duplicates rejected).
- Pure renderers: `WidgetPayload → WidgetNode` plain-data trees, testable without a DOM.
- Two output layers over one tree: `renderToHtml` (escaped string, needed later by `mcp-widget-output`) and `mountNode` (real DOM).
- Safe-by-default: every text value escaped; malformed `data` renders a fallback rather than throwing.
- Zero runtime dependencies.

**Non-Goals:**
- No reactivity/fine-grained updates — static render; re-render by re-mounting. The Arrow JS direction is a follow-up change; `WidgetNode` is designed to not preclude it.
- No theming or CSS beyond stable `wg-*` class names hosts can target.
- No interactivity (sorting, tree collapse behavior) — `expandDepth` only controls initially-rendered state via attributes.
- No async or streaming renderers.

## Decisions

### Decision 1: Instance-based catalog, not a module-global registry
`createCatalog()` returns an independent instance with `register`, `has`, `resolve`, `kinds`, `render`. A module-global singleton would leak registrations across tests and hosts, and the contract already anticipates injection (`knownKinds` is a parameter, not ambient state). Hosts that want a shared catalog can export their own instance.

### Decision 2: Renderers produce a pure `WidgetNode` tree
`WidgetNode = string | { tag, attrs?, children? }` — plain JSON-serializable data, no DOM types, no framework types. This is the "renderer-agnostic core / pure data + DOM layer" convention made concrete: built-in renderers and their tests need no DOM environment; `renderToHtml` and `mountNode` are the only code touching output concerns.

*Alternative considered*: renderers return HTML strings — rejected (string concat invites escaping bugs, and a future reactive layer can't diff strings). *Alternative*: renderers return real DOM nodes — rejected (forces a DOM into every consumer and test; MCP output needs serializable results).

### Decision 3: Duplicate registration throws; rendering returns results
`register()` throws `DuplicateKindError` (an `Error` subclass with `code: "DUPLICATE_KIND"`, including the offending kind) — the spec says "raise", and double-registration is a host programming error best surfaced loudly at startup. `render(payload)` instead returns the contract's discriminated pattern `{ ok: true, node } | { ok: false, error }` — bad payloads are runtime data, and the error shape reuses `WidgetContractError` (`UNKNOWN_KIND` comes for free by passing `kinds()` to `validateWidgetPayload`). Built-ins are registered through the same `register()` path, so they are equally protected and hosts cannot silently override them.

### Decision 4: Built-ins are lenient about `data` shape
The mapper routes arbitrary shapes at these renderers, so each has a documented fallback instead of failing:
- `card`: uses `data.title`/`data.subtitle`/`data.fields` when present; other plain-object entries become fields (a mapper-produced card "just works"); primitives/null render as a single value line. `meta.title`/`meta.subtitle` fill in when `data` doesn't provide them.
- `table`: non-array data is treated as a single-record array; columns are the union of record keys in first-seen order; `hints.columns: string[]` overrides selection and order; missing cells render empty.
- `tree`: a node's label is `node.label` stringified, else a JSON snippet fallback; `children` must be an array to recurse; `hints.expandDepth` (default `Infinity`) sets a `data-expanded` attribute per depth — state only, no behavior.
- `custom`: pretty-printed `JSON.stringify(data, null, 2)` in a `<pre>` — the safe escape hatch for data no built-in understands (circular data falls back to `String(data)`).

Totality here mirrors the mapper: garbage in should still render something inspectable, never throw.

### Decision 5: Escaping lives in the output layers, exactly once
`WidgetNode` carries raw text; `renderToHtml` escapes text and attribute values (`& < > " '`), and `mountNode` uses `textContent`/`setAttribute` (inherently safe). There is deliberately no `rawHtml` node type — agent-supplied data can never inject markup. Attribute names and tags come only from renderer code, never from data; `renderToHtml` additionally allowlists them defensively.

### Decision 6: DOM layer binds to `container.ownerDocument`
`mountNode(node, container)` creates elements via the container's own document rather than a global `document`, so it works unmodified in browsers, happy-dom tests, and any embedder. It replaces the container's children (idempotent re-mount — the future reactivity change upgrades this in place). `happy-dom` is added as a devDependency solely for these tests; if installation is not possible in the environment, DOM-layer tests are the only casualty and the pure/HTML layers remain fully covered.

### Decision 7: Stable `wg-` class names as the only styling surface
Each built-in emits predictable classes (`wg-card`, `wg-card-title`, `wg-table`, `wg-tree-node`, ...). No stylesheet ships in this change; classes give hosts and the future theming work a stable contract without committing to visuals now.

## Risks / Trade-offs

- [`happy-dom` may not install in offline environments] → DOM tests are isolated in one file; pure-tree and HTML-serialization tests cover all behavioral requirements. Verified during apply; worst case the DOM test file is added but skipped with a note.
- [Lenient built-ins may mask malformed data] → the fallbacks are themselves specified (scenarios below), so behavior is deliberate and testable, and `custom`/JSON output keeps the raw data inspectable.
- [`kinds()` snapshot vs live registry drift when hosts hold `knownKinds` sets] → `render()` recomputes from the live registry on each call; documented that `kinds()` returns a fresh array.
- [No reactivity means full re-mount on data change] → acceptable at foundation scale; `WidgetNode` purity keeps the door open for diffing/Arrow JS later.
- [JSON.stringify in `custom` can throw on circular data] → caught; falls back to `String(data)`.
