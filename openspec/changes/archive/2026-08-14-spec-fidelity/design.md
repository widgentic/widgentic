# Design — Spec Fidelity

## Context

Cross-spec verification (2026-08-14, four independent review passes over all 12 capabilities) returned zero criticals and a bounded debt list. Every item is small; the value is in clearing them together so specs, code, and tests re-converge before new feature work.

## Decisions

**D1 — A throwing renderer becomes `RENDER_FAILED`, not a crash.** `catalog.render` wraps the resolved renderer call; a throw returns `{ ok: false, error: { code: "RENDER_FAILED", path: "widget", message } }` naming the kind (and the thrown message, stringified — renderer authors are developers, the message is for them). The contract's error-code set is documented as open ("a documented set including…"), so this is additive, no contract-spec change. Built-ins stay total; this guards the third-party extension point.

**D2 — One identifier charset for all adapters.** The file store already refuses names outside `^[a-zA-Z0-9._-]+$` (path-traversal guard); Cosmos ids embed `widget:<kind>` / `theme:<name>` and reject `/ \ # ?` at the service. Rather than three divergent behaviors, `checkStoredWidget`/`checkStoredTheme` enforce the file store's charset for `kind` and `name` (code `INVALID_IDENTIFIER`), making all adapters agree at the port. Every existing stored entry (built-ins, invoice, x-post, alice-report, bob-ticket, user entries observed in production) already conforms.

**D3 — Spec bends to deliberate code; code bends to normative intent.** Where the implementation choice was deliberate and better (preview via `catalog.register` for mount stability; exports-map-only package resolution; best-effort JSON parse position), the spec text is corrected. Where the spec captured real intent the code missed (`render` totality, hero spanning), the code is fixed. The two stale mcp-server passages are plain leftovers of the split — updated to the entry-based framing and the assembly default.

**D4 — Type tests join the default gate.** `vitest.config.ts` flips `typecheck.enabled: true`. Rationale: a compile-time guarantee that never runs is not a guarantee; the read-only-store-handle proof is part of the security story (change 2/3) and must be un-skippable. `npm run test:types` remains as the focused runner.

**D5 — `WIDGENTIC_INLINE_IMAGES` reads per construction.** Matches `WIDGENTIC_ASSUME_UI`'s pattern, makes the disable path testable in-process, and removes the only env var in the assembly with load-time-freeze semantics. No behavioral change for deployed processes.

**D6 — sdk-interop rewrites against the assembly.** The bespoke hand-wired server predates `createWidgenticServer` and now asserts a tool list that diverges from reality (missing `list_themes`). The rewrite keeps the suite's distinctive value — protocol round-trips including string-marshalled data — while running them against the real wiring, which also closes the "in-memory interop tests use the library assembly" scenario.

## Risks / Trade-offs

- [RENDER_FAILED reaches agents] → Only when a host registers a broken renderer; the structured error is strictly better than a transport-level crash.
- [Identifier rule rejects previously-legal exotic kinds] → No such entries exist anywhere (verified in production data); the memory store was the only permissive adapter and nothing round-trips through it persistently.
- [typecheck-in-default-gate slows `npm test`] → Measured seconds; correctness of the type story is worth it.

## Migration Plan

All additive/tightening; deploy as `v15` with the standing parameter set (domains + live secrets per the redeploy contract). Rollback = v14.

## Open Questions

_None._
