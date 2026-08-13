# widget-store — the Cosmos adapter and the writable port

## MODIFIED Requirements

### Requirement: Store programmatic surface
The package SHALL export from a `./store` entry: the `WidgetStore` port (`resolvePrincipal(apiKey: string): Promise<Principal | undefined>`, `widgets(principalId: string): Promise<StoredWidget[]>`, `themes(principalId: string): Promise<ThemeEntry[]>`), the `Principal` (`{ id, label?, scopes }`), `StoredWidget` (`{ kind, template, descriptor }`) and `StoreLimits` types, the reference implementations `createMemoryStore(seed?)` and `createFileStore(dir, limits?)`, the composition functions `composeCatalog(store, principalId, options?)` and `composeThemes(store, principalId, options?)`, and `ANONYMOUS_PRINCIPAL`. The entry SHALL depend only on other widgentic public entries and Node's standard library, and SHALL perform no network I/O.

The entry SHALL additionally export a `WritableWidgetStore` port that extends `WidgetStore` with `putWidget(principalId, widget)`, `deleteWidget(principalId, kind)`, `putTheme(principalId, theme)`, `deleteTheme(principalId, name)`, `ensurePrincipal(subject, label?)`, `createKey(principalId, name)`, `listKeys(principalId)` and `revokeKey(principalId, keyId)`. Writability SHALL be a **separate type**, so a host holding a `WidgetStore` cannot write through it and a read-only deployment need not implement the write half. `createMemoryStore` SHALL satisfy `WritableWidgetStore` so the write contract is testable without a database. Adapters that reach a network service SHALL live behind their own entry (`./store/cosmos`), leaving `./store` itself free of network I/O.

#### Scenario: Memory store round-trips entries
- **WHEN** `createMemoryStore` is seeded with a principal owning one widget and one theme
- **THEN** `widgets(id)` and `themes(id)` SHALL return them, and an unknown principal id SHALL return empty arrays

#### Scenario: File store reads a principal directory
- **WHEN** a directory holds `<dir>/<principal>/widgets/*.json` and `<dir>/<principal>/themes/*.json`
- **THEN** `createFileStore(dir)` SHALL load those entries for that principal
- **AND** a missing directory SHALL yield empty arrays rather than an error

#### Scenario: Writes round-trip through the writable port
- **WHEN** a widget is written with `putWidget` and a theme with `putTheme`
- **THEN** `widgets` and `themes` for that principal SHALL include them
- **AND** `deleteWidget` / `deleteTheme` SHALL remove them, leaving the principal's other entries intact

#### Scenario: A read-only handle exposes no writes
- **WHEN** a value typed as `WidgetStore` is used
- **THEN** the write methods SHALL NOT be reachable through that type

## ADDED Requirements

### Requirement: Cosmos adapter with point-read key lookup
A `createCosmosStore(options)` adapter SHALL implement `WritableWidgetStore` against Azure Cosmos DB over two containers: `data` partitioned by `/principalId`, holding one document per principal with ids `profile`, `widget:<kind>` and `theme:<name>`; and `keys` partitioned by `/digest`, holding `{ digest, principalId, name, scopes, createdAt, revokedAt? }`. `resolvePrincipal` SHALL be a **single-partition point read** on the digest — never a cross-partition query — and `widgets`/`themes` SHALL be single-partition queries scoped to one `principalId`. The adapter SHALL enforce the same `StoreLimits` and the same validation as the reference implementations, and SHALL skip an invalid stored entry with a diagnostic rather than failing the read.

#### Scenario: A principal's catalog is one partition
- **WHEN** `widgets(principalId)` runs
- **THEN** the query SHALL be scoped to that partition key and SHALL NOT enable cross-partition execution

#### Scenario: Key resolution is a point read
- **WHEN** `resolvePrincipal` is called with a key
- **THEN** the adapter SHALL read the `keys` container by the key's digest as both id and partition key
- **AND** a missing document SHALL yield `undefined`, not an error

#### Scenario: A revoked key resolves to nothing
- **WHEN** the stored key document carries `revokedAt`
- **THEN** `resolvePrincipal` SHALL return `undefined`, exactly as for an unknown key

#### Scenario: The adapter honours the store contract
- **WHEN** the shared port contract suite runs against the Cosmos adapter
- **THEN** it SHALL pass the same assertions as the memory implementation, including limit rejections and skip-with-diagnostic on invalid entries

### Requirement: The adapter authenticates by managed identity, read-only where it can be
The Cosmos adapter SHALL authenticate with an Azure credential (managed identity in deployment, developer credential locally) and SHALL NOT accept an account key or connection string. The MCP server's identity SHALL hold the **read-only** Cosmos data-plane role, so a write attempted from the MCP container fails at the service, not merely by convention; the app's identity SHALL hold read/write. Key material and credentials SHALL NOT appear in logs, diagnostics, or error messages.

#### Scenario: No secret configuration path exists
- **WHEN** the adapter is constructed
- **THEN** it SHALL accept an endpoint and a credential only, with no option carrying an account key or connection string

#### Scenario: The read-only identity cannot write
- **WHEN** a write is attempted with an identity holding only the read role
- **THEN** the service SHALL reject it and the adapter SHALL surface a structured error naming the operation, without credential material

#### Scenario: Diagnostics stay free of key material
- **WHEN** the adapter reports a skipped entry or a failed operation
- **THEN** the message SHALL identify the principal and entry, and SHALL contain no API key, digest secret, or token
