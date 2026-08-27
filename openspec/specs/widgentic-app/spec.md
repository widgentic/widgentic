# widgentic-app Specification

## Purpose
The widgentic.dev app: the authenticated front door to per-principal catalogs. People sign in by email (Entra External ID) or GitHub (first-party OAuth), receive a stable principal, mint named revocable API keys (shown exactly once, stored as digests), and design widgets and themes in the hosted designers — saving writes through a session-authenticated API into the caller's store, so an entry appears in that principal's MCP catalog on the next tool call. Writes are authorized by sessions only; MCP API keys never write. This capability owns accounts, sessions, the key lifecycle, the authoring API, and designer hosting; storage semantics live in widget-store.

## Requirements
### Requirement: Accounts through two strictly validated sign-in methods
The app SHALL authenticate people by email through Entra External ID (OIDC code flow; the app validates issuer, audience, signature, and expiry on the ID token) and by GitHub through the app's own OAuth code flow (state-bound, code exchanged server-side, identity read from GitHub's user API) — GitHub cannot federate into External ID, which supports only OIDC-compliant custom providers. Both methods SHALL produce the app's own sealed session and SHALL map to a stable principal id through the same subject derivation, with GitHub subjects namespaced (`github:<id>`) so the two identity sources can never collide. The app SHALL never store passwords or provider access tokens. An unauthenticated request to any authoring route SHALL be refused, not silently downgraded. A signed-in person SHALL be able to LINK the other sign-in method to their account: the link flow reuses the provider's full validation (state-bound, server-side exchange) while carrying a session-bound link intent, and on success the new subject resolves to the CURRENT principal instead of provisioning a new one. The app SHALL show the account's FULL identity set — primary and linked — from whichever identity is signed in, displaying each identity by a human-friendly label (the GitHub login, the email address, or the provider's display name; raw subjects are secondary), refuse link conflicts with the store's `SUBJECT_IN_USE` message, and allow unlinking any linked identity through a session-authorized route — never the primary.

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

#### Scenario: Both sides see the whole account
- **WHEN** the linked identity signs in and opens the Identities section
- **THEN** the primary identity SHALL be visible and marked as primary
- **AND** no link button SHALL be offered for a provider already attached

#### Scenario: Identities read as accounts, not identifiers
- **WHEN** a GitHub identity and an email identity are attached
- **THEN** each SHALL display its login or email address rather than the raw subject

#### Scenario: Unlink through the Identities section
- **WHEN** a linked identity is unlinked
- **THEN** signing in with it later SHALL provision a fresh principal
- **AND** the primary identity SHALL offer no unlink action

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
The authoring API (widgets, themes, schemas, keys) SHALL accept only a validated session token. Presenting an MCP API key to a write endpoint SHALL be refused with `401`, regardless of the key's scopes. Every write SHALL be attributed to the session's principal — a request SHALL NOT be able to name a different principal as its target.

#### Scenario: An MCP key cannot write
- **WHEN** a request presents a valid MCP API key (and no session) to any authoring endpoint
- **THEN** the response SHALL be `401` and nothing SHALL be persisted

#### Scenario: A session cannot write into another principal
- **WHEN** an authenticated request supplies a principal id other than its own
- **THEN** the write SHALL be refused or applied to the session's own principal, never to the named one

#### Scenario: Stored entries pass the store's rules
- **WHEN** a widget, theme, or schema is submitted through the API
- **THEN** it SHALL be validated by the same rules the store enforces (template validity, reserved kinds, limits)
- **AND** a rejected entry SHALL return a structured error naming the rule, leaving existing entries untouched

