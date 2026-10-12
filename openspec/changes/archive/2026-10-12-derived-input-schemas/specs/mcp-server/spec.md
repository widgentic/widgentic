## MODIFIED Requirements

### Requirement: Server assembly is a library export
The package SHALL export `createWidgenticServer(options?: { catalog?, themes? })` from the `@widgentic/mcp/sdk` entry, producing a connectable `McpServer` from the official MCP TypeScript SDK 2.x (`@modelcontextprotocol/server`) with the full wiring: the tools, the formal Apps declaration, the app-template resource, capability-aware slimming, and image inlining. The same assembly SHALL serve both protocol eras: the 2025-era revisions, and revision 2026-07-28. It does so through the SDK's serving entries (`createMcpHandler` over HTTP, `serveStdio` over stdio) and through a directly connected transport. Its MCP SDK packages SHALL be optional peer dependencies — installed only by hosts importing this entry — and the base `@widgentic/mcp` entry SHALL remain importable without any SDK present. No workspace source SHALL import the superseded 1.x SDK package `@modelcontextprotocol/sdk`. Every tool SHALL be registered with its exported definition's `inputSchema` exactly as exported, so the schemas clients read are the ones the `./host` bundle serves; the assembly SHALL restate no schema. The assembly SHALL perform no argument validation of its own: the SDK passes every call's arguments to the tool's handler unchanged, and the handler answers malformed input with its structured errors. This makes the Node assembly and every embedding host answer malformed arguments identically. With no options the assembly SHALL serve exactly the built-in kinds and built-in themes; compiled-in extras are the host's explicit choice via `catalog`.

#### Scenario: One assembly serves every transport
- **WHEN** the HTTP entry, the stdio example, and the in-memory interop tests construct their servers
- **THEN** each SHALL use the library's `createWidgenticServer`, differing only in the catalog/themes they pass and the transport they connect

#### Scenario: The default is the built-ins
- **WHEN** `createWidgenticServer()` is constructed with no options and `list_widgets` is called
- **THEN** the descriptor list SHALL contain exactly the built-in kinds

#### Scenario: The base entry stays SDK-free
- **WHEN** the modules reachable from the `@widgentic/mcp` entry are inspected
- **THEN** none SHALL import from an MCP SDK package — the SDK surface exists only behind `@widgentic/mcp/sdk`

#### Scenario: Both protocol eras through one assembly
- **WHEN** a 2026-07-28 client reaches `createWidgenticServer()` through `createMcpHandler`, and a 2025-era client reaches it through the in-memory transport
- **THEN** both SHALL list the same tools and receive the same `structuredContent` from `render_widget` for the same arguments

#### Scenario: Wire schemas are the exported definitions
- **WHEN** a client lists the tools of `createWidgenticServer()`
- **THEN** every tool's `inputSchema` SHALL deep-equal its exported definition's `inputSchema`, with no key added or removed

#### Scenario: The 1.x SDK is never imported
- **WHEN** the workspace's TypeScript sources are scanned
- **THEN** none SHALL import from `@modelcontextprotocol/sdk`, and the boundary check SHALL fail naming any file that does

### Requirement: Rendering error contract
Failures SHALL be returned as `isError: true` results whose text content is the JSON of a structured error using the existing contract vocabulary: unknown `widget` → `UNKNOWN_KIND`; missing or non-object input, missing `widget`/`data`, or invalid `hints`/`meta` → the corresponding `MISSING_FIELD`/`INVALID_TYPE` error. Error `path`s SHALL use the tool's input vocabulary (`widget`, not the payload's `kind`), and unknown-widget errors SHALL list the available kinds so recovery requires no extra round trip. A call that omits `widget` but carries a string `kind` SHALL get the `MISSING_FIELD` error on `widget` with a message that names the mix-up: `kind` is the payload's field, and the tool takes that value as `widget`. `preview_widget` SHALL answer the same way. Handlers SHALL never throw regardless of input. These errors SHALL reach clients through the server assembly unchanged, because the assembly does not validate arguments itself.

#### Scenario: Unknown widget id is correctable in one step
- **WHEN** `handleRenderWidget(catalog, { widget: "nope", data: 1 })` runs
- **THEN** the result SHALL have `isError: true`
- **AND** the parsed error SHALL have `code: "UNKNOWN_KIND"` and `path: "widget"`
- **AND** its message SHALL list the catalog's available kinds

#### Scenario: Missing data is a structured error
- **WHEN** `handleRenderWidget(catalog, { widget: "card" })` runs
- **THEN** the parsed error SHALL have `code: "MISSING_FIELD"` and `path: "data"`

#### Scenario: The payload's field name is named
- **WHEN** `render_widget` is called with `{ kind: "card", data: { title: "T" } }`
- **THEN** the result SHALL be `isError: true` with `code: "MISSING_FIELD"` and `path: "widget"`
- **AND** its message SHALL say that `kind` is the payload's field and that the value belongs in `widget`

#### Scenario: Malformed arguments reach the handler through the protocol
- **WHEN** an SDK client calls `render_widget` through `createWidgenticServer()` with `{ kind: "card", data: 1 }`, and with `{ widget: "card", data: 1, format: "pdf" }`
- **THEN** each delivered result SHALL be the handler's structured error (`MISSING_FIELD` on `widget`, `INVALID_TYPE` on `format`), not an SDK input-validation message

