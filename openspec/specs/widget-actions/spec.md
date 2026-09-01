# widget-actions Specification

## Purpose
The action model for interactive widgets: what an action is (`prompt` or `http`), how a template binds one to an element or to the widget's load, how arguments are derived from widget data, how an http response flows back into the widget, and the trust boundary that keeps execution server-side and principal-scoped.

## Requirements

### Requirement: Two action kinds with declared contracts
An action definition SHALL be one of two kinds. A `prompt` action SHALL carry `text`: a sequence of literal strings and `{ bind }` segments that resolves, at render time, to one plain-text message of at most 2 000 characters; it proposes a user message through the host and involves no server call. An `http` action SHALL carry `method` (`"GET"` or `"POST"`), `url` (an absolute `https:` URL with no userinfo and no fragment; the URL itself SHALL contain no bindings), `input` (a JSON Schema of type `object` describing the arguments), `output` (a JSON Schema the response body MUST satisfy), and optional `headers` and `query` maps whose values are literal strings or `{ "secret": "<name>" }` references. For `GET`, the validated arguments SHALL be sent as query parameters (values string-coerced); for `POST`, as a JSON body with `Content-Type: application/json`. Definitions SHALL be JSON-serializable plain data. Header and query NAMES SHALL be non-empty RFC 7230 tokens; `host`, `content-length`, `transfer-encoding` and `connection` SHALL be refused as header names (the transport owns them).

#### Scenario: A GET action serializes its arguments as query parameters
- **WHEN** an http action `{ method: "GET", url: "https://api.example.com/weather", input: { type: "object", properties: { city: { type: "string" } } } }` executes with arguments `{ city: "Vancouver" }`
- **THEN** the request SHALL be `GET https://api.example.com/weather?city=Vancouver`

#### Scenario: A POST action sends a JSON body
- **WHEN** the same definition with `method: "POST"` executes with `{ city: "Vancouver" }`
- **THEN** the request body SHALL be `{"city":"Vancouver"}` with `Content-Type: application/json`

#### Scenario: Malformed definitions are refused
- **WHEN** a definition has an `http:` URL, a URL with userinfo, a method other than GET/POST, an `input` schema that is not `type: object`, or a `prompt` text over 2 000 characters after resolution
- **THEN** validation SHALL fail with a structured error naming the offending field

#### Scenario: Malformed or reserved header names are refused
- **WHEN** a definition declares a header named `""`, `"Bad Name"`, `"Host"` or `"Transfer-Encoding"`
- **THEN** validation SHALL fail naming `headers.<name>`

### Requirement: Bindings attach actions to elements and to the widget's load
A template element SHALL be able to carry an `action` binding, and a widget SHALL be able to carry one `load` binding. A binding SHALL name its action either by reference to a shared action (`{ ref: "<name>" }`) or by an inline definition nested under `definition` (`{ definition: <action definition> }` — nested so the definition's `input`/`output` schemas never collide with the binding's own keys), and MAY carry `input` (a record mapping each input-schema field to a template path or a `{ const }` literal) and `output` (see the output requirement). `load` SHALL accept only `http` actions with `method: "GET"`. Every binding SHALL have a stable identifier: the dotted template path of the element that carries it, or the literal `"load"`.

#### Scenario: A button binds a shared action with mapped input
- **WHEN** a template element `{ tag: "button", action: { ref: "refresh-weather", input: { city: "location.city" } }, children: ["Refresh"] }` is validated
- **THEN** validation SHALL succeed and the binding's identifier SHALL be the element's dotted template path

#### Scenario: Load refuses anything but an http GET
- **WHEN** a widget declares `load` with a `prompt` action or an http `POST` action
- **THEN** validation SHALL fail with a structured error at `load`

### Requirement: Arguments resolve at render time in node scope
Input mappings SHALL be resolved when the widget renders, against the scope of the element carrying the binding (the current `each` item where applicable), using the template path grammar — including `$root`, `$parent` and `$index` — so a row's button can name that row's fields without any client-side evaluation. The resolved arguments and, for `prompt` actions, the resolved text SHALL be embedded in the rendered output as the element's action descriptor; nothing is evaluated after render. Every descriptor — unresolved ones included — SHALL carry the `widget` its template was registered as, and the prompt-text cap SHALL never split a surrogate pair.

#### Scenario: A row action names its row
- **WHEN** `{ each: "rows", template: { tag: "button", action: { ref: "open", input: { id: "id", owner: "$root.owner" } } } }` renders `{ owner: "ada", rows: [{ id: 1 }, { id: 2 }] }`
- **THEN** the first button's descriptor SHALL carry arguments `{ id: 1, owner: "ada" }` and the second `{ id: 2, owner: "ada" }`

