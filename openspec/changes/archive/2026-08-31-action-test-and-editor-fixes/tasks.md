## 1. Test call

- [x] 1.1 `packages/mcp/src/server/actions.ts`: `testHttpAction` applies `{ mode: "replace" }` instead of `undefined`, with a comment naming why (binding-level fold, absent at action-authoring time).
- [x] 1.2 Tests: an action whose output schema is an array/scalar passes with the redacted response; a schema-violating response still fails `INVALID_ACTION_OUTPUT`; existing guard/secret/budget tests untouched.

## 2. Action editor

- [x] 2.1 `packages/designer/src/action-editor.ts`: Kind and Method in one `wgd-row` for http; prompt unchanged; URL keeps its row.
- [x] 2.2 Editor test asserting the combined row (both selects under one row container).

## 3. Secrets UX (same session's findings)

- [x] 3.1 `packages/mcp/src/secrets/envelope.ts`: the value messages say characters, with the byte measure and the why in parentheses — "at least 8 characters (UTF-8 bytes; anything shorter is a guessable token)" / "exceeds 4096 characters (UTF-8 bytes)". Codes unchanged.
- [x] 3.2 `examples/docker/index.html`: the secret-name input enforces the rule at the form (`pattern`, `autocapitalize=off`) and both secret inputs carry `title` hints naming the rules; the server stays the authority.

## 4. Ship

- [x] 4.1 Changeset: patch `@widgentic/mcp` + `@widgentic/designer`.
- [x] 4.2 Gate: typecheck, `npm test`, build, pack:check; `openspec validate --strict`.
