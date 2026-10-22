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

### Requirement: Stored themes may carry styles
A stored theme entry MAY carry `styles` beside `tokens`. On write, a store SHALL refuse with `INVALID_THEME` a theme whose `styles` is present and is not a plain object mapping selectors to plain objects of string values, and composition SHALL skip such an entry with a diagnostic on read. Unsafe entries inside a well-shaped map SHALL be stored and dropped when CSS is generated, as a widget descriptor's are. The entry's serialized size, `styles` included, SHALL count against the per-entry byte limit. Entries written before `styles` existed SHALL load unchanged, every adapter included.

#### Scenario: A theme with styles round-trips
- **WHEN** a theme `{ name: "brand", tokens: { accent: "#ff5a1f" }, styles: { ".wg-btn": { padding: "4px 8px" } } }` is written with `putTheme`
- **THEN** `themes(principalId)` SHALL return it with the same `styles`, and the composed registry's `brand` entry SHALL carry them

#### Scenario: A malformed styles section is refused at the door
- **WHEN** a theme whose `styles` maps `.wg-btn` to the string `"padding: 4px"` is written
- **THEN** the write SHALL be refused with `INVALID_THEME` and nothing SHALL be stored
- **AND** a store edited out of band to hold that entry SHALL have it skipped at composition with a diagnostic naming the theme

#### Scenario: Themes stored before styles existed still load
- **WHEN** a store holds a theme entry with no `styles` key, written in the earlier shape, in each adapter (memory, file, SQLite, Cosmos)
- **THEN** composition SHALL register it with its tokens and no styles, and no diagnostic

### Requirement: Principal settings are one record per principal
Each principal SHALL have one settings record, read through `settings(principalId): Promise<PrincipalSettings>` on the read port — an empty object when nothing is set or the principal is unknown, never an error — and written through `putSettings(principalId, update)` on the writable port. The record is a set of named sections; this version defines three: `defaultThemes: { light?: string; dark?: string }`; `resourceDomains: string[]` (whose rule, refusals and composition are in "Resource domains are a settings section"); and `resources: { type: "stylesheet"; href: string; integrity?: string }[]` (in "Stylesheet resources are a settings section"). `putSettings` SHALL replace each section present in `update`, remove a section given as `null`, and keep every section `update` does not mention — a section given as `undefined` counts as not mentioned — so a writer that knows only some sections never erases the others. An unknown section name, a `defaultThemes` key other than `light` and `dark`, or a non-string value SHALL be refused with `INVALID_SHAPE`; a `defaultThemes` value naming no theme the principal stores (raw stored entries, whether or not they currently validate) SHALL be refused with `UNKNOWN_THEME`; on any refusal the stored record SHALL be unchanged. Because the section holds one name per mode, at most one theme SHALL be a mode's default at any time, and the same theme SHALL be allowed to hold both. `removeTheme` SHALL refuse with `THEME_IN_USE`, naming the mode or modes, while `defaultThemes` names the theme. `composeThemes` SHALL set the composed registry's default for each mode `defaultThemes` names; a name the composed registry does not hold — missing, or skipped as invalid — SHALL be dropped with a diagnostic, leaving that mode's built-in default. On read, a section this version does not know SHALL be ignored, not refused, so data written by a later version still loads. Composing for `ANONYMOUS_PRINCIPAL` SHALL leave both built-in defaults. Every adapter (memory, file, SQLite, Cosmos) SHALL behave identically, and a store holding no record SHALL read as empty settings. The invariant "a default names a stored theme" SHALL hold under concurrent writes: `putSettings` SHALL commit only while every theme its update names still exists and the record is unchanged since it was read (a section the update leaves alone is kept as stored, even if it names a theme that is gone), and `removeTheme` SHALL delete only while the record it checked is unchanged — retrying, or refusing with the matching code, when a concurrent write intervenes. A stored value that is not a name SHALL be dropped on read with a diagnostic. Default themes are cosmetic: when the settings cannot be read, `composeThemes` SHALL keep the built-in defaults and never fail: an adapter written before settings existed has none to read, silently, and a failing read is reported with a diagnostic. A Cosmos permission refusal SHALL surface as `FORBIDDEN` whether it arrives from a single operation or from a transactional batch, whose SDK error carries no status code, and Cosmos `putSettings` SHALL check only the defaults its update writes, as every adapter does.

