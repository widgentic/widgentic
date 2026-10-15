## ADDED Requirements

### Requirement: Preview frame route
The surface SHALL answer `GET /preview-frame` with the document a designer previews in.
- **The body.** Status 200, `text/html`, and the MCP Apps app template exactly as the server registers it.
- **The policy.** A Content-Security-Policy that grants the frame what MCP Apps hosts grant for the same declaration:
  - `default-src 'none'`;
  - `script-src` with the SHA-256 hash of each inline script the template carries, and nothing else;
  - `style-src 'unsafe-inline'`, `img-src data:`, `font-src` and `media-src`, each followed by the resource domains;
  - `connect-src 'none'`, `frame-src 'none'`, `base-uri 'none'` and `form-action 'none'`;
  - `frame-ancestors 'self'`.
- **The domains.** The operator's list, which the host passes in the surface's deps as `resourceDomains`, followed by the signed-in principal's `resourceDomains` setting. Both are read by the resource-domain rule, canonical and deduplicated: the same list the MCP server declares for that principal.
- **Other headers.** `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`. The response SHALL set no cookie.
- **When no principal resolves**, the route SHALL still answer 200, with the operator's list only, so a preview never breaks. A settings read that fails SHALL be logged and answered the same way.
- **Keys and methods.** A request presenting an API key SHALL be refused as every route refuses one (`KEY_NOT_A_SESSION`). A method other than `GET` SHALL be refused as unsupported methods are elsewhere.

#### Scenario: The frame carries the principal's domains
- **WHEN** the operator's list is `["assets.example.org"]` and the signed-in principal's settings hold `["cdn.example.com", "*.example.net"]`, and `GET /preview-frame` is requested
- **THEN** the body SHALL equal the app template the server registers
- **AND** the policy's `img-src` SHALL be `data: https://assets.example.org https://cdn.example.com https://*.example.net`, with the same domains in `style-src`, `font-src` and `media-src`
- **AND** `script-src` SHALL hold only `sha256-` hashes, one per inline script in the body, each matching that script

#### Scenario: Anyone gets a working frame
- **WHEN** no principal resolves for the request
- **THEN** the route SHALL answer 200 with the operator's domains only

#### Scenario: The frame is framed only by its origin
- **WHEN** the response headers are inspected
- **THEN** the policy SHALL carry `frame-ancestors 'self'` and `connect-src 'none'`, the response SHALL carry `Cache-Control: no-store`, and no `Set-Cookie` header SHALL be present

## MODIFIED Requirements

### Requirement: The surface is transport-agnostic with a Node adapter
The authoring surface SHALL be exposed as a function over a decoded request — method, path, parsed body and the principal context — returning a status and a JSON body — or, for the preview frame route alone, an HTML body with its headers — so it can be tested without a socket and mounted on any server. A `node:http` adapter SHALL be published beside it for hosts using the standard server, and it SHALL be the only part that touches request and response objects. The adapter SHALL contain the host's own failure: when the principal resolution the host supplies throws or rejects, the answer SHALL be exactly what the same failure inside the surface would produce — a store rejection keeps its mapped status and code, and any other failure is answered with the surface's structured internal-failure refusal and reported through the deps' log sink. The rejection SHALL NOT escape into the host's server, where it would surface as an unhandled rejection or a bodyless response, and an internal-failure refusal SHALL carry no detail of the host's failure. "Not signed in" is expressed by resolving no context, never by throwing.

#### Scenario: The core needs no server
- **WHEN** the surface is exercised in a test with plain values
- **THEN** every route SHALL be reachable with no HTTP server, socket or framework involved

#### Scenario: The adapter adds no behavior
- **WHEN** the same operation is driven through the core and through the Node adapter
- **THEN** the status and body SHALL be identical

#### Scenario: A failing host callback is contained
- **WHEN** the host's principal resolution rejects (its store is unreachable, say) during an authoring request
- **THEN** the response SHALL be the surface's structured internal-failure refusal, the failure SHALL reach the log sink, and no rejection SHALL escape the adapter
- **AND** the response body SHALL name no detail of the host's failure

#### Scenario: A store rejection keeps its meaning wherever it is thrown
- **WHEN** the host's principal resolution throws a store rejection (its principal store refuses the subject, say)
- **THEN** the response SHALL carry the same mapped status and code the surface would answer for that rejection inside a route

#### Scenario: The adapter writes the frame as the core answers it
- **WHEN** `GET /preview-frame` is driven through the core and through the Node adapter
- **THEN** the status, the headers and the HTML body SHALL be identical
