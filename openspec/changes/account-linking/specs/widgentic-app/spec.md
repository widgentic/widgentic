# Widgentic App — account linking delta

## MODIFIED Requirements

### Requirement: Accounts through two strictly validated sign-in methods
The app SHALL authenticate people by email through Entra External ID (OIDC code flow; the app validates issuer, audience, signature, and expiry on the ID token) and by GitHub through the app's own OAuth code flow (state-bound, code exchanged server-side, identity read from GitHub's user API) — GitHub cannot federate into External ID, which supports only OIDC-compliant custom providers. Both methods SHALL produce the app's own sealed session and SHALL map to a stable principal id through the same subject derivation, with GitHub subjects namespaced (`github:<id>`) so the two identity sources can never collide. The app SHALL never store passwords or provider access tokens. An unauthenticated request to any authoring route SHALL be refused, not silently downgraded. A signed-in person SHALL be able to LINK the other sign-in method to their account: the link flow reuses the provider's full validation (state-bound, server-side exchange) while carrying a session-bound link intent, and on success the new subject resolves to the CURRENT principal instead of provisioning a new one. The app SHALL show the signed-in identity and its linked identities, refuse link conflicts with the store's `SUBJECT_IN_USE` message, and allow unlinking any linked identity through a session-authorized route — never the primary.

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

#### Scenario: Linking the other method joins the catalogs
- **WHEN** an email-signed-in person links GitHub and later signs in with GitHub
- **THEN** they SHALL land in the same principal with the same widgets, themes, schemas, and keys

#### Scenario: A link conflict is refused, not merged
- **WHEN** the GitHub identity being linked already owns widgets under its own account
- **THEN** the link SHALL fail with a message naming the conflict
- **AND** both accounts SHALL remain unchanged

#### Scenario: Link intent cannot be forged across sessions
- **WHEN** a link callback arrives without a live session or with a state not bound to it
- **THEN** no link SHALL be created

#### Scenario: Unlink through the Identities section
- **WHEN** a linked identity is unlinked
- **THEN** signing in with it later SHALL provision a fresh principal
- **AND** the primary identity SHALL offer no unlink action
