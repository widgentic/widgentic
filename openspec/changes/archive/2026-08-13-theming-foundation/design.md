# Design — Theming Foundation

## Context

Themes today are `Partial<Record<ThemeToken, string>>` — a flat map of 13 registry tokens, validated by `validateTheme`, applied as inline `--wg-*` custom properties or serialized by `themeToCss`. They are anonymous: nothing carries a name, so nothing can *reference* one. The MCP server takes only inline maps; the designer edits a single draft theme; the base stylesheet exposes no status colors or scale steps, so real widgets improvise (`x-post` derived its avatar size with `calc(var(--wg-avatar-size) * 1.5)` and hard-coded nothing else only because it stuck to existing tokens).

This change is the first of four planned for the widgentic.dev arc. The sequencing rationale — recorded here because it shapes what this change must not do:

| # | Change | Depends on | Why here |
|--|--|--|--|
| **1** | **Theming foundation (this)** | — | Pure library work, no infra decisions. Defines the theme *entity* the app will persist and the registry the designers consume. |
| 2 | Per-user catalog & wire registration | 1 | The security-sensitive bridge: the MCP server resolving a caller's widgets **and themes** from a store instead of a hard-coded array. Needs its own security review; blocking the app on it early keeps auth honest. |
| 3 | widgentic.dev app | 1, 2 | Accounts, API-key issuance, persistence, hosting both designers. Only change that needs hosting/DB/auth decisions. |
| 4 | Static site (docs/examples) | — | Independent; can run in parallel or fold into 3's shell. Zero functional risk, so it never blocks the pipeline. |

## Goals / Non-Goals

**Goals:**
- A theme becomes a nameable, describable, registrable entity — the shape the app will store.
- Enough standard tokens that a designed widget rarely needs raw colors, plus a sanctioned escape hatch when it does.
- Agents can request a theme by name.
- Theme editing is its own embeddable; the widget designer consumes themes rather than authoring them.

**Non-Goals:**
- No persistence, accounts, or per-user resolution (changes 2–3).
- No theme *inheritance at runtime* — `extends` merges once at registration; no live cascade.
- No visual/branding redesign: new tokens keep today's look via defaults.
- No CSS-wide value grammar: the existing safety guard stays exactly as strict.

## Decisions

**D1 — Token additions are earned, not aspirational.** Each new token must be consumed by `baseStylesheet` or answer a gap a shipped example hit: status colors (`danger`/`success`/`warning`/`info`) for badges and status columns; `accent-fg` for text on an accent fill (unreadable today); `font-mono` for code/pre content (`wg-custom` hard-codes a mono stack); `line-height` for density; `radius-sm|lg`, `spacing-sm|lg`, `font-size-sm|lg`, `border-width` so widgets scale without `calc()` gymnastics. Alternative — a full design-system scale (9 greys, 5 steps per axis) — rejected: unbounded registry growth for a library whose promise is "tokens are the only theming surface".

**D2 — Custom variables are flat, prefixed, and validated like tokens.** Keys matching `/^x-[a-z0-9][a-z0-9-]*$/` are accepted and emitted as `--wg-x-<name>`; every other unknown key still fails `UNKNOWN_TOKEN`; values run the existing `isSafeTokenValue` guard. Flat-with-prefix (rather than a nested `custom: {}` object) keeps `WidgetTheme` JSON-shaped exactly as today, so existing themes, exports, and the `theme` tool input need no migration. `applyTheme`/`themeToCss` emit them alongside registry tokens.

**D3 — Theme registry mirrors the widget catalog.** `createThemeRegistry()` → `{ register(entry), get(name), list(), names() }` with entries `{ name, label?, description?, tokens }`, duplicate names throwing `DuplicateThemeError` (same ergonomics as `DuplicateKindError`). `extends: <name>` is resolved **at registration** into a flat merged token map — no cycles possible, no runtime resolution, and what you store is what renders. Built-ins `light` (empty map = defaults) and `dark` (today's `darkTheme`) ship registered.

**D4 — `theme` accepts a name or a map, resolved server-side.** In `handleRenderWidget`, a string `theme` resolves through the registry (unknown name → `UNKNOWN_THEME` in the existing structured-error vocabulary, listing available names — same self-sufficient recovery as `UNKNOWN_KIND`); an object keeps today's `validateTheme` path. A new `list_themes` tool returns `{ name, label?, description?, tokens }` per entry so agents can discover them. `list_theme_tokens` stays (it documents the token vocabulary) and gains the custom-variable rule.

**D5 — Theme designer is a sibling factory, not a fork.** `createThemeDesigner(container, options)` returns `{ getTheme(), loadTheme(entry), subscribe(), dispose() }` and reuses the existing preview controller and store discipline; `defineThemeDesignerElement()` registers `<widgentic-theme-designer>`. The widget designer's Theme panel becomes a **selector** over `options.themes` (plus "None") that sets the preview theme — it no longer edits tokens, which removes the awkward overlap where a widget draft carried a whole theme. The widget draft keeps `theme` as the *preview selection* (a name), and export continues to emit only `{ kind, template, descriptor }`. Alternative — one designer with a mode toggle (today's shape) — rejected: the app needs to route to "design a theme" and "design a widget" as separate destinations, and hosts embedding only one shouldn't ship the other.

## Risks / Trade-offs

- [Registry growth sets precedent] → D1's earned-token rule is the standing gate; anything speculative goes to `x-*` custom variables instead.
- [Widget draft no longer owns a theme] → The draft's `theme` narrows to a preview-selection name; export was already theme-free, so no artifact changes. Migration for in-flight localStorage drafts: unknown/legacy object themes are ignored on load rather than erroring.
- [`extends` merged eagerly hides provenance] → Entries keep the `extends` name for display, but the stored tokens are flat; the app can re-derive on edit.
- [Two designers double the demo surface] → The demo host gains a tab; both share the preview controller and chrome, so the marginal weight is small.

## Migration Plan

Additive throughout: new tokens have defaults, `x-*` keys were previously invalid, the registry is new, `theme`-as-string is a widened input, and `list_themes` is a new tool. Ship as `v8` alongside the existing catalog. The only behavioral narrowing is inside the designer (theme editing moves out of the widget designer), which is pre-1.0 UI with no persisted consumers yet.

## Open Questions

_None blocking. Deferred to change 2: how per-user registries are keyed and loaded (this change deliberately leaves the registry an in-memory object the server owns)._
