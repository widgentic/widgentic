---
"@widgentic/designer": minor
---

The settings designer gains a **Resource domains** subsection: the domains a person's MCP Apps frames may load images from directly.

- Entries are added, edited and removed in place, each checked as it is typed by core's `parseResourceDomain`. A valid entry is recorded and shown in its canonical `https://` form. An invalid one is kept as typed and marked with the rule's reason, so the save's `INVALID_DOMAIN` names it.
- Adding stops at `RESOURCE_DOMAIN_LIMIT`. The text states the accepted forms, the limit and the trust a declaration grants: any render may load from a listed domain in the viewer's browser, so list only domains you control.
- `getSettings()` carries `resourceDomains` once the supplied record had it or the person edited the list (possibly empty, so a save clears it). `loadSettings` refuses a `resourceDomains` that is not a list of strings, and read-only mode makes the list inert.
