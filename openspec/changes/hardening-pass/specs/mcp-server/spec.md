# MCP Server — hardening delta

## MODIFIED Requirements

### Requirement: Server-side image inlining for iframe surfaces
Because Apps-host sandboxes block external `img-src` while permitting `data:`, the runnable server SHALL, when inlining is enabled (the default; `WIDGENTIC_INLINE_IMAGES=0` disables), rewrite `img` sources on the iframe-facing surfaces of a `render_widget` result — the `structuredContent` HTML fragment, the `structuredContent.tree` render tree (element nodes with `tag: "img"`), and the `ui://widgentic/page/<kind>` embedded resource — replacing each `http(s)` source whose fetch succeeds with a `data:<content-type>;base64,` URI; the tree and HTML projections SHALL be rewritten from the same fetch results and never disagree. The model-facing HTML text block and `format: "page"` output SHALL keep original URLs. Each unique URL SHALL be fetched at most once per render. The fetch SHALL be guarded: `https` scheme only; hostnames resolving to loopback, private (RFC1918), link-local (including 169.254.169.254), carrier-grade NAT, or IPv6 unique-local/link-local addresses SHALL be rejected, re-validated on every redirect hop (at most 3); the connection SHALL be made to the exact address that passed validation — the fetch SHALL NOT perform its own name resolution, so a DNS answer that changes between validation and connection has no effect — while TLS server-name and the `Host` header keep the original hostname; the response `Content-Type` MUST be `image/*`; per-image size SHALL be capped (1 MiB) and the fetch SHALL time out (~4 s); at most 24 images SHALL be inlined per render, the first N unique fetchable sources in document order. URLs whose hostname is among the deployment's declared resource domains SHALL be left un-inlined — the frame is allowed to load them natively. Any failure SHALL leave the original URL in place (alt-text fallback) without failing the render.

#### Scenario: External image becomes a data URI in iframe surfaces only
- **WHEN** `render_widget` renders a table whose cell is a fetchable `https` image URL and inlining is enabled
- **THEN** the `structuredContent` fragment and the `ui://` resource SHALL carry the image as `data:image/...;base64,` with no `http(s)` `img` source remaining
- **AND** the plain HTML text block SHALL still reference the original URL

#### Scenario: The tree is rewritten in lockstep with the html
- **WHEN** inlining succeeds for a render that carries `structuredContent.tree`
- **THEN** every `img` element node in the tree SHALL carry the same `data:` URI as the corresponding `img` in `structuredContent.html`

#### Scenario: Private-network targets are refused
- **WHEN** a widget value is `https://169.254.169.254/latest/meta-data.png` or an `https` URL whose hostname resolves to a private address
- **THEN** no request body SHALL be consumed from the target and the original URL SHALL remain in the output

#### Scenario: Rebinding between validation and connection is ineffective
- **WHEN** a hostname's resolution passes validation but a subsequent resolution of the same name would return a private address
- **THEN** the connection SHALL still be made to the validated address
- **AND** no request SHALL ever reach the privately-resolved address

#### Scenario: Non-image and oversized responses are not inlined
- **WHEN** the fetched response has a non-`image/*` content type, or exceeds the size cap
- **THEN** the original URL SHALL remain and the render SHALL still succeed

#### Scenario: Declared resource domains are not inlined
- **WHEN** the deployment declares `cdn.example.com` as a resource domain and a widget image source is `https://cdn.example.com/a.png`
- **THEN** the URL SHALL remain in all surfaces (no fetch, no data URI)
- **AND** an image on an undeclared host in the same render SHALL still be inlined

#### Scenario: Inlining can be disabled
- **WHEN** `WIDGENTIC_INLINE_IMAGES=0` is set
- **THEN** all surfaces SHALL keep original image URLs

#### Scenario: Overflow beyond the cap is deterministic
- **WHEN** a render carries more unique fetchable image sources than the cap
- **THEN** the first 24 in document order SHALL be inlined and the rest SHALL keep their original URLs (alt-text fallback in sandboxed frames)

### Requirement: Formal Apps declaration at the wiring layer
The server assembly SHALL declare the tool↔UI linkage per the MCP Apps specification using the official `@modelcontextprotocol/ext-apps` server helpers: `render_widget` registered with `_meta.ui.resourceUri: "ui://widgentic/app.html"`, and the app template registered as a resource with mime type `"text/html;profile=mcp-app"`. When the assembly is given `resourceDomains` (a list of hostnames the operator trusts the frame to load assets from), the app resource SHALL declare them as `_meta.ui.csp.resourceDomains` (the Apps CSP block) and the same list SHALL govern the inliner's declared-domain skip; with none given, nothing is declared and every external image faces inlining. The list is deployment configuration — stored widgets and render inputs SHALL have no way to extend it. The assembly SHALL detect the client's Apps capability (`extensions["io.modelcontextprotocol/ui"]`) after initialization and note the outcome on stderr. SDK and host-flavor specifics SHALL live only behind the `widgentic/mcp-server/sdk` entry; the base `widgentic/mcp-server` entry remains SDK-free (per the server-assembly requirement).

#### Scenario: Tool declares its template
- **WHEN** an SDK client lists tools
- **THEN** `render_widget` SHALL carry `_meta.ui.resourceUri` pointing at the app template resource

#### Scenario: Non-Apps hosts keep working
- **WHEN** a client without the Apps capability connects
- **THEN** all tools SHALL behave exactly as before (text/page/widget outputs), with the template simply unmounted

#### Scenario: Declared domains reach the resource metadata
- **WHEN** the assembly is created with `resourceDomains: ["cdn.example.com"]` and an SDK client reads the app resource
- **THEN** the resource SHALL carry `_meta.ui.csp.resourceDomains: ["cdn.example.com"]`
- **AND** with no domains configured the key SHALL be absent
