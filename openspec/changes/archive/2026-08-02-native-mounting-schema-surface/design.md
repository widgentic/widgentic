# Design — Native Tree Mounting + Schema Patterns + Surface Token

## Context

The render pipeline is `payload → WidgetNode tree → renderToHtml() string`. The tree is deliberately plain JSON (`node.ts`: "no DOM or framework types"), and `src/reactive` already implements build-and-patch over it (`buildDom`, `patchNode`) for programmatic hosts. The app template, however, receives only the serialized string and injects it. Meanwhile `structuredContent` already ships `{ html, css, payload }` (+ optional `diagnostics`) to the iframe, the image inliner rewrites `img src` in the HTML surfaces, the schema subset stops at `type/properties/required/items/enum`, and `bg` styles both page and widget surfaces.

## Goals / Non-Goals

**Goals:**
- DOM-from-data mounting in the app template with identity-preserving updates; HTML string kept as fallback.
- `pattern` for string validation without opening a ReDoS door.
- Page/surface color separation with perfect back-compat for existing themes.

**Non-Goals:**
- No interactivity in widgets yet (native mounting is the prerequisite, not the feature).
- No bundler; the template stays a hand-rolled inline bridge.
- No other schema keywords (`minLength`/`format`/`patternProperties` wait for real demand).
- No visual redesign — `surface` defaults preserve the current light/dark look.

## Decisions

**D1 — Ship the tree, not a bundle.** `structuredContent.tree = rendered.node` (the exact `WidgetNode` the HTML came from — one render, two projections). The template gains a compact inline mounter (~40 lines): `build(node)` via `createElement`/`setAttribute`/`createTextNode`, `patch(prev, next, dom)` mirroring `src/reactive/diff.ts` semantics — same-shape nodes patch attributes/children in place, shape changes rebuild the subtree. Successive `tool-result`s patch instead of replacing, preserving DOM identity (scroll, selection, future widget state). `html` remains authoritative fallback when `tree` is absent (older servers, defensive hosts). Alternative — importing `src/reactive` into the template: rejected; the template has no build step, and inlining the module's source verbatim would drag its imports along. Drift risk between the two implementations is real and handled with a parity test: render a payload, mount the tree in the template's mounter (happy-dom), assert `container.innerHTML` equals `renderToHtml(tree)` output for a scenario matrix.

**D2 — Attribute safety in the mounter.** The tree arrives from the server but the mounter still applies the serializer's discipline: tag names and attribute names validated against the same `TAG_NAME`/`ATTR_NAME` patterns, `on*` attributes skipped, values set via `setAttribute` (never innerHTML). This keeps the iframe safe even against a tampered `tree`.

**D3 — Inliner walks the tree too.** `inlineRenderResultImages` collects `img` sources from BOTH the HTML surfaces and `structuredContent.tree` (walking element nodes for `tag === "img"`), fetches each unique URL once, and rewrites both projections from the same resolved map — tree and html can never disagree about an image.

**D4 — `pattern`, bounded.** String data + string `pattern` → test with guards: pattern length ≤ 256; tested string capped at 10 000 chars (longer strings validate only their prefix — documented); reject patterns matching the nested-quantifier heuristic `/(\([^)]*[+*][^)]*\)|\[[^\]]*\][+*])[+*{]/` or failing `new RegExp` — rejected/invalid patterns are IGNORED (the subset's standing "unknown/unusable ⇒ never misinterpret" policy), not errors. Violations report `INVALID_TYPE` with the dotted path and a message naming the pattern. Non-string data is untouched by `pattern` (type mismatches are `type`'s job). Alternative — RE2-style engine: a runtime dependency, rejected (zero-dep charter).

**D5 — `surface` via nested var fallback.** Token `surface` (light default `#ffffff`) joins the registry; the stylesheet emits `background: var(--wg-surface, var(--wg-bg, #ffffff))` for `.wg-card`/`.wg-table`/`.wg-custom`. Themes that set only `bg` behave exactly as today (surface inherits it); themes may now lift surfaces separately. `darkTheme` gains `surface: "#161b26"` (a step above its `bg: "#0f131c"`). The registry-reference test keeps passing: both vars in the chain are registry tokens with fallbacks.

## Risks / Trade-offs

- [Mounter/serializer drift] → D1 parity test renders the same trees through both paths on every `npm test`.
- [Tree doubles structuredContent size] → Trees are compact JSON (no styling); payload block and html already dominate. Accepted; measured in tests only informally.
- [Pattern prefix-capping surprises on >10k strings] → Documented in the descriptor guidance; widget data of that size has bigger problems.
- [Hosts caching the old template] → Template is fetched per session; basic-host re-fetches on connect. No versioning needed yet.

## Migration Plan

Additive: `tree` is a new optional key (hosts ignore unknown keys); the template's html path remains; schemas without `pattern` and themes without `surface` are untouched. Ship as `v6`.

## Open Questions

_None blocking._
