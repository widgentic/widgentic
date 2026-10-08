## 1. Template size budget and baseline (BACKLOG RND-4)

- [x] 1.1 Record the baseline before any change: `buildAppTemplate()` raw and gzipped (level 9) bytes, and mount time in the real-browser rig (headless Chrome over CDP, as `tools/probe-computed.mjs` does) for a 200-row table and a 200-node tree delivered as a `tool-result`; keep the numbers for the `TESTING.md` entry (task 9.5).
- [x] 1.2 `packages/mcp/src/server/__tests__`: size-budget test pinning 45,056 bytes raw and 13,312 bytes gzipped (design D1); the failure message names the measured size and the budget.
- [x] 1.3 `packages/mcp/src/server/app-template.ts`: build-time pass over the bridge that trims leading whitespace and drops empty lines and full-line `//` comments (design D1); a test asserts the served script contains no full-line comment and that the source bridge contains no backtick (the invariant that makes the pass safe).
- [x] 1.4 Load the stripped template in the real-browser rig and confirm the bridge runs (handshake sent, a `tool-result` mounts); jsdom does not catch parse-level failures.

## 2. Keys in the render tree and the core patcher (RND-1)

- [x] 2.1 `packages/core/src/catalog/node.ts`: `WidgetElementNode.key?: string`; module header describes it as render-tree data that output layers never emit.
- [x] 2.2 `renderToHtml` and the catalog DOM layer ignore `key`; test that a keyed tree serializes identically to the same tree with keys removed and that no DOM attribute carries a key (widget-catalog "Keys are invisible in the HTML").
- [x] 2.3 `widgets/table.ts`: key body rows from record `id` per design D4 (all records objects, string or finite-number `id`, distinct as strings); tests for the keyed, missing-id and `1`/`"1"` collision scenarios.
- [x] 2.4 `widgets/tree.ts`: the same rule per sibling list on `li.wg-tree-node`; tests for a keyed root list with an unkeyed child list.
- [x] 2.5 Patcher fixture table (design D3) in `packages/mcp/src/server/__tests__/`, driving both patchers in one suite (core's through `mountWidget` with a pass-through fixture kind, the bridge's through `bootTemplate()`): sequences covering keyed reverse, `[a,b,c] → [c,d,a]`, insertion, removal, duplicate keys, an unkeyed element in the list, text children, and a tag change under a key. Lands with 6.4.
- [x] 2.6 `packages/core/src/reactive/diff.ts`: keyed reconciliation when every child of both lists is a uniquely keyed element, positional otherwise (design D3); never sets a key on the DOM.
- [x] 2.7 Core reactive tests from the fixture table plus the reactive-rendering scenarios: keyed rows keep identity through a reorder; a visitor-opened branch for `id: "b"` stays open after `a`/`b` swap; add/remove by key; positional fallback; keys never reach the DOM; every pre-existing scenario still passes unchanged.

## 3. Keyed `each` in templates (RND-1)

- [x] 3.1 `packages/core/src/templates/types.ts`: optional `key` on the each node type.
- [x] 3.2 `validate.ts`: `key` must be a string (`INVALID_TEMPLATE_NODE`) with valid path syntax (`INVALID_PATH`), at the node's path.
- [x] 3.3 `compile.ts`: resolve `key` in the item scope; key an iteration's output only when it is exactly one element and the value is a string or finite number; never key the `empty` branch.
- [x] 3.4 Tests: keyed iterations (`"A1"`, `"42"`); multi-node iterations unkeyed; invalid keys refused; HTML identical with and without `key`; a keyed template widget reorders in place through `mountWidget`.

## 4. Partial-data renders in the catalog (supports RND-2)

- [x] 4.1 `packages/core/src/catalog/registry.ts`: `render(payload, options?: { partialData?: boolean })`; skip the descriptor data-schema check when set, threaded through group recursion (design D6); contract validation unchanged.
- [x] 4.2 Tests: a required-field kind renders `Ada` with the option and fails without it; a group item inherits it; a missing `kind` still yields `MISSING_FIELD`.

## 5. `preview_widget` tool (RND-2)

- [x] 5.1 `packages/mcp/src/server/definitions.ts`: `PREVIEW_WIDGET_TOOL` (name, description saying the app template calls it while input streams and agents should not, input schema `{ widget, data?, hints?, meta?, theme? }`); the docs generator's tool list gains it in 9.2.
- [x] 5.2 `handlers.ts`: handler composing the caller's catalog like `render_widget`, rendering with `partialData: true`, returning `structuredContent: { tree, css }` plus a one-line text; no inlining, diagnostics, `load` or payload; an unresolvable theme is dropped; contract errors follow the rendering error contract.
- [x] 5.3 `server.ts`: register it with `_meta.ui.resourceUri` and `_meta.ui.visibility: ["app"]`; add the `previewRateLimit?: () => boolean` option answering `RATE_LIMITED` when it returns `false` (design D7).
- [x] 5.4 `examples/docker/mcp.ts`: a separate per-principal limiter from `WIDGENTIC_PREVIEW_RATE` (default 240 per minute, `positiveIntFromEnv` fallback) wired to `previewRateLimit`.
- [x] 5.5 Tests (handler and SDK interop): the app-only declaration; an incomplete `person` previews while `render_widget` still fails the schema check; an `https` image is never fetched and keeps its URL; another principal's kind is `UNKNOWN_KIND`; excess calls return `RATE_LIMITED`; `WIDGENTIC_PREVIEW_RATE=garbage` falls back to the default.
- [x] 5.6 Update `tools/exports.test.ts` snapshots for the new exports and review the diff.

