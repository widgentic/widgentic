# widget-store Specification

## Purpose
Per-principal storage for user-authored widgets and themes: a persistence-agnostic port (`resolvePrincipal`, `widgets`, `themes`) with in-memory and file-backed reference implementations. It is the port, not a database — a deployment supplies its own adapter. API keys identify principals as stored digests compared in constant time, never as clear text and never in logs. Composition builds a **fresh** catalog and theme registry per request from the built-ins plus that principal's entries, so nothing mutable is shared and one principal's widgets never surface in another's. Stored entries are untrusted input: they are validated on write and re-validated on read, with invalid or over-limit entries skipped with a diagnostic rather than failing the session.
## Requirements
### Requirement: Store programmatic surface
The package SHALL export from a `./store` entry: the `WidgetStore` port (`resolvePrincipal(apiKey: string): Promise<Principal | undefined>`, `widgets(principalId: string): Promise<StoredWidget[]>`, `themes(principalId: string): Promise<ThemeEntry[]>`), the `Principal` (`{ id, label?, scopes }`), `StoredWidget` (`{ kind, template, descriptor }`) and `StoreLimits` types, the reference implementations `createMemoryStore(seed?, limits?)` and `createFileStore(dir, options?)` (options carrying `limits?` and an `onDiagnostic?` sink), the composition functions `composeCatalog(store, principalId, options?)` and `composeThemes(store, principalId, options?)`, and `ANONYMOUS_PRINCIPAL`. The entry SHALL depend only on other widgentic public entries and Node's standard library, and SHALL perform no network I/O.

The entry SHALL additionally export a `WritableWidgetStore` port that extends `WidgetStore` with `putWidget(principalId, widget)`, `removeWidget(principalId, kind)`, `putTheme(principalId, theme)`, `removeTheme(principalId, name)`, `ensurePrincipal(subject, label?)`, `createKey(principalId, name)`, `listKeys(principalId)` and `revokeKey(principalId, keyId)`. Writability SHALL be a **separate type**, so a host holding a `WidgetStore` cannot write through it and a read-only deployment need not implement the write half. `createMemoryStore` SHALL satisfy `WritableWidgetStore` so the write contract is testable without a database. Adapters that reach a network service SHALL live behind their own entry (`./store/cosmos`), leaving `./store` itself free of network I/O.

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
- **AND** `removeWidget` / `removeTheme` SHALL remove them, leaving the principal's other entries intact

#### Scenario: A read-only handle exposes no writes
- **WHEN** a value typed as `WidgetStore` is used
- **THEN** the write methods SHALL NOT be reachable through that type

### Requirement: Keys identify principals without leaking
Stores SHALL hold API keys as `sha256:<hex>` digests, never in clear text, and SHALL compare a presented key against stored digests in constant time over fixed-length buffers. `resolvePrincipal` SHALL return `undefined` for an unknown or malformed key — never an error and never a partial match — and implementations SHALL NOT log key material. A `Principal` SHALL carry `scopes` (at least `"read"`; `"write"` reserved for the app's authenticated path).

#### Scenario: A valid key resolves to its principal
- **WHEN** `resolvePrincipal` is called with a key whose digest is registered
- **THEN** it SHALL return that principal with its id and scopes

#### Scenario: Unknown keys resolve to undefined
- **WHEN** an unregistered, empty, or malformed key is presented
- **THEN** the result SHALL be `undefined`

#### Scenario: Stored material is hashed
- **WHEN** a store is seeded with a raw key and then inspected
- **THEN** the raw key SHALL NOT appear in the store's serialized state; only its digest SHALL

### Requirement: Composition is per request and isolated
`composeCatalog(store, principalId)` SHALL return a NEW catalog containing the built-in kinds plus that principal's stored widgets; `composeThemes(store, principalId)` SHALL return a NEW theme registry containing the built-in themes plus that principal's stored themes. Neither SHALL mutate a shared instance, cache across principals, or expose one principal's entries to another. Composing for `ANONYMOUS_PRINCIPAL` SHALL yield the built-ins only, plus any entries the host explicitly supplies.

#### Scenario: Two principals see two catalogs
- **WHEN** principal A owns a `report` widget and principal B owns a `ticket` widget
- **THEN** `composeCatalog` for A SHALL list `report` and NOT `ticket`
- **AND** `composeCatalog` for B SHALL list `ticket` and NOT `report`
- **AND** both SHALL list every built-in kind

#### Scenario: Composition returns independent instances
- **WHEN** two catalogs are composed for the same principal and one is registered into afterwards
- **THEN** the other SHALL be unaffected

#### Scenario: Anonymous callers get the built-ins
- **WHEN** composition runs for `ANONYMOUS_PRINCIPAL`
- **THEN** the catalog SHALL contain exactly the built-in kinds and the registry the built-in themes

### Requirement: Stored entries are validated on write and on read
A store SHALL validate an entry before persisting it and composition SHALL re-validate every entry as it loads — a store may be edited out of band, so loaded data is untrusted input. Templates SHALL pass `validateTemplate`, themes `validateTheme`, and descriptors SHALL carry a string `description`. Entries whose `kind` collides with a built-in kind SHALL be refused on write and skipped on read. Widget `kind` and theme `name` identifiers SHALL match `^[a-zA-Z0-9._-]+$` (refused with `INVALID_IDENTIFIER` otherwise) — the same charset the file store's path guard enforces — so every adapter accepts and rejects identically regardless of how its backend encodes identifiers (the Cosmos adapter embeds them in document ids). An entry failing any check SHALL be **skipped with a diagnostic** — never thrown, never partially registered — so one bad entry cannot deny a principal their remaining widgets.

#### Scenario: An invalid stored template is skipped, not fatal
- **WHEN** a principal's stored widgets contain one template with a forbidden `on*` attribute alongside two valid widgets
- **THEN** composition SHALL register the two valid kinds, omit the invalid one, and report a diagnostic naming it

#### Scenario: Built-in kinds cannot be shadowed
- **WHEN** a stored widget declares `kind: "table"`
- **THEN** writing it SHALL be refused, and a store already containing it SHALL have it skipped at composition
- **AND** rendering `table` SHALL still use the built-in renderer

#### Scenario: An invalid stored theme is skipped
- **WHEN** a stored theme carries an unknown token
- **THEN** composition SHALL omit it and report a diagnostic, leaving the built-in themes intact

#### Scenario: Exotic identifiers are refused everywhere, not just where they break
- **WHEN** a widget with `kind: "a/b#c"` is written to any adapter
- **THEN** the write SHALL be refused with `INVALID_IDENTIFIER` — by the memory store just as by the Cosmos adapter, so behavior never depends on the backend

### Requirement: Per-principal limits are enforced
Stores SHALL enforce configurable `StoreLimits` — maximum widgets per principal, maximum themes per principal, maximum serialized bytes per entry, and maximum template nodes per entry — with documented defaults (100, 50, 65536, 2000). Exceeding a limit SHALL be a rejection at write time and a skip-with-diagnostic at read time, so a store that grew past its limits still serves what fits.

#### Scenario: Writes beyond the count limit are refused
- **WHEN** a principal at the widget limit writes one more
- **THEN** the write SHALL be refused with a structured error naming the limit

#### Scenario: Oversized entries are skipped at composition
- **WHEN** a stored widget's serialized form exceeds the byte limit or its template exceeds the node limit
- **THEN** composition SHALL skip it with a diagnostic and register the principal's remaining widgets

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
