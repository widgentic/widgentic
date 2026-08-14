# Design — The widgentic.dev App

## Context

The MCP server runs on Azure Container Apps (Consumption, scale-to-zero) behind `mcp.widgentic.dev`, built from `infra/main.bicep`, pulling from ACR Basic, with a user-assigned identity and a managed certificate. Change 2 defined `WidgetStore` — `resolvePrincipal(apiKey)`, `widgets(id)`, `themes(id)` — plus request-scoped composition, hashed constant-time keys, and validation on both sides of the store. Change 1 made themes nameable entities. The designers are embeddable, zero-dependency, and already export exactly the shapes the store persists.

So the app is not a rewrite: it is an account system, a key lifecycle, a database adapter, and a shell around two components that already exist.

Architecture decisions were priced against Azure retail rates for Central US before choosing (see D1/D2 rationale); the settled answers are recorded here because they will outlive this change.

## Goals / Non-Goals

**Goals:**
- Sign in, get keys, design widgets and themes, see them in your own MCP catalog — with no hand-editing anywhere.
- Marginal infrastructure cost near zero, reusing what already runs.
- Writes authenticated by a *session*, never by the MCP key.
- The MCP server and the app read and write the same store through the change-2 port.

**Non-Goals:**
- No billing, plans, or quotas beyond change 2's structural limits.
- No team or organization sharing — one principal per user for now.
- No marketing/docs site (change 4).
- No agent-facing write tools (change 2, D5 stands).

## Decisions

**D1 — A second container app in the existing environment.** Priced: App Service Linux B1 is **$13.14/month** always-on; Static Web Apps Standard is **$9.00/month**; a second Consumption container app with `minReplicas: 0` is **~$0** under the same free grant already covering the MCP server. Beyond price it reuses the Bicep, the registry, the identity pattern, the Log Analytics workspace, and the managed-certificate flow — one deployment story instead of two. The tradeoff accepted: a cold start of a few seconds on the first request after idle, which is worse for a website than for an MCP endpoint. If that proves annoying in use, the lever is `minReplicas: 1` on the app only (~$8–10/month), decided after measuring rather than before.

**D2 — Cosmos DB serverless, not SQL and not Table Storage.** All three are effectively free at this volume (Cosmos storage $0.02/GB/month; ~100 k point reads ≈ $0.03), so cost did not decide it:
- The stored things *are* JSON documents keyed by one partition, with no joins and no reporting — a document store by shape.
- Azure SQL serverless auto-pause would put a 30–60 s cold start on the **MCP read path**, where an agent is waiting; keeping it warm costs more than everything else combined.
- Table Storage caps a property at 64 KB while change 2's `maxEntryBytes` is 65 536 — a legal widget could exceed a single property. Cosmos's 2 MB document limit removes the collision.
Serverless (pay-per-RU) is chosen over the subscription's free-tier slot deliberately: no provisioned ceiling to trip over, and the slot stays available for something else.

**D3 — Two containers, both point-read by design.** `data` partitioned by `/principalId` holds `id: "profile" | "widget:<kind>" | "theme:<name>"` — so `widgets(principalId)` is a single-partition query and a user's whole catalog costs a handful of RUs. `keys` partitioned by `/digest` holds `{ digest, principalId, name, scopes, createdAt, revokedAt? }` — so `resolvePrincipal` is a **1 RU point read**, never a cross-partition scan. Key lookup by digest is the hottest path on the MCP side; it gets its own container precisely so it stays O(1).

**D4 (revised during apply) — External ID for email, direct GitHub OAuth in the app.** The original decision federated GitHub into External ID for one token type from one issuer. Discovered at tenant setup: **external tenants do not support GitHub** — built-in social providers are Google/Facebook/Apple, and the custom-provider slot requires OIDC (discovery document, id_token, jwks), which GitHub's OAuth does not speak. Bridging through a third-party OIDC broker was rejected as a new auth dependency to avoid ~80 lines of our own code. Revised: email sign-in stays with External ID (one-time passcode — no passwords anywhere); GitHub is a first-party OAuth code flow in `apps/web/auth.ts`, reusing the same sealed state cookie and session mechanisms, with subjects namespaced `github:<id>`. Both methods land on the identical principal model. Free to 50 k MAU on the External ID side; the GitHub access token is used once to read the user id and never persisted.

**D5 — Keys: many, named, shown once, revocable individually.** A key is generated (`wgk_` + 32 random bytes), displayed exactly once, and stored only as its digest — the app cannot show it again, and says so. Each carries a name, a creation time, and `scopes: ["read"]`. Revocation stamps `revokedAt`; `resolvePrincipal` treats a revoked row as unknown, which lands the caller on the anonymous catalog rather than an error, exactly like any unknown key. Rotation therefore has no downtime window: create, migrate hosts, revoke.

**D6 — Managed identity to Cosmos, no connection strings.** Both container apps authenticate to Cosmos with their user-assigned identities under Cosmos DB data-plane RBAC: the app gets read/write, **the MCP server gets read only**, enforced by role assignment rather than by convention. A leaked MCP container cannot write to anyone's catalog. No account keys appear in Bicep, environment variables, or logs.

**D7 — Sessions authorize writes; keys never do.** The write API accepts only a validated External ID session token; presenting an MCP API key to it is refused. This is change 2's D5 carried through to implementation: the pasted key travels into third-party, prompt-injectable hosts, so it must not be able to persist templates that the victim's own agents will later render.

**D8 — Domains.** Apex `widgentic.dev` (and `www`) serve the app; `mcp.widgentic.dev` stays the MCP endpoint; `docs.widgentic.dev` is reserved for change 4's static site. All in Central US, next to the data, as confirmed — no residency constraint to design around.

**D9 — Writability is a separate type, not a flag.** Change 2's `WidgetStore` is read-only by construction; the app needs writes. Rather than widen the port (which would hand the MCP server methods it must never call), a `WritableWidgetStore` extends it with the widget/theme/key/principal mutations. The MCP server keeps holding the narrow type, so "the MCP path cannot write" is enforced twice — by the type it holds and by the Cosmos role its identity has (D6). `createMemoryStore` implements the wide one, so the write contract is tested without a database, and the Cosmos adapter is proven against the same suite. It ships from `./store/cosmos` so `./store` keeps its "no network I/O" property, with `@azure/cosmos` and `@azure/identity` as **optional peer dependencies** — only a host that imports that entry installs them, and the package's zero-runtime-dependency promise survives for everyone else.

## Risks / Trade-offs

- [Cold start on the app's first page view] → Accepted for now (D1); measured before spending on a warm replica.
- [Cosmos RU spikes from a pathological catalog] → change 2's per-principal limits bound entry count and size; single-partition reads keep RUs proportional to one user's data.
- [Key shown once is a support burden] → Deliberate: storing anything reversible would defeat the digest. Mitigated by making keys cheap to create and individually revocable.
- [One principal per user blocks teams] → Acknowledged; the `Principal` shape already carries an id independent of the sign-in subject, so team ownership can land later without migrating stored entries.
- [External ID misconfiguration locks users out] → Sign-in is the app's only door; the MCP path stays key-based and unaffected by an identity outage.

## Migration Plan

Additive: the MCP server keeps working unchanged until Cosmos configuration is present, and the anonymous catalog (built-ins + compiled-in widgets) still answers unauthenticated callers. The existing production key remains valid — it is seeded as a digest row for a bootstrap principal, so no host reconfiguration is needed on cutover. Ship as `v11`.

## Open Questions

_None blocking. Deferred: teams/sharing, per-plan quotas, and whether scoped write keys ever reach the MCP surface (its own change, its own review)._
