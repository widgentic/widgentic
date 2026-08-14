# widget-store — real signatures; one identifier rule for every adapter

## MODIFIED Requirements

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
