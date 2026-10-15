## ADDED Requirements

### Requirement: Stylesheets reach the endpoint and the designers
The example's MCP endpoint SHALL compose the caller's `resources` on every request, with no cache and from the same single settings read that serves the default themes and the resource domains, and pass them to the server assembly. The authoring app SHALL pass the signed-in person's stylesheets to the widget and theme designers, so their island previews link them. A stylesheet saved in the Settings section SHALL reach the endpoint's next request and the next designer mount without a restart.

#### Scenario: A saved stylesheet reaches the next render
- **WHEN** a person saves `fonts.googleapis.com` and `fonts.gstatic.com` as resource domains and the Material Icons stylesheet in Settings, then an agent renders with that person's key
- **THEN** the result's `structuredContent.resources` SHALL hold the stylesheet, and a render with another principal's key SHALL carry none

#### Scenario: The designers preview with it
- **WHEN** that person opens the Widgets section after saving
- **THEN** the widget designer's preview SHALL carry the stylesheet in its `resources`
