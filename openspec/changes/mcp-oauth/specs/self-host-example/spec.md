## ADDED Requirements

### Requirement: Hosts sign in through the authoring app
The MCP service SHALL protect `/mcp` and SHALL serve the built-in catalog on `/mcp/public`, as the `mcp-server` capability specifies, and its documentation SHALL state both URLs and that a host given the bare `/mcp` URL is sent to sign in. The authoring app SHALL mount the published authorization surface over the deployment's store, resolving the signed-in principal through the deployment's own identity mode and adding no authorization logic of its own: in single-principal mode the fixed principal SHALL be the signed-in one and the consent page SHALL be the first page a person sees; in trusted-header mode the header's subject SHALL be, and a request without it SHALL be offered only the anonymous choice. The issuer and the MCP resource SHALL come from the deployment's public origins (`WIDGENTIC_PUBLIC_URL` for the app, `WIDGENTIC_MCP_PUBLIC_URL` for the MCP endpoint, the latter defaulting to the former's `/mcp`); with no public origin configured the stack SHALL derive both from its default local ports. The signing secret SHALL come from a mounted file or a variable and SHALL be derived from the deployment's key-encryption key when neither is set, so tokens and client registrations survive a restart with no extra configuration. The MCP service SHALL keep its read-only store handle: resolving an access token SHALL require no write. The app's Keys section SHALL show, beside each key, the names of the applications connected through it as the authoring surface lists them, marked as reported by the application, and SHALL say that revoking the key disconnects them.

#### Scenario: Adding the bare URL signs the host in
- **WHEN** the stack runs in single-principal mode and an MCP client that implements the authorization flow is given the `/mcp` URL with no key
- **THEN** it SHALL be challenged, discover the app as the authorization server, reach the consent page with no sign-in step, and — once a key is selected or created — list the principal's widgets with that key's scopes

#### Scenario: The public URL needs nothing
- **WHEN** a client is given the `/mcp/public` URL
- **THEN** it SHALL complete `initialize` and list the built-in kinds with no challenge and no key

#### Scenario: A proxied identity consents for its own account
- **WHEN** trusted-header mode is on and two people complete the flow with different header values
- **THEN** each client SHALL see only its own principal's widgets
- **AND WHEN** an authorize request arrives without the header
- **THEN** the page SHALL offer only the anonymous choice and no principal SHALL be served

#### Scenario: The Keys section names what uses a key
- **WHEN** a host registered as `Claude` completes the flow with key `ops` and the Keys section is opened
- **THEN** the row for `ops` SHALL show `Claude` as a connected application, and a key no host is connected through SHALL show none

#### Scenario: Connections survive a restart
- **WHEN** both containers are recreated over the same volume with the same key-encryption key
- **THEN** a client's refresh token SHALL still yield a token pair and its registered client id SHALL still be recognised

#### Scenario: The MCP service still cannot write
- **WHEN** an access token is resolved on the MCP service
- **THEN** the store handle it used SHALL be the read-only port and no write SHALL have occurred

## MODIFIED Requirements

### Requirement: One image, two services, one store
The example SHALL ship a single container image that runs either host, selected by the command, and a compose file that starts both against one shared data volume: an authoring app and a Streamable HTTP MCP endpoint. The MCP service SHALL hold a read-only handle on the store and SHALL expose no write path; the authoring app SHALL be the only writer. Both services SHALL read the same store with no cache between them, so an entry the app saves is served on the MCP endpoint's next tool call without a restart or an eviction step. All persistent state SHALL live on the mounted volume, so recreating the containers SHALL NOT lose a principal, an entry, a key digest or a secret record. Neither service SHALL require a cloud account, a managed identity or a network dependency beyond the store file. When the environment names an MCP upstream (`WIDGENTIC_MCP_UPSTREAM`, an http origin), the authoring app SHALL additionally forward requests under `/mcp`, and requests for the protected-resource metadata under `/.well-known/oauth-protected-resource`, to that upstream unchanged — method, headers, body and streamed response — so one public origin can serve both surfaces behind one certificate; with the variable unset the app SHALL serve no `/mcp` route and no protected-resource metadata. The proxy SHALL add no authorization of its own: keys and access tokens are resolved, and challenges are issued, by the MCP service exactly as when it is reached directly.

#### Scenario: Both surfaces answer after one command
- **WHEN** the compose stack is started with no configuration beyond the KEK
- **THEN** the app SHALL serve its authoring shell and the MCP service SHALL complete `initialize` and `tools/list` on its public endpoint, each on its own port

#### Scenario: An entry saved in the app is in the next tool call
- **WHEN** a widget is saved in the app and `list_widgets` is called on the MCP endpoint with a key of the same principal
- **THEN** the widget SHALL be in the response, with no restart of either service

#### Scenario: The MCP service cannot write
- **WHEN** the MCP host's store handle is inspected
- **THEN** it SHALL be the read-only port, carrying no write operation, and no request the MCP service accepts SHALL reach a write

#### Scenario: State survives recreation
- **WHEN** both containers are removed and started again over the same volume
- **THEN** every principal, widget, theme, schema, action, key digest and secret record SHALL still resolve

#### Scenario: One origin serves both surfaces
- **WHEN** the app runs with `WIDGENTIC_MCP_UPSTREAM=http://localhost:8081` and a client posts an MCP `initialize` to the app's `/mcp` with an `x-api-key` header
- **THEN** the response SHALL be the MCP service's response for that key, streamed as the service sent it
- **AND** a request with no credential to the app's `/mcp` SHALL be answered with the MCP service's `401` challenge, and the app's `/.well-known/oauth-protected-resource/mcp` SHALL answer the MCP service's metadata
- **AND WHEN** the variable is unset
- **THEN** `/mcp` on the app SHALL answer 404

### Requirement: A deployment key survives an ephemeral store
The MCP service SHALL accept one operator-supplied API key — from a mounted file (`WIDGENTIC_DEFAULT_KEY_FILE`, preferred) or a variable (`WIDGENTIC_DEFAULT_KEY`) — that resolves to the single principal on every boot, so hosts configured with it keep working when the store starts empty. The key SHALL have the shape the stores mint (`wgk_` followed by 64 hexadecimal characters); any other value SHALL be ignored with a log line. The service SHALL hold only its digest and SHALL compare a presented key against it in constant time; the key SHALL NOT be written to the store, the volume, any log line, page or diagnostic. Its scopes SHALL come from `WIDGENTIC_DEFAULT_KEY_SCOPES` through the same normalization a key gets at creation: read only by default, `execute` only when the operator names it, and a scope keys cannot hold SHALL leave the key read-only with a log line. A presented key that is not the deployment key SHALL resolve through the store exactly as before. With neither setting configured, nothing SHALL change.

#### Scenario: The deployment key reaches the seeded catalog after a restart
- **WHEN** the deployment key is configured, the store starts empty and the seed loads, and a host presents that key
- **THEN** the request SHALL resolve to the single principal and its catalog SHALL include the seeded widgets

#### Scenario: Read only unless execute is named
- **WHEN** the deployment key is configured without scopes, and again with `read,execute`
- **THEN** it SHALL resolve with `read` only the first time and `read` and `execute` the second

#### Scenario: A scope keys cannot hold leaves it read-only
- **WHEN** `WIDGENTIC_DEFAULT_KEY_SCOPES` names `write`
- **THEN** the key SHALL resolve read-only and a log line SHALL say so

#### Scenario: A malformed or unreadable key is ignored
- **WHEN** the configured value lacks the minted shape, or the named file cannot be read
- **THEN** no deployment key SHALL be active, a log line SHALL say why, and no log line SHALL contain the configured value

#### Scenario: Other keys resolve as before
- **WHEN** a deployment key is configured and a different key is presented
- **THEN** the presented key SHALL resolve through the store, and SHALL be answered with the endpoint's challenge when the store does not know it
