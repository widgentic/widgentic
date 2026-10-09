---
"@widgentic/mcp": minor
---

New `@widgentic/mcp/host` entry: the runtime-neutral host bundle, for MCP servers that
are not Node. `createWidgenticHost(configJson)` returns a host whose every argument and result
is a string: `definitions()` (the render-side tool definitions, as exported), `call(name,
argsJson, slim)` (the same handlers the Node assembly wires), `appTemplate()`,
`widgetPage(kind)`, `problems()` and `version()`. Widgets, themes and shared schemas arrive in
the designer's export shapes and go through the store's own composition and checks; refused
entries are listed, never thrown. The host is render-only: http actions compile disabled, no
`load` is emitted, and `execute_action`/`list_actions` are not served.

The entry's default condition is one self-contained ES module with no imports that needs
nothing beyond ECMAScript and `Intl` — no Node modules, no web APIs — and never touches the
realm's globals; `URL` resolves to the platform's implementation, or to a bundled
spec-compliant one where the engine has none. The `Widgentic.Mcp` NuGet package runs it on V8.

Internally, composition now runs synchronously over entry lists with structured problems;
`composeCatalog` and `composeThemes` keep their signatures and diagnostic lines. The store limits
moved to a module without Node imports (same exported names), and the entry-size check counts
UTF-8 bytes without `Buffer`.
