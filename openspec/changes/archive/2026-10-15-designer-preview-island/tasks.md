## 1. The frame route (`@widgentic/mcp/authoring`)

- [x] 1.1 Add an HTML response variant to the surface (`{ status, headers, html }`) and have the Node adapter write it as is. Every JSON route is unchanged.
- [x] 1.2 `GET /preview-frame`, per D2/D3:
  - the body is `buildAppTemplate()`;
  - the policy carries `sha256` hashes of the inline scripts and the operator's then the principal's canonical domains;
  - `Cache-Control: no-store`, `nosniff`, no cookie;
  - with no principal, or when the settings read fails (logged), the operator's list only;
  - API keys and other methods are refused as elsewhere.
  Add `resourceDomains` to the authoring deps.
- [x] 1.3 Tests for every scenario of "Preview frame route" and the adapter scenario. Each hash must match its script in the body.

## 2. The island (`@widgentic/designer`)

- [x] 2.1 `previewFrame` on the widget and theme designer factories, and a `preview-frame` attribute on their elements.
- [x] 2.2 Island mode in `preview.ts` (D1, D5–D8): the iframe with `sandbox="allow-scripts"`, the host protocol subset, message holding until initialized, one `tool-result` per previewable revision with tree, CSS (D5 order plus the action badge) and payload, size, color scheme with `host-context-changed`, the link guard, the source check and dispose. The in-page mode is untouched.
- [x] 2.3 Tests for every "Preview island" scenario with a fake frame window, plus the island scenario of the theme-styles requirement. Existing preview tests pass unchanged.
- [x] 2.4 A parity test in `@widgentic/mcp`: the designer's island tree and CSS order equal `handleRenderWidget`'s for the same widget and theme.

## 3. The self-host example

- [x] 3.1 `main.ts` sets `previewFrame` on the widget and theme designers. The web service passes no operator list, because its MCP endpoint declares none (D9, revised during apply). Check that the page CSP allows the same-origin frame.
- [x] 3.2 An example test: the Widgets and Themes previews are iframes on `/api/preview-frame`, and the route's policy carries the person's domains.

## 4. Real browser, docs and release notes

- [x] 4.1 A real-browser check, Chrome against the example served locally (dark mode needed the host palette: D7, revised during apply):
  - the preview renders inside the frame;
  - a page-level `.wg-title` rule does not reach it, and the draft's rule does not reach the page;
  - an image from a declared domain loads in the frame;
  - the iframe height follows the content;
  - a dark page gives a dark frame.
- [x] 4.2 Docs:
  - `docs/develop/embed-the-designers.mdx`: `previewFrame` and the route;
  - `docs/design/widget-designer.mdx`;
  - `docs/develop/self-hosting.mdx`;
  - the designer and mcp READMEs.
  Regenerate the reference pages.
- [x] 4.3 Changesets: designer and mcp minor. Add a dated `TESTING.md` entry.

## 5. Gates and staging

- [x] 5.1 Run the gates: typecheck, `npm test`, build, `pack:check`, docs check, `openspec validate --strict designer-preview-island` and `--specs`. Also run `dotnet test`: the host bundle is untouched, but the template module is shared.
- [x] 5.2 Deploy the branch to staging, replacing the stylesheet probe. Check from the served bytes that `/api/preview-frame` carries the policy. Hand the owner a designer check (isolation, external images, dark mode).
