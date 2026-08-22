# Account linking across sign-in methods

## Why

One person who signs in with email and with GitHub today gets two unrelated principals — two catalogs, two key sets, two widget collections — because each method's subject derives its own principal id. That splits a user's work the moment they switch sign-in buttons, and it has been on the backlog since the accounts milestone. Linking makes the two identities resolve to one principal.

## What Changes

- **Store**: linked-identity operations on the writable port — `linkSubject(principalId, subject)` attaches another identity to an existing principal, `unlinkSubject` detaches it, and subject resolution follows a one-hop alias so `ensurePrincipal` with a linked subject returns the canonical principal. Linking REFUSES when the other identity already owns data (`SUBJECT_IN_USE`, no v1 merge); an empty principal is absorbed. The canonical subject (the one the principal id derives from) can never be unlinked (`CANNOT_UNLINK_PRIMARY`). All three store implementations (memory, file read-side, Cosmos) honor the same contract; Cosmos stays point-read (worst case two reads).
- **App**: an Identities section — shows the signed-in identity and any linked ones; "Link GitHub" / "Link email" starts the *other* provider's existing OAuth/OIDC flow carrying a session-bound link intent, and the callback attaches the new subject to the CURRENT principal instead of signing in as a new one; conflicts surface with the refusal message. Unlink per linked identity through a session-authorized route; the primary is not unlinkable.
- After linking, either sign-in lands in the same catalog: widgets, themes, schemas, and API keys are shared.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `widget-store`: new requirement — linked identities resolve to one principal (ops, refusal codes, point-read resolution).
- `widgentic-app`: the accounts requirement gains the linking flow, the Identities section, and unlink.

## Impact

- `src/store/types.ts` (port ops + codes), `memory.ts`, `file.ts`, `cosmos.ts` (alias docs + `linkedSubjects` on the canonical profile), contract suite.
- `apps/web/auth.ts` (link-intent state through both flows), `api.ts` (`GET /api/identities`, `DELETE /api/identities`), `main.ts` + `index.html` (Identities UI).
- No MCP or wire changes — keys already resolve principals; a linked account simply shares them.
