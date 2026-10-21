---
"@widgentic/mcp": patch
---

The app template's streamed card and table previews encode a `hints.links` prefix value as the renderer does, so a preview links the same href its tool result carries. The authoring guide's `ATTR PREFIX` line now says the value is percent-encoded and that agents should pass raw values.
