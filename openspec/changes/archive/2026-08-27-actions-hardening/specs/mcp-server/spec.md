# mcp-server — actions-hardening delta

## ADDED Requirements

### Requirement: Request bodies are bounded at the edge
The runnable HTTP server SHALL cap request bodies (default 4 MiB, configurable) and answer `413` with a JSON-RPC error for larger ones, so a round-tripped payload cannot exhaust memory.

#### Scenario: An oversized body is refused
- **WHEN** a POST body exceeds the cap
- **THEN** the response SHALL be `413` and the body SHALL NOT be buffered further

## MODIFIED Requirements

### Requirement: Action execution tool
The server SHALL expose a seventh tool, `execute_action`, registered with `_meta.ui.resourceUri: "ui://widgentic/app.html"` and `_meta.ui.visibility: ["app"]` so Apps hosts hide it from the model and let the mounted widget call it; its description SHALL state that it is called by widgets, not by agents (non-Apps clients still list it — the SDK does not filter). Its input SHALL be `{ widget: string, action: string, args?: object, payload: WidgetPayload, at?: string, item?: string }` where `action` is a binding identifier (a dotted template path or `"load"`), `payload` is the ROOT payload as the frame holds it, and — when the bound element belongs to an item of a `group` render — `at` is the dotted path of that item's payload within the root (e.g. `data.items.2`) and `item` its kind. The handler SHALL: resolve the binding on the item's kind when `at` is given (otherwise on `widget`) from the caller's composed catalog (the stored template's binding at that path, or the referenced shared action) — never from the request; require the `execute` scope; validate `args` against the action's input schema; execute per the widget-actions capability (SSRF-guarded https fetch, secrets injected, response validated); apply the output mode to `payload.data`; re-validate and re-render the payload exactly as `render_widget` would; and return the same `structuredContent: { html, css, payload, tree, diagnostics? }` (with inlined images) plus the slim text line; for a group item the response folds into THAT item's data and the whole group re-renders. Failures SHALL follow the rendering error contract with codes `UNKNOWN_KIND`, `UNKNOWN_ACTION`, `ACTION_NOT_HTTP`, `FORBIDDEN_SCOPE`, `INVALID_ACTION_INPUT`, `UNKNOWN_SECRET`, `ACTION_FETCH_FAILED`, `INVALID_ACTION_OUTPUT`, `RATE_LIMITED`; every message SHALL be scrubbed of secret values. `action` SHALL be a non-empty string (`MISSING_FIELD` otherwise); `at` SHALL match `data.items.<i>` exactly (`INVALID_TYPE` otherwise); failure messages SHALL never forward store or vault error text — a fixed message is returned and the detail is logged server-side; the designer's test path (`testHttpAction`) SHALL validate the definition before doing anything and return a structured `{ ok: false, code, message, path? }` for malformed input instead of throwing. The tool's wire schema descriptions SHALL derive from `EXECUTE_ACTION_TOOL` exactly as `render_widget`'s do.

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

#### Scenario: Backend errors are not echoed
- **WHEN** secret resolution throws a vault error carrying a key identifier
- **THEN** the tool text SHALL read a fixed message (no identifier) and the detail SHALL appear only in the server log

#### Scenario: A malformed test definition yields a structured result
- **WHEN** `testHttpAction` receives `{ kind: "http" }` with no `url` or `input`
- **THEN** it SHALL return `{ ok: false, code: "INVALID_ACTION_INPUT", … }` rather than throwing

### Requirement: Execute scope and rate limiting at the edge
The runnable HTTP server SHALL derive the caller's scopes from the resolved key and SHALL refuse `execute_action` with `FORBIDDEN_SCOPE` for callers without `execute` — the anonymous principal included. It SHALL enforce a per-principal rate limit on `execute_action` (default 60 executions per minute, configurable by environment), answering excess calls with `RATE_LIMITED` without executing them, and SHALL note limited calls on stderr without key material. When the caller lacks `execute`, `render_widget` results SHALL still render http-bound elements but mark their descriptors `disabled: "scope"` and SHALL omit `structuredContent.load`, so the frame shows the affordance as unavailable instead of failing on click. A non-numeric or non-finite `WIDGENTIC_EXECUTE_RATE` SHALL fall back to the default rather than producing a limiter that refuses everything, and the limiter SHALL tolerate a clock stepping backwards.

