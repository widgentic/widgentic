# Design — account linking

## D1. Aliases, not merges

The principal id derives deterministically from the FIRST subject (`usr_<sha256(subject)[:24]>`), and every stored entry lives in that principal's partition. Re-parenting data between principals (a merge) would mean cross-partition moves, kind-collision resolution, and key re-hashing — enormous machinery for a rare conflict. v1 links only identities that are fresh or empty: the alias simply points the second subject at the canonical principal, and a conflict (the other identity owns data) is refused with `SUBJECT_IN_USE`, naming what the user should do instead (delete or move that account's content first). Merge stays future work if live usage ever demands it.

## D2. One-hop link docs keep Cosmos point-read

`ensurePrincipal(subject)` today point-reads `("profile", principalIdForSubject(subject))`. A link writes an alias profile at the LINKED subject's derived partition — `{ id: "profile", linkTo: <canonicalPrincipalId> }` — so resolution reads the alias, sees `linkTo`, and point-reads the canonical profile: two reads worst case, no queries, no new indexes. Absorbing an empty principal replaces its profile doc with the alias doc. The canonical profile additionally carries `linkedSubjects: string[]` so `listLinkedSubjects` is a single point read; link/unlink update both docs (alias first, then the canonical list — a crash between the two leaves an alias that resolution honors and the list misses, healed by the next link/unlink write; the enumeration list is UI convenience, resolution is the truth).

`linkTo` chains do not exist by construction: linking refuses when the target subject resolves anywhere else, and aliases are only ever created pointing at a canonical (non-alias) profile. Resolution still guards with a one-hop limit.

## D3. The link flow is the sign-in flow with an intent

No new OAuth machinery: "Link GitHub" sends the signed-in user through the exact GitHub flow (state-bound, server-side exchange), and "Link email" through the exact OIDC flow. The difference is a link intent bound into the state value alongside the existing CSRF material, minted only for a live session and single-use. On callback, a valid link intent + live session routes to `store.linkSubject(sessionPrincipal.id, newSubject)` instead of session minting; the session stays the original identity (no silent identity switch). Missing session, dead intent, or state mismatch → no link, normal error page. Provider tokens are dropped exactly as in sign-in.

## D4. Identities UI lives beside API keys

A small section on the existing keys tab (both are "account plumbing"): the primary identity labeled as such, linked identities with an Unlink action, and one link button for whichever method is not yet attached. Unlink is `DELETE /api/identities` with `{ subject }`, session-authorized like every write. After unlink the detached identity behaves like a brand-new user on next sign-in — stated in the UI copy so nobody expects their widgets to follow.

## D5. Keys and MCP need nothing

API keys already resolve key→principal directly; a linked account shares keys because there is only one principal. The MCP server, catalogs, and wire formats are untouched — this change is entirely identity-plumbing behind `ensurePrincipal`.

## Risks

- **Alias/list divergence on partial failure** (D2): resolution is authoritative, list is convenience; acceptable and self-describing in the code.
- **Absorbed-empty subtlety**: "empty" must include unrevoked keys — absorbing a principal that still has a working key would silently re-point that key's catalog. The emptiness check counts widgets, themes, schemas, AND unrevoked keys.
- **Session identity after linking**: the session subject stays whichever method signed in; both now resolve identically, so nothing user-visible changes until the next sign-in — worth one line in the UI.
