# mcp-authorization Specification

## Purpose
The OAuth side of connecting an MCP host: the resource-side documents and challenge by which an MCP endpoint asks a host to sign in, and the authorization surface a deployment mounts so that a person, in their browser, binds the host to one of their API keys. Authentication of the person stays with the host of the surface. Ships in `@widgentic/mcp` behind `./oauth`.

## Requirements

### Requirement: Resource-side helpers describe and challenge
The `./oauth` entry SHALL export the resource side of the flow as pure functions over plain values: the protected-resource metadata document for a resource (its identifier, the authorization servers, `scopes_supported` of `read` and `execute`, and `bearer_methods_supported` of `header`), the value of a `WWW-Authenticate: Bearer` challenge that names the metadata URL, and extraction of a bearer token from an `Authorization` header value. A challenge for a request that presented a bearer token SHALL carry `error="invalid_token"`; a challenge for a request that presented none SHALL carry no error. Extraction SHALL accept the `Bearer` scheme case-insensitively and SHALL return nothing for any other scheme, an empty token or a malformed value — never an error. No helper SHALL read a request object, a store or the environment.

#### Scenario: The metadata names the resource and its authorization server
- **WHEN** the metadata is built for resource `https://mcp.example/mcp` and authorization server `https://example`
- **THEN** the document SHALL carry `resource: "https://mcp.example/mcp"`, `authorization_servers: ["https://example"]`, `scopes_supported: ["read", "execute"]` and `bearer_methods_supported: ["header"]`

#### Scenario: The challenge points at the metadata
- **WHEN** a challenge is built for metadata URL `https://mcp.example/.well-known/oauth-protected-resource/mcp` with no presented token
- **THEN** the value SHALL be a `Bearer` challenge whose `resource_metadata` parameter is that URL and SHALL carry no `error` parameter
- **AND WHEN** it is built for a request whose token was refused
- **THEN** the value SHALL also carry `error="invalid_token"`

#### Scenario: Only a bearer token is extracted
- **WHEN** extraction is given `Bearer abc`, `bearer abc`, `Basic abc`, `Bearer ` and no value
- **THEN** it SHALL return `abc` for the first two and nothing for the others

### Requirement: The host resolves who is signed in; the surface never does
The authorization surface SHALL be constructed with the deployment's issuer, the resources it issues tokens for, a signing secret, a store and a host callback that resolves the signed-in principal for a request. It SHALL contain no session reading, no cookie parsing, no identity-provider knowledge and no sign-in form: when the callback resolves no principal, the surface SHALL answer the authorize step with a page offering the sign-in links the host supplied — each carrying the full authorize request as its return address — and the anonymous choice. Nothing in an authorize, decision or token request SHALL be able to name, select or influence the principal a grant is created for. The surface SHALL be exposed as a function over a decoded request returning a status, headers and a body, with a `node:http` adapter beside it that adds no behavior.

#### Scenario: Two hosts, two authentication schemes, one surface
- **WHEN** one host resolves the signed-in principal from a validated session and another from a single fixed principal
- **THEN** both SHALL obtain identical authorization behavior from the same surface, with no identity code inside it

#### Scenario: An unsigned visitor is offered sign-in and the anonymous choice
- **WHEN** a valid authorize request arrives and the host resolves no principal
- **THEN** the response SHALL be a page listing the host's sign-in links, each returning to the same authorize request, and a control that continues without an account
- **AND** no grant, code or record SHALL have been written

#### Scenario: The request cannot name a principal
- **WHEN** an authorize, decision or token request carries a principal id in its query or body
- **THEN** it SHALL be ignored and only the principal the host resolved SHALL be used

#### Scenario: The core needs no server
- **WHEN** the surface is exercised in a test with plain values
- **THEN** every route SHALL be reachable with no HTTP server, socket or framework involved, and the Node adapter SHALL answer the same status, headers and body

### Requirement: Authorization-server metadata is derived from the surface
The surface SHALL serve an authorization-server metadata document at `/.well-known/oauth-authorization-server` whose every value derives from its construction: the issuer, the authorization, token, registration and revocation endpoints, `response_types_supported: ["code"]`, `grant_types_supported: ["authorization_code", "refresh_token"]`, `code_challenge_methods_supported: ["S256"]`, `token_endpoint_auth_methods_supported: ["none"]`, `scopes_supported: ["read", "execute"]`, `client_id_metadata_document_supported: true` and `authorization_response_iss_parameter_supported: true`. The metadata, registration, token and revocation routes SHALL answer cross-origin requests; the authorize and decision routes SHALL NOT.

