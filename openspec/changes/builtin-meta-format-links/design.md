# Design — built-in meta chrome, table formats, and links

## D1. Meta chrome uses each widget's native shape

The table gets a semantic `<caption class="wg-table-caption">` holding `wg-table-title` and `wg-table-subtitle` spans — HTML's own table-title element, free accessibility, styled from existing tokens (accent + muted, mirroring the card's chrome). The tree gets a `wg-tree-title` line above the roots (`meta.subtitle` deliberately unused there — a tree has no natural subtitle slot; add later if live testing asks). The card keeps its data-over-meta precedence untouched. Unlike the card there is no precedence question for table/tree: their data has no title slot, so meta is the only source and absence simply means no chrome.

## D2. Table `fieldFormat` is the card hint verbatim, keyed by column

Same hint name, same `{value}` semantics, same escaping, same image-wins-on-same-key rule — an agent who learned the hint on card applies it to table unchanged, and the typed-value guidance ("send 9.99, format for display") finally holds across both kinds. The formatter helper moves from `card.ts` into the shared `format.ts` so both renderers use one implementation. The analyzer's existing `fieldFormat` branch becomes kind-aware: `tableColumns(data)` (already implemented for `columns` checks) is the universe for tables, `cardFields(data)` otherwise.

## D3. Links are opt-in, guard-checked in the renderer, never auto-detected

`hints.links: Record<key, boolean>` on card fields and table cells. `true` renders an anchor only when the value is a string whose scheme passes `ALLOWED_SCHEMES` (http, https, mailto, tel — unchanged since v30); everything else stays text. No auto-linking: URL-shaped strings render today as text, and silently converting them would change existing renders behind users' backs (the same reasoning that made image treatment auto-detect but link treatment did not exist to grandfather). The renderer does its own guard check — built-ins construct nodes directly and never pass through the template compiler's URL guard, exactly like `isSafeImageSrc` in the image path. Anchor text is the formatted value (`fieldFormat` composes); `href` is the raw value; `rel="noopener noreferrer"` for the page format, where anchors actually navigate (inside the app frame the v29 capture-phase interceptor preventDefaults and forwards via `ui/open-link`, so no template change is needed).

Precedence per key: image > link > fieldFormat-text. A key can carry both `links: true` and a `fieldFormat` pattern (link wraps formatted text); it cannot be image and link at once — image wins, consistent with image-over-fieldFormat.

## D4. One new diagnostic code, and the analyzer requirement catches up

`UNSAFE_LINK_TARGET` mirrors `UNSAFE_IMAGE_SOURCE`: a `true` link hint aimed at a value that is not a linkable string is a coherence problem worth telling the agent about, distinct from a key that matches nothing. While the requirement is open: the group vocabularies shipped in v32 (layout/gap presets, numeric clamped columns, columns-needs-grid) were implemented in `analyzeHints` but never written into the requirement text — this delta formalizes them, closing the drift found in review.

## D5. No designer, guide, or wire surface

These are renderer/hint behaviors of built-in kinds. Agents discover them where they discover every hint: the descriptors in `list_widgets` (the card/table `hints` docs grow `links`, table grows `fieldFormat`, and the descriptions mention the meta chrome). `get_authoring_guide` stays authoring-focused; the tool schema and formats are untouched.

## Risks

- **Caption vs. host styling**: some hosts style `<caption>` oddly; the base stylesheet sets explicit alignment/spacing so it renders predictably inside the frame. Verify visually on the rig.
- **Link clicks on non-Apps surfaces**: `format: "page"` anchors navigate a real browser tab — `rel="noopener noreferrer"` covers the opener leak; scheme guard covers the rest.
- **Descriptor prose growth**: the card/table `dataShape`/`hints` strings are already long; keep the new lines recipe-shaped (the v30 lesson: recipes in the tool docs are what agents actually follow).
