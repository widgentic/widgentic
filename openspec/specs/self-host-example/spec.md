# self-host-example Specification

## Purpose
A runnable self-hosted widgentic: one container image whose two services — an authoring app with the designers and a per-principal MCP endpoint — share a single durable store, so someone who has never seen our deployment can author widgets and connect an agent host to them on their own machine, with no cloud account and no identity provider.

## Requirements

### Requirement: One image, two services, one store
The example SHALL ship a single container image that runs either host, selected by the command, and a compose file that starts both against one shared data volume: an authoring app and a Streamable HTTP MCP endpoint. The MCP service SHALL hold a read-only handle on the store and SHALL expose no write path; the authoring app SHALL be the only writer. Both services SHALL read the same store with no cache between them, so an entry the app saves is served on the MCP endpoint's next tool call without a restart or an eviction step. All persistent state SHALL live on the mounted volume, so recreating the containers SHALL NOT lose a principal, an entry, a key digest or a secret record. Neither service SHALL require a cloud account, a managed identity or a network dependency beyond the store file. When the environment names an MCP upstream (`WIDGENTIC_MCP_UPSTREAM`, an http origin), the authoring app SHALL additionally forward requests under `/mcp` to that upstream unchanged — method, headers, body and streamed response — so one public origin can serve both surfaces behind one certificate; with the variable unset the app SHALL serve no `/mcp` route. The proxy SHALL add no authorization of its own: keys are resolved by the MCP service exactly as when it is reached directly.

#### Scenario: Both surfaces answer after one command
- **WHEN** the compose stack is started with no configuration beyond the KEK
- **THEN** the app SHALL serve its authoring shell and the MCP endpoint SHALL complete `initialize` and `tools/list`, each on its own port

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
- **AND WHEN** the variable is unset
- **THEN** `/mcp` on the app SHALL answer 404

### Requirement: The app mounts the authoring surface and the designers
The authoring app SHALL serve its authoring routes by mounting the published authoring surface over the deployment's store, adding no route of its own beside it and reimplementing none of its behavior — the refusal codes, the write-only secrets, the one-time key reveal and the production-path test call are that surface's, not the example's. It SHALL mount the widget, theme, schema and action designers against those routes so that every authoring function of the hosted app is present: list, create, replace by name, view an existing entry read-only, delete, test an action, write a secret, mint and revoke a key. It SHALL NOT carry a landing page or brand assets, and it SHALL NOT expose identity routes while running without an identity subject. It SHALL register the published WebMCP designer tools once per page load with sources that open the corresponding section and return its live designer; when an agent-capable browser registered them it SHALL tell the person so ("WebMCP tools are available in this browser", with a refused count when any registration was refused), and otherwise SHALL show nothing about agent tools and behave identically to a browser without a model context. When the environment supplies a Chrome origin-trial token (`WIDGENTIC_ORIGIN_TRIAL_TOKEN`) the served page SHALL carry it as an `origin-trial` meta tag; no token SHALL be committed. The Keys section SHALL name the MCP endpoint hosts connect to — `WIDGENTIC_MCP_PUBLIC_URL` when set, this origin's `/mcp` when the web service forwards it, otherwise the MCP service's default port on the app's host — with both key forms (the `x-api-key` header and `?key=`), and the one-time key reveal SHALL include the ready-to-paste `<endpoint>?key=<key>` form.

#### Scenario: The example adds no authoring behavior
- **WHEN** the example's authoring routes are compared with the published surface
- **THEN** the example SHALL contain wiring only — a store, a principal context and a mount — and no route logic, refusal mapping or validation of its own

#### Scenario: Saving publishes to the catalog
- **WHEN** a widget is saved from the designer
- **THEN** it SHALL be stored for the caller's principal and SHALL appear in that principal's composed catalog

#### Scenario: Every designer is present and complete
- **WHEN** the app is opened
- **THEN** the widget, theme, schema and action designers SHALL each be reachable, each able to create a new entry, open a stored one read-only, edit and save it, and delete it

#### Scenario: An agent drafts into the designer the person is looking at
- **WHEN** the app is open in a browser with a model context and the agent calls the widget draft-load tool with a valid definition
- **THEN** the widget section SHALL be shown with that definition in its designer and the tool result SHALL carry the designer's diagnostics — and the save control SHALL still be the person's

#### Scenario: No agent-capable browser
- **WHEN** the app is opened in a browser with no model context
- **THEN** every authoring function SHALL work as before and nothing about agent tools SHALL be shown

#### Scenario: An agent-capable browser is told
- **WHEN** the app is opened in a browser whose model context accepted the registrations
- **THEN** the header SHALL say that WebMCP tools are available in this browser

#### Scenario: The Keys section says where to connect
- **WHEN** the app runs with `WIDGENTIC_MCP_UPSTREAM` set and the Keys section is opened
- **THEN** it SHALL show this origin's `/mcp` as the endpoint with the header and query key forms
- **AND WHEN** a key is created
- **THEN** the one-time reveal SHALL include `<endpoint>?key=<the raw key>`