#### Scenario: The document matches the mounted routes
- **WHEN** the surface is constructed with issuer `https://example` and the metadata is read
- **THEN** every endpoint in the document SHALL be a route the same surface answers, under that issuer
- **AND** the only code challenge method listed SHALL be `S256` and the only client authentication method `none`

#### Scenario: Browser clients can reach the token endpoint
- **WHEN** a preflight and a cross-origin `POST` reach the token route
- **THEN** both SHALL be answered with the headers a browser needs to read the response
- **AND** a cross-origin script SHALL NOT be able to read the authorize or decision responses

### Requirement: Clients register without the server storing them
The surface SHALL accept two kinds of public client and SHALL store neither. A dynamically registered client SHALL be answered with a `client_id` that carries its registered metadata sealed under the signing secret, so a later request proves its own registration; a tampered or foreign `client_id` SHALL be refused. A `client_id` that is an `https` URL SHALL be treated as a client metadata document: fetched through the guarded fetch (public https, no redirects, bounded time and size, JSON only), accepted only when the document's own `client_id` equals the URL. Registration SHALL refuse a client with no redirect URI, with more than ten, or with one that is neither `https`, loopback `http`, nor a private-use scheme — and SHALL always refuse `javascript`, `data`, `file`, `blob`, `about` and `vbscript`. An authorize request's `redirect_uri` SHALL match a registered one exactly, except that a loopback redirect MAY differ in port.

#### Scenario: A registered client is recognised without a record
- **WHEN** a client registers with one `https` redirect URI and a name, and later presents the returned `client_id` to the authorize route
- **THEN** the request SHALL be accepted with that name and redirect URI, and the store SHALL hold no record of the client

#### Scenario: A forged client id is refused
- **WHEN** an authorize request presents a `client_id` that was altered after registration, or sealed under another secret
- **THEN** the response SHALL be an error page and SHALL NOT redirect anywhere

#### Scenario: A metadata-document client is fetched under the guard
- **WHEN** the `client_id` is `https://host.example/client.json` and that document names the same `client_id` and a redirect URI
- **THEN** the client SHALL be accepted with the document's name and redirect URIs
- **AND WHEN** the URL resolves to a private address, redirects, answers a non-JSON type, exceeds the size bound or names a different `client_id`
- **THEN** the client SHALL be refused

#### Scenario: Redirect URIs are checked at the door and matched exactly
- **WHEN** registration names `javascript:alert(1)`, or `http://example.com/cb`, or no redirect URI
- **THEN** it SHALL be refused with `invalid_redirect_uri`
- **AND WHEN** an authorize request names a redirect URI that differs from the registered one by path, query or host
- **THEN** the response SHALL be an error page and SHALL NOT redirect
- **AND** a registered `http://127.0.0.1/cb` SHALL match `http://127.0.0.1:53123/cb`

### Requirement: The authorize step validates before it shows anything
The authorize route SHALL require `response_type=code`, a recognised client, a matching `redirect_uri`, a `code_challenge` with `code_challenge_method=S256`, and a `resource` that is one of the surface's resources — defaulting to the first when the parameter is absent. A request whose client or redirect URI cannot be trusted SHALL be answered with an error page that offers no way on. Every other failure SHALL be answered with an error page that states the failure and offers a link to the client's redirect URI carrying the OAuth error code, the request's `state` and `iss`. Because anyone can register a client, the surface SHALL NOT send a browser to a client's address — by redirect or by any automatic means — before a person has acted on a page it served. A valid request with a signed-in principal SHALL be answered with the consent page; every page the surface serves SHALL forbid framing, SHALL load no script, style, font or image from another origin, and SHALL NOT be cacheable.

#### Scenario: A request without PKCE is refused to the client
- **WHEN** an authorize request from a recognised client omits `code_challenge`, or names `plain`
- **THEN** the response SHALL be an error page, not a redirect, whose link back to the client's redirect URI carries `error=invalid_request` and the original `state`