#### Scenario: Default themes round-trip and replace
- **WHEN** a principal stores themes `a` and `b`, and `putSettings(P, { defaultThemes: { light: "a", dark: "b" } })` is followed by `putSettings(P, { defaultThemes: { light: "b" } })`
- **THEN** `settings(P)` SHALL return `{ defaultThemes: { light: "b" } }`
- **AND** the composed registry's defaults SHALL be `{ light: "b", dark: "dark" }`

#### Scenario: Sections not mentioned are kept
- **WHEN** P's settings hold `defaultThemes` and `putSettings(P, {})` is called
- **THEN** `settings(P)` SHALL still hold the same `defaultThemes`
- **AND** `putSettings(P, { defaultThemes: null })` SHALL remove the section

#### Scenario: A default must name a stored theme
- **WHEN** `putSettings(P, { defaultThemes: { dark: "missing" } })` is called and P stores no `missing` theme
- **THEN** the call SHALL be refused with `UNKNOWN_THEME` and P's settings SHALL be unchanged
- **AND** `putSettings(P, { defaultThemes: { sepia: "a" } })` and `putSettings(P, { fonts: {} })` SHALL each be refused with `INVALID_SHAPE`

#### Scenario: A default theme cannot be removed
- **WHEN** theme `a` is P's light default and `removeTheme(P, "a")` is called
- **THEN** the removal SHALL be refused with `THEME_IN_USE` naming `light`, and `a` SHALL remain
- **AND** after `putSettings(P, { defaultThemes: null })`, the removal SHALL succeed

#### Scenario: A dangling default degrades to the built-in
- **WHEN** a store edited out of band names `ghost` as P's dark default and holds no `ghost` theme
- **THEN** composition SHALL report a diagnostic naming `ghost` and the registry's dark default SHALL be the built-in `dark`

#### Scenario: Stores without settings read as empty
- **WHEN** a principal written before settings existed is read in each adapter
- **THEN** `settings` SHALL return `{}` and the composed registry's defaults SHALL be the built-ins

#### Scenario: A later version's section does not break loading
- **WHEN** a store edited out of band holds settings with `defaultThemes` beside an unknown section `fonts`
- **THEN** `settings` and composition SHALL apply `defaultThemes` and ignore `fonts` without a refusal

#### Scenario: Settings never cross principals
- **WHEN** principal A sets `brand` as its light default and principal B stores its own `brand` theme
- **THEN** B's composed registry SHALL keep the built-in light default

#### Scenario: Concurrent writes keep a default naming a stored theme
- **WHEN** a theme named by a `putSettings` call is removed after the call checked it, or a theme being removed becomes a default after `removeTheme` checked the settings
- **THEN** `putSettings` SHALL be refused with `UNKNOWN_THEME` and the settings SHALL be unchanged, or `removeTheme` SHALL be refused with `THEME_IN_USE` and the theme SHALL remain
- **AND** a section another writer added meanwhile SHALL survive a `putSettings` of a different section

#### Scenario: Unreadable settings never fail a render
- **WHEN** composition runs over an adapter without a `settings` method, or one whose settings read throws
- **THEN** the registry SHALL keep the built-in defaults and register the stored themes, and the throwing read SHALL be reported with a diagnostic

#### Scenario: A read-only identity's batch is FORBIDDEN
- **WHEN** a Cosmos `putSettings` or `removeTheme` batch fails as the SDK reports a permission refusal
- **THEN** the store SHALL refuse with `FORBIDDEN`, and a batch failing for another reason, throttling included, SHALL refuse with `STORE_ERROR`

