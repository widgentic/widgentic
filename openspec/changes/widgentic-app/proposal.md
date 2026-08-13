# The widgentic.dev App

## Why

Change 2 built the bridge — the server can serve a caller's own widgets and themes — but nothing fills the store. Today a principal exists only if someone hand-edits a directory, and the single API key is distributed out of band. This change is the front door: a person signs in, gets keys they can rotate, designs widgets and themes in the browser, and sees them appear in their own MCP catalog on the next tool call.

It is also the only change in this arc that needs decisions outside the codebase. Those are now settled: a second container app in the existing environment, Cosmos DB serverless, and Entra External ID federating GitHub — an architecture whose marginal cost is roughly zero because it reuses infrastructure that is already paid for.

## What Changes

- **Accounts**: sign-in via Entra External ID, with **GitHub federated** into it so both email and GitHub arrive as one token type the app validates once. No password code is written.
- **Multiple named API keys per user**: create, name, and individually revoke. The raw key is shown **once** at creation; only its `sha256:` digest is stored, so rotation is "make the new one, move your hosts, revoke the old" with no downtime.
- **Cosmos-backed store**: a `CosmosWidgetStore` implementing change 2's port, shared by the app (writes) and the MCP server (reads) via managed identity and Cosmos RBAC — no connection strings in configuration.
- **The write path**: session-authenticated HTTP endpoints for widgets, themes and keys. Deliberately **not** MCP tools (change 2, D5) — the pasted key stays read-only.
- **The designers, hosted**: the app serves the bundled widget and theme designers, wired to persistence — so "design it" and "it is in my catalog" are the same act.
- **Infrastructure**: Cosmos serverless account + a second container app in the existing `widgentic-env`, added to the same Bicep, pulling from the same ACR, at the apex domain `widgentic.dev`.

## Capabilities

### New Capabilities

- `widgentic-app`: accounts and sessions, API-key lifecycle, the authenticated write API, and hosting the designers against persistence.

### Modified Capabilities

- `widget-store`: gains the Cosmos adapter — the port's first real database implementation, with the partition design and RBAC identity model that make per-principal reads a point lookup.

## Impact

- New `src/store/cosmos.ts` (adapter) and `apps/web/` — the site, its API, and the designer bundle — alongside the MCP server's new home at `apps/mcp-server/`.
- `infra/main.bicep`: Cosmos serverless account, the app container app, apex + `www` hostnames with managed certificates, RBAC role assignments for both container apps' identities.
- The MCP container gains Cosmos configuration and reads through the same adapter instead of the file store.
- Tests: the Cosmos adapter against the port's contract (emulator or a test account), key lifecycle (create → use → revoke → refuse), session-vs-key authorization, and an end-to-end proving a widget designed in the app appears in that user's `list_widgets` and in nobody else's.
- Cost: ~$0–1/month added (Cosmos serverless at this volume is cents; the second container app is covered by the existing free grant); the resource group stays ACR-dominated at ~$6/month.
- Deferred to change 4: the static marketing/docs site on Static Web Apps Free at `docs.widgentic.dev`.
