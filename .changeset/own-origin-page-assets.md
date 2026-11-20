---
"@widgentic/mcp": patch
---

A host that renders the authorization pages itself can give them its brand: `pageAssets` on the authorization surface names the kinds of asset (`style`, `font`, `img`, `script`) those pages may load from their own origin. Each kind is opt-in and the default is none, which is the policy served before. No other origin, no inline script and no framing can be admitted this way.
