# Tasks — Widget Image Rendering

## 1. Shared URL guard (contract layer)

- [x] 1.1 Create `src/contract/urls.ts`: move `ALLOWED_SCHEMES`/`isSafeUrl` semantics from `src/templates/guards.ts`; add `isSafeImageSrc` (safe http(s) or `data:image/*;base64,` form) and `looksLikeImageUrl` (isSafeImageSrc + `data:image/*` or pathname extension `.png|.jpg|.jpeg|.gif|.webp|.avif|.svg`, query tolerated); export from `widgentic/contract`
- [x] 1.2 Re-export the moved/new guards from `src/templates/guards.ts` so its public surface is unchanged; keep `FORBIDDEN_ATTR`, `URL_ATTRS`, `MAX_TEMPLATE_DEPTH` in place
- [x] 1.3 Unit tests for the guard matrix: schemes, `data:image` vs `data:text`, obfuscated schemes (`java\nscript:`), extension detection with/without query strings, extensionless URLs

## 2. Template DSL image-context exception

- [x] 2.1 In `src/templates/compile.ts`, switch the URL check for `img[src]` specifically to `isSafeImageSrc`; all other `URL_ATTRS` keep `isSafeUrl`
- [x] 2.2 Tests: `data:image/*` kept on `img src`, dropped on `a href`; existing safety scenarios still pass

## 3. Catalog image rendering

- [x] 3.1 Add image resolution helper (field key + value + `hints.images` + context default → `{ src, shape } | null`) honoring precedence: `false` suppresses, shape/`true` forces (safety still required), else auto-detect; place alongside `format.ts`
- [x] 3.2 `card.ts`: render image field values as `img.wg-img.wg-img-<shape>` (default `thumb`) with `alt` = field key, `loading="lazy"`, `decoding="async"`; image treatment wins over `fieldFormat` for the same key
- [x] 3.3 `table.ts`: same for cells with column-key hints (default `avatar`)
- [x] 3.4 Descriptors: document image auto-detection and `hints.images` on `card` and `table` (hints text + `dataShape` note); extend a `dataExample` with an avatar URL
- [x] 3.5 Tests: the six delta-spec scenarios (auto-detect in table, thumb default in card, hint-forced hero on extensionless URL, `false` suppression, unsafe rejection under hint, data-URI render) plus fieldFormat-precedence case

## 4. Theming tokens and base stylesheet

- [x] 4.1 Add `avatar-size` (`32px`) and `thumb-size` (`48px`) to `THEME_TOKENS`/defaults in `src/theming/tokens.ts`
- [x] 4.2 Base stylesheet: `.wg-img` (object-fit cover, vertical alignment, subtle background while loading), `.wg-img-avatar` (token-sized circle), `.wg-img-thumb` (token-sized rounded rect via `radius`), `.wg-img-hero` (block, `max-width: 100%`, radius) — all sizing via `var(--wg-*, fallback)`
- [x] 4.3 Tests: token registry contents, stylesheet class coverage, registry-only `var()` references still hold, avatar-size override flows through `applyTheme`

## 5. MCP server surface

- [x] 5.1 Interop/page tests: `format: "app"`/`"page"` output containing an image field emits the `img` element, still zero `script` elements and no other external reference kinds
- [x] 5.2 Confirm `list_widgets` descriptor output surfaces the new hints text (existing serialization — verify only)

## 6. Verification and docs

- [x] 6.1 Full `npm test` + typecheck green
- [x] 6.2 Live check in basic-host and/or Copilot against a table-with-avatars and card-with-hero payload; record whether external images render or are CSP-blocked (alt fallback) in TESTING.md verified-hosts notes
- [x] 6.3 Update README capability table blurbs if wording mentions text-only rendering

## 7. Server-side image inlining (CSP finding follow-up)

- [x] 7.1 `src/mcp-server/inline-images.ts`: SSRF-guarded fetcher (https-only, DNS private-range rejection re-checked per redirect hop ≤3, content-type `image/*`, 1 MiB cap, ~4 s timeout, ≤8 images/render, per-call dedup + small TTL cache) and `inlineImagesInHtml(html, fetchImage)` rewriting `img src` on widgentic-serialized markup
- [x] 7.2 Wire into the render path for iframe-facing surfaces only (structuredContent fragment + `ui://` resource text); model-facing HTML block and `format: "page"` keep URLs; `WIDGENTIC_INLINE_IMAGES=0` disables
- [x] 7.3 Tests: local-http fixture image inlined; 127.0.0.1/metadata-IP refused; non-image content-type and oversize left as URL; per-render dedup; disabled flag leaves URLs; failure keeps render successful
- [x] 7.4 Deploy v4; re-run basic-host payload #1/#2 expecting visible pixels; update TESTING.md image-rendering note
