# Design — pre-production hardening pass

Ordering: rotation first (live exposure), rebinding pinning second (real vulnerability), resourceDomains third (feature-shaped), identity review last (a decision). Steps marked **[USER]** need the user's own credentials (GitHub UI, Entra portal); everything else the agent performs. One deploy (v40) carries the code items; the rotation deploy can be the same one.

## D1. Secret rotation — runbook

**Exposure**: `apiKey`, `sessionSecret`, and `githubClientSecret` have all appeared in plaintext in chat transcripts (deploy-params files were printed for verification). Treat all three as compromised.

**Standing rule (goes into TESTING.md)**: secrets are never echoed into terminal output or chat. Verification of params files uses masking: `python3 -c "import json;d=json.load(open(F));[d['parameters'][k].update(value='***') for k in ('apiKey','sessionSecret','githubClientSecret') if k in d['parameters']];print(json.dumps(d,indent=1))"`. Generation pipes directly into variables or Key Vault, never through the screen.

1. **[USER] Regenerate the GitHub OAuth client secret**: github.com → avatar → Settings → Developer settings → OAuth Apps → the widgentic app (client id `Ov23likZKNlJwQu8BAvo`) → "Generate a new client secret". Copy it once; do NOT paste it into chat — put it straight into Key Vault (step 3 gives the exact command to run locally) or hand it over via the vault only. Delete the old secret in the same screen AFTER the new deployment is verified (GitHub allows two active secrets — generate-verify-delete gives zero-downtime rotation).
2. **Generate replacements for the widgentic-owned secrets** (agent, no echo): `NEW_API_KEY=$(openssl rand -hex 32)`, `NEW_SESSION=$(openssl rand -hex 32)` — used within the same shell invocation that writes them to the vault, never printed.
3. **Key Vault** (see D2) receives all three: `az keyvault secret set --vault-name <kv> --name widgentic-api-key --value "$NEW_API_KEY" -o none` (likewise `widgentic-session-secret`; the GitHub one the user sets from their terminal: `az keyvault secret set --vault-name <kv> --name widgentic-github-client-secret --value '<pasted>' -o none`).
4. **Deploy** with KV-referencing params (D2). Verify with masked output only.
5. **Post-verification**: old API key → 401 on `https://mcp.widgentic.dev/mcp?key=<old>` (the old key IS printable — it is burned); new key → tools/list succeeds (result inspected, key never echoed — read it from the vault inside the probe script). **[USER]** GitHub sign-in on widgentic.dev works; then delete the old GitHub secret (step 1). Note: rotating `sessionSecret` invalidates every browser session — everyone signs in again; expected, mention in the commit.

## D2. Key Vault-backed deploy parameters

The tmp scratchpad params file has been lost to cleanup twice and carries raw secrets. Move the three secrets to Key Vault; the params file then contains only references (non-sensitive, committable to TESTING.md as a template).

