# MCP Server — built-in meta, formats, and links delta

## MODIFIED Requirements

### Requirement: Server-side image inlining for iframe surfaces
Because Apps-host sandboxes block external `img-src` while permitting `data:`, the runnable server SHALL, when inlining is enabled (the default; `WIDGENTIC_INLINE_IMAGES=0` disables), rewrite `img` sources on the iframe-facing surfaces of a `render_widget` result — the `structuredContent` HTML fragment, the `structuredContent.tree` render tree (element nodes with `tag: "img"`), and the `ui://widgentic/page/<kind>` embedded resource — replacing each `http(s)` source whose fetch succeeds with a `data:<content-type>;base64,` URI; the tree and HTML projections SHALL be rewritten from the same fetch results and never disagree. The model-facing HTML text block and `format: "page"` output SHALL keep original URLs. Each unique URL SHALL be fetched at most once per render. The fetch SHALL be guarded: `https` scheme only; hostnames resolving to loopback, private (RFC1918), link-local (including 169.254.169.254), carrier-grade NAT, or IPv6 unique-local/link-local addresses SHALL be rejected, re-validated on every redirect hop (at most 3); the response `Content-Type` MUST be `image/*`; per-image size SHALL be capped (1 MiB) and the fetch SHALL time out (~4 s); at most 24 images SHALL be inlined per render, the first N unique fetchable sources in document order. Any failure SHALL leave the original URL in place (alt-text fallback) without failing the render.

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

#### Scenario: Non-image and oversized responses are not inlined
- **WHEN** the fetched response has a non-`image/*` content type, or exceeds the size cap
- **THEN** the original URL SHALL remain and the render SHALL still succeed

#### Scenario: Inlining can be disabled
- **WHEN** `WIDGENTIC_INLINE_IMAGES=0` is set
- **THEN** all surfaces SHALL keep original image URLs

#### Scenario: Overflow beyond the cap is deterministic
- **WHEN** a render carries more unique fetchable image sources than the cap
- **THEN** the first 24 in document order SHALL be inlined and the rest SHALL keep their original URLs (alt-text fallback in sandboxed frames)