#### Scenario: A prompt resolves to plain text
- **WHEN** a prompt action with text `["Show the 7-day forecast for ", { bind: "city" }]` renders `{ city: "Vancouver" }`
- **THEN** the descriptor SHALL carry the text `"Show the 7-day forecast for Vancouver"` with no markup

#### Scenario: Unresolved descriptors still name their kind
- **WHEN** a registered template binds an unknown shared action
- **THEN** the rendered descriptor SHALL be `{ id, disabled: "unresolved", widget: <kind> }`

### Requirement: Output flows back through an explicit mode
An http binding's `output` SHALL declare how the validated response merges into the widget's data: `mode` is `"replace"` (the response becomes `data`), `"merge"` (a shallow merge of the response's top-level keys over `data` — the default when `mode` is absent) or `"patch"` (the response is written at `path`, a required dotted data path). An optional `map` (a record of target data path → source response path) SHALL project the response before the mode applies. When `map` has no `"."` entry, the response is an ARRAY and no source path begins with an index segment, the entries SHALL resolve against EACH ITEM and the projection SHALL be the array of per-item results — selecting and renaming fields out of a list response without replacing it raw; a source path absent from an item projects that item's target as it would for an object response. A source that begins with an index (`0.ask`) addresses the array ROOT, so a map that picks elements by position keeps its meaning. A `map` target of `"."` SHALL SELECT a source value at the response root first: alone, that value IS the projection (so an element of an array response is still addressable by index); beside other entries, it names the value those entries map — an enveloped list (`{ ".": "data", ask: "ask" }`) therefore projects per item after selection, and a selected object maps at its root. The result SHALL be re-validated as a payload of the widget's kind before rendering. `path` and every `map` key and value SHALL follow the dotted-path grammar — non-empty segments, no reserved `$` tokens, no `__proto__`, `constructor` or `prototype` segments — and SHALL be rejected otherwise; `path` SHALL be accepted only with `mode: "patch"`; an empty `map` SHALL be rejected. Writes into arrays SHALL address elements by index only. A `merge` whose response (or target data) is not an object SHALL fail with `INVALID_ACTION_OUTPUT` rather than silently replacing.

#### Scenario: Merge keeps fields the response did not return
- **WHEN** data `{ city: "Vancouver", temp: 12 }` receives response `{ temp: 18, asOf: "…" }` under the default mode
- **THEN** the new data SHALL be `{ city: "Vancouver", temp: 18, asOf: "…" }`

#### Scenario: Patch writes at a path
- **WHEN** `output: { mode: "patch", path: "forecast.today" }` receives `{ high: 20 }`
- **THEN** `data.forecast.today` SHALL become `{ high: 20 }` and every other field SHALL be unchanged

#### Scenario: A response that breaks the widget's schema is refused
- **WHEN** the merged data violates the widget's `dataSchema`
- **THEN** execution SHALL fail with `INVALID_ACTION_OUTPUT` and the widget's previous data SHALL stand

#### Scenario: Output paths follow the grammar
- **WHEN** a binding declares `output: { mode: "patch", path: "a..b" }`, `map: { "__proto__.x": "y" }`, `map: {}`, or `mode: "merge"` with a `path`
- **THEN** validation SHALL fail with `INVALID_ACTION` at the offending field

#### Scenario: Merge needs objects on both sides
- **WHEN** a `merge` binding's response is an array
- **THEN** execution SHALL fail with `INVALID_ACTION_OUTPUT` and the widget's data SHALL stand

#### Scenario: An array response projects per item
- **WHEN** `output: { mode: "replace", map: { ask: "ask", when: "date" } }` receives `[{ "ask": "3206.99", "bid": "3179.43", "date": "2026-09-01T02:04:47" }]`
- **THEN** the new data SHALL be `[{ "ask": "3206.99", "when": "2026-09-01T02:04:47" }]` — each item projected, unmapped fields dropped

#### Scenario: The whole-projection target still addresses the response root
- **WHEN** `output: { mode: "replace", map: { ".": "0" } }` receives that same array response
- **THEN** the projection SHALL be the array's first element, not a per-item result

#### Scenario: Index-addressed sources keep the response root
- **WHEN** `output: { mode: "merge", map: { latest: "0.ask" } }` receives `[{ "ask": "3206.99" }, { "ask": "3179.43" }]` over object data
- **THEN** the projection SHALL be `{ latest: "3206.99" }` — one object built at the root, exactly as before per-item projection existed

#### Scenario: An enveloped list projects per item after selection
- **WHEN** `output: { mode: "replace", map: { ".": "data", price: "ask" } }` receives `{ "data": [{ "ask": "3206.99" }, { "ask": "4100.00" }], "next": "cursor" }`
- **THEN** the new data SHALL be `[{ "price": "3206.99" }, { "price": "4100.00" }]` — the selection walked, each item mapped, the envelope's other fields dropped

### Requirement: Execution is server-side and principal-scoped
Only the principal's own stored definitions SHALL ever execute: an execution request names a widget kind and a binding identifier, and the server SHALL resolve the definition from that principal's stored template or shared action — a request SHALL NOT be able to supply a URL, method, headers or schema of its own. Arguments SHALL be validated against the input schema before any network activity; the response SHALL be required to be `application/json`, to parse, and to satisfy the output schema. Outbound requests SHALL be `https` only, SHALL refuse targets that resolve to private, loopback, link-local or metadata addresses (validated per connection, with the connection pinned to the validated address), SHALL NOT follow redirects, and SHALL be bounded by an 8-second TOTAL deadline (covering connection, headers and body streaming — a slow-drip body cannot extend it) and a 256 KiB response cap; the content type SHALL be checked before the body is read, `application/json` and `application/*+json` SHALL be accepted, and a `204` or empty body SHALL be delivered as `null` for the output schema to judge. Executing an http action SHALL require the caller's `execute` scope; `prompt` actions need no server call and no scope. Arguments SHALL be accepted only for fields the input schema declares (`INVALID_ACTION_INPUT` otherwise, including when the schema declares none), SHALL NOT share a name with a fixed `query` parameter, and fixed `headers`/`query` SHALL be applied AFTER the arguments so the author's values always win.

#### Scenario: A tampered request cannot redirect execution
- **WHEN** an execution request carries a `url` or `headers` field alongside the binding identifier
- **THEN** those fields SHALL be ignored and only the stored definition SHALL be used

#### Scenario: Private targets are refused before any bytes are read
- **WHEN** a stored action's hostname resolves to `10.0.0.5` or `169.254.169.254`
- **THEN** execution SHALL fail with `ACTION_FETCH_FAILED` and no request body SHALL be consumed from the target

#### Scenario: Redirects are failures
- **WHEN** the target responds `302`
- **THEN** execution SHALL fail with `ACTION_FETCH_FAILED` and the redirect SHALL NOT be followed

#### Scenario: A key without execute cannot run http actions
- **WHEN** a caller whose key carries only `read` requests execution of an http action
- **THEN** the result SHALL be `FORBIDDEN_SCOPE` and no request SHALL leave the server

#### Scenario: Undeclared or colliding arguments are refused
- **WHEN** an action declares `input.properties: { city }` and `query: { key: { secret: "k" } }` and the request carries `args: { city: "Oslo", key: "ATTACKER" }` or `args: { city: "Oslo", extra: 1 }`
- **THEN** execution SHALL fail with `INVALID_ACTION_INPUT` naming the offending argument and no request SHALL leave the server

#### Scenario: The author's fixed parameters always win
- **WHEN** a fixed `query` value and an argument could both set `key`
- **THEN** the outbound URL SHALL carry the author's fixed value

#### Scenario: The deadline covers slow bodies
- **WHEN** the target answers headers promptly then streams one byte per second
- **THEN** execution SHALL fail with `ACTION_FETCH_FAILED` no later than the deadline

#### Scenario: Empty responses are null, structured JSON variants are accepted
- **WHEN** the target answers `204` with no body, or `200` with `application/problem+json`
- **THEN** the response body SHALL be `null` (validated against the output schema) or the parsed JSON respectively

### Requirement: The model learns what the widget now shows
After every successful http action or load, the widget SHALL inform the host's model context of its new state with both a plain-text summary and the structured payload in one update (hosts advertise inconsistent modality sets; all accept both). The update SHALL be bounded (text and structured content each capped at 8 KiB, truncated with a marker), and SHALL replace any earlier update from the same widget instance. A widget whose first render fires several `load` bindings (a group) SHALL send ONE model-context update after the whole chain settles, not one per item.

#### Scenario: A refresh updates the model's view
- **WHEN** an http action changes the widget's data
- **THEN** the widget SHALL send one model-context update carrying a text block that names the kind and the action and a `structuredContent` copy of the new payload

#### Scenario: Large payloads are truncated, not dropped
- **WHEN** the new payload serializes to more than 8 KiB
- **THEN** the update SHALL still be sent, with the text and structured parts truncated and marked as truncated

#### Scenario: A load chain updates the model once
- **WHEN** a group render carries two `loads` and both succeed
- **THEN** exactly one `ui/update-model-context` SHALL follow, carrying the final payload
