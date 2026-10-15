---
"@widgentic/mcp": minor
---

The authoring surface serves `GET /preview-frame`, the designers' preview island. It is the app template as HTML, under a Content-Security-Policy:
- **Domains.** The operator's domains (`resourceDomains`, new in the authoring deps) followed by the signed-in principal's `resourceDomains` setting, for images, styles, fonts and media.
- **Scripts.** Only the template's inline scripts, by hash.
- **Everything else.** No network access, framing by its own origin only, and `no-store`.

The surface's response gains an HTML variant (`html` and `headers`), which the Node adapter writes as is. Without a principal, or when the settings read fails, the policy carries the operator's domains alone. A presented API key is refused, as on every route.
