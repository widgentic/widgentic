# authoring-api Specification

## Purpose
The write side of the store port as a hostable HTTP surface: the routes, refusal codes and trust rules by which a person authors their own widgets, themes, schemas, actions, secrets and API keys. Authentication stays with the host — this capability begins once a principal is resolved and guarantees that nothing about the request can change whose catalog is touched.

## Requirements

### Requirement: The host resolves the principal; the surface never does
The authoring surface SHALL be constructed with an already-resolved principal context — a principal id, and optionally the identity subject and label the host authenticated. It SHALL contain no session reading, no token validation, no cookie parsing and no identity-provider knowledge, so a host may authenticate by session, by a trusted proxy header, or not at all. Nothing in a request's path, query or body SHALL be able to name, select or influence the principal; every read and write SHALL address the resolved one. A host that resolves no principal SHALL be able to refuse the request itself, before the surface is reached.

#### Scenario: The request cannot name a principal
- **WHEN** a request carries a principal id in its path, query or body
- **THEN** it SHALL be ignored and the resolved principal SHALL be used for the operation

#### Scenario: Two hosts, two authentication schemes, one surface
- **WHEN** one host resolves its principal from a validated session and another from a configured trusted header
- **THEN** both SHALL obtain identical authoring behavior from the same surface, with no identity code inside it

### Requirement: An API key never authorizes authoring
A widgentic API key presented to the authoring surface — as a header, a query parameter or a body field — SHALL be refused with `401 KEY_NOT_A_SESSION`, whether or not a principal is also resolved, and SHALL never be treated as a credential, an identity or a fallback. The refusal SHALL happen before any store access and SHALL NOT reveal whether the key is valid.

#### Scenario: A pasted key writes nothing
- **WHEN** a valid API key is presented to any authoring route, with or without a resolved principal
- **THEN** the response SHALL be `401 KEY_NOT_A_SESSION` and no store operation SHALL have been attempted

#### Scenario: The refusal is uniform
- **WHEN** an invalid key and a valid key are each presented
- **THEN** the two responses SHALL be indistinguishable

### Requirement: Entries round-trip under the store's own rules
The surface SHALL expose list, replace-by-name and delete for widgets, themes, schemas and shared actions, and the path SHALL name the entry — a body naming a different `kind` or `name` SHALL NOT override it. Every write SHALL go through the store's validation, and a store refusal SHALL surface as `{ error: { code, message } }` carrying the store's own code with a status that matches its meaning: reference conflicts and limit refusals as `409`, an absent principal or key as `404`, a missing cipher as `503`, a forbidden operation as `403`, a store failure as `502`, and the validation family as `422`. A malformed or oversized body SHALL be refused as `400 INVALID_BODY`. On any refusal the store's state SHALL be unchanged.

#### Scenario: The path names the entry
- **WHEN** a widget is written at one kind with a different kind in the body
- **THEN** the entry SHALL be stored under the path's kind and the body's SHALL be discarded

#### Scenario: A refusal keeps its code
- **WHEN** a schema that a stored widget references is deleted
- **THEN** the response SHALL be `409` with code `SCHEMA_IN_USE` naming the referencing widgets, and the schema SHALL still be stored

#### Scenario: A malformed body is a client error
- **WHEN** a request carries malformed JSON or a body beyond the accepted size
- **THEN** the response SHALL be `400 INVALID_BODY` and nothing SHALL be written

### Requirement: Secrets are write-only and gated on a cipher
The surface SHALL accept a secret value on write and SHALL never return one: a listing SHALL carry names and timestamps and nothing derived from a value. When the store holds no cipher, the listing SHALL report the surface as unavailable and a write or delete SHALL be refused with `503 NO_CIPHER`, so a deployment never half-supports secrets.

#### Scenario: A written secret never comes back
- **WHEN** a secret is written and the secrets listing is read
- **THEN** the entry SHALL carry a name and timestamps only, with no value, preview, length or digest

#### Scenario: No cipher, no half-support
- **WHEN** the store holds no cipher
- **THEN** the listing SHALL report the surface unavailable and a write SHALL be refused with `503 NO_CIPHER`

