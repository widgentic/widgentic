## 1. The listing tool

- [x] 1.1 `packages/mcp/src/server/definitions.ts`: add `LIST_ACTIONS_TOOL` beside `LIST_SCHEMAS_TOOL` — zero-arg `inputSchema`, and a description that tells agents to bind a listed action by name (`action: { "ref": "<name>" }`), says the listing is the contract (no URL or headers) and that an action the user has not saved is DESCRIBED for the designer, never invented, and states the per-key/anonymous behavior.
- [x] 1.2 `handlers.ts`: `StoredActionEntry` (`{ name, label?, description?, kind, method?, input?, output? }`) and `handleListActions(source)` over a LAZY source of the STORED entries, returning `{ actions, rules }` with the same steering as the wire description (design A4). The handler projects (design A10): it drops `url`, `headers` and `query` (A1) and keeps `method` (A2).
- [x] 1.3 `server.ts`: a `sharedActions?: () => Promise<StoredAction[]>` option documented as lazy — `actions` was already the execution binding source — and the `registerTool` call mirroring `list_schemas`.
- [x] 1.4 `server/index.ts` barrel: export `LIST_ACTIONS_TOOL`, `handleListActions` and the entry type.
- [x] 1.5 Wire the source at the edges: `examples/docker/mcp.ts` passes `() => store.actions(principalId)`; the stdio example has no store (its actions are compiled-in and inline), so it passes nothing and serves the specified empty list — its banner names the new tool.

## 2. Tests for the listing

- [x] 2.1 Handler tests: a principal's http and prompt actions listed with `name`/`kind` (and `method`/`input`/`output` for http); an absent source yields an empty list, not an error.
- [x] 2.2 The transport-never-leaves test (spec scenario): a stored action carrying `url`, fixed `query` and `headers` with a `{ secret }` reference — assert the SERIALIZED result contains none of those names or values.
- [x] 2.3 An invalid stored action is omitted while the valid ones list (spec scenario) — drive it through a store whose read validation rejects one entry.
- [x] 2.4 `sdk-interop.test.ts`: add `list_actions` to the tool-name assertion (7 → 8) and an end-to-end call over the protocol, modelled on the `list_schemas` case.
- [x] 2.5 A render does not read the action source (spec scenario): construct a server with a counting source, call `render_widget`, assert zero reads; then call `list_actions` and assert one.

## 3. The authoring guide

- [x] 3.1 `guide.ts`: a `sharedAction` section between `sharedSchema` and `theme` — the entry shape `{ name, label?, description?, definition }`, both definition kinds, the name pattern read from `ACTION_NAME.source` (never typed), and the Actions-section import path with the same draft → import → reference workflow the schema section teaches.
- [x] 3.2 The three steering twins: `workflow.related` names `list_actions`; the template `actions` rules point at it for discovery and state the "describe, don't invent" rule; the binding note documents `action: { ref, input?, output? }` and the widget-level `load` (http `GET` only).
- [x] 3.3 Add `maxSchemas` and `maxActions` to the guide's `limits`, derived from `DEFAULT_LIMITS` like the four already there.
- [x] 3.4 Guide tests, cloned from the shared-schema pair: the section documents the shape and the import path; the rules steer to `list_actions` and forbid invention; the name pattern equals `ACTION_NAME.source`; the limits equal the store defaults. Refresh the "carries the five sections" describe title if it is now misleading.
- [x] 3.5 Agent-simulation check: a widget drafted from the guide alone, binding a listed action by `ref`, passes the store's write validation unchanged.

## 4. Adapter polish

- [x] 4.1 `packages/mcp/src/authoring/node.ts`: contain a rejecting `resolveContext` — answer the surface's structured `INTERNAL` refusal, report through `deps.log`, let nothing escape, and name no detail of the host's failure (design A9).
- [x] 4.2 Regression test: a resolve callback that rejects yields that refusal with the log sink called once, and the same request through the core is unaffected.

## 5. Docs and surface bookkeeping

- [x] 5.1 `tools/docs-generate.ts`: add the tool to the `TOOLS` array, correct the "seven tools" frontmatter, and add the authoring-contract block that renders the new guide section (its readers drop an untaught key silently — design A7).
- [x] 5.2 `tools/exports.test.ts` snapshot: the two new export names appear in the `@widgentic/mcp` block and nowhere else.
- [x] 5.3 `README.md` capability row: eight tools, `execute_action` included, `list_actions` named.
- [x] 5.4 Hand-written docs that list tools: `docs/develop/mcp-tools.mdx` and `docs/design/authoring-with-an-agent.mdx`.
- [x] 5.5 `TESTING.md`: the protocol smoke's tool count and a dated verification-log entry.
- [x] 5.6 Changeset: minor for `@widgentic/mcp` (new tool surface, guide section, adapter fix).

## 6. Gate

- [x] 6.1 `npm run typecheck`, `npm test`, `npm run build`, `npm run pack:check` all green.
- [x] 6.2 `openspec validate --strict agent-visible-actions` and `openspec validate --specs`.
- [x] 6.3 Run the example MCP server and call `list_actions` and `get_authoring_guide` over the protocol against a store holding one http and one prompt action; confirm by reading the RESULT bytes that the contract is present and the transport is absent.

## 7. Review closure (8-angle code review on the diff)

- [x] 7.1 Reuse: `StoredActionLike` collapsed into core's `StoredAction`; `logSink`/`internalRefusal`/`storeRefusal` extracted in the authoring core and reused by the adapter; the `as () => Promise<never[]>` test cast removed; the guide's binding rule keeps its steering but points at `sharedAction.workflow` for the rationale.
- [x] 7.2 Behavior: a host `resolveContext` throwing a store rejection keeps the mapped status/code (spec delta amended, regression test); prompt entries carry `binds` and every steering text states that a prompt ref takes no input mapping (spec delta amended, tests); `handleListActions` drops a malformed entry instead of failing the call.
- [x] 7.3 Conventions: node.ts module header describes the containment; the two history comments trimmed; the fixture no longer resembles a production resource name; new adapter tests use `listen()` with try/finally; the guide test asserts the `load` (http GET only) clause.
- [x] 7.4 Docs sweep the proposal missed: `docs/index.mdx`, `docs/develop/packages.mdx`, `docs/get-started/keys-and-scopes.mdx` (read-scope row + anonymous lists), `docs/how-it-works/per-principal-catalogs.mdx`, `docs/how-it-works/trust-model.mdx`, `docs/develop/run-your-own-server.mdx` (options table + wiring snippet), `docs/develop/mcp-tools.mdx` body sentence, `docs/get-started/connect-a-host.mdx` Copilot count, the README stdio banner; the generated limits page gains the schema/action caps and the MCP-tools frontmatter derives its count from `TOOLS.length`; the `docs-site` spec's "seven MCP tools" fixed via its own delta.
- [x] 7.5 `TESTING.md` smoke rewritten: positive assertion first (an unwired source lists `[]` and passes any absence check vacuously), then the absence of the action's OWN transport values (a blanket `https://` grep false-positives on `$schema` URLs).
- [x] 7.6 Declined with reasons: memoizing the docker example's per-request `actions()` read (mirrors the existing `schemas` pattern; example simplicity wins), module-scope guide stringify caching (pre-existing pattern, spec favors call-time derivation), merging the two interop `connectWith` helpers (consistent with the existing suite's shape). Routed to backlog: `execute_action` failure text can name the target hostname (`guarded-fetch.ts`) while the listing withholds it — pre-existing, execute-scope only.
