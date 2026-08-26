# widget-secrets Specification

## Purpose
Per-principal secrets for http actions — credentials that are stored encrypted with a vault-held key, referenced by name, injected only server-side at execution time, never displayed again, and scrubbed from every diagnostic.

## Requirements

### Requirement: Secrets are stored as envelope-encrypted ciphertext
A secret SHALL be identified by a name matching `^[a-z][a-z0-9-]{0,63}$` and hold a value of at most 4 096 bytes. On write, the system SHALL generate a fresh random 256-bit data key, encrypt the value with AES-256-GCM under that data key, wrap the data key with the deployment's key-encryption key (KEK) through a cipher port, and persist only `{ alg, kekVersion, wrappedKey, iv, ciphertext, tag }` plus the name and timestamps. The plaintext value and the unwrapped data key SHALL never be persisted, listed, returned by any read API other than execution-time resolution, or logged. Two writes of the same value SHALL produce different ciphertext.

#### Scenario: A stored secret is unreadable without the KEK
- **WHEN** a secret is written and the store's serialized state is inspected
- **THEN** the state SHALL contain the ciphertext record and SHALL NOT contain the plaintext value

#### Scenario: Listing reveals names only
- **WHEN** the principal's secrets are listed
- **THEN** each entry SHALL carry `name`, `createdAt` and `updatedAt` and no value, preview or digest

#### Scenario: Oversized or misnamed secrets are refused
- **WHEN** a secret named `My Key` or a value over 4 096 bytes is written
- **THEN** the write SHALL be rejected with a structured error and nothing SHALL be stored

### Requirement: The KEK never leaves the vault
In production the cipher port SHALL wrap and unwrap data keys with a Key Vault key through the vault's cryptographic operations — the KEK material is never present in the process — using the identity each app already holds: the writing app wraps, the executing app unwraps, and both SHALL need only the wrap/unwrap role on that key (no secret-read permission). Every stored record SHALL name the KEK version that wrapped it, and the system SHALL be able to re-wrap a record under a newer KEK version without ever decrypting the secret value. For development and file-store rigs a local cipher keyed from an environment variable SHALL implement the same port, and the choice of cipher SHALL be deployment configuration, invisible to callers.

#### Scenario: Unwrap is the only production operation the executing app needs
- **WHEN** the executing app resolves a secret
- **THEN** it SHALL perform exactly one unwrap of that record's data key against the KEK version the record names, then decrypt locally

#### Scenario: Re-wrapping does not expose values
- **WHEN** the KEK is rotated and stored records are re-wrapped
- **THEN** each record's `wrappedKey` and `kekVersion` SHALL change while `ciphertext`, `iv` and `tag` SHALL be byte-identical

#### Scenario: Development rigs work without a vault
- **WHEN** the local cipher is configured and a secret is written and resolved
- **THEN** the round trip SHALL succeed with the same record shape as production

### Requirement: Secrets are referenced by name and injected at execution
An http action SHALL reference a secret only as `{ "secret": "<name>" }` in a header value or a query-parameter value; references SHALL NOT be accepted in the URL, the body or the input mapping. At execution the server SHALL resolve each reference from the executing principal's own secrets and substitute the value into the outbound request; a reference to a missing secret SHALL fail the execution with `UNKNOWN_SECRET` before any network activity. Secret values SHALL never appear in the rendered output, `structuredContent`, tool text, or model-context updates.

#### Scenario: A bearer token reaches the target and nothing else
- **WHEN** an action declares `headers: { Authorization: { secret: "weather-token" } }` and executes
- **THEN** the outbound request SHALL carry `Authorization: <the stored value>`
- **AND** the tool result, the re-rendered tree and the model-context update SHALL NOT contain that value

#### Scenario: References outside headers and query are refused
- **WHEN** a definition places `{ secret }` in `url`, in the input mapping or in a body field
- **THEN** validation SHALL fail with a structured error naming the field

### Requirement: Diagnostics are scrubbed of secret values
Every string the system emits about an execution — error messages, diagnostics, tool text, log lines — SHALL have each resolved secret value replaced by `***` before it is emitted, including values echoed back by the remote service. Outbound URLs that carry a secret as a query parameter SHALL NOT be logged in full.

#### Scenario: A remote error echoing the key is redacted
- **WHEN** the target responds `401 {"error":"invalid key sk-live-123"}` and the secret value is `sk-live-123`
- **THEN** the execution error SHALL read `invalid key ***` and the log line SHALL NOT contain `sk-live-123`

### Requirement: Secrets are write-only and lifecycle-safe
The authoring surfaces SHALL let a person set, replace and delete a secret and never show a value or a preview again after entry. A secret referenced by any of the principal's stored actions or widget-inline actions SHALL NOT be deletable (`SECRET_IN_USE`) until those references are removed; deleting a principal SHALL delete its secrets.

#### Scenario: Replacing keeps the name, changes the ciphertext
- **WHEN** an existing secret is set again with a new value
- **THEN** `updatedAt` SHALL advance, the record SHALL be re-encrypted under a fresh data key, and the name SHALL be unchanged

#### Scenario: In-use secrets survive deletion attempts
- **WHEN** deletion is requested for a secret referenced by an http action
- **THEN** the request SHALL fail with `SECRET_IN_USE` naming the referencing action and the secret SHALL remain
