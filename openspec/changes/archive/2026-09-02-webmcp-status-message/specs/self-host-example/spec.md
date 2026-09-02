## MODIFIED Requirements

### Requirement: The app mounts the authoring surface and the designers
The authoring app SHALL serve its authoring routes by mounting the published authoring surface over the deployment's store, adding no route of its own beside it and reimplementing none of its behavior — the refusal codes, the write-only secrets, the one-time key reveal and the production-path test call are that surface's, not the example's. It SHALL mount the widget, theme, schema and action designers against those routes so that every authoring function of the hosted app is present: list, create, replace by name, view an existing entry read-only, delete, test an action, write a secret, mint and revoke a key. It SHALL NOT carry a landing page or brand assets, and it SHALL NOT expose identity routes while running without an identity subject. It SHALL register the published WebMCP designer tools once per page load with sources that open the corresponding section and return its live designer; when an agent-capable browser registered them it SHALL tell the person so ("WebMCP tools are available in this browser", with a refused count when any registration was refused), and otherwise SHALL show nothing about agent tools and behave identically to a browser without a model context. When the environment supplies a Chrome origin-trial token (`WIDGENTIC_ORIGIN_TRIAL_TOKEN`) the served page SHALL carry it as an `origin-trial` meta tag; no token SHALL be committed.

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
