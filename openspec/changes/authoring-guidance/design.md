# Design — Authoring Guidance

## Context

The write boundary is settled and stays: sessions write, keys read (widget-store D5, widgentic-app D7). This change builds the *read-side complement* — enough machine-readable authoring knowledge that an agent's draft passes the designer's import validation on the first try.

## Decisions

**D1 — One tool, `get_authoring_guide`, no parameters.** A single structured document beats per-topic tools: the agent's job is "build a valid widget/theme", which always needs the same bundle (shapes + rules + limits + workflow). No parameters means no partial views to get wrong; the payload is a few KB of JSON, well within tool-result norms. The existing listing tools stay untouched — the guide references them ("call `list_widgets` to see what already exists") rather than duplicating their output.

**D2 — Derived, not written.** Every fact an agent could act on comes from the live source of truth at call time: reserved kinds from `createCatalog().kinds()`, limits from `DEFAULT_LIMITS`, the token registry from `TOKEN_SPECS`, the identifier pattern from the store validator's own constant (exported for this purpose), URL scheme rules from the contract's constants. Curated prose exists only where no constant exists (the DSL's node-form grammar, the workflow statement) — and the agent-simulation test pins that prose to reality: a widget and theme built strictly from the guide's grammar must pass `checkStoredWidget`/`checkStoredTheme` and designer import.

**D3 — The guide teaches the boundary, not just the format.** The payload's `workflow` section states explicitly: agents draft JSON; users import, validate, and save in the authenticated designer at widgentic.dev; there is no MCP registration path and none should be requested. This turns the security decision into agent-visible guidance instead of a silent 404 — an agent that reads the guide stops looking for a write tool.

**D4 — The widget designer previews the draft, only the draft.** The kind selector predates the theme designer, which now owns "preview any kind under a theme" (its spec already says so). Removing it deletes the non-draft render path in `preview.ts` (`previewKind` threading, `sampleFor`) rather than hiding a control — less state, one less way for the preview to not show your widget. The theme-panel spec text loses the selector; the theme designer spec is untouched.

**D5 — Token reference is a listing, not an editor.** The compact panel shows the *effective* preview tokens — selected theme entry merged over defaults — as name, value, and a swatch for `color`-typed tokens (type read from `TOKEN_SPECS`, never inferred). Clicking nothing, editing nothing: token editing stays in the theme designer (preview-theme requirement's existing rule). Its job is purely to make `var(--wg-…)` writable from sight while authoring styles.

## Risks / Trade-offs

- [Guide prose drifts from validators] → the agent-simulation test compiles/validates artifacts built from the guide's own grammar strings; drift breaks the build.
- [Removing the kind selector surprises an existing user] → the theme designer offers the same capability in its proper home; TESTING.md notes the move.
- [Guide payload grows over time] → sections are versioned by shape, not prose promises; still one tool call.

## Migration Plan

Additive on the MCP side (new tool; existing tools byte-identical). Designer change is UI-only; export shapes untouched. Ship as `v16`.

## Open Questions

_None._
