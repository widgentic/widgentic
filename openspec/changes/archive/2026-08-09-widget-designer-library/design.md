# Design — Widget Designer Library

## Context

Everything hard about a widget designer already exists in widgentic as pure, tested functions: `validateTemplate` (structured errors incl. `FORBIDDEN_ATTRIBUTE`), `compileTemplate`/`registerTemplate`, `validateDataAgainstSchema` (subset + bounded `pattern`), the styles safety filters behind `widgetStylesToCss`, `validateTheme`/`applyTheme`/`themeToCss` + `THEME_TOKENS`, and `mountWidget` for identity-preserving live re-rendering. The designer is a UI shell over these — its architecture question is *what that shell is built with*, because the answer leaks into every future host application.

The consumer contract is fixed by the server: a designed widget must export exactly the `CustomWidget` shape (`{ kind, template, descriptor }`) that `examples/mcp-server/widgets/` registers, and a designed theme must be a plain validated token map.

## Goals / Non-Goals

**Goals:**
- Embeddable in ANY host (plain HTML page, the future widgentic.dev app, React/Vue apps) without imposing a framework on the host.
- Zero runtime dependencies, keeping the whole package's charter intact for the future standalone npm extraction.
- Every editing surface backed by the existing validators; preview always live; drafts always serializable.
- No network I/O — hosts own persistence through change events.

**Non-Goals:**
- No host-app concerns: no persistence, no auth, no key issuance, no server registration (all in later changes).
- No drag-and-drop visual canvas in v1 — the template editor is a structured node tree + JSON source, not a WYSIWYG page builder.
- No collaborative editing, undo history beyond a simple stack, or mobile-optimized layout in v1.

## Decisions

**D1 — Framework evaluation → web-component boundary, vanilla zero-dep implementation.** Criteria: (a) host-agnostic embedding, (b) dependency/peer-dep footprint as a published library, (c) consistency with the project charter (zero deps, "Arrow JS direction" — fine-grained updates, no VDOM, no framework lock-in), (d) authoring velocity for form-heavy UI, (e) longevity/maintenance risk.

| Candidate | Embedding | Footprint | Charter fit | Velocity | Risk | Verdict |
|--|--|--|--|--|--|--|
| **Vanilla custom elements + widgentic primitives** | Universal (custom element + factory) | 0 deps | Perfect — dogfoods `el`/`mountWidget`, same discipline as the hand-rolled app-template bridge | Lowest — mitigated by an internal micro-store and existing pure logic | None external | **Chosen** |
| Lit 3 | Universal (it *is* web components) | 1 dep, ~5 KB, no peers | Good, but breaks the zero-dep charter | High (reactive properties, templates) | Low; industry standard | **Named fallback** — adopt only if vanilla velocity proves unacceptable in implementation |
| Svelte 5 (compiled to custom elements) | Universal after compile | 0 runtime deps, but adds a compiler/bundler toolchain to a repo that has none | Toolchain conflicts with the no-build charter | High | Build-pipeline maintenance | Rejected |
| React (+ wrappers) | Forces React or ships react-dom (~40 KB+) into every host | Heavy; peer-dep matrix | Contradicts "no heavy framework lock-in" verbatim | High | Ecosystem churn | Rejected |
| Arrow JS (the literal package) | Fine | ~1 dep, tiny | The charter cites its *direction*, not the package | Medium | Single-maintainer, low activity — unacceptable for a flagship surface | Rejected; its philosophy (fine-grained, template-literal reactivity) survives in the internal store design |

The 2026 ecosystem consensus for embeddable libraries (web-component boundary, framework wrappers only as thin sugar) matches: hosts get a custom element and/or a factory function; no host ever inherits our internals.

**D2 — Packaging: `widgentic/designer` subpath now, standalone package later.** Same repo, new `src/designer/` entry in the existing exports map — zero new tooling, the extraction to a standalone npm package later is a package.json exercise because the module only imports from widgentic's public entries (`widgentic/templates`, `widgentic/catalog`, `widgentic/theming`, `widgentic/reactive`, `widgentic/contract`). Import discipline enforced by convention + review: nothing under `src/designer/` may deep-import another capability's internals.

**D3 — Embedding API: factory first, element as sugar.** `createDesigner(container, options)` returns a handle: `{ getDraft(), loadWidget(def), loadTheme(theme), subscribe(listener), dispose() }` — the factory is what framework wrappers and tests use. `defineDesignerElement(tagName = "widgentic-designer")` registers an opt-in custom element wrapping the factory, emitting `widgentic-change` CustomEvents with the serialized draft in `detail` (custom-element registration is an explicit call, never an import side effect — hosts control the registry). Options: initial widget/theme, base catalog for preview kinds, locale-free strings only in v1.