#### Scenario: A dangling default left alone does not block an update
- **WHEN** the stored settings name a dark default whose theme is gone and an update leaves `defaultThemes` alone
- **THEN** Cosmos SHALL accept the update, as every adapter does, and an update writing that name SHALL be refused with `UNKNOWN_THEME`

### Requirement: Stored themes are read under today's token rules without vanishing
On read, every persistent adapter (file, SQLite, Cosmos) SHALL pass each stored theme through `normalizeStoredTheme` before validating it — the memory store holds only entries validated in-process, so it has nothing to normalize: a token value today's token guard refuses — stored under looser rules by an earlier version — SHALL be dropped from the entry with a diagnostic naming the theme and the token, and the rest of the theme SHALL be served, so it stays listed, renderable and usable as a default. The stored document SHALL be left as it is, and writes SHALL still refuse such values with `INVALID_THEME`. `normalizeStoredTheme` SHALL be exported for custom adapters.

#### Scenario: An old theme keeps its other tokens
- **WHEN** a theme `legacy` was stored with `accent: "#0b5fff /* brand */"` and `bg: "#fafafa"`, in SQLite, Cosmos or the file store
- **THEN** `themes()` SHALL return `legacy` with `bg` only and report `token 'accent' dropped on read`, `legacy` SHALL serve as the light default, and a write of the same entry SHALL be refused with `INVALID_THEME`

### Requirement: Resource domains are a settings section
The settings section `resourceDomains` SHALL list the domains a principal's MCP Apps frames may load assets from directly, at most 20 entries (the limit exported beside the rule). An entry SHALL be accepted when, after trimming surrounding whitespace and lowercasing, it reads as an optional `https://` prefix, then a host, then at most one trailing `/`, and nothing else. The host is two or more dot-separated labels, each 1–63 characters of `a-z`, `0-9` and `-` that neither starts nor ends with `-`, with at most 253 characters in all and a last label that is not all digits; the host MAY begin with a wildcard label `*.` followed by at least two labels. A stored entry SHALL take the canonical form `https://<host>` (wildcard included), and the stored list SHALL be deduplicated in first-seen order. The store SHALL refuse with `INVALID_DOMAIN`, naming the entry and the reason, any string this rule rejects. That includes a scheme other than `https` (`http:`, `data:`), a port, a path, a query or a fragment, userinfo, an IPv4 or IPv6 literal, a single-label host such as `localhost` or a host under `localhost` (`app.localhost`), a wildcard that is not the whole leading label or that is followed by fewer than two labels (`*`, `https://*`, `*.com`, `a.*.example.com`), a non-ASCII host (the punycode `xn--` form is accepted), and any whitespace, `;`, `,` or quote inside the entry, so no entry can inject into a CSP a host builds from it. A value that is not an array of strings, or that holds more than the limit, SHALL be refused with `INVALID_SHAPE`. On every refusal the stored record SHALL be unchanged. An empty list SHALL remove the section, as `null` does. Writing `resourceDomains` SHALL check no theme, and writing `defaultThemes` SHALL leave `resourceDomains` as stored. On read, an entry that fails the rule SHALL be dropped with a diagnostic naming it, the entries that pass SHALL be kept, and a record without the section SHALL read as no domains. `composeResourceDomains` SHALL yield the principal's canonical list: empty for `ANONYMOUS_PRINCIPAL`, never another principal's, and empty with a diagnostic when the settings cannot be read, never failing the request. An adapter written before settings existed SHALL yield an empty list silently. Every adapter (memory, file, SQLite, Cosmos) SHALL behave identically.

#### Scenario: Accepted forms are stored canonical
- **WHEN** `putSettings(P, { resourceDomains: ["CDN.Example.com", "https://*.example.org/", "https://cdn.example.com"] })` is called
- **THEN** `settings(P)` SHALL return `{ resourceDomains: ["https://cdn.example.com", "https://*.example.org"] }`