#### Scenario: Garbage input never throws
- **WHEN** `handleRenderWidget(catalog, x)` runs for `null`, `42`, `"str"`, and `[]`
- **THEN** each SHALL return an `isError: true` result with a structured error

### Requirement: Action execution tool
The server SHALL expose an app-only tool, `execute_action`, registered with `_meta.ui.resourceUri: "ui://widgentic/app.html"` and `_meta.ui.visibility: ["app"]` so Apps hosts hide it from the model and let the mounted widget call it; its description SHALL state that it is called by widgets, not by agents (non-Apps clients still list it — the SDK does not filter). Its input SHALL be `{ widget: string, action: string, args?: object, payload: WidgetPayload, at?: string, item?: string }` where `action` is a binding identifier (a dotted template path or `"load"`), `payload` is the ROOT payload as the frame holds it, and — when the bound element belongs to an item of a `group` render — `at` is the dotted path of that item's payload within the root (e.g. `data.items.2`) and `item` its kind. The handler SHALL: resolve the binding on the item's kind when `at` is given (otherwise on `widget`) from the caller's composed catalog (the stored template's binding at that path, or the referenced shared action) — never from the request; require the `execute` scope; validate `args` against the action's input schema; execute per the widget-actions capability (SSRF-guarded https fetch, secrets injected, response validated); apply the output mode to `payload.data`; re-validate and re-render the payload exactly as `render_widget` would; and return the same `structuredContent: { html, css, payload, tree, diagnostics? }` (with inlined images) plus the slim text line; for a group item the response folds into THAT item's data and the whole group re-renders. Failures SHALL follow the rendering error contract with codes `UNKNOWN_KIND`, `UNKNOWN_ACTION`, `ACTION_NOT_HTTP`, `FORBIDDEN_SCOPE`, `INVALID_ACTION_INPUT`, `UNKNOWN_SECRET`, `ACTION_FETCH_FAILED`, `INVALID_ACTION_OUTPUT`, `RATE_LIMITED`; every message SHALL be scrubbed of secret values. `action` SHALL be a non-empty string (`MISSING_FIELD` otherwise); `at` SHALL match `data.items.<i>` exactly (`INVALID_TYPE` otherwise); failure messages SHALL never forward store or vault error text — a fixed message is returned and the detail is logged server-side; the designer's test path (`testHttpAction`) SHALL validate the definition before doing anything and return a structured `{ ok: false, code, message, path? }` for malformed input instead of throwing. The tool's wire schema descriptions SHALL derive from `EXECUTE_ACTION_TOOL` exactly as `render_widget`'s do.

#### Scenario: The tool is declared for apps only
- **WHEN** an SDK client lists tools
- **THEN** `execute_action` SHALL carry `_meta.ui.resourceUri` for the app template and `_meta.ui.visibility: ["app"]`

#### Scenario: A refresh re-renders through the same pipeline
- **WHEN** a principal's stored widget `weather` binds a button at path `children.2` to a GET action, and `execute_action` is called with `{ widget: "weather", action: "children.2", args: { city: "Oslo" }, payload }`
- **THEN** the result's `structuredContent.tree` SHALL be the render of the merged payload and `renderToHtml(tree)` SHALL equal `structuredContent.html`
- **AND** `structuredContent.payload.data` SHALL reflect the response under the binding's output mode

#### Scenario: Unknown bindings and prompt bindings are refused
- **WHEN** `action` names a path that carries no binding, or one whose action is a `prompt`
- **THEN** the result SHALL be `isError: true` with `UNKNOWN_ACTION` or `ACTION_NOT_HTTP` respectively

#### Scenario: Another principal's widget cannot be executed
- **WHEN** principal B calls `execute_action` for a kind only principal A owns
- **THEN** the result SHALL be `UNKNOWN_KIND` and nothing SHALL be fetched

#### Scenario: An item inside a group executes against its own kind and the group re-renders
- **WHEN** a `group` renders a `weather` item whose Refresh descriptor carries `at: "data.items.0"` and `widget: "weather"`, and `execute_action` is called with `{ widget: "group", action: "children.1", at: "data.items.0", item: "weather", args, payload: <the group payload> }`
- **THEN** the binding SHALL resolve on `weather`, the response SHALL fold into `data.items[0].data`, and the result SHALL be the re-rendered GROUP with every other item unchanged

#### Scenario: Errors never carry secret values
- **WHEN** an action fails after resolving a secret and the failure text would include the value
- **THEN** the tool text SHALL contain `***` in its place

#### Scenario: Empty ids and stray locations are refused
- **WHEN** `execute_action` is called with `action: ""`, or with `at: "meta.x"`
- **THEN** the result SHALL be `MISSING_FIELD` / `INVALID_TYPE` and nothing SHALL be fetched
- **AND** an `args` that is present but not an object, or an `at` or `item` that is present but not a string, SHALL be refused with `INVALID_TYPE` on that path, never ignored, and nothing SHALL be fetched

#### Scenario: Backend errors are not echoed
- **WHEN** secret resolution throws a vault error carrying a key identifier
- **THEN** the tool text SHALL read a fixed message (no identifier) and the detail SHALL appear only in the server log

#### Scenario: A malformed test definition yields a structured result
- **WHEN** `testHttpAction` receives `{ kind: "http" }` with no `url` or `input`
- **THEN** it SHALL return `{ ok: false, code: "INVALID_ACTION_INPUT", … }` rather than throwing