**D4 — Draft store: one micro-store, derived validation.** A single internal store (~100 lines: `get/set/update/subscribe`, path-scoped updates, small undo stack) holds the draft (`{ kind, template, descriptor, sampleData?, theme? }`). Every mutation runs a derive step that calls the pure validators and produces a `diagnostics` view (per-panel error lists). Panels are plain modules: `(store, container) → dispose()`, DOM built with the same `el`-style discipline as the catalog. No global state; multiple designer instances per page must coexist (tested).

**D5 — Template editing: structured tree + JSON source, one model.** The canonical model is the DSL JSON itself. The structured editor renders the node tree with per-form editors (text, `{bind}`, `{each}`, `{when}`, element with attrs — including `{bind}` attr values) and add/remove/move; the JSON source pane is a two-way alternate projection with parse + `validateTemplate` gating (invalid JSON never destroys the tree — last-valid wins, error shown). `FORBIDDEN_ATTRIBUTE` and URL-scheme feedback surface exactly where the offending attr is edited.

**D6 — Preview: scratch catalog per draft, mounted once, patched forever.** On each valid draft revision: a scratch `createCatalog()` gets the draft registered via `registerTemplate` (custom kind) — built-ins are always present for theme-designer previews — and the preview `mountWidget` handle is `update()`d with `{ kind, data: sampleData ?? dataExample, theme }` so the DOM patches in place (dogfooding `reactive-rendering`). Invalid drafts freeze the last good preview and show the structured error in a banner — never a blank panel (the app-template error-state lesson).

**D7 — Theme designer: registry-driven, kind-agnostic.** The theme panel renders one input per `THEME_TOKENS` entry (color-typed inputs where the default parses as a color, text otherwise), validates per keystroke (`validateTheme` — unknown-token impossible by construction, unsafe values inline-flagged), previews against a selectable kind (built-in or the current draft), and exports the bare token map. `surface` vs `bg` separation gets first-class visibility here.

**D8 — Export/import: the server's shape, verbatim.** Export produces `{ kind, template, descriptor }` JSON (and separately a theme JSON); import accepts the same, re-validating everything on load (imports are untrusted). A copy-as-TypeScript convenience emits a `CustomWidget` module body matching `examples/mcp-server/widgets/invoice.ts` for today's manual registration workflow — the bridge until wire registration ships.

**D9 — Editor-UX evaluation → in-house structured editors, patterns borrowed, no new runtime deps.** Raw-JSON textareas proved unfriendly in first use. Survey of the field: `vanilla-jsoneditor` (full tree/text/table editing, schema validation) is excellent but a Svelte-compiled several-hundred-KB dependency; `@json-editor/json-editor` (~150 KB gz) generates forms from *full* JSON Schema; every visual schema builder found (react-json-schema-form-builder, JSON-Schema-Builder, JSONJoy, Form.io/SurveyJS platforms) is React-bound or a service. The decisive asymmetry: widgentic's schema subset is six keywords (`type/properties/required/items/enum/pattern`) — general libraries price in a generality the subset bans. Therefore three in-house editors (~200–300 lines each in the existing panel idiom), interaction patterns borrowed from the surveyed tools:
  1. **Schema builder**: property rows (name, type select, required toggle) with per-type extras (string `pattern`, `enum` values, array `items` sub-editor, nested object properties) — the react-json-schema-form-builder card pattern, subset-sized. JSON source stays as a tab.
  2. **Schema-driven data forms**: when `dataSchema` exists, `dataExample`/preview data render as a generated form (string/number/boolean/enum/array/object controls, validated live by `validateDataAgainstSchema`); without a schema, a generic **JSON tree editor** (collapsible nodes, in-place key/value editing, type switching, add/remove — the NanoJSON/JSONTree pattern). JSON text stays as a tab.
  3. **Template tree usability pass**: indent guides, compact node rows, collapse/expand — same tree interaction vocabulary as the data tree editor.
  `vanilla-jsoneditor` is the sanctioned fallback if the in-house editors prove insufficient (same structure as the D1 Lit fallback). Zero new runtime dependencies either way.

## Risks / Trade-offs

- [Vanilla verbosity slows the panels] → D1 names Lit as the sanctioned fallback; the store/panel contract (D4) is framework-shaped so a Lit rewrite would be panel-local. Decide by mid-implementation, not by re-litigating the architecture.
- [Structured template editor is the biggest UI surface] → JSON source pane ships first and is always available; the tree editor grows form-by-form (text/bind first, each/when next, attrs last) with the preview keeping every step honest.
- [Designer bundle weight inside hosts] → No deps and no framework keeps it small by construction; the demo page loads via plain module script.
- [Two projections (tree/JSON) drifting] → One canonical model (D5); the JSON pane is a projection with last-valid-wins, tested for round-trip stability.

## Migration Plan

Purely additive: a new entry point and a new example directory. Nothing existing changes; the server consumes designed widgets exactly as it consumes the hand-written invoice today. Rig exposure adds one Caddy site (`:9446 → :8082`).

## Open Questions

_None blocking. Deferred to the host-app change: persistence, auth, multi-user, wire registration hand-off._