#### Scenario: Anonymous callers cannot execute
- **WHEN** a request without a resolvable key calls `execute_action`
- **THEN** the result SHALL be `FORBIDDEN_SCOPE` and no outbound request SHALL be made

#### Scenario: Excess calls are limited, not executed
- **WHEN** a principal exceeds the configured executions per minute
- **THEN** further calls in that window SHALL return `RATE_LIMITED` immediately

#### Scenario: A read-only key sees disabled actions
- **WHEN** a key with only `read` renders a widget with an http button and a `load`
- **THEN** the button's descriptor SHALL carry `disabled: "scope"` and the result SHALL have no `structuredContent.load`

#### Scenario: A misconfigured rate never fails closed
- **WHEN** `WIDGENTIC_EXECUTE_RATE=garbage`
- **THEN** executions SHALL proceed under the default rate

### Requirement: App template action layer
The app template SHALL act on action descriptors the way it already acts on links: a delegated listener on `[data-wg-action]` elements (clicks; Enter/Space on any focused host — non-button hosts, action anchors included, SHALL be made focusable with `tabindex="0"` and `role="button"` by the template) that parses and validates the descriptor and never evaluates anything from it. Until the first complete `tool-result` has rendered, and during any streaming preview, descriptors SHALL be inert. For `kind: "prompt"` the template SHALL send `ui/message` with `role: "user"` and one text block carrying the descriptor's text — always enabled (the probe found hosts that support the method without advertising it), with a JSON-RPC error response (`-32601` included) surfacing as an inline alert inside the frame. For `kind: "http"` the template SHALL call `tools/call` `execute_action` with `{ widget: payload.kind, action: id, args, payload }` — enabled only when the initialize result advertised `hostCapabilities.serverTools`, otherwise rendered disabled with an explanatory `title`; descriptors marked `disabled` by the server SHALL render disabled with their reason. While a call is in flight the widget root SHALL carry `aria-busy="true"` and a `wg-busy` class (a pulsing overlay drawn from the status tokens) and the triggering element SHALL be disabled; concurrent activations SHALL be ignored. On success the returned `structuredContent` SHALL be rendered through the same in-place mounter as a tool-result, the frame's held payload SHALL be replaced, and one `ui/update-model-context` SHALL follow carrying both a text block and `structuredContent` (each capped at 8 KiB, truncated with a marker). On failure the previous render SHALL stay, the error text (from the tool result or the JSON-RPC error) SHALL appear in an inline `wg-app-alert` element that the next successful action clears, and the model-context update SHALL NOT be sent. When `structuredContent.load` is present on the first complete tool-result, the template SHALL execute it exactly once per widget instance (never on partial input, never again after a re-render), with the same in-flight, success and failure behavior. Actions on the `format: "app"` embedded page and any surface without the bridge SHALL be inert. The layer SHALL further: never lose a `load` because the first result arrived before the initialize response (the load fires once capabilities are known); discard an in-flight result whose cycle was reset by `tool-input`/`tool-cancelled`; time out a pending action request (30 s) into the alert, clearing the busy state; clear the alert on `tool-input`, `tool-cancelled` and any host-driven render; preserve an author-set `title` (restoring it when the element becomes live again) and remove a stale disabled tooltip; stop a handled activation from also reaching the link interceptor when the element sits inside an `<a href>`; and send one model-context update after a load chain rather than one per item.

#### Scenario: A prompt proposes a message
- **WHEN** a mounted button with a `prompt` descriptor is clicked
- **THEN** the template SHALL send `ui/message` `{ role: "user", content: [{ type: "text", text: <descriptor text> }] }`
- **AND** the widget SHALL remain rendered whatever the host answers

#### Scenario: An http action round-trips and updates the model
- **WHEN** a mounted button with an `http` descriptor is clicked on a host that advertised `serverTools`
- **THEN** the template SHALL call `tools/call` `execute_action` with the descriptor's id and args and the frame's current payload
- **AND** on success SHALL patch the DOM in place from the returned tree, hold the returned payload, and send one `ui/update-model-context` with a text block and `structuredContent`

#### Scenario: Missing serverTools disables http actions up front
- **WHEN** the initialize result carries no `serverTools`
- **THEN** every `http` descriptor element SHALL be rendered disabled with a `title` explaining the host cannot run widget actions, and prompt elements SHALL stay enabled