## 6. Server previews in the app template (RND-2)

- [ ] 6.1 Probe first, from the apps repository on an instrumented deploy (or `npm link` against basic-host locally): does a `tools/call` sent during `tool-input-partial` resolve before the tool result on claude.ai, VS Code Copilot Chat, ChatGPT and basic-host? Record the outcome per host for the host matrix (task 9.3). The feature ships either way because every failure path keeps the skeleton.
- [x] 6.2 Bridge: for a snapshot naming any non-built-in kind (alone or as a group item) with `serverTools` available, request `preview_widget`; one request in flight, one pending slot holding the latest snapshot, sent when the previous settles; mount a successful `tree` and apply its `css` through the existing preview path (in-progress marker); end requests for the render on error, timeout, `RATE_LIMITED`, missing `serverTools` or host rejection; clear the slot on the tool result and discard late answers; reset on `tool-cancelled`.
- [x] 6.3 `bootTemplate()` tests for every new App template loader scenario: custom kinds preview through the server; one request in flight carrying the latest of three snapshots; failures keep the skeleton and stop requests; no request after the result and late answers discarded; a group with a custom item previews through the server, showing the client preview with a skeleton until the answer; "Custom kinds never get a guessed preview" with its new wording.
- [x] 6.4 Bridge keyed patch: port design D3 to the inline `patch()`; run the shared fixture table (task 2.5) through the bridge and assert the same DOM and the same preserved nodes as the core patcher ("The template's patcher agrees with the core patcher"); test "Keyed results reorder in place".

## 7. Occurrence-aware inlining (RND-3)

- [x] 7.1 `packages/mcp/src/server/inline-images.ts`: rank occurrences by shape class (hero 3; thumb, avatar or unclassed 2; icon 1), group by URL (count, best rank, first index), sort, fetch the first 24, admit within a 3 MiB budget charged as data-URI length × occurrences, skipping sources that do not fit (design D8); keep the declared-domain skip and the lockstep rewrite of every surface.
- [x] 7.2 One stderr note per render when sources stay external, counts only (fetch cap, byte budget), no URLs; nothing added to model-facing output or diagnostics.
- [x] 7.3 Tests: a hero outranks 30 earlier icons (hero plus the first 23 icons fetched); a 20,000-character icon on 200 nodes stays external while a 100 KB hero inlines; the updated "Overflow beyond the cap is deterministic" scenario; the stderr note carries counts and no URL; every pre-existing inlining scenario still passes.

## 8. Designer (RND-1)

- [x] 8.1 `packages/designer` template tree: a compact key input on `each` rows beside the path, completions from the item scope (the paths offered to binds inside that `each`); an emptied input deletes `key`; validators run on edit.
- [x] 8.2 Designer tests: typing `sku` sets `key` and shows it in the JSON pane; clearing removes the property; completions offer `sku` and `name` for `{ each: "lines" }`; an invalid key shows `INVALID_PATH` beside the row.

## 9. Guide, docs and bookkeeping

- [x] 9.1 `packages/mcp/src/server/guide.ts`: the EACH form line documents the optional `key` and what it is for (records that can be reordered by an action); the authoring guide test follows.
- [x] 9.2 `npm run docs:generate` and review the diff: the template DSL reference carries `key`; the MCP tools reference lists nine tools including `preview_widget`.
- [x] 9.3 Hand-written docs: the eight-tool counts (README capability row and tool list, `docs/index.mdx`, `docs/get-started/what-is-widgentic.mdx`, `docs/develop/mcp-tools.mdx`, `docs/develop/packages.mdx`, `docs/reference/index.mdx`); `docs/how-it-works/inline-rendering.mdx` (custom-kind server previews, the priority order and byte budget); `docs/how-it-works/host-matrix.mdx` (server previews call `preview_widget` during streaming, marked not yet probed); `docs/design/template-dsl.mdx` (keyed `each`); `docs/develop/self-hosting.mdx` (`WIDGENTIC_PREVIEW_RATE`).
- [x] 9.4 Changesets: `@widgentic/core` (element `key`, table/tree keys, keyed `each`, keyed patcher, `partialData`), `@widgentic/designer` (key input), `@widgentic/mcp` (`preview_widget`, template keyed patch and previews, size budget, inlining order and budget).
- [x] 9.5 `TESTING.md`: a dated verification-log entry with the before/after template sizes and mount times, the real-browser checks (1.4, keyed reorder and preview in a browser), and the probe outcome.
- [ ] 9.7 After 6.1: replace the host matrix's "not yet probed" line with each host's outcome.
- [x] 9.6 `BACKLOG.md`: delete RND-1 to RND-4 and the "Rendering and the app template" section, and drop their summary rows.

## 10. Gate

- [x] 10.1 `npm run typecheck`, `npm test`, `npm run build`, `npm run pack:check`, `openspec validate --strict rendering-app-template`, `openspec validate --specs`, `npm run docs:check` — all green.