#### Scenario: A link to this origin is never an automatic redirect elsewhere
- **WHEN** a client registered with a redirect URI on another site is named in an authorize request that fails validation
- **THEN** the response SHALL carry no `Location` and no automatic refresh, and SHALL name the other site's host as unverified beside the link

#### Scenario: An unknown resource is refused
- **WHEN** an authorize request names a `resource` the surface was not constructed with
- **THEN** the error page's link back SHALL carry `error=invalid_target`
- **AND WHEN** the parameter is absent
- **THEN** the request SHALL proceed for the surface's first resource

#### Scenario: Pages cannot be framed or cached
- **WHEN** the sign-in choice page, the consent page or an error page is served
- **THEN** its headers SHALL forbid framing by any origin, SHALL restrict every resource type to the page's own origin or inline hashes, and SHALL carry `Cache-Control: no-store`

### Requirement: Consent binds the host to an API key the person selects or creates
The consent page SHALL show the requesting client's name and the host of its redirect URI, marked as unverified, and the signed-in principal's label; SHALL list the principal's unrevoked API keys by name, scopes and digest preview; and SHALL offer creating a key with a name and scopes. The decision SHALL be a `POST` that carries a token sealed under the signing secret and bound to the resolved principal and the exact authorize request, valid for ten minutes; a decision without it, with one sealed for another principal or request, or after it expired SHALL be refused and SHALL write nothing. Approving with a selected key SHALL issue an authorization code bound to that key. Approving with a new key SHALL create the key through the store's own rules — its name check and scope normalization included — and bind the code to it; the raw key SHALL NOT appear in any response, page, log or redirect. The scopes the code carries, and the grant it becomes, SHALL be the key's scopes, narrowed to the requested `scope` when the request named one, with `read` always present. Denying SHALL redirect with `error=access_denied`.

#### Scenario: The person selects an existing key
- **WHEN** a signed-in principal with keys `laptop` (`read`) and `ops` (`read`, `execute`) approves with `ops`
- **THEN** the response SHALL redirect to the client with a `code`, the original `state` and `iss`, and exchanging that code SHALL yield a grant bound to `ops` with scopes `read` and `execute`

#### Scenario: The person creates a key at consent
- **WHEN** the principal approves with a new key named `Claude` and scope `read`
- **THEN** the principal's key listing SHALL contain `Claude` with `read`, the issued code SHALL be bound to it, and no response of the flow SHALL contain a raw key

#### Scenario: A store refusal is reported, not bypassed
- **WHEN** the principal approves with a new key whose name the store refuses (an empty one), or with a scope keys cannot hold
- **THEN** the consent page SHALL be shown again with the store's refusal, no key and no code SHALL be created, and selecting an existing key SHALL still work

#### Scenario: A requested scope narrows the grant
- **WHEN** the authorize request named `scope=read` and the selected key holds `read` and `execute`
- **THEN** the grant the code is exchanged for SHALL carry `read` only

#### Scenario: A forged decision writes nothing
- **WHEN** a decision arrives with no sealed token, with one issued to a different principal, or with one issued for a different client or redirect URI
- **THEN** it SHALL be refused, and no key, grant or code SHALL have been created

#### Scenario: Denial returns to the client
- **WHEN** the person denies
- **THEN** the response SHALL redirect with `error=access_denied` and the original `state`, and nothing SHALL be written

### Requirement: Continuing without an account yields the anonymous catalog
The sign-in choice page SHALL let a visitor continue without an account. That choice SHALL complete the flow with an authorization code and then an access token of a distinct anonymous form, issued without any store write and without a refresh token; the token SHALL resolve to the anonymous principal wherever a deployment accepts access tokens, and SHALL grant nothing a request without credentials to the public endpoint would not have. PKCE SHALL be verified for the anonymous exchange exactly as for a signed-in one.

#### Scenario: A declined login still connects
- **WHEN** a visitor who is not signed in chooses to continue without an account and the client exchanges the returned code with the matching verifier
- **THEN** the token response SHALL carry an access token of the anonymous form, `scope: "read"` and no refresh token
- **AND** the store SHALL have received no write