#### Scenario: Unsupported prompt surfaces an alert
- **WHEN** the host answers `ui/message` with a JSON-RPC error
- **THEN** the frame SHALL show a `wg-app-alert` with the message and keep the widget intact

#### Scenario: In-flight state blocks re-entry
- **WHEN** an http action is in flight and the same element is clicked again
- **THEN** no second `tools/call` SHALL be sent, the root SHALL carry `aria-busy="true"` and `wg-busy`, and the element SHALL be disabled until the call settles

#### Scenario: Failure keeps the old render
- **WHEN** `execute_action` returns `isError: true`
- **THEN** the DOM SHALL be unchanged, a `wg-app-alert` SHALL show the error text, and no model-context update SHALL be sent

#### Scenario: Load fires once
- **WHEN** the first complete tool-result carries `structuredContent.load` and a later in-place re-render occurs
- **THEN** `execute_action` SHALL have been called with `action: "load"` exactly once for the instance

#### Scenario: Descriptors are inert before the first result
- **WHEN** a click lands on a `[data-wg-action]` element during a streaming preview
- **THEN** nothing SHALL be sent to the host

#### Scenario: Action anchors are keyboard reachable
- **WHEN** an `a` element carries an action descriptor
- **THEN** it SHALL be focusable, expose `role="button"`, and Enter or Space SHALL activate it exactly like a click

#### Scenario: A result that beats initialize still loads
- **WHEN** `tool-result` with `structuredContent.load` arrives before the `ui/initialize` response
- **THEN** the load SHALL fire once the response advertises `serverTools`

#### Scenario: Stale results are dropped
- **WHEN** an execute call is in flight and `tool-input` starts a new cycle before it settles
- **THEN** the late result SHALL neither mount nor update the model context

#### Scenario: A silent host cannot freeze the widget
- **WHEN** the host never answers an action's `tools/call`
- **THEN** after the timeout the busy state SHALL clear and an alert SHALL explain the failure

#### Scenario: Titles and alerts are restored and cleared
- **WHEN** a disabled element becomes live (or carried an author `title` before being disabled)
- **THEN** its `title` SHALL be the author's again
- **AND WHEN** a new tool-input arrives after a failed action
- **THEN** the alert SHALL be hidden

### Requirement: Action notes in model-facing output
Because the model never sees the frame, every `render_widget` and `execute_action` text output SHALL end with an `Action notes:` tail whenever the rendered widget carries action descriptors, stating how many http and prompt actions it has and how they behave (http actions run server-side when the user activates them, the widget re-renders itself and posts its new data to the model's context; prompt actions propose a message in the user's composer; the model does not call `execute_action` itself), whether the widget loads data on first render, and — when http descriptors are disabled — the reason in plain terms: `scope` (this API key lacks `execute`; the user can create an execute key in the app) or `unresolved` (the widget references an action the user has not saved). Renders without actions SHALL carry no tail. The `list_widgets` tool description SHALL instruct agents to call it fresh whenever the user asks what is available or mentions saving in the designer, never answering from an earlier listing, because catalogs are per key and change between calls. The authoring guide SHALL document the action vocabulary, the `disabled` reasons and the `execute` scope. Counts SHALL be per BINDING (a descriptor repeated by `each` counts once) and the sentence SHALL agree grammatically in number.

#### Scenario: A read-only key's render explains the disabled buttons
- **WHEN** a key with only `read` renders a widget with one http and one prompt binding
- **THEN** the text output SHALL end with an `Action notes:` tail saying the http action is disabled because the key lacks the `execute` scope and that the prompt action still works

#### Scenario: An execute key's render explains the live actions
- **WHEN** a key with `execute` renders the same widget with a `load` binding
- **THEN** the tail SHALL say the http action runs server-side on activation and re-renders the widget, that the widget loads data on first render, and that the agent does not call `execute_action` itself

#### Scenario: Plain widgets carry no tail
- **WHEN** a widget without bindings renders
- **THEN** the text SHALL contain no `Action notes:`

#### Scenario: Repeated rows count once
- **WHEN** one bound button renders in twenty `each` rows
- **THEN** the tail SHALL say `1 http action`, not twenty
