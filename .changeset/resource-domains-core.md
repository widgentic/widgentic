---
"@widgentic/core": minor
---

One resource-domain rule for every door: `parseResourceDomain`, `parseResourceDomains`, `matchesResourceDomain` and `RESOURCE_DOMAIN_LIMIT` (20), exported from the root and `./contract`.

- Accepts `cdn.example.com`, `*.example.com`, or either behind `https://`, with one optional trailing `/`, ignoring case and surrounding whitespace. Returns the canonical origin (`https://cdn.example.com`, `https://*.example.com`) or a readable reason.
- Refuses other schemes, ports, paths, queries, fragments, userinfo, IP literals, single-label and `localhost` names, a wildcard anywhere but the whole first label (or before fewer than two labels), non-ASCII hosts (enter punycode), and whitespace, `;`, `,` or quotes, so no entry can inject into a CSP a host builds from it.
- `matchesResourceDomain` follows CSP: a wildcard covers subdomains at any depth, never its apex.
