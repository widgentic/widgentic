## ADDED Requirements

### Requirement: SQLite adapter for single-node deployments
The store port SHALL have an implementation over a single SQLite database file, shipped from its own subpath entry, built on the Node runtime's built-in SQLite so that it requires no dependency — not even an optional peer. It SHALL implement the writable port in full and SHALL honour the writable-store contract: round-trips for widgets, themes, schemas, actions and secrets; deletes scoped to one principal; per-principal limits; refusal of invalid entries with the same structured codes; the key lifecycle (create, resolve, revoke, unknown); linked identities; and referential integrity on delete. Every entry SHALL survive a process restart. The database SHALL be opened so that a reading process and a writing process may hold the same file at once, and a write SHALL be committed whole or not at all — a refused or failed write SHALL leave no partial state. Key resolution SHALL be a single indexed lookup on the presented key's digest. The database SHALL never hold raw key material or a plaintext secret value.

#### Scenario: The adapter honours the store contract
- **WHEN** the writable-store contract suite is run against the SQLite adapter, including reopening a new store over the same file
- **THEN** every case SHALL pass, with the same refusal codes as the reference implementations

#### Scenario: Entries outlive the process
- **WHEN** a principal's widgets, themes, schemas, actions, keys and secrets are written, the store is closed, and a new store is opened over the same file
- **THEN** every entry SHALL resolve exactly as before, and a key minted before the restart SHALL still resolve to its principal

#### Scenario: A reader sees a writer's committed entry
- **WHEN** one connection writes a widget and a second connection over the same file lists that principal's widgets
- **THEN** the second connection SHALL see the widget without reopening the file

#### Scenario: A refused write leaves nothing behind
- **WHEN** a write is refused for exceeding a limit or failing validation
- **THEN** the store SHALL be byte-for-byte unchanged with respect to that entry, and no row, index entry or orphaned reference SHALL remain

#### Scenario: Keys are digests, looked up once
- **WHEN** a key is created and later presented
- **THEN** resolution SHALL be one indexed lookup on the digest, and the database file SHALL contain the digest and never the raw key

#### Scenario: The adapter installs nothing
- **WHEN** a host installs `@widgentic/mcp` alone and imports the SQLite entry
- **THEN** the import SHALL succeed with no additional package installed, and the entry SHALL import nothing outside the package and the Node runtime
