# widget-store Specification

## Purpose
Per-principal storage for user-authored widgets and themes: a persistence-agnostic port (`resolvePrincipal`, `widgets`, `themes`) with in-memory and file-backed reference implementations. It is the port, not a database — a deployment supplies its own adapter. API keys identify principals as stored digests compared in constant time, never as clear text and never in logs. Composition builds a **fresh** catalog and theme registry per request from the built-ins plus that principal's entries, so nothing mutable is shared and one principal's widgets never surface in another's. Stored entries are untrusted input: they are validated on write and re-validated on read, with invalid or over-limit entries skipped with a diagnostic rather than failing the session.
## Requirements
### Requirement: Store programmatic surface
The package SHALL export from a `./store` entry: the `WidgetStore` port (`resolvePrincipal(apiKey: string): Promise<Principal | undefined>`, `widgets(principalId: string): Promise<StoredWidget[]>`, `themes(principalId: string): Promise<ThemeEntry[]>`, `schemas(principalId: string): Promise<StoredSchema[]>`), the `Principal` (`{ id, label?, scopes }`), `StoredWidget` (`{ kind, template, descriptor }`), `StoredSchema` (`{ name, label?, description?, schema }`) and `StoreLimits` types, the reference implementations `createMemoryStore(seed?, limits?)` and `createFileStore(dir, options?)` (options carrying `limits?` and an `onDiagnostic?` sink), the composition functions `composeCatalog(store, principalId, options?)` and `composeThemes(store, principalId, options?)`, and `ANONYMOUS_PRINCIPAL`. The entry SHALL depend only on other widgentic public entries and Node's standard library, and SHALL perform no network I/O.

The entry SHALL additionally export a `WritableWidgetStore` port that extends `WidgetStore` with `putWidget(principalId, widget)`, `removeWidget(principalId, kind)`, `putTheme(principalId, theme)`, `removeTheme(principalId, name)`, `putSchema(principalId, schema)`, `removeSchema(principalId, name)`, `ensurePrincipal(subject, label?)`, `createKey(principalId, name)`, `listKeys(principalId)` and `revokeKey(principalId, keyId)`. Writability SHALL be a **separate type**, so a host holding a `WidgetStore` cannot write through it and a read-only deployment need not implement the write half. `createMemoryStore` SHALL satisfy `WritableWidgetStore` so the write contract is testable without a database. Adapters that reach a network service SHALL live behind their own entry (`./store/cosmos`), leaving `./store` itself free of network I/O.

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

#### Scenario: Schemas round-trip like widgets and themes
- **WHEN** a schema is written with `putSchema` for a principal
- **THEN** `schemas(principalId)` SHALL include it and `removeSchema` SHALL remove it, leaving other entries intact
- **AND** `createFileStore(dir)` SHALL load `<dir>/<principal>/schemas/*.json` for that principal