- Create (agent): `az keyvault create -n widgentickv -g widgentic-rg -l <region> --enable-rbac-authorization true`, then grant the deploying identity (the user's az login principal) `Key Vault Secrets Officer` via `az role assignment create`.
- Params file shape (replaces the raw values):
  `"apiKey": { "reference": { "keyVault": { "id": "/subscriptions/6980a233-6776-4431-9645-8a7025160557/resourceGroups/widgentic-rg/providers/Microsoft.KeyVault/vaults/widgentickv" }, "secretName": "widgentic-api-key" } }`
  (same pattern for `sessionSecret`, `githubClientSecret`). ARM resolves references at deployment time; `main.bicep` is unchanged (its `@secure()` params already never surface in outputs). The vault needs `--enabled-for-template-deployment true` (or the RBAC equivalent: the ARM resource provider evaluates the deployer's permissions — with RBAC vaults, the deployer's `Key Vault Secrets User` suffices).
- The reference-style params file is durable: store it as `infra/deploy.params.template.json` in the REPO (it holds no secrets), ending the rebuild-from-live dance for everything except image tags and domains.

## D3. DNS-rebinding pinning — implementation

**The hole**: `fetchImageAsDataUri` calls `lookupImpl` to validate addresses, then calls `fetch(url)` — and undici resolves the hostname AGAIN for the socket. A DNS server can alternate answers (public for the check, `169.254.169.254` for the fetch).

**The fix, zero-dep**: replace the `fetch` transport with `node:https.request`, whose options accept a custom `lookup(hostname, opts, cb)`. Per hop: validate via `lookupImpl` as today, pick the first validated address, then issue `https.request(url, { lookup: (h, o, cb) => cb(null, [{ address: validatedIp, family }]) , timeout, headers })`. TLS `servername` and the `Host` header default to the URL's hostname (certificate validation intact); only the socket target is pinned. Redirects stay manual (the existing ≤3-hop loop re-validates AND re-pins each hop). `fetchImpl` stays injectable for tests, now shaped as the pinned transport; the structural fakes gain a "lookup and connect disagree" case asserting the connection target is the validated address and a rebinding answer never receives a request.

IP-literal URLs keep the current path (validated directly, no resolution to pin). The `AbortSignal.timeout` behavior maps to `request.setTimeout` + destroy.

## D4. resourceDomains — one list, two consumers

`createWidgenticServer({ resourceDomains?: string[] })`; `apps/mcp-server/http.ts` reads `WIDGENTIC_RESOURCE_DOMAINS` (comma-separated hostnames, trimmed, lowercased). Consumers:
1. The app resource registration adds `_meta.ui.resourceDomains` when non-empty (per the ext-apps registration options).
2. The same list reaches the inliner (threaded through the render-result inlining call), which skips URLs whose hostname equals a declared entry (exact hostname match — no wildcard semantics in v1; subdomains must be listed explicitly, the conservative reading).

Empty default keeps today's behavior bit-for-bit. The list is config-only: nothing in stored widgets, drafts, or render inputs can extend it. Bicep gains an optional `mcpResourceDomains` param (default `[]`) mapped to the env var — deployments that want it set it in params.

## D5. Identity credential review — decision record

- The Entra External ID flow is a **public client with PKCE**: no client secret exists (redirect URIs live under the *Mobile and desktop* platform precisely because of that — the AADSTS7000218 lesson). Decision: it stays public+PKCE. Nothing to federate today.
- GitHub OAuth is a confidential flow **by GitHub's design** — no workload-federation equivalent exists; its secret is therefore a permanent rotation item (now living in Key Vault, D1/D2).
- Standing rule for the future, recorded in TESTING.md: if a confidential Entra client is ever introduced (Graph calls, OBO), it uses a **federated credential bound to the container app's managed identity** (Entra portal → App registrations → the app → Certificates & secrets → Federated credentials → scenario "Managed identity") — never a client secret.
- **[USER] verification**: Entra admin center → Applications → App registrations → widgentic app (client id `5659817c-432c-4f3e-8ad4-87f29f80a0ee`) → Certificates & secrets → confirm the Client secrets tab is EMPTY. Screenshot or verbal confirmation closes the task.

## D6. Abuse-surface posture — documentation only

TESTING.md records: key auth is digest-compared in constant time but unthrottled (a brute-force attempt costs the attacker one HTTPS round-trip per guess against a 256-bit keyspace — not a practical risk, documented so nobody rediscovers it); auth routes are safe-by-shape (dev login hard-disabled when an issuer exists); if throttling is ever wanted, Container Apps ingress supports IP restrictions and the ingress-level rate limiting arriving in the platform — revisit then. No code.

## Risks

- **Key Vault reference resolution needs deployer permissions** — first deploy after the switch may 403 until the role assignment propagates (minutes). Mitigation: assign roles, wait for `az keyvault secret show` to succeed as the deployer, then deploy.
- **Session invalidation** on sessionSecret rotation is user-visible. Deliberate.
- **Pinned transport behavior drift** vs undici (header casing, gzip) — the inliner only needs status, content-type, and bytes; tests pin those.
