---
"@widgentic/mcp": minor
---

Hosts can sign in instead of pasting a key.

- New entry `@widgentic/mcp/oauth`. The resource side (`protectedResourceMetadata`, `bearerChallenge`, `readBearerToken`, `resolveCredential`) is what a protected MCP endpoint serves and answers. The authorization surface (`createAuthorizationSurface`, `createAuthorizationHttpHandler`) covers metadata, client registration, authorize and consent, the token endpoint (authorization code with PKCE S256, rotating refresh tokens) and revocation. The host says who is signed in; the person selects or creates the API key the application is bound to.
- The stores gain access grants (`AccessGrantStore`, `WritableAccessGrantStore` from `@widgentic/mcp/store`): tokens and codes are held as digests, resolving a token is one read, and `revokeKey` ends the grants bound to that key. `StoreLimits` gains the optional `maxGrants` (default 50). Stores written by earlier versions open unchanged.
- The authoring surface's key listing carries `connections` (the connected application's name and two timestamps) when its deps include `grants`.
- **Self-host example (`examples/docker`), breaking for keyless hosts:** `/mcp` now requires a sign-in or an API key and answers `401` with a challenge otherwise — including for an unknown or revoked key, which used to be served the built-in catalog. The built-in catalog is at `/mcp/public`. Set `WIDGENTIC_PUBLIC_URL` on both services anywhere but localhost.
