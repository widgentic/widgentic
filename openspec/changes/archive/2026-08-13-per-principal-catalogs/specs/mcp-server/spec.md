# mcp-server — Delta: per-principal catalogs

## ADDED Requirements

### Requirement: Per-request principal resolution
When a store is configured, the runnable server SHALL resolve the caller's principal from the presented API key **before** constructing the request's server, and SHALL serve that principal's composed catalog and theme registry for the whole request. `createWidgenticServer(options?)` SHALL accept the composed `catalog` and `themes` rather than building its own, so the composition (and therefore the trust decision) happens at the transport edge where the key is read. A key that resolves to no principal SHALL fall back to the anonymous catalog — built-ins plus any entries the deployment supplies — never an error, and the server SHALL note the unresolved-key event on stderr **without** logging the key. With no store configured, behavior SHALL be exactly as before this change: the compiled-in custom widgets serve every caller.

#### Scenario: Two keys see two catalogs
- **WHEN** a request presents principal A's key and another presents principal B's key
- **THEN** `list_widgets` SHALL return A's kinds for the first and B's for the second
- **AND** neither listing SHALL contain the other's kinds
- **AND** both SHALL contain every built-in kind

#### Scenario: A principal's widget renders only for that principal
- **WHEN** principal A owns kind `report` and principal B calls `render_widget` with `widget: "report"`
- **THEN** B's result SHALL be `isError: true` with `code: "UNKNOWN_KIND"` and `report` absent from the available-kinds list

#### Scenario: Themes are resolved per principal too
- **WHEN** principal A owns a `brand` theme
- **THEN** `list_themes` SHALL include it for A and omit it for B
- **AND** `render_widget` with `theme: "brand"` SHALL resolve for A and return `UNKNOWN_THEME` for B

#### Scenario: Unknown keys degrade to anonymous, not to failure
- **WHEN** a request presents a key no principal owns
- **THEN** the tools SHALL still work over the anonymous catalog
- **AND** the key SHALL NOT appear in any log line

#### Scenario: No store configured preserves today's behavior
- **WHEN** the server runs without a store
- **THEN** every caller SHALL see the built-ins plus the compiled-in custom widgets, exactly as before

### Requirement: Composed catalogs never leak between requests
Each request SHALL compose fresh catalog and theme-registry instances; the server SHALL NOT hold a mutable catalog across requests or cache composed instances keyed by anything less specific than the principal. Registration performed while serving one request SHALL NOT be observable in another.

#### Scenario: Sequential requests do not accumulate kinds
- **WHEN** a request for principal A is served, then a request for the anonymous principal
- **THEN** the anonymous listing SHALL NOT contain A's kinds

#### Scenario: Concurrent requests stay isolated
- **WHEN** requests for principals A and B are served concurrently
- **THEN** each response SHALL reflect only its own principal's catalog
