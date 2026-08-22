# Tasks — Pre-production hardening pass

Tasks marked **[USER]** need the user's own credentials (GitHub UI, Entra portal, or a local terminal for secret entry); the rest are agent work. Order matters in section 1.

## 1. Key Vault + secret rotation (operational)

- [x] 1.1 Create `widgentickv` in `widgentic-rg` (RBAC-enabled, template-deployment enabled); grant the deploying principal secrets-officer; wait until `az keyvault secret show` succeeds as the deployer
- [x] 1.2 Generate and store new `widgentic-api-key` and `widgentic-session-secret` in the vault — piped, never echoed
- [ ] 1.3 **[USER]** Regenerate the GitHub OAuth client secret (GitHub → Settings → Developer settings → OAuth Apps → client `Ov23likZKNlJwQu8BAvo` → Generate a new client secret; keep the OLD one active until 1.7) and store it: `az keyvault secret set --vault-name widgentickv --name widgentic-github-client-secret --value '<new>' -o none` from your own terminal — never paste it into chat
- [x] 1.4 Rewrite the deploy params as Key Vault references; commit the non-sensitive template as `infra/deploy.params.template.json`
- [x] 1.5 TESTING.md: never-print-secrets rule + masked-verification snippet + the KV-based redeploy contract (supersedes rebuild-from-live for secrets)
- [x] 1.6 Deploy with the referenced params (v40, first KV-referenced deploy, Succeeded); rotation verified the store-mode way — the old key resolves ANONYMOUS (built-ins only; store mode demotes, it never 401s) after Cosmos key surgery (bootstrap principal: old key revoked, replacement minted straight into the vault), and the vault key lists the principal's customs
- [ ] 1.7 **[USER]** Verify GitHub sign-in on widgentic.dev, then delete the OLD GitHub client secret in the same GitHub screen; note that all browser sessions were invalidated by the session-secret rotation

## 2. DNS-rebinding pinning

- [x] 2.1 Replace the inliner's transport with `node:https.request` carrying a fixed `lookup` that returns only the validated address; hostname preserved for TLS servername + Host; timeout/size/redirect semantics unchanged; re-validate AND re-pin per redirect hop; `fetchImpl`-style injection preserved for tests
- [x] 2.2 Tests: lookup-vs-connect disagreement case (connection goes to the validated address; a rebound answer never receives a request); full existing inliner suite green unchanged

## 3. resourceDomains

- [x] 3.1 `createWidgenticServer({ resourceDomains?: string[] })` → `_meta.ui.resourceDomains` on the app resource when non-empty; `WIDGENTIC_RESOURCE_DOMAINS` (comma-separated) in `apps/mcp-server/http.ts`; optional `mcpResourceDomains` Bicep param mapped to the env var
- [x] 3.2 Inliner skip for declared hostnames (exact match, lowercased); config-only — no path from widgets/renders into the list
- [x] 3.3 Tests: declaration present/absent on the resource; skip + still-inlined side by side; sdk-interop reads the metadata
- [x] 3.4 Rig: live probe with a declared domain — declaration visible on resources/list, declared image stays a URL, undeclared inlines (frame-native loading is the HOST's half of the contract; basic-host does not implement csp.resourceDomains, so that half is verifiable only on hosts that do)

## 4. Identity review, docs, ship

- [x] 4.1 TESTING.md: identity decision record (Entra stays public+PKCE; GitHub secret is a permanent KV rotation item; any future confidential Entra client uses MI-federated credentials, with the portal path) + rate-limit posture note
- [ ] 4.2 **[USER]** Entra admin center → App registrations → client `5659817c-432c-4f3e-8ad4-87f29f80a0ee` → Certificates & secrets → confirm zero client secrets; report back
- [ ] 4.3 Full gate; strict validation; deploy v40 per the (new, KV-based) redeploy contract; live verification (pinning is behavior-invisible — verify via the gate; resourceDomains via resources/read on production)
- [ ] 4.4 Commit, push, memory update
