# Tasks — Built-in meta chrome, table formats, and links

## 1. Renderers

- [x] 1.1 Shared helpers in `format.ts`: move `applyPattern` from card; add a guarded `linkOrText(key, value, hints, formatted)` used by card and table (scheme allowlist check in the renderer, `rel="noopener noreferrer"`)
- [x] 1.2 `table.ts`: `<caption class="wg-table-caption">` with title/subtitle spans from meta; `fieldFormat` by column; `links` by column; precedence image > link > formatted text
- [x] 1.3 `card.ts`: `links` on field values with the same precedence; existing fieldFormat path reuses the shared helper
- [x] 1.4 `tree.ts`: `wg-tree-title` line from `meta.title`
- [x] 1.5 Base stylesheet: `wg-table-caption`/`wg-table-title`/`wg-table-subtitle`/`wg-tree-title`/`wg-link` rules from existing tokens

## 2. Hints, descriptors

- [x] 2.1 `hints.ts`: `links` branch (NO_MATCH / INVALID_VALUE / new `UNSAFE_LINK_TARGET`); `fieldFormat` universe switches to `tableColumns` for `kind: "table"`
- [x] 2.2 `descriptors.ts`: table gains `fieldFormat` + `links` hint docs and caption mention; card gains `links`; tree description mentions the title line

## 3. Tests

- [x] 3.1 Renderer tests: caption present/absent, tree title, table fieldFormat (typed payload preserved through render_widget), card+table anchors for all four schemes, unsafe/non-string targets stay text, image-over-link precedence, link wraps formatted text
- [x] 3.2 Analyzer tests: table-aware fieldFormat NO_MATCH, links three-way (INVALID_VALUE / NO_MATCH / UNSAFE_LINK_TARGET), group vocabulary scenarios pinned against the requirement
- [x] 3.3 Safety: serialized anchors carry escaped hrefs; `javascript:`/`data:` never appear in an `href`

## 4. Verify and ship

- [x] 4.1 Full gate; strict validation
- [x] 4.2 Rig: table with caption + currency fieldFormat + linked website/mailto columns through mcp:http; click a link inside the basic-host frame (ui/open-link path); group of two tables with captions
- [x] 4.3 Deploy v33 per the redeploy contract; verify live; README table/card bullets if touched
- [x] 4.4 Commit, push, memory update

## 5. Prefix links (live finding: clean display text for email/phone columns)

- [x] 5.1 Delta: `links` values become `boolean | string` — a string is an author prefix composed with the raw value into the href; display stays the formatted value; composed href faces the guard; empty/non-string values never link
- [x] 5.2 `format.ts` `linkOrText`: prefix form; `hints.ts`: string link values validated on the composed href; descriptors: recipe docs (`{ email: 'mailto:', phone: 'tel:' }`)
- [x] 5.3 Tests: clean display + composed href for mailto/tel, empty value no-link, hostile compose refused, analyzer prefix scenarios
- [x] 5.4 Gate; deploy v34; verify live; commit, push, memory
