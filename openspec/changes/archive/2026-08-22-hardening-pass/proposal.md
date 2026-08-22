# Pre-production hardening pass

## Why

Production has accumulated four known exposures while product work took priority, and the user has now cleared it as the next milestone. Two are live risks: every production secret (API key, session secret, GitHub OAuth client secret) has transited chat transcripts in plaintext, and the image inliner's SSRF guard validates DNS separately from the fetch's own resolution — a classic rebinding window that can reach link-local metadata endpoints despite the address checks. Two are posture items: the Apps CSP story relies entirely on data-URI inlining with no way for a deployment to declare trusted asset domains, and the identity setup has never been formally reviewed for stored-secret minimization.

## What Changes

- **Secret rotation (operational, user-performed steps included)**: all three secrets rotated; the deploy flow moves to Key Vault references so the params file never carries raw values again; the redeploy contract gains a never-print-secrets rule with masked verification.
- **DNS-rebinding pinning**: the inliner connects to the exact address that passed validation (custom `lookup` on the HTTPS agent, hostname kept for TLS SNI and Host), re-pinned per redirect hop. No second resolution between check and fetch.
- **Per-deployment `resourceDomains`**: a new `resourceDomains` option on the server assembly (env `WIDGENTIC_RESOURCE_DOMAINS` at the entry) flows into the app resource's `_meta.ui.resourceDomains`; the inliner leaves URLs on declared hosts un-inlined (the frame loads them natively). Empty by default — an operator trust decision, never influenced by stored widgets.
- **Identity credential review (decision + documentation)**: confirm the Entra flow stays public-client + PKCE (no stored secret exists to eliminate); record that GitHub's protocol requires its client secret and that any future confidential Entra client MUST use managed-identity workload federation instead of a secret; user verifies the app registration holds zero client secrets.
- **Abuse-surface documentation**: TESTING.md records the rate-limiting posture of the public endpoints (constant-time key comparison, no throttle) and the Container Apps options if throttling is ever needed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mcp-server`: the image-inlining requirement gains the pinned-connection guarantee and the declared-domain skip; the Apps declaration requirement gains the per-deployment `resourceDomains` flow.

## Impact

- `src/mcp-server/inline-images.ts` — pinned HTTPS fetching via `node:https` with a fixed `lookup` (stays zero-dep); declared-domain skip.
- `src/mcp-server/server.ts` — `resourceDomains?: string[]` option → `_meta.ui.resourceDomains`; `apps/mcp-server/http.ts` — `WIDGENTIC_RESOURCE_DOMAINS` env.
- `infra/main.bicep` + params — Key Vault reference support (no template secret-shape change; params files change).
- TESTING.md — rotation runbook, never-print rule, identity decision record, rate-limit posture.
- Operational: GitHub OAuth secret regeneration (user), Entra portal verification (user), Key Vault creation + secret writes, production redeploy (v40).