#### Scenario: The anonymous token is the anonymous principal
- **WHEN** that token is presented as a bearer to a protected endpoint
- **THEN** the request SHALL be served the anonymous catalog with `read` only

#### Scenario: PKCE still guards the anonymous exchange
- **WHEN** the anonymous code is exchanged with a verifier that does not match the challenge
- **THEN** the token endpoint SHALL answer `invalid_grant`

### Requirement: The token endpoint exchanges codes and rotates refresh tokens
The token endpoint SHALL accept `application/x-www-form-urlencoded` requests for `authorization_code` and `refresh_token`. A code SHALL be exchangeable once, within sixty seconds of issue, only by the client and redirect URI it was issued to and only with the verifier matching its S256 challenge; a second exchange of the same code within those sixty seconds SHALL be refused and SHALL revoke the grant the first exchange produced, also when the two arrive at once. After those sixty seconds a code SHALL be refused and SHALL revoke nothing. A successful exchange SHALL return a bearer access token valid for one hour, a refresh token, `expires_in` and the granted `scope`. A refresh SHALL return a new access token and a new refresh token and SHALL invalidate the previous pair; a refresh token presented more than sixty seconds after it was rotated SHALL revoke the grant. A refresh token SHALL expire thirty days after it was last used. Every refusal SHALL be an OAuth error response (`invalid_grant`, `invalid_client`, `invalid_request`, `unsupported_grant_type`), every response SHALL carry `Cache-Control: no-store`, and no token, code or verifier SHALL be written to a log — a failure SHALL be logged by its kind, never by the failing component's own message. The surface SHALL answer only its own routes: for any other path, whatever the method, it SHALL answer nothing and leave the request to the host.

#### Scenario: A code becomes a token pair
- **WHEN** the client exchanges a fresh code with the matching verifier, client id and redirect URI
- **THEN** the response SHALL carry `token_type: "Bearer"`, an access token, `expires_in: 3600`, a refresh token and the granted scope

#### Scenario: A code works once
- **WHEN** the same code is exchanged a second time
- **THEN** the response SHALL be `invalid_grant`, and the access token from the first exchange SHALL no longer resolve

#### Scenario: A wrong verifier, client or redirect is refused
- **WHEN** a fresh code is exchanged with a verifier that does not hash to its challenge, or by another client, or with another redirect URI
- **THEN** the response SHALL be `invalid_grant` and no token SHALL be issued

#### Scenario: Refresh rotates the pair
- **WHEN** the client refreshes with its refresh token
- **THEN** it SHALL receive a new access token and a new refresh token, and the previous access token SHALL no longer resolve

#### Scenario: A replayed refresh token ends the grant
- **WHEN** a refresh token is presented again more than sixty seconds after it was rotated
- **THEN** the response SHALL be `invalid_grant` and the grant's current tokens SHALL no longer resolve
- **AND WHEN** it is presented again within sixty seconds
- **THEN** the response SHALL be a valid token pair and the grant SHALL stay alive

#### Scenario: Nothing secret is logged
- **WHEN** any token request succeeds or fails
- **THEN** the log sink SHALL have received no code, verifier, access token or refresh token
- **AND WHEN** the store fails with a message that names the code
- **THEN** the log line SHALL name the kind of failure and SHALL NOT contain that message

#### Scenario: Other routes are the host's
- **WHEN** a preflight or a request for a path the surface does not own reaches it
- **THEN** it SHALL answer nothing, so the host's own route handles it

### Requirement: Revocation ends a grant
The revocation endpoint SHALL accept an access token or a refresh token and SHALL end the grant it belongs to, answering `200` whether or not the token was known. Revoking the API key a grant is bound to SHALL end the grant with no further step.

#### Scenario: A client signs out
- **WHEN** the client posts its refresh token to the revocation endpoint
- **THEN** the response SHALL be `200`, and neither the grant's access token nor its refresh token SHALL resolve afterwards

#### Scenario: Unknown tokens are not revealed
- **WHEN** an unknown token is posted
- **THEN** the response SHALL be `200` with the same body as for a known one

#### Scenario: Revoking the key ends the connection
- **WHEN** the principal revokes the key a grant is bound to
- **THEN** the grant's access token SHALL stop resolving and its refresh token SHALL be answered `invalid_grant`