### Requirement: Identity resolves without an identity provider
By default the deployment SHALL serve a single fixed principal with no sign-in, and its documentation SHALL state that this mode belongs on localhost or a trusted network. Setting the trusted-header option SHALL opt into multi-user: the named request header's value SHALL become the identity subject through the store's existing subject-to-principal mapping, namespaced so it can never collide with a subject minted by another identity source, and the same value SHALL resolve to the same principal across restarts. When the option is not set the header SHALL have no effect whatsoever — a request carrying it SHALL be served the single fixed principal. When it is set the deployment SHALL fail closed: a request without the header, or with an empty one, SHALL be refused rather than served the default principal.

#### Scenario: No configuration, no sign-in
- **WHEN** the stack runs with no identity configuration
- **THEN** every request SHALL be served as one fixed principal and no sign-in SHALL be presented

#### Scenario: A spoofed header is inert by default
- **WHEN** the trusted-header option is unset and a request carries that header
- **THEN** the header SHALL be ignored and the default principal SHALL be served

#### Scenario: A proxied identity gets its own account
- **WHEN** the trusted-header option is set and two requests arrive with different header values
- **THEN** each SHALL resolve to its own principal, each seeing only its own entries, and a repeat of either value after a restart SHALL resolve to the same principal as before

#### Scenario: A misconfigured proxy fails closed
- **WHEN** the trusted-header option is set and a request arrives without that header
- **THEN** the request SHALL be refused and SHALL NOT be served the default principal

### Requirement: The deployment supplies its own key-encryption key
The deployment SHALL take its KEK from operator-supplied configuration — a file it mounts or an environment variable — and SHALL NOT generate one for itself. With no KEK configured the app SHALL disable its secrets surface and the store SHALL refuse secret writes and resolutions with `NO_CIPHER`, rather than accepting records that cannot be read back. Both services SHALL be configured with the same KEK, since the app writes records the MCP service resolves. The KEK SHALL NOT be written to the data volume and SHALL NOT appear in any log line, page or diagnostic.

This deployment holds its KEK in the process, which is weaker custody than widgentic's own hosted deployment, where the key lives in a managed vault and no process ever holds it. The example's documentation SHALL say so plainly rather than implying parity: it SHALL name the file-based key with restricted permissions or a platform secret as the way to supply it, SHALL warn against an image layer, a committed file or a shell history, SHALL state that whoever reads that material can decrypt every secret this deployment stores, and SHALL point a reader whose threat model needs more at the vault-backed cipher the same port already supports.

#### Scenario: No KEK, no secrets, no surprise
- **WHEN** the stack starts with no KEK configured
- **THEN** the app SHALL report the secrets surface as unavailable, secret writes SHALL be refused with `NO_CIPHER`, and everything else SHALL work

#### Scenario: The store file alone reveals nothing
- **WHEN** a secret is written and the database file is read directly
- **THEN** it SHALL contain the ciphertext record and SHALL NOT contain the value or the KEK

#### Scenario: A wrong KEK fails loudly
- **WHEN** the stack is restarted with a different KEK and a secret is resolved
- **THEN** the resolution SHALL fail with a structured error naming the failure, and the stored records SHALL be left intact

#### Scenario: The documentation ranks its own custody honestly
- **WHEN** a reader follows the example's secrets documentation
- **THEN** it SHALL state that the KEK is held in the process, SHALL name the mounted-file or platform-secret way to supply it and the ways not to, SHALL say what reading that material would allow, and SHALL name the vault-backed cipher as the stronger option

### Requirement: The image consumes published packages
The image SHALL install `@widgentic/core`, `@widgentic/designer`, `@widgentic/webmcp` and `@widgentic/mcp` from the registry at declared version ranges, never from a path, a workspace link or a tarball in the build context, so building it exercises exactly what a reader of the documentation would install. A module shared between the examples in this repository is part of the example, not the product, and MAY be referenced by path and copied into the build context. The example's documentation SHALL name the supported way to run it against unreleased package changes, and that way SHALL NOT be a committed dependency edit.

#### Scenario: The build resolves from the registry
- **WHEN** the image is built
- **THEN** every `@widgentic/*` dependency SHALL resolve from the registry at the declared ranges, and no `file:`, `link:`, `portal:` or workspace specifier SHALL name one of them in the example's manifest

#### Scenario: Unreleased changes have a documented path
- **WHEN** a reader wants to try an unreleased package change in the example
- **THEN** the documentation SHALL give a linking recipe that leaves the committed manifest unchanged

#### Scenario: The build proves the webmcp entry
- **WHEN** the image is built while `@widgentic/webmcp` is not yet on the registry at the declared range
- **THEN** the build SHALL fail at the import smoke rather than produce a container whose page cannot register tools
