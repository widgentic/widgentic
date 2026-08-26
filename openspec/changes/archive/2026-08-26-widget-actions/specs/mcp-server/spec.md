# mcp-server — widget-actions delta

## ADDED Requirements

### Requirement: Action execution tool
The server SHALL expose a seventh tool, `execute_action`, registered with `_meta.ui.resourceUri: "ui://widgentic/app.html"` and `_meta.ui.visibility: ["app"]` so Apps hosts hide it from the model and let the mounted widget call it; its description SHALL state that it is called by widgets, not by agents (non-Apps clients still list it — the SDK does not filter). Its input SHALL be `{ widget: string, action: string, args?: object, payload: WidgetPayload, at?: string, item?: string }` where `action` is a binding identifier (a dotted template path or `"load"`), `payload` is the ROOT payload as the frame holds it, and — when the bound element belongs to an item of a `group` render — `at` is the dotted path of that item's payload within the root (e.g. `data.items.2`) and `item` its kind. The handler SHALL: resolve the binding on the item's kind when `at` is given (otherwise on `widget`) from the caller's composed catalog (the stored template's binding at that path, or the referenced shared action) — never from the request; require the `execute` scope; validate `args` against the action's input schema; execute per the widget-actions capability (SSRF-guarded https fetch, secrets injected, response validated); apply the output mode to `payload.data`; re-validate and re-render the payload exactly as `render_widget` would; and return the same `structuredContent: { html, css, payload, tree, diagnostics? }` (with inlined images) plus the slim text line; for a group item the response folds into THAT item's data and the whole group re-renders. Failures SHALL follow the rendering error contract with codes `UNKNOWN_KIND`, `UNKNOWN_ACTION`, `ACTION_NOT_HTTP`, `FORBIDDEN_SCOPE`, `INVALID_ACTION_INPUT`, `UNKNOWN_SECRET`, `ACTION_FETCH_FAILED`, `INVALID_ACTION_OUTPUT`, `RATE_LIMITED`; every message SHALL be scrubbed of secret values.

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

### Requirement: Execute scope and rate limiting at the edge
The runnable HTTP server SHALL derive the caller's scopes from the resolved key and SHALL refuse `execute_action` with `FORBIDDEN_SCOPE` for callers without `execute` — the anonymous principal included. It SHALL enforce a per-principal rate limit on `execute_action` (default 60 executions per minute, configurable by environment), answering excess calls with `RATE_LIMITED` without executing them, and SHALL note limited calls on stderr without key material. When the caller lacks `execute`, `render_widget` results SHALL still render http-bound elements but mark their descriptors `disabled: "scope"` and SHALL omit `structuredContent.load`, so the frame shows the affordance as unavailable instead of failing on click.

#### Scenario: Anonymous callers cannot execute
- **WHEN** a request without a resolvable key calls `execute_action`
- **THEN** the result SHALL be `FORBIDDEN_SCOPE` and no outbound request SHALL be made

#### Scenario: Excess calls are limited, not executed
- **WHEN** a principal exceeds the configured executions per minute
- **THEN** further calls in that window SHALL return `RATE_LIMITED` immediately

#### Scenario: A read-only key sees disabled actions
- **WHEN** a key with only `read` renders a widget with an http button and a `load`
- **THEN** the button's descriptor SHALL carry `disabled: "scope"` and the result SHALL have no `structuredContent.load`

### Requirement: App template action layer
The app template SHALL act on action descriptors the way it already acts on links: a delegated listener on `[data-wg-action]` elements (clicks; Enter/Space on focused buttons) that parses and validates the descriptor and never evaluates anything from it. Until the first complete `tool-result` has rendered, and during any streaming preview, descriptors SHALL be inert. For `kind: "prompt"` the template SHALL send `ui/message` with `role: "user"` and one text block carrying the descriptor's text — always enabled (the probe found hosts that support the method without advertising it), with a JSON-RPC error response (`-32601` included) surfacing as an inline alert inside the frame. For `kind: "http"` the template SHALL call `tools/call` `execute_action` with `{ widget: payload.kind, action: id, args, payload }` — enabled only when the initialize result advertised `hostCapabilities.serverTools`, otherwise rendered disabled with an explanatory `title`; descriptors marked `disabled` by the server SHALL render disabled with their reason. While a call is in flight the widget root SHALL carry `aria-busy="true"` and a `wg-busy` class (a pulsing overlay drawn from the status tokens) and the triggering element SHALL be disabled; concurrent activations SHALL be ignored. On success the returned `structuredContent` SHALL be rendered through the same in-place mounter as a tool-result, the frame's held payload SHALL be replaced, and one `ui/update-model-context` SHALL follow carrying both a text block and `structuredContent` (each capped at 8 KiB, truncated with a marker). On failure the previous render SHALL stay, the error text (from the tool result or the JSON-RPC error) SHALL appear in an inline `wg-app-alert` element that the next successful action clears, and the model-context update SHALL NOT be sent. When `structuredContent.load` is present on the first complete tool-result, the template SHALL execute it exactly once per widget instance (never on partial input, never again after a re-render), with the same in-flight, success and failure behavior. Actions on the `format: "app"` embedded page and any surface without the bridge SHALL be inert.

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