### Requirement: Keys are minted once with the scopes fixed at creation
Creating a key SHALL return the raw key exactly once, together with the stored entry and a notice that it cannot be shown again; the raw key SHALL exist in no other response, log or listing. Requested scopes SHALL be normalized by the store's rules — `read` always granted, only key-grantable scopes accepted, `INVALID_SCOPES` otherwise. Listing SHALL return metadata only. Revoking SHALL affect exactly the named key.

#### Scenario: Shown once, then never
- **WHEN** a key is created and the key listing is then read
- **THEN** the raw key SHALL appear only in the creation response, and the listing SHALL carry the digest preview, name, scopes and timestamps

#### Scenario: Execute is opt-in
- **WHEN** a key is created without scopes, and another with `execute`
- **THEN** the first SHALL carry `read` alone and the second SHALL carry both, and a scope that cannot be granted to a key SHALL be refused with `INVALID_SCOPES`

#### Scenario: Revocation is scoped to one key
- **WHEN** one of a principal's keys is revoked
- **THEN** that key SHALL resolve to no principal and the principal's other keys SHALL keep working

### Requirement: The action test call is a production-path call
Testing an action SHALL execute it server-side through the same guarded fetch, secret resolution and output validation as execution in the MCP surface, with values redacted from the result, and SHALL draw on the same per-principal execution budget — an exhausted budget answering `RATE_LIMITED` rather than failing. It SHALL live on its own route so that an action may itself be named `test`, and it SHALL never be performed by the browser.

Output validation for a STANDALONE action means the action's own contract: the response SHALL be validated against the action's output schema. The fold a widget applies to a response — the binding-level `mode` and `map`, authored per widget, later — SHALL NOT be applied by the test, because no binding exists at action-authoring time; in particular the `merge` default's object-shape requirement SHALL NOT fail a test whose response satisfies the schema. Binding-time folding keeps its own validation where the binding is authored.

#### Scenario: The test call spends the shared budget
- **WHEN** test calls exceed the principal's execution budget
- **THEN** the surface SHALL answer `RATE_LIMITED` and SHALL make no outbound request

#### Scenario: The test route shadows no action
- **WHEN** an action is named `test`
- **THEN** it SHALL remain addressable, and the test route SHALL be unaffected

#### Scenario: A non-object response tests on its schema, not a widget's fold
- **WHEN** an http action whose output schema describes an array or scalar response is tested and the API answers accordingly
- **THEN** the test SHALL pass with the redacted response, and no `merge`-shape requirement SHALL be applied

#### Scenario: A response violating the schema still fails
- **WHEN** the API's response does not satisfy the action's output schema
- **THEN** the test SHALL fail with `INVALID_ACTION_OUTPUT` naming the violation

### Requirement: Linked identities are served only when the host supplies a subject
Identity routes — reading an account's linked identities and detaching one — SHALL be available only when the host supplies the authenticated subject alongside the principal. A host with no identity concept SHALL NOT expose them, and their absence SHALL NOT affect any other route.

#### Scenario: A single-principal host exposes no identity routes
- **WHEN** a host constructs the surface with a principal id and no subject
- **THEN** identity routes SHALL be absent and every other route SHALL behave unchanged

#### Scenario: An account sees its own identities from either session
- **WHEN** a host supplies a subject linked to an account
- **THEN** the account's canonical identity and its linked identities SHALL be readable, and the canonical one SHALL be refused for detaching

### Requirement: The surface is transport-agnostic with a Node adapter
The authoring surface SHALL be exposed as a function over a decoded request — method, path, parsed body and the principal context — returning a status and a body, so it can be tested without a socket and mounted on any server. A `node:http` adapter SHALL be published beside it for hosts using the standard server, and it SHALL be the only part that touches request and response objects.

#### Scenario: The core needs no server
- **WHEN** the surface is exercised in a test with plain values
- **THEN** every route SHALL be reachable with no HTTP server, socket or framework involved

#### Scenario: The adapter adds no behavior
- **WHEN** the same operation is driven through the core and through the Node adapter
- **THEN** the status and body SHALL be identical