#### Scenario: Unacceptable entries are refused by name
- **WHEN** `putSettings` is called with `resourceDomains` holding any one of `http://cdn.example.com`, `https://cdn.example.com:8443`, `https://cdn.example.com/img`, `192.168.1.10`, `localhost`, `*`, `*.com`, `a.*.example.com`, `exämple.com`, `cdn.example.com; script-src *` or `'self'`
- **THEN** the call SHALL be refused with `INVALID_DOMAIN` naming that entry, and the stored record SHALL be unchanged

#### Scenario: Shape and limit are refused as shape
- **WHEN** `resourceDomains` is the string `"cdn.example.com"`, the array `[42]`, or an array of 21 distinct valid domains
- **THEN** each call SHALL be refused with `INVALID_SHAPE`
- **AND** an array of 20 distinct valid domains SHALL be accepted

#### Scenario: An empty list removes the section
- **WHEN** P stores domains and `putSettings(P, { resourceDomains: [] })` is called
- **THEN** `settings(P)` SHALL hold no `resourceDomains`, as after `putSettings(P, { resourceDomains: null })`

#### Scenario: Sections stay independent
- **WHEN** P's settings hold a light default theme, and `putSettings(P, { resourceDomains: ["cdn.example.com"] })` is called
- **THEN** the light default SHALL be unchanged, and no theme SHALL be checked
- **AND** a later `putSettings(P, { defaultThemes: { dark: "b" } })` SHALL keep the domains

#### Scenario: Invalid stored entries are dropped on read
- **WHEN** a store edited out of band holds `resourceDomains: ["https://cdn.example.com", "http://old.example.com"]` for P
- **THEN** `settings(P)` and `composeResourceDomains` SHALL yield `["https://cdn.example.com"]`, and the adapter's read diagnostics (file, SQLite, Cosmos) SHALL name `http://old.example.com`, as they report a malformed default theme

#### Scenario: Composition yields only the caller's domains
- **WHEN** principal A stores `["cdn.a.example"]` and principal B stores nothing
- **THEN** composing for A SHALL yield `["https://cdn.a.example"]`, while composing for B and for `ANONYMOUS_PRINCIPAL` SHALL each yield `[]`

#### Scenario: Unreadable settings declare nothing
- **WHEN** composition runs over an adapter without a `settings` method, or one whose settings read throws
- **THEN** `composeResourceDomains` SHALL yield `[]`; only the throwing read SHALL be reported with a diagnostic

#### Scenario: Every adapter alike
- **WHEN** the scenarios above run against the memory, file, SQLite and Cosmos adapters
- **THEN** each SHALL store, refuse and read identically

### Requirement: Stylesheet resources are a settings section
The settings section `resources` SHALL list the stylesheets a principal's MCP Apps frames load. It holds at most 8 entries, a limit exported by the core package beside the rule.
- **An entry** SHALL be an object with exactly these keys:
  - `type`, which SHALL be `"stylesheet"`;
  - `href`, a string;
  - optionally `integrity`, a string.
- **The `href` rule.** After trimming surrounding whitespace, an `href` SHALL read as `https://`, then a host that the resource-domain rule accepts (no wildcard), then optionally a path, query and fragment, in at most 2,048 characters.
  - **Refused:** any other scheme, userinfo, a port, an IP literal, a single-label or `localhost` host, and any whitespace, control character, quote, `<`, `>` or backslash.
  - **Stored form:** the host lowercased, the rest as given.
