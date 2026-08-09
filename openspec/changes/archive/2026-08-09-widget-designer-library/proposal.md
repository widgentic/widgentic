# Widget Designer Library

## Why

Custom widgets are widgentic's extension point — the invoice example proves the shape (`{ kind, template, descriptor }`) — but authoring one today means hand-writing the template DSL, descriptor, styles, and dataSchema in TypeScript with no feedback until a render fails. The designer turns that into an interactive loop: edit → validate (with widgentic's existing pure validators) → live preview. It is deliberately a **library** (embeddable custom element + programmatic API, future standalone npm package), not an app: the widgentic.dev host app that persists designs and issues keys is a separate, later change.

## What Changes

- **New `widgentic/designer` package entry** (`src/designer/`): zero-dependency, DOM-based designer that any host application can embed.
- **Custom widget authoring**: edit the `kind`, the template (structured node editor over the DSL forms — text/bind/each/when/element — with a raw-JSON source view kept in sync), and every descriptor property: `description`, `dataShape`, `dataExample`, `hints`, `styles`, `dataSchema`.
- **Validation-first UX**: every edit runs the existing pure guards — `validateTemplate`, `validateTheme`, `validateDataAgainstSchema`, the styles safety filters — surfacing their structured errors inline; the draft additionally cross-checks `dataExample` against `dataSchema`.
- **Live preview**: the draft renders continuously through a scratch catalog + `mountWidget` (in-place patching — widgentic's own reactive layer dogfooded), against `dataExample` or user-supplied sample data, under light/dark/custom themes.
- **Theme designer**: token-by-token editing (registry-driven form, `validateTheme` feedback) previewed against any catalog kind — built-ins or the draft — exporting a plain theme JSON usable with `applyTheme`/`render_widget`.
- **Import/export**: drafts round-trip as JSON in exactly the `CustomWidget` shape the server consumes (`examples/mcp-server/widgets/*.ts`) plus theme JSON; the library performs **no network I/O** — hosts own persistence via change events.
- **Embedding surface**: programmatic `createDesigner(container, options)` handle plus an opt-in custom element (`defineDesignerElement()`), per the framework evaluation in the design (web-component boundary, vanilla zero-dep implementation).
- **Demo rig page**: a static example host page under `examples/designer/` served through the existing tailnet rig for live testing until the real host app exists.

## Capabilities

### New Capabilities

- `widget-designer`: the embeddable designer library — draft model, validation integration, live preview, theme designer, import/export, embedding API.

### Modified Capabilities

_None — the designer consumes existing capabilities (`template-widgets`, `widget-catalog`, `widget-theming`, `reactive-rendering`) through their public APIs without changing any of their requirements._

## Impact

- New: `src/designer/` (state store, panels, preview, element wrapper), `widgentic/designer` export in `package.json`, `examples/designer/` demo host page + serve script (+ one Caddy site on the rig).
- Tests: happy-dom suites for the draft store, each editor panel's validation wiring, preview patching, import/export round-trips, custom-element lifecycle.
- No changes to existing capability code; the designer must work against their public exports only (enforced by import-path convention and review).
- Future (separate changes): widgentic.dev host app (persistence, auth, key issuance), wire registration of designed widgets onto the hosted server.
