## 1. Server assembly

- [x] 1.1 `server.ts`: `fromDefinition(tool)`, a pass-through Standard Schema over the exported `inputSchema` (D1). Register all nine tools with it (D2), and drop zod.
- [x] 1.2 Module header and comments describe current behavior: schemas from the definitions, validation in the handlers.

## 2. Handlers

- [x] 2.1 `handleRenderWidget` and `handlePreviewWidget`: when `widget` is missing and `kind` is a string, the `MISSING_FIELD` message names the mix-up and the value to pass (D3).
- [x] 2.2 `handleExecuteAction`: refuse a present non-object `args`, and a present non-string `at` or `item`, with `INVALID_TYPE` on that path, before any scope check or fetch (D4).
- [x] 2.3 Conformance corpus: cases for the mix-up on both tools; regenerate with `npm run conformance:generate`.

## 3. Packaging

- [x] 3.1 `@widgentic/mcp`: drop the `zod` peer and its meta entry (D5). The boundary test asserts the MCP peers are exactly server and ext-apps.
- [x] 3.2 Docs: the packages page and the `packages/mcp` README peer rows, and CLAUDE.md's boundaries line.

## 4. Tests

- [x] 4.1 `server-wiring`: every tool's `inputSchema` in `tools/list` deep-equals its exported definition's.
- [x] 4.2 `sdk-interop`: `{ kind, data }` and an unknown `format` reach the handler through the protocol and come back as its structured errors.
- [x] 4.3 Handler tests: the mix-up message on both tools; the `execute_action` refusals with nothing fetched.
- [x] 4.4 The .NET suite against the regenerated corpus.

## 5. Release and records

- [x] 5.1 Changeset: minor `@widgentic/mcp`.
- [ ] 5.2 TESTING log entry (done); BACKLOG AGT-4 removed at archive.
- [x] 5.3 Gate: typecheck, `npm test`, build, `pack:check`, `openspec validate`, `dotnet test`.

## 6. Staging

- [ ] 6.1 Stage on `demo.widgentic.dev` from this branch (`Dockerfile.source`) and read the served bytes: the listing equals the definitions, and a raw `{ kind, data }` call gets the named error.
- [ ] 6.2 Owner host retest on staging, in fresh conversations.
