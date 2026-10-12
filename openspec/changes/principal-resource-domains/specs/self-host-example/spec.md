## ADDED Requirements

### Requirement: The MCP endpoint declares each caller's resource domains
The example's MCP endpoint SHALL compose the caller's `resourceDomains` setting on every request, with no cache, and pass it to the server assembly. The app resource read with a principal's key therefore declares that principal's domains, another principal's key declares its own, and an anonymous caller declares none. The settings record SHALL be read once per request, and that one read serves the default themes and the resource domains alike. A failing settings read SHALL be logged and SHALL declare no domains, never failing the request. A domain saved in the Settings section SHALL be declared on the endpoint's next request without a restart.

#### Scenario: A principal's domains reach its app resource
- **WHEN** a principal saves `cdn.example.com` in Settings and an MCP client using that principal's key reads `ui://widgentic/app.html`
- **THEN** the read content's `_meta.ui.csp.resourceDomains` SHALL be `["https://cdn.example.com"]`

#### Scenario: Another caller declares its own
- **WHEN** a second principal with no domains, and then an anonymous caller, read the same resource
- **THEN** neither read SHALL carry a `csp` block

#### Scenario: One settings read per request
- **WHEN** a request composes for a principal whose settings hold both a light default theme and domains
- **THEN** the store's settings SHALL be read once for that request, and both the default theme and the declaration SHALL apply

#### Scenario: A saved change applies on the next request
- **WHEN** the principal removes `cdn.example.com` in Settings and saves, and the same MCP client reads the app resource again
- **THEN** the read SHALL carry no `csp` block, with no restart of either service
