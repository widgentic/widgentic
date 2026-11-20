## MODIFIED Requirements

### Requirement: Keys are minted once with the scopes fixed at creation
Creating a key SHALL return the raw key exactly once, together with the stored entry and a notice that it cannot be shown again; the raw key SHALL exist in no other response, log or listing. Requested scopes SHALL be normalized by the store's rules — `read` always granted, only key-grantable scopes accepted, `INVALID_SCOPES` otherwise. Listing SHALL return metadata only. When the surface is constructed over a store with access grants, each listed key SHALL also carry `connections`: one entry per live grant bound to that key, with the client's name as it registered, when the connection was made and when it last refreshed — and nothing else: no token, digest, client id or redirect URI. A grant that was revoked or whose refresh token has expired SHALL NOT be listed, a key with no live grant SHALL carry an empty list, and a surface constructed without access grants SHALL omit the field. The client name is supplied by the client and unverified; the surface SHALL return it as data and SHALL bound its length. Revoking SHALL affect exactly the named key.

#### Scenario: Shown once, then never
- **WHEN** a key is created and the key listing is then read
- **THEN** the raw key SHALL appear only in the creation response, and the listing SHALL carry the digest preview, name, scopes and timestamps

#### Scenario: Execute is opt-in
- **WHEN** a key is created without scopes, and another with `execute`
- **THEN** the first SHALL carry `read` alone and the second SHALL carry both, and a scope that cannot be granted to a key SHALL be refused with `INVALID_SCOPES`

#### Scenario: Revocation is scoped to one key
- **WHEN** one of a principal's keys is revoked
- **THEN** that key SHALL resolve to no principal and the principal's other keys SHALL keep working

#### Scenario: A key lists the applications connected through it
- **WHEN** two hosts registered as `Claude` and `VS Code` each hold a live grant bound to key `ops`, and the key listing is read
- **THEN** the entry for `ops` SHALL carry two connections naming `Claude` and `VS Code` with their created and last-refreshed times, and the principal's other keys SHALL carry empty lists
- **AND** no connection SHALL contain a token, a digest, a client id or a redirect URI

#### Scenario: Ended connections disappear
- **WHEN** one of those grants is revoked by its client, or its refresh token expires
- **THEN** the next listing SHALL no longer contain it

#### Scenario: A store without grants lists keys as before
- **WHEN** the surface is constructed without access grants and the key listing is read
- **THEN** each entry SHALL carry the digest preview, name, scopes and timestamps and no `connections` field
