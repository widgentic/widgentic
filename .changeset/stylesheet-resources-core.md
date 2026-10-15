---
"@widgentic/core": minor
---

The stylesheet resource rule: `parseResource`, `parseResources`, `resourceCovered`, `resourceHost` and `RESOURCE_LIMIT` (8).
- **An entry** is `{ type: "stylesheet", href, integrity? }`.
- **The address** is `https://` on a host the resource-domain rule accepts, with no port, user name or wildcard, read by grammar, so every runtime reads it alike. Nothing that could leave an attribute value passes.
- **Integrity** is one or more `sha256|sha384|sha512-<base64>` values.
- **Coverage** follows CSP host-source matching: exact, or a `*.` wildcard for its subdomains, never its apex.

The store, the server, the host bundle and the designers all use this one rule.
