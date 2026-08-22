# Widget Store — account linking delta

## ADDED Requirements

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
