## MODIFIED Requirements

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
The authoring app SHALL serve its authoring routes by mounting the published authoring surface over the deployment's store, adding no route of its own beside it and reimplementing none of its behavior — the refusal codes, the write-only secrets, the one-time key reveal and the production-path test call are that surface's, not the example's. It SHALL mount the widget, theme, schema and action designers against those routes so that every authoring function of the hosted app is present: list, create, replace by name, view an existing entry read-only, delete, test an action, write a secret, mint and revoke a key. It SHALL NOT carry a landing page or brand assets, and it SHALL NOT expose identity routes while running without an identity subject. It SHALL register the published WebMCP designer tools once per page load with sources that open the corresponding section and return its live designer, SHALL show whether an agent-capable browser registered them ("agent tools: N registered" or "no agent-capable browser"), and SHALL behave identically in a browser without a model context. When the environment supplies a Chrome origin-trial token (`WIDGENTIC_ORIGIN_TRIAL_TOKEN`) the served page SHALL carry it as an `origin-trial` meta tag; no token SHALL be committed.

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
- **THEN** every authoring function SHALL work as before and the status SHALL read that no agent-capable browser is present

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
