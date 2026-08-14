# widget-designer — copy-as-TypeScript follows the example widgets

## MODIFIED Requirements

### Requirement: Import and export in the server's shapes
The designer SHALL export the draft as JSON in exactly the `CustomWidget` shape (`{ kind, template, descriptor }`) and themes as bare token maps, and SHALL import the same shapes, re-validating everything on load (imports are untrusted input; invalid imports are rejected with the structured errors, leaving the current draft untouched). A copy-as-TypeScript convenience SHALL emit a module body compatible with `examples/mcp-server/widgets/` for manual registration. Exported widget JSON loaded back SHALL round-trip to a deep-equal draft.

#### Scenario: Export/import round-trips
- **WHEN** a draft equivalent to the invoice example is exported and re-imported
- **THEN** the resulting draft SHALL deep-equal the original

#### Scenario: Invalid imports never clobber the draft
- **WHEN** an import contains a template failing validation
- **THEN** the current draft SHALL remain and the import errors SHALL be shown
