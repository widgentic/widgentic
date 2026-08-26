# widget-store — widget-actions delta

## ADDED Requirements

### Requirement: Stored actions beside widgets, themes and schemas
The `WidgetStore` port SHALL gain `actions(principalId): Promise<StoredAction[]>` where `StoredAction` is `{ name, label?, description?, definition }` and `definition` is a validated action definition per the widget-actions capability; `WritableWidgetStore` SHALL gain `putAction(principalId, action)` and `removeAction(principalId, name)`. `StoredWidget` SHALL gain an optional `load` binding. Actions SHALL be validated on write and on read exactly as widgets are (invalid stored entries are skipped with a diagnostic, never thrown), SHALL count against a per-principal limit (`maxActions`, default 50), and SHALL be isolated per principal. The file store SHALL read `<dir>/<principal>/actions/*.json`; the Cosmos adapter SHALL store them as `action:<name>` documents in the principal's partition (point reads and single-partition queries only). Composition SHALL attach a widget's bindings and the principal's shared actions to the composed catalog so the server can resolve a binding identifier to its definition without re-reading the store.

#### Scenario: Actions round-trip through every implementation
- **WHEN** an action is written with `putAction` for a principal
- **THEN** `actions(principalId)` SHALL include it, `removeAction` SHALL remove it, and the memory, file and Cosmos implementations SHALL behave identically

#### Scenario: A widget binding resolves through composition
- **WHEN** a stored widget's template binds `{ ref: "refresh" }` and the principal owns action `refresh`
- **THEN** the composed catalog SHALL resolve the binding's identifier to that definition
- **AND** a binding to a name the principal does not own SHALL surface as a composition diagnostic and render its element with a `disabled: "unresolved"` descriptor

### Requirement: Stored secrets are ciphertext records
`WidgetStore` SHALL gain `listSecrets(principalId): Promise<SecretEntry[]>` (`{ name, createdAt, updatedAt }`) and `secretValue(principalId, name): Promise<string | undefined>` — the execution-time resolution, which unwraps through the configured cipher and SHALL be the only path that yields a value; `WritableWidgetStore` SHALL gain `putSecret(principalId, name, value)` and `removeSecret(principalId, name)`. Stores SHALL persist only the envelope-encrypted record the widget-secrets capability defines, in `<dir>/<principal>/secrets/*.json` for the file store and as `secret:<name>` documents for Cosmos, and SHALL count secrets against `maxSecrets` (default 50). A store constructed without a cipher SHALL refuse `putSecret` and `secretValue` with a structured error rather than storing or returning plaintext.

#### Scenario: Values are unreadable through listing
- **WHEN** a secret is written and `listSecrets` runs
- **THEN** the entry SHALL carry name and timestamps only

#### Scenario: No cipher means no secrets
- **WHEN** a store has no cipher configured and `putSecret` is called
- **THEN** it SHALL fail with a structured error and nothing SHALL be written

### Requirement: Referential integrity on delete
`removeAction` SHALL refuse with `ACTION_IN_USE` while any of the principal's stored widgets binds the action by `ref` (naming the widgets), and `removeSecret` SHALL refuse with `SECRET_IN_USE` while any of the principal's shared actions or widget-inline actions references the secret (naming them). Widget removal SHALL be unaffected by bindings. Stores SHALL also tolerate dangling references that arrive by other means (manual edits, races): composition SHALL report them as diagnostics and the affected elements SHALL render disabled rather than failing the render.

#### Scenario: An action in use cannot be removed
- **WHEN** widget `weather` binds `{ ref: "refresh" }` and `removeAction(P, "refresh")` is called
- **THEN** the call SHALL fail with `ACTION_IN_USE` listing `weather`, and the action SHALL remain

#### Scenario: Dangling references degrade, not fail
- **WHEN** a widget references an action that no longer exists
- **THEN** the widget SHALL still render, its bound element SHALL carry `disabled: "unresolved"`, and composition SHALL emit a diagnostic naming the widget and the action

## MODIFIED Requirements

### Requirement: Keys identify principals without leaking
Stores SHALL hold API keys as `sha256:<hex>` digests, never in clear text, and SHALL compare a presented key against stored digests in constant time over fixed-length buffers. `resolvePrincipal` SHALL return `undefined` for an unknown or malformed key — never an error and never a partial match — and implementations SHALL NOT log key material. A `Principal` SHALL carry `scopes` (at least `"read"`; `"execute"` grants http-action execution; `"write"` reserved for the app's authenticated path). `createKey(principalId, name, scopes?)` SHALL accept the key's scopes at creation (default `["read"]`), scopes SHALL be fixed for the key's lifetime, and the principal returned by `resolvePrincipal` SHALL carry the presented key's scopes.

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