### Requirement: Keys identify principals without leaking
Stores SHALL hold API keys as `sha256:<hex>` digests, never in clear text, and SHALL compare a presented key against stored digests in constant time over fixed-length buffers. `resolvePrincipal` SHALL return `undefined` for an unknown or malformed key — never an error and never a partial match — and implementations SHALL NOT log key material. A `Principal` SHALL carry `scopes` (at least `"read"`; `"execute"` grants http-action execution; `"write"` reserved for the app's authenticated path). `createKey(principalId, name, scopes?)` SHALL accept the key's scopes at creation (default `["read"]`), scopes SHALL be fixed for the key's lifetime, and the principal returned by `resolvePrincipal` SHALL carry the presented key's scopes. Key-based resolution SHALL omit the principal's identity `subject` in every implementation, and the file store SHALL normalize a principal row's scopes to key-grantable ones (`read` always; `write` never) exactly as `createKey` does.

#### Scenario: A valid key resolves to its principal
- **WHEN** `resolvePrincipal` is called with a key whose digest is registered
- **THEN** it SHALL return that principal with its id and scopes

#### Scenario: Unknown keys resolve to undefined
- **WHEN** an unregistered, empty, or malformed key is presented
- **THEN** the result SHALL be `undefined`

#### Scenario: Stored material is hashed
- **WHEN** a store is seeded with a raw key and then inspected
- **THEN** the raw key SHALL NOT appear in the store's serialized state; only its digest SHALL

#### Scenario: Scopes travel with the key
- **WHEN** one key is created with `["read"]` and another with `["read", "execute"]` for the same principal
- **THEN** resolving the first SHALL yield scopes `["read"]` and the second `["read", "execute"]`
- **AND** a pre-existing key SHALL resolve with `["read"]`

#### Scenario: Key resolution never carries the subject
- **WHEN** a key belonging to a principal provisioned through `ensurePrincipal` is resolved
- **THEN** the returned principal SHALL have no `subject`

#### Scenario: File-store rows cannot grant write
- **WHEN** `principals.json` lists `scopes: ["read", "write"]`
- **THEN** `resolvePrincipal` SHALL return `["read"]`

### Requirement: Linked identities resolve to one principal
The writable store SHALL support attaching additional identity subjects to an existing principal: `linkSubject(principalId, subject, label?)` makes every later resolution of that subject (including `ensurePrincipal`) return the canonical principal, storing an optional display label with the link, and `listLinkedSubjects(principalId)` SHALL enumerate the principal's linked identities as `{ subject, label? }` entries (the canonical subject excluded). Principals returned by `ensurePrincipal` SHALL carry the CANONICAL subject, whichever identity resolved them — so account UIs can present the full identity set from any session. Linking SHALL refuse with `SUBJECT_IN_USE` when the subject already resolves to a different principal that owns any data (widgets, themes, schemas, or unrevoked keys); a subject whose principal is empty SHALL be absorbed (the empty principal ceases to resolve). Linking a subject already linked to the same principal SHALL be idempotent. `unlinkSubject(principalId, subject)` SHALL detach a linked subject so it resolves to nothing (a later `ensurePrincipal` provisions a fresh principal); unlinking the canonical subject — the one the principal id derives from — SHALL refuse with `CANNOT_UNLINK_PRIMARY`. Resolution through a link SHALL remain point-addressed in the Cosmos adapter (at most one extra point read; no cross-partition queries), and links SHALL survive process restarts in every persistent implementation.

#### Scenario: A linked subject signs into the same principal
- **WHEN** `linkSubject(P, "github:42")` succeeds and `ensurePrincipal("github:42")` runs later
- **THEN** the returned principal SHALL be `P`
- **AND** the principal's widgets, themes, schemas, and keys SHALL be the same set either way

#### Scenario: Linking refuses to swallow an account with data
- **WHEN** `github:42` already resolves to a principal that owns a widget or an unrevoked key
- **THEN** `linkSubject` SHALL refuse with `SUBJECT_IN_USE`
- **AND** both principals SHALL remain exactly as they were

#### Scenario: An empty principal is absorbed by linking
- **WHEN** `github:42` resolves to a principal with no widgets, themes, schemas, or unrevoked keys
- **THEN** `linkSubject(P, "github:42")` SHALL succeed
- **AND** the empty principal SHALL no longer be resolvable

#### Scenario: Unlink detaches, primary stays
- **WHEN** `unlinkSubject(P, "github:42")` runs on a linked subject
- **THEN** `ensurePrincipal("github:42")` SHALL later provision a fresh principal
- **AND** unlinking `P`'s canonical subject SHALL refuse with `CANNOT_UNLINK_PRIMARY`

#### Scenario: Linked subjects are enumerable with their labels
- **WHEN** `linkSubject(P, "github:42", "octocat")` succeeds and `listLinkedSubjects(P)` runs
- **THEN** it SHALL list `{ subject: "github:42", label: "octocat" }` and SHALL NOT list the canonical subject

#### Scenario: Any session sees the canonical subject
- **WHEN** `ensurePrincipal("github:42")` resolves through the link
- **THEN** the returned principal SHALL carry the canonical subject, not `github:42`

#### Scenario: Links hold across implementations and restarts
- **WHEN** the contract suite runs against memory and Cosmos implementations
- **THEN** every scenario above SHALL hold identically
- **AND** a Cosmos link SHALL survive a new store instance against the same account

### Requirement: Composition is per request and isolated
`composeCatalog(store, principalId)` SHALL return a NEW catalog containing the built-in kinds plus that principal's stored widgets; `composeThemes(store, principalId)` SHALL return a NEW theme registry containing the built-in themes plus that principal's stored themes. Neither SHALL mutate a shared instance, cache across principals, or expose one principal's entries to another. Composing for `ANONYMOUS_PRINCIPAL` SHALL yield the built-ins only, plus any entries the host explicitly supplies. Composition SHALL resolve each widget's `dataSchemaRef` into the registered descriptor's `dataSchema` — downstream of composition (catalog, renderer, wire format, agents) the reference does not exist.

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

#### Scenario: References resolve at composition
- **WHEN** a principal stores a `person` schema and a `person-card` widget whose descriptor carries `dataSchemaRef: "person"`
- **THEN** the composed catalog's descriptor for `person-card` SHALL carry that schema as its `dataSchema` and no ref
- **AND** editing the stored `person` schema and recomposing SHALL validate `person-card` renders against the updated schema — one edit reaches every referencing widget

### Requirement: Stored entries are validated on write and on read
A store SHALL validate an entry before persisting it and composition SHALL re-validate every entry as it loads — a store may be edited out of band, so loaded data is untrusted input. Templates SHALL pass `validateTemplate`, themes `validateTheme`, and descriptors SHALL carry a string `description`. Entries whose `kind` collides with a built-in kind SHALL be refused on write and skipped on read, and — symmetrically — a theme whose `name` collides with a built-in registry theme SHALL be refused on write with `RESERVED_THEME` and skipped on read; without that check the write succeeds, `registry.register` then throws during composition, and the entry is swallowed into a diagnostic while the caller was told it saved. The reserved names SHALL be read from the theme registry rather than restated, so the two cannot drift. Widget `kind` and theme `name` identifiers SHALL match `^[a-zA-Z0-9._-]+$` (refused with `INVALID_IDENTIFIER` otherwise) — the same charset the file store's path guard enforces — so every adapter accepts and rejects identically regardless of how its backend encodes identifiers (the Cosmos adapter embeds them in document ids). Stored schemas SHALL satisfy the same discipline: `name` in the shared identifier charset, `schema` a plain object (the documented JSON-Schema subset; unknown keywords stay ignored downstream), and size within limits. A widget descriptor MAY carry `dataSchemaRef: "<schema-name>"` **in place of** an inline `dataSchema` — carrying both SHALL be refused (`INVALID_SHAPE`); a ref naming no stored schema of that principal SHALL be refused on write (`UNKNOWN_SCHEMA`) and skipped with a diagnostic on read, since out-of-band edits can orphan a ref. Removing a schema that widgets still reference SHALL be refused (`SCHEMA_IN_USE`) naming the referencing widgets — the write-side guard that keeps dangling refs an out-of-band-only condition. An entry failing any check SHALL be **skipped with a diagnostic** — never thrown, never partially registered — so one bad entry cannot deny a principal their remaining widgets.

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

#### Scenario: Built-in theme names cannot be shadowed
- **WHEN** a stored theme declares `name: "dark"`
- **THEN** writing it SHALL be refused with `RESERVED_THEME`, and a store already containing it SHALL have it skipped at composition with a diagnostic
- **AND** resolving `dark` SHALL still yield the built-in preset

#### Scenario: A widget references a shared schema, never both at once
- **WHEN** a widget's descriptor carries `dataSchemaRef: "person"` and that principal stores a `person` schema
- **THEN** the write SHALL be accepted
- **AND** a descriptor carrying both `dataSchema` and `dataSchemaRef` SHALL be refused with `INVALID_SHAPE`
- **AND** a ref naming no stored schema SHALL be refused with `UNKNOWN_SCHEMA`

#### Scenario: A referenced schema cannot be removed
- **WHEN** `removeSchema` targets a schema that stored widgets reference
- **THEN** the removal SHALL be refused with `SCHEMA_IN_USE`, naming the referencing widgets
- **AND** after those widgets are removed or re-pointed, the removal SHALL succeed

#### Scenario: A dangling reference skips the widget on read
- **WHEN** a store edited out of band holds a widget whose `dataSchemaRef` names a missing schema
- **THEN** composition SHALL skip that widget with a diagnostic naming the missing schema and register the principal's remaining widgets

### Requirement: Per-principal limits are enforced
Stores SHALL enforce configurable `StoreLimits` — maximum widgets per principal, maximum themes per principal, maximum schemas per principal, maximum serialized bytes per entry, and maximum template nodes per entry — with documented defaults (100, 50, 50, 65536, 2000). Exceeding a limit SHALL be a rejection at write time and a skip-with-diagnostic at read time, so a store that grew past its limits still serves what fits.

#### Scenario: Writes beyond the count limit are refused
- **WHEN** a principal at the widget limit writes one more
- **THEN** the write SHALL be refused with a structured error naming the limit

#### Scenario: Oversized entries are skipped at composition
- **WHEN** a stored widget's serialized form exceeds the byte limit or its template exceeds the node limit
- **THEN** composition SHALL skip it with a diagnostic and register the principal's remaining widgets

### Requirement: Cosmos adapter with point-read key lookup
A `createCosmosStore(options)` adapter SHALL implement `WritableWidgetStore` against Azure Cosmos DB over two containers: `data` partitioned by `/principalId`, holding one document per principal with ids `profile`, `widget:<kind>`, `theme:<name>` and `schema:<name>`; and `keys` partitioned by `/digest`, holding `{ digest, principalId, name, scopes, createdAt, revokedAt? }`. `resolvePrincipal` SHALL be a **single-partition point read** on the digest — never a cross-partition query — and `widgets`/`themes` SHALL be single-partition queries scoped to one `principalId`. The adapter SHALL enforce the same `StoreLimits` and the same validation as the reference implementations, and SHALL skip an invalid stored entry with a diagnostic rather than failing the read.

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

### Requirement: Stored actions beside widgets, themes and schemas
The `WidgetStore` port SHALL gain `actions(principalId): Promise<StoredAction[]>` where `StoredAction` is `{ name, label?, description?, definition }` and `definition` is a validated action definition per the widget-actions capability; `WritableWidgetStore` SHALL gain `putAction(principalId, action)` and `removeAction(principalId, name)`. `StoredWidget` SHALL gain an optional `load` binding. Actions SHALL be validated on write and on read exactly as widgets are (invalid stored entries are skipped with a diagnostic, never thrown), SHALL count against a per-principal limit (`maxActions`, default 50), and SHALL be isolated per principal. The file store SHALL read `<dir>/<principal>/actions/*.json`; the Cosmos adapter SHALL store them as `action:<name>` documents in the principal's partition (point reads and single-partition queries only). Composition SHALL attach a widget's bindings and the principal's shared actions to the composed catalog so the server can resolve a binding identifier to its definition without re-reading the store. Composition SHALL report a shared action it skipped for failing validation as a diagnostic (`skipped action '<name>': <code> — <message>`) and SHALL stop at `maxActions` with a diagnostic, and adapters SHALL cap `actions()` at `maxActions`.

#### Scenario: Actions round-trip through every implementation
- **WHEN** an action is written with `putAction` for a principal
- **THEN** `actions(principalId)` SHALL include it, `removeAction` SHALL remove it, and the memory, file and Cosmos implementations SHALL behave identically

#### Scenario: A widget binding resolves through composition
- **WHEN** a stored widget's template binds `{ ref: "refresh" }` and the principal owns action `refresh`
- **THEN** the composed catalog SHALL resolve the binding's identifier to that definition
- **AND** a binding to a name the principal does not own SHALL surface as a composition diagnostic and render its element with a `disabled: "unresolved"` descriptor

#### Scenario: Invalid shared actions are visible, not silent
- **WHEN** a stored action fails validation at compose time
- **THEN** the diagnostics SHALL name it and its code, in addition to any dangling-ref notes

### Requirement: Stored secrets are ciphertext records
`WidgetStore` SHALL gain `listSecrets(principalId): Promise<SecretEntry[]>` (`{ name, createdAt, updatedAt }`) and `secretValue(principalId, name): Promise<string | undefined>` — the execution-time resolution, which unwraps through the configured cipher and SHALL be the only path that yields a value; `WritableWidgetStore` SHALL gain `putSecret(principalId, name, value)` and `removeSecret(principalId, name)`. Stores SHALL persist only the envelope-encrypted record the widget-secrets capability defines, in `<dir>/<principal>/secrets/*.json` for the file store and as `secret:<name>` documents for Cosmos, and SHALL count secrets against `maxSecrets` (default 50). A store constructed without a cipher SHALL refuse `putSecret` and `secretValue` with a structured error rather than storing or returning plaintext. `secretValue` failures (malformed record, unwrap or decryption failure, transport error) SHALL surface as `StoreRejectionError` carrying the secret error code — never as a raw cipher, vault or Cosmos error.

#### Scenario: Values are unreadable through listing
- **WHEN** a secret is written and `listSecrets` runs
- **THEN** the entry SHALL carry name and timestamps only

#### Scenario: No cipher means no secrets
- **WHEN** a store has no cipher configured and `putSecret` is called
- **THEN** it SHALL fail with a structured error and nothing SHALL be written

#### Scenario: Resolution failures are store rejections
- **WHEN** a stored record was written under a cipher the store no longer holds
- **THEN** `secretValue` SHALL reject with `StoreRejectionError` code `DECRYPTION_FAILED`

### Requirement: Referential integrity on delete
`removeAction` SHALL refuse with `ACTION_IN_USE` while any of the principal's stored widgets binds the action by `ref` (naming the widgets), and `removeSecret` SHALL refuse with `SECRET_IN_USE` while any of the principal's shared actions or widget-inline actions references the secret (naming them). Widget removal SHALL be unaffected by bindings. Stores SHALL also tolerate dangling references that arrive by other means (manual edits, races): composition SHALL report them as diagnostics and the affected elements SHALL render disabled rather than failing the render. The scans SHALL run over the RAW stored entries — including entries that currently fail validation — in every implementation, so a reference held by a temporarily invalid widget still protects the action or secret; and `putAction` SHALL refuse (`ACTION_IN_USE`) to replace an action referenced by a widget's `load` with a definition that is not an http GET.

#### Scenario: An action in use cannot be removed
- **WHEN** widget `weather` binds `{ ref: "refresh" }` and `removeAction(P, "refresh")` is called
- **THEN** the call SHALL fail with `ACTION_IN_USE` listing `weather`, and the action SHALL remain

#### Scenario: Dangling references degrade, not fail
- **WHEN** a widget references an action that no longer exists
- **THEN** the widget SHALL still render, its bound element SHALL carry `disabled: "unresolved"`, and composition SHALL emit a diagnostic naming the widget and the action

#### Scenario: Invalid widgets still hold their references
- **WHEN** a stored widget that fails validation binds action `refresh`
- **THEN** `removeAction("refresh")` SHALL still fail with `ACTION_IN_USE`

#### Scenario: A load cannot be broken by a replacement
- **WHEN** widget `weather.load` refs `refresh` and `putAction` replaces `refresh` with a `prompt` definition
- **THEN** the write SHALL fail with `ACTION_IN_USE` naming `weather`

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
