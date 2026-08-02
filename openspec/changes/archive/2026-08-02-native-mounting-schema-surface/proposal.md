# Native Tree Mounting + Schema Patterns + Surface Token

## Why

Three remaining backlog items, deliberately bundled as the polish pass before the designer and pre-production hardening cycles. The app template still renders widgets by injecting a serialized HTML string — the render tree it came from is pure JSON and could be mounted natively (DOM built from data, patched in place across results), eliminating the template's last string-injection surface and laying the groundwork for interactive widgets. Descriptor data schemas can't express string shapes (`pattern`), so kinds like `invoice` can't validate ids or currency codes. And themes can't separate the page background from widget surfaces — dark themes especially want a card surface a shade off the page (`bg` does double duty today).

## What Changes

- **Native tree mounting**: `structuredContent` gains `tree` — the render tree (`WidgetNode`, JSON-serializable by design). The app template mounts it natively with a compact inline builder/patcher: first result builds DOM via `createElement`/`createTextNode` (no HTML parsing), subsequent `tool-result`s patch in place preserving node identity. `structuredContent.html` remains and is the fallback when `tree` is absent.
- **Image inlining covers the tree**: the server-side inliner rewrites `img` sources inside `structuredContent.tree` with the same fetched data URIs it applies to the HTML surfaces.
- **Bounded `pattern` in data schemas**: the JSON-Schema subset gains `pattern` for strings, guarded against ReDoS: pattern length cap, tested-string length cap, rejection of nested-quantifier constructs, and invalid/unsafe patterns ignored (consistent with the subset's "never misinterpret" policy).
- **`surface` theme token**: new registry token for widget surfaces; the base stylesheet moves `.wg-card`/`.wg-table`/`.wg-custom` backgrounds to `var(--wg-surface, var(--wg-bg, …))` so themes without `surface` keep exactly today's look; `darkTheme` gains a surface value a step off its `bg`.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `mcp-server`: `structuredContent` carries `tree`; the app template mounts natively with in-place patching (html fallback retained); image inlining extends to the tree.
- `widget-catalog`: data-schema subset gains bounded `pattern`.
- `widget-theming`: `surface` token in the registry, base-stylesheet surface fallback chain, `darkTheme` surface value.

## Impact

- `src/mcp-server/handlers.ts` (tree in structuredContent), `src/mcp-server/inline-images.ts` (tree walker), `examples/mcp-server/app-template.ts` (inline mounter/patcher).
- `src/catalog/schema.ts` (+ pattern guard), `src/theming/tokens.ts`/`stylesheet.ts`/`apply.ts`.
- Tests: tree presence/parity with html, template mount/patch behavior (DOM tests), inliner tree coverage, pattern matrix incl. ReDoS guards, surface fallback chain.
- `src/reactive` is intentionally not imported by the template (no build step); the inline mounter mirrors its build/patch contract — drift guarded by a parity test rendering the same tree both ways.
