## ADDED Requirements

### Requirement: Stylesheets come from settings
For each caller, render results SHALL carry the stylesheets of the caller's effective `resources` settings section in `structuredContent.resources`, as the bundle delivers them ("Stylesheet resources reach the frame and the page" in `mcp-server`).
- **The effective section** SHALL follow the settings combination of "Default themes come from settings, at startup and per principal": in `Merge` a principal's `resources` section replaces the startup record's whole, in `Replace` only the principal's record applies, and without a source the startup record applies.
- **Coverage.** A stylesheet SHALL be delivered only when a domain declared for that caller covers its host: `WidgenticOptions.ResourceDomains`, then the effective `resourceDomains` section.
- **Refusals.** A refused or uncovered entry SHALL be skipped and logged with section `settings`, its name and its code, and SHALL never fail the request.

#### Scenario: Startup settings deliver their stylesheets
- **WHEN** the server is configured with `ResourceDomains = ["fonts.googleapis.com"]` and a startup record `{ "resources": [{ "type": "stylesheet", "href": "https://fonts.googleapis.com/icon?family=Material+Icons" }] }`, and a client calls `render_widget`
- **THEN** the result's `structuredContent.resources` SHALL hold that stylesheet

#### Scenario: Principals get only their own stylesheets
- **WHEN** principals A and B in `Replace` mode each return settings with a stylesheet the other lacks, on domains each declares, and render concurrently against a pool of 4
- **THEN** each result SHALL carry its own principal's stylesheet and not the other's

#### Scenario: An uncovered stylesheet is skipped and logged
- **WHEN** a principal's settings carry a stylesheet whose host no declared domain covers
- **THEN** its renders SHALL carry no `resources`, the request SHALL succeed, and a log entry SHALL name the section `settings` and the code `UNDECLARED_DOMAIN`
