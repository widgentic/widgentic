---
"@widgentic/mcp": minor
---

Per-principal resource domains: a person can declare the domains their MCP Apps frames may load images from directly.

- **Settings.** The settings record gains a `resourceDomains` section: up to 20 domains, stored as canonical `https://` origins and deduplicated. A refused entry is `INVALID_DOMAIN` (new store code, `422` on the authoring surface), a non-list or a list over the limit `INVALID_SHAPE`, and an empty list removes the section. Writing it checks no theme. On read, a refused stored entry is dropped with a diagnostic naming it. The rules live in the runtime-neutral settings rules the host bundle shares.
- **Composition.** `composeResourceDomains(store, principalId, { settings? })` yields the caller's list (empty for anonymous callers, and empty with a diagnostic when the record cannot be read). `readPrincipalSettings` reads the record once per request, and `composeThemes` accepts the same `{ settings }`, so one read serves the default themes and the domains.
- **Declaration.** `createWidgenticServer({ resourceDomains })` takes the operator's list followed by the caller's. Entries go through the core rule, refused ones are dropped, and the rest are declared as canonical origins in `_meta.ui.csp.resourceDomains`, on the declaration and the read content. **Behavior change:** operator entries used to be declared as given (bare hostnames).
- **Inlining.** Sources on declared domains are no longer skipped. They rank after every undeclared source, which has no other route, and are inlined with the cap and budget left over. One left external keeps its URL, which a host honoring the declaration loads directly. A host that ignores the declaration, or still holds an old one, never shows fewer images than before. The overflow note counts declared leftovers separately.
- **Host bundle.** `createWidgenticHost`'s config takes the embedding server's own `resourceDomains`, and its `settings` take the new section. Refusals are listed in `problems()` (under `resourceDomains` or `settings`), and `resources()` reports the app template's declared list, absent when empty.
