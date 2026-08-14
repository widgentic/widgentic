# widgentic-app — accounts, keys, and the authoring surface

## ADDED Requirements

### Requirement: Accounts through two strictly validated sign-in methods
The app SHALL authenticate people by email through Entra External ID (OIDC code flow; the app validates issuer, audience, signature, and expiry on the ID token) and by GitHub through the app's own OAuth code flow (state-bound, code exchanged server-side, identity read from GitHub's user API) — GitHub cannot federate into External ID, which supports only OIDC-compliant custom providers. Both methods SHALL produce the app's own sealed session and SHALL map to a stable principal id through the same subject derivation, with GitHub subjects namespaced (`github:<id>`) so the two identity sources can never collide. The app SHALL never store passwords or provider access tokens. An unauthenticated request to any authoring route SHALL be refused, not silently downgraded.

#### Scenario: First sign-in provisions a principal
- **WHEN** a person signs in for the first time by either method
- **THEN** a principal SHALL be created with a stable id bound to that method's subject
- **AND** a subsequent sign-in by the same identity SHALL resolve to that same principal

#### Scenario: Both methods reach the same account model
- **WHEN** one person signs in with email and another with GitHub
- **THEN** each SHALL receive a principal through the same subject→principal derivation and the same session mechanism

#### Scenario: Invalid or expired sessions are refused
- **WHEN** a request carries no token, a malformed token, or an expired one
- **THEN** the response SHALL be `401` and no principal data SHALL be read or written

#### Scenario: Provider credentials never persist
- **WHEN** a GitHub sign-in completes
- **THEN** the session cookie SHALL carry only the namespaced subject and label
- **AND** the GitHub access token SHALL NOT appear in the session, the store, or any log

### Requirement: Multiple named API keys with individual revocation
A principal SHALL be able to hold several named API keys. Creating a key SHALL return the raw key **exactly once**, in the creation response only, and SHALL persist nothing but its `sha256:` digest, name, creation time and scopes — the app SHALL be incapable of displaying an existing key again and SHALL say so at the point of creation. Each key SHALL be revocable individually without affecting the others; a revoked key SHALL resolve to no principal, which places its bearer on the anonymous catalog exactly as any unknown key does.

#### Scenario: A created key works and is never shown again
- **WHEN** a key is created and then used against the MCP endpoint
- **THEN** it SHALL resolve to its principal and serve that principal's catalog
- **AND** listing keys afterwards SHALL show the name, creation time and a non-reversible identifier, never the key

#### Scenario: Rotation has no downtime window
- **WHEN** a second key is created while the first is still in use, and the first is then revoked
- **THEN** requests bearing the second SHALL keep working throughout
- **AND** requests bearing the revoked first SHALL fall back to the anonymous catalog

#### Scenario: Revocation is scoped to one key
- **WHEN** one of three keys is revoked
- **THEN** the other two SHALL continue to resolve to the principal

### Requirement: Writes are authorized by session, never by API key
The authoring API (widgets, themes, keys) SHALL accept only a validated session token. Presenting an MCP API key to a write endpoint SHALL be refused with `401`, regardless of the key's scopes. Every write SHALL be attributed to the session's principal — a request SHALL NOT be able to name a different principal as its target.

#### Scenario: An MCP key cannot write
- **WHEN** a request presents a valid MCP API key (and no session) to any authoring endpoint
- **THEN** the response SHALL be `401` and nothing SHALL be persisted

#### Scenario: A session cannot write into another principal
- **WHEN** an authenticated request supplies a principal id other than its own
- **THEN** the write SHALL be refused or applied to the session's own principal, never to the named one

#### Scenario: Stored entries pass the store's rules
- **WHEN** a widget or theme is submitted through the API
- **THEN** it SHALL be validated by the same rules the store enforces (template validity, reserved kinds, limits)
- **AND** a rejected entry SHALL return a structured error naming the rule, leaving existing entries untouched

### Requirement: Designing and publishing are the same act
The app SHALL host the widget designer and the theme designer against persistence: saving in the designer SHALL write through the authoring API to the signed-in principal's store, and the entry SHALL then appear in that principal's MCP catalog without any further step. The app SHALL load the principal's existing widgets and themes into the designers, and SHALL offer the principal's themes as the widget designer's preview options.

#### Scenario: A saved widget appears in the caller's catalog
- **WHEN** a signed-in user saves a widget in the designer and then calls `list_widgets` with one of their keys
- **THEN** the saved kind SHALL appear in that listing
- **AND** it SHALL NOT appear for any other principal or for the anonymous catalog

#### Scenario: A saved theme is selectable and renderable
- **WHEN** a user saves a theme and calls `render_widget` with `theme: "<its name>"` using their key
- **THEN** the theme SHALL resolve and apply
- **AND** `list_themes` SHALL include it for that principal only

#### Scenario: Existing entries load back into the designers
- **WHEN** a signed-in user opens the designers
- **THEN** their stored widgets and themes SHALL be listed and loadable for editing
