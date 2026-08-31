## MODIFIED Requirements

### Requirement: The KEK never leaves the vault
In a vault-backed deployment the cipher port SHALL wrap and unwrap data keys with a Key Vault key through the vault's cryptographic operations — the KEK material is never present in the process — using the identity each app already holds: the writing app wraps, the executing app unwraps, and both SHALL need only the wrap/unwrap role on that key (no secret-read permission). This SHALL remain the posture of widgentic's own deployment: its KEK lives in a managed vault, no process ever holds it, and no configuration path exists that would put it there. Every stored record SHALL name the KEK version that wrapped it, and the system SHALL be able to re-wrap a record under a newer KEK version without ever decrypting the secret value. For development rigs and for self-hosted single-node deployments a local cipher keyed from an environment variable or from a file the operator supplies SHALL implement the same port, holding that KEK in the process for the lifetime of the process; the choice of cipher SHALL be deployment configuration, invisible to callers. A deployment that keeps its KEK in the process SHALL protect that material with at least the care owed to the credentials it encrypts — restricted file permissions or a platform secret rather than an image layer, a committed file or a shell history — and SHALL state in its own documentation that whoever can read it can decrypt that deployment's records; documentation for a self-hosted path SHALL NOT present it as equivalent in strength to the vault-backed one. The KEK version SHALL be derived from the configured key identifier whether or not a client is injected; a versionless identifier SHALL record the version the vault reports on wrap; an unwrap for a version that is neither current nor listed as previous SHALL fail with a clear `DECRYPTION_FAILED` naming the unknown version.

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

#### Scenario: A process-held KEK is documented as the weaker custody
- **WHEN** documentation describes running with the local cipher
- **THEN** it SHALL name the vault-backed arrangement as the stronger one, SHALL state what reading the KEK material would allow, and SHALL give the operator a concrete way to protect it