### Requirement: Action notes in model-facing output
Because the model never sees the frame, every `render_widget` and `execute_action` text output SHALL end with an `Action notes:` tail whenever the rendered widget carries action descriptors, stating how many http and prompt actions it has and how they behave (http actions run server-side when the user activates them, the widget re-renders itself and posts its new data to the model's context; prompt actions propose a message in the user's composer; the model does not call `execute_action` itself), whether the widget loads data on first render, and — when http descriptors are disabled — the reason in plain terms: `scope` (this API key lacks `execute`; the user can create an execute key in the app) or `unresolved` (the widget references an action the user has not saved). Renders without actions SHALL carry no tail. The `list_widgets` tool description SHALL instruct agents to call it fresh whenever the user asks what is available or mentions saving in the designer, never answering from an earlier listing, because catalogs are per key and change between calls. The authoring guide SHALL document the action vocabulary, the `disabled` reasons and the `execute` scope.

#### Scenario: A read-only key's render explains the disabled buttons
- **WHEN** a key with only `read` renders a widget with one http and one prompt binding
- **THEN** the text output SHALL end with an `Action notes:` tail saying the http action is disabled because the key lacks the `execute` scope and that the prompt action still works

#### Scenario: An execute key's render explains the live actions
- **WHEN** a key with `execute` renders the same widget with a `load` binding
- **THEN** the tail SHALL say the http action runs server-side on activation and re-renders the widget, that the widget loads data on first render, and that the agent does not call `execute_action` itself

#### Scenario: Plain widgets carry no tail
- **WHEN** a widget without bindings renders
- **THEN** the text SHALL contain no `Action notes:`

## MODIFIED Requirements

### Requirement: Structured content for app templates
Every successful `render_widget` result SHALL carry `structuredContent: { html, css, payload, tree }` — the rendered fragment, the generated theme/kind CSS, the validated payload, and the render tree (`WidgetNode`, JSON-serializable) the fragment was serialized from — so a host-mounted app template can render any call's result via the MCP Apps `ui/notifications/tool-result` flow, regardless of the requested `format`. `tree` and `html` SHALL be projections of the same render (never divergent). For `group` renders, `css` SHALL union the registered styles of the group and every distinct item kind, each kind's block exactly once. Per the Apps convention, `structuredContent` is presentation data, not model context. When hint diagnostics exist for the render, `structuredContent` SHALL additionally carry them as a `diagnostics` array; the key SHALL be absent when there are none. When the rendered kind declares a `load` binding and the caller holds the `execute` scope, `structuredContent` SHALL additionally carry `load: { id: "load", widget, args }` with the binding's input mapping resolved against the rendered payload; the key SHALL be absent otherwise. For a `group` render, each item whose kind declares `load` SHALL contribute a descriptor to `structuredContent.loads` (an array; each entry stamped with the item's `widget` and `at`), which the frame executes one after another. `execute_action` results SHALL carry the same `structuredContent` shape.

#### Scenario: Structured content on default renders
- **WHEN** `render_widget` runs with no `format` and a valid payload
- **THEN** the result SHALL include `structuredContent.html` containing the widget markup
- **AND** `structuredContent.payload.kind` SHALL match the rendered widget

#### Scenario: Theme and styles reach the template channel
- **WHEN** a render includes a valid `theme` and the kind has registered styles
- **THEN** `structuredContent.css` SHALL contain the `--wg-*` declarations and the kind's style rules

#### Scenario: Diagnostics ride the template channel when present
- **WHEN** a render produces hint diagnostics
- **THEN** `structuredContent.diagnostics` SHALL be the same array surfaced in the `Hint notes:` text

#### Scenario: Tree and html are the same render
- **WHEN** any successful render is inspected
- **THEN** serializing `structuredContent.tree` with `renderToHtml` SHALL reproduce `structuredContent.html` exactly

#### Scenario: Group renders union item styles
- **WHEN** a `group` render includes items of two custom kinds with registered styles
- **THEN** `structuredContent.css` SHALL contain both kinds' style rules exactly once each

#### Scenario: Group items load one after another
- **WHEN** a `group` renders two items whose kinds declare `load`, for a caller with `execute`
- **THEN** `structuredContent.loads` SHALL carry two descriptors with `at: "data.items.0"` and `at: "data.items.1"`, and the frame SHALL execute the second only after the first has settled

#### Scenario: Load descriptors ride the template channel
- **WHEN** a kind with a `load` binding mapping `{ id: "record.id" }` renders `{ record: { id: 42 } }` for a caller with `execute`
- **THEN** `structuredContent.load` SHALL be `{ id: "load", widget: <kind>, args: { id: 42 } }`
- **AND** for a caller without `execute`, or a kind without `load`, the key SHALL be absent
