## ADDED Requirements

### Requirement: A protected endpoint challenges; a public endpoint is anonymous
A runnable HTTP server that protects its MCP endpoint SHALL answer a request to it that carries no credential, an API key that resolves to no principal, or a bearer token that resolves to no principal, with `401`, a `WWW-Authenticate: Bearer` challenge naming the endpoint's protected-resource metadata URL, and a JSON-RPC error body that says how to connect — and SHALL construct no server for it. The challenge SHALL carry `error="invalid_token"` when a bearer token was presented. The server SHALL serve the protected-resource metadata, without credentials and to any origin, at the well-known location for the endpoint's path and at the root well-known location. It SHALL also serve a public endpoint on a distinct path that never challenges, reads no credential — a presented key or token SHALL have no effect there — and serves the anonymous principal: the built-in catalog, `read` only. An API key SHALL be accepted on the protected endpoint from the `x-api-key` header or the `key` query parameter exactly as before, and SHALL take precedence over a bearer token presented in the same request. Browser hosts SHALL be able to send `Authorization` to both endpoints and to read `WWW-Authenticate` from the protected one.

#### Scenario: No credential is a challenge
- **WHEN** an `initialize` reaches the protected endpoint with no `x-api-key`, no `key` parameter and no `Authorization` header
- **THEN** the response SHALL be `401` with a `WWW-Authenticate: Bearer` header whose `resource_metadata` is the endpoint's metadata URL, and a JSON-RPC error body
- **AND** no catalog SHALL have been composed

#### Scenario: A refused token says so
- **WHEN** a request presents an expired, revoked or unknown bearer token
- **THEN** the response SHALL be `401` and the challenge SHALL carry `error="invalid_token"`

#### Scenario: The metadata is where hosts look for it
- **WHEN** the protected endpoint is `/mcp` and a client reads `/.well-known/oauth-protected-resource/mcp` and `/.well-known/oauth-protected-resource` without credentials
- **THEN** both SHALL answer the same document naming the endpoint as `resource` and the deployment's authorization server

#### Scenario: The public endpoint never asks
- **WHEN** `initialize`, `tools/list` and `render_widget` reach the public endpoint with no credential
- **THEN** each SHALL succeed over the built-in catalog, and `execute_action` SHALL answer `FORBIDDEN_SCOPE`
- **AND WHEN** the same requests carry a valid key of a principal that owns widgets
- **THEN** the listing SHALL still contain the built-in kinds only

#### Scenario: Keys keep working where they did
- **WHEN** a request presents a known key in `x-api-key`, and another in the `key` query parameter, to the protected endpoint
- **THEN** both SHALL be served that principal's catalog with no challenge

#### Scenario: A browser host can complete the challenge
- **WHEN** a cross-origin preflight names the `Authorization` request header, and a cross-origin request is then challenged
- **THEN** the preflight SHALL allow the header and the `401` SHALL expose `WWW-Authenticate` to the page

## MODIFIED Requirements

### Requirement: Per-request principal resolution
When a store is configured, the runnable server SHALL resolve the caller's principal from the presented credential — an API key, or an access token presented as a bearer — **before** constructing the request's server, and SHALL serve that principal's composed catalog and theme registry for the whole request. `createWidgenticServer(options?)` SHALL accept the composed `catalog` and `themes` rather than building its own, so the composition (and therefore the trust decision) happens at the transport edge where the credential is read. An access token SHALL resolve only when it was issued for this endpoint's resource. On a protected endpoint, a credential that resolves to no principal SHALL be answered with the endpoint's challenge and SHALL NOT be served any catalog; on the public endpoint, which resolves no credential, every request SHALL be served the anonymous catalog — built-ins plus any entries the deployment supplies — never an error. The server SHALL note an unresolved credential on stderr **without** logging the key or the token. With no store configured, the server SHALL serve the assembly's catalog to every caller — the library default (built-ins only) unless the host passes its own composed catalog, as the compiled-in example deployment does.

#### Scenario: Two keys see two catalogs
- **WHEN** a request presents principal A's key and another presents principal B's key
- **THEN** `list_widgets` SHALL return A's kinds for the first and B's for the second
- **AND** neither listing SHALL contain the other's kinds
- **AND** both SHALL contain every built-in kind

#### Scenario: A principal's widget renders only for that principal
- **WHEN** principal A owns kind `report` and principal B calls `render_widget` with `widget: "report"`
- **THEN** B's result SHALL be `isError: true` with `code: "UNKNOWN_KIND"` and `report` absent from the available-kinds list

#### Scenario: Themes are resolved per principal too
- **WHEN** principal A owns a `brand` theme
- **THEN** `list_themes` SHALL include it for A and omit it for B
- **AND** `render_widget` with `theme: "brand"` SHALL resolve for A and return `UNKNOWN_THEME` for B

#### Scenario: Unknown keys degrade to anonymous, not to failure
- **WHEN** a request presents a key no principal owns to the public endpoint
- **THEN** the tools SHALL still work over the anonymous catalog
- **AND** the key SHALL NOT appear in any log line
- **AND WHEN** the same key is presented to a protected endpoint
- **THEN** the response SHALL be the endpoint's `401` challenge and the key SHALL NOT appear in any log line

#### Scenario: No store configured preserves today's behavior
- **WHEN** the server runs without a store
- **THEN** every caller SHALL see the same catalog: the built-ins, plus exactly the extras the host compiled into the catalog it passed (none, in the hosted deployment; the example's own widgets, in the stdio example)

#### Scenario: A key and a token of the same key see the same catalog
- **WHEN** one request presents principal A's key in `x-api-key` and another presents, as a bearer, an access token granted through that key for this endpoint's resource
- **THEN** both SHALL be served A's catalog and themes with that key's scopes

#### Scenario: A token issued for another resource is not accepted
- **WHEN** a valid access token issued for a different resource is presented
- **THEN** it SHALL resolve to no principal
