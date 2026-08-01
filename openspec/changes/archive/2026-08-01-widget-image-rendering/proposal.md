# Widget Image Rendering

## Why

Agents constantly render entities that carry imagery — user avatars, product thumbnails, logos — but today an image URL in widget data renders as a plain text string. The template DSL can already bind `img src` safely (URL-scheme guard, escaped serialization), yet the built-in card and table renderers have no image path at all, and no `.wg-` styling exists to make an image look intentional anywhere. Image support is also a prerequisite for the upcoming registration/designer portal, where designer-authored templates will lean on imagery.

## What Changes

- **Built-in image detection**: `card` and `table` renderers detect image-URL values (safe scheme + image extension, or `data:image/*`) and render a styled `<img>` element instead of text. Detection is automatic (agent-friendly: no hint required) with a per-field hint override.
- **`hints.images` vocabulary**: per-field/column control — force a shape (`"avatar" | "thumb" | "hero"`), or `false` to suppress detection and keep the URL as text.
- **Image shape styling**: new stable classes (`wg-img`, `wg-img-avatar`, `wg-img-thumb`, `wg-img-hero`) and theme tokens (avatar size, image radius) in the base stylesheet, so images look right in both themes and can be re-skinned per deployment.
- **Shared safe-image-URL guard**: one guard used by both the catalog renderers and the template DSL; `data:image/*` becomes an allowed image source (image contexts only — `href` and other URL attributes keep the existing scheme set), so CSP-restricted Apps hosts can still show inline images.
- **Descriptor updates**: `card`/`table` descriptors document image behavior and the `hints.images` key; `dataExample`s exercise it.
- **Spec alignment**: the `mcp-server` output requirement "no scripts and no external references" is amended to "no scripts; the only external references are validated image URLs in widget content" — the app template itself stays fully reference-free.
- **Server-side image inlining**: Apps-host sandboxes block external `img-src` (verified live: basic-host CSP is `img-src 'self' data: blob:`; VS Code likewise), and `data:` is universally allowed — so on the iframe-facing surfaces (structuredContent fragment and the `ui://` page resource) the MCP server fetches image bytes at render time and replaces `http(s)` sources with `data:<type>;base64,…` URIs, behind an SSRF-hardened fetcher. Broken-glyph fallback becomes the exception (fetch failure), not the norm.

## Capabilities

### New Capabilities

_None — this lands entirely inside existing capabilities._

### Modified Capabilities

- `widget-catalog`: card/table renderers gain image detection + `hints.images`; descriptors advertise it; a safe-image-URL rule joins the render-tree safety story.
- `widget-theming`: new image tokens in the validated token registry and new `wg-img*` rules in the base stylesheet.
- `template-widgets`: the URL-attribute guard for `img src` additionally accepts `data:image/*` (all other URL attributes unchanged).
- `mcp-server`: page/app output requirement relaxed to permit validated image references inside widget content; the app template remains reference-free with no CSP domain declarations.

## Impact

- `src/catalog/widgets/card.ts`, `table.ts` — image rendering paths; `src/catalog/widgets/format.ts` or a new shared module — image-URL detection.
- `src/templates/guards.ts` — image-source guard (shared with catalog; placed so catalog does not import from templates).
- `src/catalog/descriptors.ts` — hints/docs/examples; `src/theming` — tokens + base stylesheet additions.
- `openspec/specs/{widget-catalog,widget-theming,template-widgets,mcp-server}/spec.md` via delta specs.
- Tests: catalog widget tests (detection matrix, hint overrides, unsafe URL rejection), template guard tests, theming token/stylesheet tests, MCP interop assertions on emitted page content.
- Hosts: MCP Apps hosts enforce their own iframe CSP — external images are blocked host-side (confirmed in basic-host and VS Code Copilot); the server-side inliner converts them to `data:` URIs on iframe-facing surfaces so pixels actually display, with `alt` fallback only when the fetch itself fails. Verification in basic-host is part of acceptance.
- `src/mcp-server/inline-images.ts` (new) — guarded fetch + HTML rewrite; `examples/mcp-server/server.ts` render wiring; `WIDGENTIC_INLINE_IMAGES` env switch (default on).