- **The `integrity` rule.** One or more space-separated values, each `sha256-`, `sha384-` or `sha512-` followed by base64.
- **Refusal codes.**
  - `INVALID_RESOURCE`, naming the entry and the reason: an entry this rule rejects, including a `type` other than `"stylesheet"` (scripts are not supported) and a key other than the three.
  - `INVALID_SHAPE`: a value that is not an array of objects, or that holds more than the limit.
  - `UNDECLARED_DOMAIN`, naming the stylesheet and its host. After the write, each stylesheet's host SHALL be covered by the same record's `resourceDomains`, as a CSP host source covers a host: exactly, or by a `*.` wildcard for any subdomain. This applies to a write of `resources` and equally to a write of `resourceDomains`, or its removal, that would leave a stored stylesheet uncovered.

  On every refusal the stored record SHALL be unchanged.
- **Stored list.** Deduplicated by `href` in first-seen order. Order is kept, since it is cascade order. An empty list SHALL remove the section, as `null` does.
- **On read.** An entry that fails the rule, has an unknown `type`, or is not covered by the record's domains SHALL be dropped with a diagnostic naming it, and the entries that pass SHALL be kept. A record without the section SHALL read as no stylesheets.
- **`composeResources`** SHALL yield the principal's list: empty for `ANONYMOUS_PRINCIPAL`, never another principal's, and empty with a diagnostic when the settings cannot be read, never failing the request. An adapter written before settings existed SHALL yield an empty list silently.
- **Every adapter** (memory, file, SQLite, Cosmos) SHALL behave identically.

#### Scenario: Accepted entries are stored in order
- **WHEN** P's `resourceDomains` hold `fonts.googleapis.com` and `*.example.org`, and `putSettings(P, { resources: [...] })` is called with these entries in order:
  1. `{ type: "stylesheet", href: "https://Fonts.Googleapis.com/icon?family=Material+Icons" }`;
  2. `{ type: "stylesheet", href: "https://cdn.example.org/brand.css", integrity: "sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC" }`;
  3. the first entry again.
- **THEN** `settings(P).resources` SHALL be the first two entries, in that order, the first with its host lowercased

#### Scenario: Unacceptable entries are refused by name
- **WHEN** `putSettings` is called with a `resources` entry whose `href` is any one of `http://cdn.example.org/a.css`, `https://user:pw@cdn.example.org/a.css`, `https://cdn.example.org:8443/a.css`, `https://192.168.1.10/a.css`, `https://localhost/a.css`, `javascript:alert(1)` or `https://cdn.example.org/a.css" onload="x`; or whose `integrity` is `md5-abc`; or whose `type` is `"script"`; or which carries a key `media`
- **THEN** the call SHALL be refused with `INVALID_RESOURCE` naming that entry, and the stored record SHALL be unchanged

#### Scenario: Shape and limit are refused as shape
- **WHEN** `resources` is the string `"https://cdn.example.org/a.css"`, the array `["https://cdn.example.org/a.css"]`, or an array of 9 distinct valid entries
- **THEN** each call SHALL be refused with `INVALID_SHAPE`
- **AND** an array of 8 distinct valid entries SHALL be accepted

#### Scenario: A stylesheet outside the declared domains is refused
- **WHEN** P's `resourceDomains` hold only `cdn.example.org` and `putSettings(P, { resources: [{ type: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter" }] })` is called
- **THEN** the call SHALL be refused with `UNDECLARED_DOMAIN` naming the stylesheet and `fonts.googleapis.com`
- **AND** the same call with `resourceDomains: ["cdn.example.org", "fonts.googleapis.com"]` in the same update SHALL be accepted

#### Scenario: A domain a stylesheet needs cannot be removed
- **WHEN** P stores a stylesheet on `fonts.googleapis.com` and `putSettings(P, { resourceDomains: ["cdn.example.org"] })` or `putSettings(P, { resourceDomains: null })` is called
- **THEN** the call SHALL be refused with `UNDECLARED_DOMAIN` naming the stylesheet, and the stored record SHALL be unchanged

#### Scenario: A wildcard domain covers its subdomains
- **WHEN** P's `resourceDomains` hold `*.example.org` and a stylesheet `https://cdn.example.org/a.css` is written
- **THEN** it SHALL be accepted, and a stylesheet on `https://example.org/a.css` SHALL be refused with `UNDECLARED_DOMAIN`

