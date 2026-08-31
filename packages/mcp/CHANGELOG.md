# @widgentic/mcp

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