### Requirement: Designing and publishing are the same act
The app SHALL host the widget designer and the theme designer against persistence: saving in the designer SHALL write through the authoring API to the signed-in principal's store, and the entry SHALL then appear in that principal's MCP catalog without any further step. The app SHALL load the principal's existing widgets and themes into the designers, and SHALL offer the principal's themes as the widget designer's preview options. Selecting a stored entry from the list SHALL open it in the designer in read-only mode — editing disabled, preview and preview selectors live — with `Edit` and `Delete` as the entry's actions. `Edit` SHALL switch the designer to edit mode: the entry's actions become `Save` and `Cancel`, and the `New` control SHALL be hidden while an existing entry is under edit. `Save to my catalog` SHALL be visible only while designing a NEW entry — selecting a stored entry hides it (that entry saves through its own row), and it returns when `New` is pressed. Stored widget and theme rows SHALL additionally offer `Copy`: it opens the designer in NEW mode seeded with a copy of that entry under a distinct identity (the source untouched), so `Save to my catalog` creates a separate entry. The `New` control for widgets SHALL also offer starting from a built-in (`card`, `table`, `tree`) via the seeded starter templates, and for themes from the `light`/`dark` presets; seeded identities SHALL avoid the principal's existing kinds/names. The app SHALL also supply the principal's stored widgets to the theme designer so its preview-kind selector covers their own widgets, not only the built-in kinds. `Save` SHALL persist through the authoring API and return to read-only mode; `Cancel` SHALL discard the edits and restore the stored entry in read-only mode. Data schemas SHALL be a managed section under the same regime: listed beside widgets and themes, opened read-only on selection with `Edit`/`Delete`, edited through the hosted schema designer with the same `Save`/`Cancel` row actions and the same new-drafts-only `Save to my catalog` rule, persisted through session-authorized schema routes. The app SHALL supply the principal's schemas to the widget designer so drafts can reference them, and the store's referenced-schema deletion refusal SHALL surface to the user naming the referencing widgets — never as a silent failure. Actions SHALL be a managed section under the same regime — listed beside widgets, themes and schemas, opened read-only on selection with `Edit`/`Delete`, edited through the hosted action designer with the same `Save`/`Cancel` row actions and the same new-drafts-only `Save to my catalog` rule, persisted through session-authorized action routes — with the test-call and prompt-notice rules of the Actions section requirement. The app SHALL supply the principal's shared actions and secret names to the widget designer so drafts can bind elements: binding an element SHALL offer the shared actions by name or an inline definition (`{ definition }`), an input mapping editor listing the action's input fields (each a template path — with `$root`, `$parent` and `$index` available — or a constant), and the output mode with its `path`/`map` fields; the widget-level `load` binding SHALL be offered for http GET actions only; the designer preview SHALL render bound elements with an inert badge (nothing executes from a preview). The store's referenced-action and referenced-secret deletion refusals SHALL surface to the user naming the referencing entries, exactly as the schema refusal does.

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

#### Scenario: Selecting a stored entry opens it read-only
- **WHEN** a stored widget or theme is selected from its list
- **THEN** the designer SHALL load it read-only with the preview live
- **AND** the entry SHALL offer `Edit` and `Delete`

#### Scenario: Edit mode swaps the actions and hides the top controls
- **WHEN** `Edit` is clicked on the selected entry
- **THEN** the designer SHALL become editable and the entry's actions SHALL become `Save` and `Cancel`
- **AND** the `New` and `Save to my catalog` controls SHALL be hidden until the edit ends

#### Scenario: Save to my catalog belongs to new entries only
- **WHEN** a stored entry is selected (read-only or under edit)
- **THEN** `Save to my catalog` SHALL be hidden
- **AND WHEN** `New` is pressed
- **THEN** it SHALL be visible again

#### Scenario: The theme designer previews the principal's own widgets
- **WHEN** a signed-in user with a stored widget opens the theme designer
- **THEN** that widget's kind SHALL be selectable in the preview-kind selector

#### Scenario: Cancel abandons the edits
- **WHEN** `Cancel` is clicked during an edit
- **THEN** the designer SHALL show the stored entry unchanged, back in read-only mode

#### Scenario: Schemas are a managed section
- **WHEN** a signed-in user saves a `person` schema
- **THEN** it SHALL appear in the Data schemas list, opening read-only on selection with `Edit` and `Delete`
- **AND** it SHALL be selectable in the widget designer's shared-schema mode

#### Scenario: A schema edit propagates to referencing widgets
- **WHEN** a stored `person-card` widget references the `person` schema and the schema is edited and saved
- **THEN** the next render of `person-card` through the principal's MCP catalog SHALL validate against the updated schema, without the widget itself being touched

#### Scenario: Deleting a referenced schema is refused with the widgets named
- **WHEN** `Delete` is pressed on a schema that stored widgets reference
- **THEN** the deletion SHALL be refused and the error shown SHALL name the referencing widgets
- **AND** the schema SHALL remain listed and intact

#### Scenario: Copy seeds a new widget
- **WHEN** `Copy` is clicked on a stored `person-card` row
- **THEN** the designer SHALL open editable in NEW mode with a copy of the widget under a different kind
- **AND** `Save to my catalog` SHALL create the new entry while `person-card` remains unchanged

#### Scenario: Copy seeds a new theme
- **WHEN** `Copy` is clicked on a stored theme row
- **THEN** the theme designer SHALL open in NEW mode with the tokens copied under a distinct, non-reserved name

#### Scenario: New from a built-in or preset
- **WHEN** the user starts a new widget from `table` or a new theme from `dark`
- **THEN** the designer SHALL open with the corresponding seeded starter, rendering recognizably like the source before any edit

#### Scenario: Actions are a managed section
- **WHEN** a signed-in user saves a `refresh` http action
- **THEN** it SHALL appear in the Actions list, opening read-only on selection with `Edit` and `Delete`
- **AND** it SHALL be offered by name when binding an element in the widget designer

