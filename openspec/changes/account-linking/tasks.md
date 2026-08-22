# Tasks — Account linking

## 1. Store: linked-identity operations

- [x] 1.1 Port: `linkSubject(principalId, subject)`, `unlinkSubject(principalId, subject)`, `listLinkedSubjects(principalId)`; rejection codes `SUBJECT_IN_USE`, `CANNOT_UNLINK_PRIMARY`; emptiness = no widgets/themes/schemas AND no unrevoked keys
- [x] 1.2 Memory store implementation (reference semantics for the contract suite)
- [x] 1.3 Cosmos: alias profile docs (`linkTo`, one-hop resolution in `ensurePrincipal`/`resolvePrincipal` paths), `linkedSubjects` on the canonical profile, empty-principal absorption; point-read only
- [x] 1.4 File store: NOTHING TO DO (factual correction during apply) — the file store is the read-only WidgetStore resolving KEYS, not subjects; ensurePrincipal/linking exist only on writable stores, so alias parity is vacuous there
- [x] 1.5 Contract suite: all six delta scenarios against memory + the Cosmos structural fake; restart-persistence case

## 2. App: link flow and Identities UI

- [x] 2.1 auth.ts: session-bound single-use link intent through BOTH provider flows; callback routes intent+session to linkSubject, never mints a session for the link path
- [x] 2.2 api.ts: `GET /api/identities` (primary + linked, provider-labeled), `DELETE /api/identities` `{subject}` (session-authorized; primary refused)
- [x] 2.3 Identities section on the keys tab: primary badge, linked rows with Unlink, link button for the missing method, conflict + next-sign-in copy
- [x] 2.4 App tests: link flow end-to-end over HTTP (intent forge attempts refused), conflict refusal, unlink → fresh principal, identities listing

## 3. Verify and ship

- [x] 3.1 Full gate; strict validation
- [x] 3.2 Rig: browser sweep on :3002 (dev login can simulate both methods via namespaced subjects) — link, shared catalog both ways, conflict message, unlink
- [x] 3.3 Deploy v41 per the KV redeploy contract; live verification (real email+GitHub link on production is the user's step — their two identities exist there)
- [x] 3.4 Commit, push, memory update
