## Why

The authorization surface's pages (sign-in choice, consent, error) are served under a policy that admits only their own inline styles. A host that renders them itself (`renderPage`) therefore cannot give them its brand: its palette stylesheet, its font files, its logo and the script that applies a visitor's chosen colour scheme are all blocked. The hosted app requires every page to match its brand, so it cannot adopt 0.16.0 as published.

## What Changes

- `AuthorizationDeps` gains `pageAssets`: the kinds of asset — `style`, `font`, `img`, `script` — a host lets its pages load **from the pages' own origin**. Each kind is opt-in; the default is none, which is today's policy byte for byte.
- Nothing else about the pages' policy moves: no other origin can be admitted, inline script stays impossible, framing stays forbidden, the pages stay uncacheable, and inline styles are still admitted only by hash.
- Docs: the "Sign hosts in" page and the package README name the option.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mcp-authorization`: a host may admit its own origin, per asset kind, on the pages the surface serves.

## Impact

- **Code**: `packages/mcp/src/oauth/types.ts`, `pages.ts`, `handler.ts`; tests beside them.
- **API**: one optional field; no existing call changes behavior.
- **Release**: `@widgentic/mcp` patch (0.16.1). The host bundle is untouched, so `Widgentic.Mcp` needs no release.
- **Consumer**: the apps repository's `adopt-host-sign-in` change, which waits on this.