#### Scenario: A bound widget publishes its bindings
- **WHEN** a widget whose button binds a shared action is saved and rendered under an `execute` key
- **THEN** the rendered element SHALL carry the action descriptor with arguments resolved from the render's data

### Requirement: Actions section
The app SHALL offer an Actions section beside Widgets, Themes and Schemas where a signed-in person creates, edits and deletes their shared actions. An http action SHALL be savable only after a test call succeeds: the app builds an input form from the action's input schema (pre-filled from the schema's example where present), runs the call **through the same server-side execution path production uses** (never from the browser), and requires the response to validate against the output schema; the test result SHALL be shown with secret values redacted. A prompt action SHALL show, at save, an explicit notice that the proposed message content is the author's responsibility and will be placed in the user's composer for them to send. Deleting an action in use SHALL be refused with the referencing widgets named. Writes SHALL be authorized by session, never by API key, as for every other entity. The test call SHALL be served at `POST /api/action-test` (so an action may be named `test`), SHALL be subject to the same per-principal execution limiter as `execute_action`, and SHALL answer malformed definitions with a structured `{ ok: false, code, message }` rather than a 500.

#### Scenario: An http action must prove itself before saving
- **WHEN** a person fills in an http action and clicks Save without a successful test call
- **THEN** Save SHALL be unavailable and the app SHALL say a passing test call is required
- **AND WHEN** the test call succeeds and its response validates
- **THEN** Save SHALL be available and the action SHALL persist

#### Scenario: A test call is a production-path call
- **WHEN** a test call runs
- **THEN** it SHALL be performed server-side with the same SSRF guard, secret injection and response validation as `execute_action`, and its displayed result SHALL contain `***` in place of any secret value

#### Scenario: Prompt actions carry a responsibility notice
- **WHEN** a prompt action is saved
- **THEN** the app SHALL have shown the notice and the save SHALL proceed only after it is acknowledged (a declined notice saves nothing)

#### Scenario: The test route neither shadows names nor amplifies
- **WHEN** an action named `test` is saved and the test call is invoked repeatedly beyond the limit
- **THEN** the save SHALL succeed and the excess test calls SHALL answer `RATE_LIMITED`

### Requirement: Authoring feedback is visible where the eye is
Every asynchronous authoring operation (save, delete, key creation, secret writes, the action test call) SHALL mark the control that triggered it busy — disabled, with a visible in-progress indicator — until it settles, and SHALL announce a pending message. Notifications (results, validation refusals, errors) SHALL render in a banner directly under the app header — never in a corner — with a distinct error tone for failures, and SHALL be dismissible. The busy control SHALL be the control that actually triggered the operation, passed explicitly (never inferred from focus), and every pending banner SHALL resolve into a final message or be cleared when the operation settles.

#### Scenario: A save shows its progress on the button that started it
- **WHEN** a person clicks Save on an entry
- **THEN** that button SHALL be disabled and show an in-progress indicator until the request settles, and the banner SHALL read a pending message

#### Scenario: Refusals are readable
- **WHEN** a save is refused (for example an http action without a passing test call)
- **THEN** the message SHALL appear in the banner under the header in the error tone

#### Scenario: Key creation resolves its banner
- **WHEN** a key is created
- **THEN** the banner SHALL show the final message (the key is ready) and no pending text SHALL linger

### Requirement: Secrets section is write-only
The app SHALL offer a Secrets section where a person sets, replaces and deletes named secrets through a password-style field. After entry the app SHALL never display a value, a preview or a length; the list SHALL show names and timestamps only. Deleting a secret in use SHALL be refused with the referencing actions named. When the deployment has no cipher, secret writes and deletes SHALL be refused with the same signal the listing exposes, not only the listing.

#### Scenario: A saved secret is never shown again
- **WHEN** a secret is set and the section reloads
- **THEN** the list SHALL show its name and timestamps and the app SHALL offer Replace and Delete, never Show or Copy

#### Scenario: No cipher means no writes either
- **WHEN** `enabled` is false and a `PUT /api/secrets/<name>` arrives
- **THEN** the response SHALL be `503 NO_CIPHER`

### Requirement: Key scopes are chosen at creation
The key-creation form SHALL offer the `execute` scope as an explicit opt-in (`read` is always granted), SHALL explain that `execute` lets widgets run http actions with the principal's secrets, and SHALL show each key's scopes in the list. Scopes SHALL NOT be editable after creation — granting `execute` to an existing integration means creating a new key.

#### Scenario: Execute is opt-in
- **WHEN** a key is created with the default form
- **THEN** it SHALL carry `["read"]`
- **AND WHEN** the person ticks Execute
- **THEN** it SHALL carry `["read", "execute"]` and the list SHALL show that
