# @widgentic/mcp

## 0.7.0

### Minor Changes

- c07dcb9: The authoring guide teaches the `format` transform and per-item array projection.

  `rules.template.forms` gains a `FORMAT` line documenting `{ bind, format }` with its number,
  currency and date specs and the currency recipe that motivated it (a numeric-string price as
  COP with 0 decimals), plus an explicit one-transform-per-value line. The recipe's example outputs
  are rendered by the engine at guide-build time, never typed. Every
  bound in that text — the decimals range, the currency-display vocabulary, the date tokens, the
  pattern length cap and the default locale — is READ from the constants the validator enforces,
  so a change to the engine cannot leave the guide lying.

  The action-output rules now state that a `map` over an ARRAY response resolves against each
  item and projects the array of per-item results (pair it with `replace` or `patch`), that a `"."`
  target selects first (alone it is the projection; beside other entries it names the value they
  map, so an enveloped list projects per item), that index-addressed sources still address the
  response root, and — on the BIND line — that a text bind may carry `map` (value → label) or
  `format`, never `prefix`.

- 3e84d9e: The app template's streaming preview mirrors the tree's new markup: branches render
  as always-open `details.wg-tree-branch` disclosures (partial input has no meaningful
  collapse state, and an open branch keeps the preview's shape identical to the
  result, so the result patch lands on matching structure), and a node's `icon`
  previews as text before the label — like card fields and table cells, the preview
  never emits images, since server-side inlining runs over the result.

  A visitor's expand/collapse survives an action's re-render of the branches it
  leaves in place: the bridge's inline patcher diffs the previous render tree, never
  the live DOM, so an unchanged branch's `open` attribute is never rewritten while a
  newly appended branch mounts with its computed initial state. The diff is
  positional — a reordering result re-pairs states by index.

  `list_widgets` and the authoring guide's `reservedKinds` follow the catalog, which
  no longer carries the removed `custom` kind.

### Patch Changes

- Updated dependencies [c07dcb9]
- Updated dependencies [3e84d9e]
  - @widgentic/core@0.7.0

## 0.5.0

### Minor Changes

- c3428fd: Agents can discover shared actions: a new `list_actions` tool serves the
  principal's saved actions as their CONTRACT — name, label, description, kind,
  and for http the method and the input/output schemas (a prompt entry instead
  carries `binds`, the data paths its text references — a prompt ref takes no
  input mapping) — so a draft can bind one with `action: { "ref": "<name>" }`
  instead of guessing a name or inventing an inline definition. The URL, headers and query stay on the server: a binding
  needs none of them, and a read-only key travels into prompt-injectable hosts.
  Wire it with the new `sharedActions` option (lazy; omitted means an empty list).

  `get_authoring_guide` gains a `sharedAction` section — the entry shape, the
  action name pattern (stricter than other identifiers, read from the constant
  that enforces it), the Actions-section import path, and the rule that an action
  the user has not saved is described for the designer, never drafted with an
  invented URL. Its `limits` now also publish `maxSchemasPerUser` and
  `maxActionsPerUser`.

  Fix: the `node:http` authoring adapter now contains a host `resolveContext`
  that throws or rejects — a store rejection keeps its mapped status and code,
  anything else answers the surface's structured `INTERNAL` with the trace on the
  log sink — instead of letting the rejection escape into the host's server.

## 0.4.1

### Patch Changes

- eb40c8e: Testing a standalone http action no longer applies a widget's output fold.

  `testHttpAction` validated the response and then folded it with the
  binding-level default (`merge`), which requires object shapes — but `mode`
  and `map` belong to a WIDGET'S binding, authored later; no binding exists at
  action-authoring time. An action whose API returns an array or scalar could
  therefore never pass its test (and, behind a test-gated save, never be
  saved). The test now validates against the action's own output schema and
  hands back the redacted response; binding-time folding keeps its own
  validation where the mode is actually authored.

  Designer: the action editor's Kind and Method selects share one row. Secrets:
  the value refusals say "characters (UTF-8 bytes)" instead of bare "bytes".

## 0.4.0

### Minor Changes

- 535d8e7: Two new entries make widgentic self-hostable without a cloud account.

  `@widgentic/mcp/store/sqlite` — `createSqliteStore(path, options?)`, a full
  `WritableWidgetStore` over a single SQLite database file using the Node
  runtime's built-in SQLite: zero dependencies, WAL mode so a read-only MCP
  process and a writing authoring app can share the file, one transaction per
  write, and the same contract suite the memory and Cosmos implementations
  pass. The database holds key digests and secret ciphertext, never raw
  material.

  `@widgentic/mcp/authoring` — the authoring surface the widgentic.dev app
  runs on, extracted: widgets, themes, schemas, shared actions, the guarded
  action test call, write-only secrets and API keys, as a pure
  `handleAuthoringRequest({ method, path, body, context })` core plus a
  `node:http` adapter (`createAuthoringHttpHandler`). Authentication stays with
  the host — it resolves a principal and hands it in; a presented API key is
  refused with `401 KEY_NOT_A_SESSION` before any store access, and identity
  routes exist only when the host supplies an authenticated subject.

## 0.1.0

### Minor Changes

- c157db8: First published versions: `@widgentic/core` (contract, adapters, mapper, catalog, theming, templates, actions, reactive rendering), `@widgentic/designer` (widget, theme, schema and action designers, custom elements, browser bundle) and `@widgentic/mcp` (tool-output convention, server building blocks and official-SDK assembly, per-principal store and secrets with Cosmos and Key Vault adapters behind subpaths).

### Patch Changes

- Updated dependencies [c157db8]
  - @widgentic/core@0.1.0