#### Scenario: An empty list removes the section
- **WHEN** P stores stylesheets and `putSettings(P, { resources: [] })` is called
- **THEN** `settings(P)` SHALL hold no `resources`, as after `putSettings(P, { resources: null })`, and P's `resourceDomains` SHALL be unchanged

#### Scenario: Invalid stored entries are dropped on read
- **WHEN** a store edited out of band holds, for P, `resources` with a valid stylesheet, an entry of type `"script"` and a stylesheet whose host P's domains do not cover
- **THEN** `settings(P)` and `composeResources` SHALL yield only the valid stylesheet, and the adapter's read diagnostics SHALL name the other two

#### Scenario: Composition yields only the caller's stylesheets
- **WHEN** principal A stores a stylesheet and principal B stores none
- **THEN** composing for A SHALL yield A's entry, while composing for B and for `ANONYMOUS_PRINCIPAL` SHALL each yield `[]`
- **AND** an adapter without a `settings` method SHALL yield `[]` silently, and one whose settings read throws SHALL yield `[]` with a diagnostic

#### Scenario: Every adapter alike
- **WHEN** the scenarios above run against the memory, file, SQLite and Cosmos adapters
- **THEN** each SHALL store, refuse and read identically

### Requirement: Widgets that name themes keep them resolvable
A stored widget's `descriptor.themes` SHALL be checked against the principal's registry on every write. `putWidget` SHALL refuse with `UNKNOWN_THEME` a name that is neither a built-in (`light`, `dark`) nor one of the principal's stored themes, naming the mode and the theme, and SHALL leave the stored widget unchanged. `removeTheme` SHALL refuse with `THEME_IN_USE` while any of the principal's stored widgets names the theme in either mode, naming those widgets beside any settings default that also names it. The scan SHALL run over the RAW stored entries, as the other reference guards do. Every writable implementation (memory, SQLite, Cosmos) SHALL behave alike, and the read-only file store SHALL apply the read-side rule. A malformed `themes` (refused by core's shape check) SHALL fail the write with `INVALID_SHAPE`. On read, a widget whose `themes` has a malformed shape SHALL be skipped with a diagnostic, like any invalid descriptor. A widget naming a theme the principal no longer holds, which can arrive by other means (manual edits, races), SHALL compose and render with the default for that mode, never failing; the render's `Theme notes:` line names it (mcp-server, "A widget's own themes take priority over the defaults"). Widgets without `themes` SHALL read and compose exactly as before.

#### Scenario: A widget naming an unknown theme is refused
- **WHEN** `putWidget(P, { kind: "promo", …, descriptor: { …, themes: { light: "acme" } } })` runs and principal `P` holds no theme `acme`
- **THEN** the call SHALL fail with `UNKNOWN_THEME` naming `light` and `acme`, and no widget `promo` SHALL be stored
- **AND** the same widget SHALL be stored once `P` holds `acme`, and a widget naming only the built-in `dark` SHALL be stored without any stored theme

#### Scenario: A theme a widget names cannot be removed
- **WHEN** widget `promo` names `acme` as its light theme and `removeTheme(P, "acme")` is called
- **THEN** the call SHALL fail with `THEME_IN_USE` naming `promo`, and `acme` SHALL remain
- **AND** after `promo` is removed or names another theme, the removal SHALL succeed

#### Scenario: A dangling theme reference degrades, not fails
- **WHEN** a stored widget names `acme` and the principal's stored themes no longer include it
- **THEN** the widget SHALL compose and render with the default for that mode, and the render's text SHALL carry a `Theme notes:` line naming the widget and the theme

#### Scenario: Old widgets are untouched
- **WHEN** a widget stored before this change, with no `themes`, is read and rendered
- **THEN** it SHALL compose without a diagnostic and render byte-identically to before
