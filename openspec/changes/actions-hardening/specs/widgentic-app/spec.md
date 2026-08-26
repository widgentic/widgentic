# widgentic-app — actions-hardening delta

## MODIFIED Requirements

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

### Requirement: Secrets section is write-only
The app SHALL offer a Secrets section where a person sets, replaces and deletes named secrets through a password-style field. After entry the app SHALL never display a value, a preview or a length; the list SHALL show names and timestamps only. Deleting a secret in use SHALL be refused with the referencing actions named. When the deployment has no cipher, secret writes and deletes SHALL be refused with the same signal the listing exposes, not only the listing.

#### Scenario: A saved secret is never shown again
- **WHEN** a secret is set and the section reloads
- **THEN** the list SHALL show its name and timestamps and the app SHALL offer Replace and Delete, never Show or Copy

#### Scenario: No cipher means no writes either
- **WHEN** `enabled` is false and a `PUT /api/secrets/<name>` arrives
- **THEN** the response SHALL be `503 NO_CIPHER`

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
