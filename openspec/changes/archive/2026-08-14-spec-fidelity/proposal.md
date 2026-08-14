# Spec Fidelity: Close the Cross-Verification Findings

## Why

A full cross-spec verification (all 12 capabilities against the implementation, four independent reviewers) found zero critical gaps — but it surfaced a small, well-defined pile of debt: three code behaviors that drift from their normative text, five spec passages that recent changes left stale, one structural test-infrastructure hole (type tests never run in the default gate), and a set of implemented-but-untested scenarios. Fixing all of it now, in one mechanical pass, keeps the specs trustworthy as the source of truth before the designer arc starts.

## What Changes

**Code (behavior):**
- `catalog.render` catches a throwing *registered* renderer and returns a structured `RENDER_FAILED` error — the "without throwing" contract becomes true for third-party renderers, not just built-ins.
- `.wg-img-hero` gains `width: 100%` so heroes actually span available width.
- Store validation gains an identifier rule: widget `kind` and theme `name` must match the file store's existing safe-name charset (`^[a-zA-Z0-9._-]+$`), so every adapter (memory, file, Cosmos — whose document ids embed these names) accepts and rejects identically.
- `WIDGENTIC_INLINE_IMAGES` is read per server construction (like `WIDGENTIC_ASSUME_UI`), not at module load.

**Test infrastructure:**
- Type tests (`*.test-d.ts`) join the default `npm test` gate (`typecheck.enabled: true`) — today the read-only-store-handle proof and its siblings only run when someone remembers `npm run test:types`.
- `sdk-interop.test.ts` is rewritten against the real library assembly instead of its pre-split hand-wired 3-tool server.

**Tests for implemented-but-unverified scenarios:** tools/list carries `_meta.ui.resourceUri`; app-template host-context handling; inlining disable path; oversized-entry skip at composition; `darkTheme` surface≠bg; throwing-renderer catch; hero width; CSV fewer-fields ragged row; page-format text free of Hint notes; redirect-to-private-host refusal; template network isolation; contract entry resolution via package exports; contract-suite fidelity (remove-leaves-siblings, `listKeys` in the type proof, 3-key rotation).

**Spec corrections (stale text):** contract's "package entry" → the `widgentic/contract` entry; JSON parse-position made honest ("when the engine reports one"); mcp-server's superseded "src/mcp-server SHALL remain SDK-free" sentence and the pre-split "compiled-in widgets" no-store scenario; `createFileStore(dir, options?)` signature; designer preview mechanism wording; truncated-single-node wrap carve-out; `data:image/*;base64` prose.

**Polish:** stale "GitHub federated" docblock in `apps/web/auth.ts`; `AdapterError.line` doc nuance; example stderr line lists `list_themes`.

## Capabilities

### Modified Capabilities

- `widget-contract`: type-exports entry wording
- `data-adapters`: JSON parse-position scenario made honest
- `widget-catalog`: render entry point catches throwing renderers (`RENDER_FAILED`)
- `template-widgets`: truncation carve-out in root wrapping; base64 data-URI prose
- `mcp-server`: Formal Apps declaration reframed entry-based; per-request no-store scenario aligned with the assembly default
- `widget-store`: `createFileStore` signature; identifier charset rule
- `widget-designer`: preview mechanism wording

## Impact

- Code: `src/catalog/registry.ts`, `src/theming/stylesheet.ts`, `src/store/validate.ts`, `src/mcp-server/server.ts`, `vitest.config.ts`, plus docs/comments.
- Tests: ~15 new/strengthened; one suite rewritten; type suite folded into the default gate.
- Behavior change surface: `RENDER_FAILED` is additive (the error-code set is documented as open); the identifier rule tightens what the store accepts (existing stored kinds all conform); hero width is visual-only. Ship as `v15`.
