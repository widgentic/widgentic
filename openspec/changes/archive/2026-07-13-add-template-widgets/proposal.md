## Why

Custom widgets today require registering a *renderer function* — code. That excludes the stated product goal: users defining their own widgets (eventually via a widget designer) with structure and data placeholders. A designer produces data, not code, so widgentic needs a serializable template format that can be stored, transmitted (including over MCP), validated, and interpreted safely — Arrow JS-style placeholder ergonomics without executing author-provided code.

## What Changes

- Add `src/templates/` defining a JSON-serializable **template DSL** (`WidgetTemplate`):
  - text literals, `{ bind: "path" }` placeholders, elements (`{ tag, attrs?, children? }` with attr values that may bind), `{ each: "path", template, empty? }` repetition, and `{ when: "path", template, else? }` conditionals.
  - Dot-notation paths resolve against `payload.data` (current scope inside `each`, `"."` for the scope value itself, `"$meta."` prefix for payload meta). Missing paths resolve to empty text — the interpreter is total.
- `compileTemplate(template)` → an ordinary `WidgetRenderer` producing `WidgetNode` trees, so template widgets plug into everything that exists: catalog registration, HTML serialization, DOM mounting, and reactive in-place updates.
- `validateTemplate(input)` → discriminated result with structured `TemplateError`s (code + path into the template), enforcing node shapes and a nesting-depth cap — the designer UI's validation backend.
- `registerTemplate(catalog, kind, template)` convenience: validate, compile, register (duplicate kinds throw the catalog's existing `DuplicateKindError`).
- **Safety rules for untrusted template authors** (customers are not trusted code authors):
  - event-handler attributes (`on*`) are rejected by validation and skipped by the interpreter,
  - bound `href`/`src`-like attribute values with dangerous schemes (e.g. `javascript:`) are dropped at render time,
  - bindings only ever produce text — templates inherit the render tree's no-raw-HTML guarantee.
- Export from a new package entry `./templates`; zero new dependencies.
- Vitest coverage for the DSL, validation errors, all safety rules, and integration: a registered template widget rendering via `catalog.render` and updating in place via `mountWidget`.

Out of scope: the widget designer UI itself (this is its runtime), template versioning/migration, expression syntax beyond paths (no arithmetic, formatting, or filters).

## Capabilities

### New Capabilities
- `template-widgets`: Serializable widget templates — DSL node forms and path resolution, validation with structured errors, compilation to catalog renderers, registration convenience, and the safety rules for untrusted authors.

### Modified Capabilities
<!-- None. registerTemplate composes with the catalog's public register(); widget-catalog requirements are unchanged. -->

## Impact

- New code: `src/templates/` with `index.ts`, DSL types, `validate.ts`, `compile.ts`, and `__tests__/`.
- New package entry: `./templates` in `package.json` `exports`.
- Depends on: `widgentic/catalog` (`WidgetNode`, `WidgetRenderer`, `WidgetCatalog`) and `widgentic/contract` types. No new dependencies.
- Downstream: enables the widget-designer product goal; templates can travel alongside payloads over MCP in a future convention change; `add-widget-theming` styles apply to template output via the same class mechanism.
