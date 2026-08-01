# Design — Widget Image Rendering

## Context

Widget data frequently carries image URLs (avatars, product thumbnails, logos), but the pipeline treats every value as text. The pieces that already exist: the render tree serializes void `img` elements with escaped attributes; the template DSL guards URL-bearing attributes (`URL_ATTRS` + `isSafeUrl` in `src/templates/guards.ts`) so a designer template can bind `img src` today. What's missing is (1) image awareness in the built-in `card`/`table` renderers, (2) any `.wg-` styling for images, (3) an agent-facing hints vocabulary, and (4) spec alignment — the `mcp-server` spec currently forbids all external references in emitted pages.

Layering constraint: `templates` imports from `catalog` (types), so `catalog` cannot import from `templates` — a shared guard needs a home below both.

## Goals / Non-Goals

**Goals:**
- Image URLs in card fields and table cells render as styled `<img>` tags with zero agent effort (auto-detection), with per-field hint control.
- One safe-image-source rule shared by catalog renderers and the template DSL.
- Images look intentional in both themes via tokens + base stylesheet; re-skinnable per deployment.
- `data:image/*` works as an image source so CSP-restricted Apps hosts still show something.

**Non-Goals:**
- No image resizing, transcoding, or upload — bytes are inlined as fetched.
- No tree/custom-kind image support in this change (tree labels stay text; `custom` stays a JSON pretty-printer).
- No `srcset`/responsive variants, no lightbox/zoom interactions.
- No per-deployment CSP `resourceDomains` configuration on the app resource. Researched and rejected for now: it requires enumerable origins (widgentic renders arbitrary agent-supplied URLs) and host support is inconsistent (VS Code does not fully honor it — microsoft/vscode#286689; claude.ai reportedly hardcodes its frame CSP — anthropics/claude-ai-mcp#40). Revisit when the portal constrains image origins.

## Decisions

**D1 — Guard placement: new `src/contract/urls.ts`.** URL safety primitives (`ALLOWED_SCHEMES`, `isSafeUrl`, plus new `isSafeImageSrc`, `looksLikeImageUrl`) move to the contract layer — the zero-dependency base both `catalog` and `templates` already sit on. `templates/guards.ts` re-exports them so its public surface and the "one module prevents drift" property are preserved. Alternative considered: catalog importing from `templates/guards` — rejected (inverts layering, courts an import cycle).

**D2 — Detection: automatic with hint override.** A string value is treated as an image when `isSafeImageSrc` passes AND (`data:image/*`, or an http(s) URL whose pathname ends in `.png|.jpg|.jpeg|.gif|.webp|.avif|.svg`). Query strings are tolerated (pathname is checked via `URL` parsing). Extensionless image URLs (e.g. Unsplash) do not auto-detect — the hint forces them. Alternative considered: hint-only (no auto-detection) — rejected as agent-hostile; the whole point is that an agent piping API data through gets avatars for free. SVG-as-`img` is safe: browsers do not execute scripts in SVG loaded through `<img>`.

**D3 — Hint vocabulary: `hints.images: Record<string, "avatar" | "thumb" | "hero" | true | false>`.** Keys are card field names / table column names. A shape string forces image treatment with that shape (value must still pass `isSafeImageSrc` — hints never bypass safety); `true` forces the context default; `false` suppresses detection (URL renders as text). Defaults: table cells → `avatar`, card fields → `thumb`. This mirrors the existing `hints.fieldFormat` per-field pattern agents already know. Alternative considered: extending `fieldFormat` with object values — rejected (its values are string patterns; overloading the type complicates every consumer).

**D4 — Markup shape.** `el("img", { class: "wg-img wg-img-<shape>", src, alt: <field/column key>, loading: "lazy", decoding: "async" })`. Alt text from the key keeps broken/blocked images legible (the graceful-degradation path in CSP-restricted hosts). No `onerror` (event attributes are forbidden project-wide).

**D5 — Styling: two new tokens + shape classes in the base stylesheet.** Tokens `avatarSize` (default `32px`) and `thumbSize` (default `48px`) join the validated registry; radii reuse the existing `radius` token. Base stylesheet: `.wg-img` (vertical-align, object-fit cover, background fallback), `.wg-img-avatar` (round, `--wg-avatar-size` box), `.wg-img-thumb` (rounded rect, `--wg-thumb-size` box), `.wg-img-hero` (block, `max-width: 100%`, auto height, radius). All sizing via tokens so themes/deployments can re-scale.

**D6 — `data:image/*` in image contexts only.** `isSafeImageSrc` accepts `data:image/<subtype>;base64,…` in addition to safe http(s). The template interpreter switches its check for `img[src]` specifically to `isSafeImageSrc`; every other URL attribute (`href`, `action`, …) keeps the existing scheme set — `data:` remains blocked there (data-URI navigation is an XSS vector; data-URI images are not). No length cap on data URIs: payload size is already bounded by transport/model context.

**D7 — Spec wording for `mcp-server`.** "No scripts and no external references" becomes "no scripts; the only external references are validated image sources inside widget content". The app template requirement is untouched — the template itself stays reference-free and declares no CSP domains.

**D8 — Server-side image inlining on iframe-facing surfaces.** Live testing confirmed Apps-host sandboxes block external `img-src` (basic-host: `img-src 'self' data: blob:`; Copilot behaves the same) while `data:` is universally allowed — and the ecosystem guidance (Microsoft Cowork MCP-apps guide) is to ship self-contained widgets with assets as `data:` URLs. So the MCP server inlines image bytes at render time: after `handleRenderWidget`, an async pass collects `img src` URLs from the emitted markup, fetches each once (per-call dedup + small TTL cache), and rewrites `src` to `data:<content-type>;base64,…`. Scope rule — inline exactly where a sandboxed iframe renders: the `structuredContent.html` fragment (app-template path) and the `ui://widgentic/page/<kind>` embedded resource. The model-facing HTML text block keeps original URLs (models don't render pixels; base64 would bloat context), and `format: "page"` keeps URLs too (it opens in a real browser where external images load normally). A fetch failure leaves the original URL — the alt-text fallback remains the safety net. Enabled by default; `WIDGENTIC_INLINE_IMAGES=0` disables. Alternatives considered: `resourceDomains` (rejected, see Non-Goals); client-side fetch from the app template (rejected — the iframe's `connect-src` is equally blocked and the template must stay script-minimal).

**D9 — SSRF guard on the inliner fetch.** The hosted server fetching agent-supplied URLs is an SSRF vector, so the fetcher enforces: `https` only; DNS resolution checked before each hop with private/reserved ranges rejected (loopback, RFC1918, link-local incl. 169.254.169.254 metadata, CGNAT, ULA/IPv6 link-local); redirects followed manually (max 3) re-validating each hop; response `Content-Type` must be `image/*`; per-image byte cap (1 MiB, streamed with abort); ~4 s timeout; at most 8 images per render. DNS-rebinding TOCTOU is acknowledged as residual (Node fetch cannot pin the resolved address without a custom agent) and accepted at this stage; noted for the portal-era hardening pass.

## Risks / Trade-offs

- [Apps-host CSP blocks external images] → Mitigated by D8 inlining; residual only when the inline fetch fails (alt-text fallback, recorded in TESTING.md).
- [Inlining adds render latency and payload weight] → Bounded by D9 caps (8 images × 1 MiB × 4 s, parallel fetches); iframe-only scope keeps model context clean; TTL cache absorbs repeat renders.
- [SSRF via agent-supplied URLs] → D9 guard profile; residual DNS-rebinding risk accepted and documented.
- [Auto-detection false positive: a URL the agent wanted as literal text] → `hints.images: { field: false }` opts out; considered rare enough not to gate detection on a hint.
- [Auto-detection false negative: extensionless image URLs] → Hint forces treatment; descriptors document this explicitly so agents know the escape hatch.
- [Untrusted `src` values on the hosted server] → Same trust model as all widget data: scheme-validated, attribute-escaped, never executed. Images can still track viewers via request logs (any remote image can); noted as inherent to remote imagery, mitigated only by host CSP.
- [Token registry growth] → Two tokens with px defaults; validated like all others.

## Migration Plan

Additive, no breaking changes: payloads without image URLs render exactly as before; `hints.images` is a new optional key; new tokens have defaults so existing themes keep validating. Ship as a normal server rebuild (`v3`) after archive.

## Open Questions

_None blocking. Post-portal follow-up: per-deployment `resourceDomains` config once image origins are known._
