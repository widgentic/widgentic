# widget-secrets — actions-hardening delta

## MODIFIED Requirements

### Requirement: Secrets are stored as envelope-encrypted ciphertext
A secret SHALL be identified by a name matching `^[a-z][a-z0-9-]{0,63}$` and hold a value of at least 8 and at most 4 096 bytes (`INVALID_SECRET_VALUE` for empty, non-string or too-short values; `SECRET_TOO_LARGE` above the cap). On write, the system SHALL generate a fresh random 256-bit data key, encrypt the value with AES-256-GCM under that data key, wrap the data key with the deployment's key-encryption key (KEK) through a cipher port, and persist only `{ alg, kekVersion, wrappedKey, iv, ciphertext, tag }` plus the name and timestamps. The plaintext value and the unwrapped data key SHALL never be persisted, listed, returned by any read API other than execution-time resolution, or logged. Two writes of the same value SHALL produce different ciphertext. Reading a record SHALL decode `iv`, `tag` and `wrappedKey` strictly (12-byte iv, 16-byte tag, non-empty key) and refuse malformed records with `INVALID_ENVELOPE` before any unwrap; re-wrapping SHALL go through the same guarded unwrap as decryption and SHALL build the new record field by field (no foreign fields carried); the data key SHALL be zeroed even when wrapping fails.

#### Scenario: A stored secret is unreadable without the KEK
- **WHEN** a secret is written and the store's serialized state is inspected
- **THEN** the state SHALL contain the ciphertext record and SHALL NOT contain the plaintext value

#### Scenario: Listing reveals names only
- **WHEN** the principal's secrets are listed
- **THEN** each entry SHALL carry `name`, `createdAt` and `updatedAt` and no value, preview or digest

#### Scenario: Oversized or misnamed secrets are refused
- **WHEN** a secret named `My Key` or a value over 4 096 bytes is written
- **THEN** the write SHALL be rejected with a structured error and nothing SHALL be stored

#### Scenario: Short and malformed inputs are refused with the right code
- **WHEN** a 3-byte value is written, or a record with a 4-byte `iv` is decrypted
- **THEN** the errors SHALL be `INVALID_SECRET_VALUE` and `INVALID_ENVELOPE` respectively

### Requirement: The KEK never leaves the vault
In production the cipher port SHALL wrap and unwrap data keys with a Key Vault key through the vault's cryptographic operations — the KEK material is never present in the process — using the identity each app already holds: the writing app wraps, the executing app unwraps, and both SHALL need only the wrap/unwrap role on that key (no secret-read permission). Every stored record SHALL name the KEK version that wrapped it, and the system SHALL be able to re-wrap a record under a newer KEK version without ever decrypting the secret value. For development and file-store rigs a local cipher keyed from an environment variable SHALL implement the same port, and the choice of cipher SHALL be deployment configuration, invisible to callers. The KEK version SHALL be derived from the configured key identifier whether or not a client is injected; a versionless identifier SHALL record the version the vault reports on wrap; an unwrap for a version that is neither current nor listed as previous SHALL fail with a clear `DECRYPTION_FAILED` naming the unknown version.

#### Scenario: Unwrap is the only production operation the executing app needs
- **WHEN** the executing app resolves a secret
- **THEN** it SHALL perform exactly one unwrap of that record's data key against the KEK version the record names, then decrypt locally

#### Scenario: Re-wrapping does not expose values
- **WHEN** the KEK is rotated and stored records are re-wrapped
- **THEN** each record's `wrappedKey` and `kekVersion` SHALL change while `ciphertext`, `iv` and `tag` SHALL be byte-identical

#### Scenario: Development rigs work without a vault
- **WHEN** the local cipher is configured and a secret is written and resolved
- **THEN** the round trip SHALL succeed with the same record shape as production

#### Scenario: Versions are recorded and unknown ones fail clearly
- **WHEN** a cipher is built with a versioned `keyId` and an injected client
- **THEN** records SHALL carry that version
- **AND WHEN** a record names a version the cipher does not hold
- **THEN** resolution SHALL fail with `DECRYPTION_FAILED` mentioning the version

### Requirement: Diagnostics are scrubbed of secret values
Every string the system emits about an execution — error messages, diagnostics, tool text, log lines — SHALL have each resolved secret value replaced by `***` before it is emitted, including values echoed back by the remote service. Outbound URLs that carry a secret as a query parameter SHALL NOT be logged in full. Redaction SHALL also cover the percent-encoded and JSON-escaped forms of each value and SHALL scrub object KEYS as well as values; error text originating in the store or the vault SHALL be replaced by a fixed message before it leaves the server.

#### Scenario: A remote error echoing the key is redacted
- **WHEN** the target responds `401 {"error":"invalid key sk-live-123"}` and the secret value is `sk-live-123`
- **THEN** the execution error SHALL read `invalid key ***` and the log line SHALL NOT contain `sk-live-123`

#### Scenario: Encoded echoes are redacted too
- **WHEN** the target echoes the request URL containing `key=sk%2Blive%2F1` for the secret `sk+live/1`
- **THEN** the emitted message SHALL contain `***` and neither form of the value
