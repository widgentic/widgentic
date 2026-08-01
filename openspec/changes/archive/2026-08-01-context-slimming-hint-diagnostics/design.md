# Design — Context Slimming + Hint-Coherence Diagnostics

## Context

`handleRenderWidget` is a pure sync function that always emits the same content shape per `format`; the default ("both") carries the full rendered HTML as a text block plus the widgentic payload resource. `structuredContent` separately feeds Apps-host iframes. UI capability is already detected (`getUiCapability` in `server.server.oninitialized`) but only logged. Hints are validated nowhere: unknown or unmatched hints are silently ignored by design (forward compatibility), which is correct for rendering but leaves agents with zero feedback — live testing showed agents both dropping hints and never noticing.

Transport constraint: on the stateless Streamable HTTP entry, every POST constructs a fresh server; the `tools/call` instance never saw `initialize`, so `getClientCapabilities()` is undefined there. Only stdio (and future stateful sessions) have an authoritative in-band signal.

## Goals / Non-Goals

**Goals:**
- Cut redundant model context on Apps hosts without changing any explicitly requested `format` contract.
- Give agents actionable, never-fatal feedback when hints don't line up with data or the kind's descriptor.
- Keep handlers pure and sync; keep renderers untouched.

**Non-Goals:**
- No new tool and no tool-schema changes.
- No hint auto-correction (diagnostics suggest; they never mutate the render).
- No per-request capability sniffing on stateless HTTP beyond the configured default (no `_meta` conventions invented here).
- No diagnostics for custom/template kinds beyond the generic descriptor-driven checks (per-kind deep checks cover built-ins only).

## Decisions

**D1 — Slimming applies to the default format only.** `format: "both"` (the default) becomes capability-dependent; explicit `html`/`widget`/`page`/`app` keep their exact contracts — an agent that asks for HTML gets HTML. Alternative (slim every format): rejected, it breaks the explicit-request contract and the existing test matrix.

**D2 — Slim shape.** In slim mode the default-format content is `[one-line text, widgentic payload block]`. The line names the kind and states the visual is already displayed and the data must not be restated (this sentence measurably fixed the duplicate-briefing behavior when given as prompt guidance; baking it into the result makes it standing). `structuredContent` is byte-identical between slim and full modes.

**D3 — Capability signal: session-authoritative, env-assumed, default-off.** `createWidgenticServer` records the negotiated UI capability in `oninitialized` and passes a `slim` flag into the render wiring. Where negotiation never happens (stateless HTTP `tools/call`), `WIDGENTIC_ASSUME_UI=1` opts the deployment in; unset keeps today's full output. Resolution order: explicit session signal (either direction) > env assumption > full. Alternatives: per-request `_meta` hints (non-standard, rejected); sniffing `Accept` headers (meaningless for capability, rejected).

**D4 — Analyzer lives in the catalog, independent of rendering.** `analyzeHints(kind, data, hints, descriptor)` is a new pure function in `src/catalog/hints.ts`, exported from the catalog entry. It never affects render output and renderers never call it — the MCP layer calls both and merges. Diagnostic shape: `{ hint: string, code: "UNKNOWN_HINT" | "NO_MATCH" | "INVALID_VALUE" | "UNSAFE_IMAGE_SOURCE", message: string, suggestion?: string }`. Checks: top-level hint keys not in the descriptor's advertised `hints` (with Levenshtein ≤ 2 near-miss suggestions, e.g. `colums` → `columns`); `columns`/`fieldFormat`/`images` keys that match no column/field in the actual data; `images` values outside `avatar|thumb|hero|true|false`; image-hinted values failing `isSafeImageSrc`; `expandDepth` non-number. Alternative (renderers emit diagnostics): rejected — it would change the pure `WidgetRenderer` signature across the catalog for a concern renderers don't own.

**D5 — Surfacing: model-facing text + structuredContent, not the payload block.** Diagnostics append as a compact `Hint notes: <hint>: <message>[; …]` tail on the model-facing text block (slim line included — the note is the feedback channel that actually reaches the agent) and ride as `structuredContent.diagnostics` for hosts/tooling. The widgentic payload block stays a faithful echo of what the agent sent (diagnostics are render metadata, not payload; `mcp-widget-output` is untouched). Renders stay `isError: false` — hints never fail a valid render.

**D6 — Handler API.** `handleRenderWidget(catalog, args, options?: { slim?: boolean })` — pure and sync; diagnostics computed inside the handler (it already resolves the descriptor). `server.ts` supplies `options.slim` from D3. Existing callers without options are unchanged (full mode), keeping the current test matrix intact.

## Risks / Trade-offs

- [Agents that *read* the HTML text block lose it in slim mode] → Only the default format slims, only on hosts that render visually; the payload block still carries the data; `format: "html"` remains available.
- [Stateless HTTP can't detect capability per-request] → Deployment-level `WIDGENTIC_ASSUME_UI` with default-off keeps behavior unchanged unless the operator opts in; the hosted `mcp.widgentic.dev` deployment (used by Apps hosts) sets it.
- [Hint notes add tokens] → Bounded: one line, only when diagnostics exist; net context still shrinks massively in slim mode.
- [Near-miss suggestions could mislead] → Distance ≤ 2 against descriptor-advertised keys only; phrased as "did you mean".

## Migration Plan

Additive and default-preserving: without `WIDGENTIC_ASSUME_UI` and without a negotiated UI capability, output is byte-identical to today except the optional `Hint notes:` tail and `structuredContent.diagnostics` key. Ship as `v5` after archive; set `WIDGENTIC_ASSUME_UI=1` on the Container App.

## Open Questions

_None blocking. Post-portal: revisit per-session capability once the hosted transport becomes stateful._
