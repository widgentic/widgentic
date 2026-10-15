---
"@widgentic/designer": minor
---

The widget and theme designers take `previewFrame` (the `preview-frame` attribute on their elements), the URL of a preview frame such as the authoring surface's `/api/preview-frame`. With it, the preview runs as an island:
- **What it renders in.** The MCP Apps app template, framed with `sandbox="allow-scripts"`.
- **The designer as host.** It answers the frame as a minimal MCP Apps host: no server tools, one tool result per revision, the frame's size, links through the URL guard, and the color scheme with the built-in palette of that scheme.
- **The result.** The preview renders as hosts render it, under the frame policy hosts apply for the person's resource domains. The page's styles and the preview's never cross the frame.

Without `previewFrame`, the in-page preview is unchanged. With it, the page no longer receives core's widget stylesheet or the in-page preview's own rules. These now sit in a separate `data-widgentic-designer-preview` stylesheet, and only an in-page preview injects it. A page that styled its own elements with the designer-injected `--wg-*` defaults should call `injectBaseStyles` itself.
