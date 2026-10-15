## Why

The designers preview widgets in the host page's own DOM.
- **Two-way style leaks.** The page's rules reach the preview (v81 fenced the app shell's element rules out by hand), and the preview's rules have to be scoped so they do not reach the page.
- **A different policy from the hosts.** The preview runs under the page's Content-Security-Policy, not the one MCP Apps hosts apply to the frame. widgentic.dev allows only its own origin and `data:` images, so anything a person loads from a declared resource domain renders in Claude or ChatGPT but not in the designer.
- **Stylesheet resources need this first.** A probe on 2026-10-15 showed that Claude and ChatGPT load a stylesheet and its fonts from declared domains (Material Icons from Google Fonts). The next change, stylesheet resources, needs a preview that loads them the same way.

The fix is a real island: the preview runs in its own framed document, under the frame policy the hosts apply.

## What Changes

- **The preview frame is the app template.**
  - The authoring surface gains `GET /preview-frame`. It serves the same MCP Apps template the hosts mount.
  - Its Content-Security-Policy is built from the operator's resource domains and the signed-in person's, the way hosts map `_meta.ui.csp.resourceDomains`.
  - Framing is limited to the serving origin.
- **The designer acts as a minimal host.**
  - Given a `previewFrame` URL, the widget and theme designers render their preview in a sandboxed iframe (`allow-scripts`, an opaque origin).
  - The designer speaks the MCP Apps protocol to it: initialize with a host context, one `tool-result` per edit carrying the rendered tree and CSS, and the frame's reported size.
  - The frame's own bridge mounts and patches the tree, exactly as in Claude or ChatGPT.
  - The preview never executes actions. The template shows them as unavailable, and the designer's badge marks them.
  - Without `previewFrame`, the in-page preview works as today, for embedders with no server.
- **No more scoping in the island.** Styles in the frame's own document need no scoping, and the host page's rules cannot reach them.
- **The self-host example** wires `previewFrame` for its designers. Its MCP endpoint declares only each person's domains, so its frame policy carries those and no operator list.
- **Release.** A minor for `@widgentic/mcp` (the new route) and `@widgentic/designer` (the new option): the linked group goes to 0.14.0. The apps repo adopts the island in its own change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `widget-designer`:
  - A new requirement, "Preview island", covers the framed preview, the host protocol subset, the size, the color scheme and the fallback.
  - The live-preview requirement now allows both modes.
  - The theme-styles requirement scopes styles only in the in-page mode.
- `authoring-api`:
  - A new requirement, "Preview frame route", covers the served template, its CSP and the anonymous behavior.
  - The transport requirement lets the frame route answer with headers and an HTML body.
- `self-host-example`: the designers preview in the island, under the person's resource domains.

## Impact

- **Code.**
  - `packages/mcp/src/authoring/*`: the route, the frame CSP, and an HTML response in the Node adapter.
  - `packages/designer/src/preview.ts` and the widget and theme designer wiring: island mode, the host protocol and the `previewFrame` option on the factories and elements.
  - `examples/docker/*`: the wiring.
  - Tests in each package, and a real-browser check.
- **Surface.** One new route, one designer option and one element attribute. Nothing existing changes: without `previewFrame`, the designers behave byte for byte as today.
- **Docs.** `docs/develop/embed-the-designers.mdx`, `docs/design/widget-designer.mdx`, the designer and mcp READMEs, and the self-hosting docs.
- **Out of scope.**
  - Stylesheet resources (the next change).
  - Scripts and web components.
  - A light/dark host toggle in the preview: the frame follows the designer's color scheme.
  - The apps adoption, a separate change in `widgentic/apps`.
