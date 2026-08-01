# Tasks — Context Slimming + Hint-Coherence Diagnostics

## 1. Hint-coherence analyzer (catalog)

- [x] 1.1 `src/catalog/hints.ts`: diagnostic types (`HintDiagnostic { hint, code, message, suggestion? }`, codes `UNKNOWN_HINT | NO_MATCH | INVALID_VALUE | UNSAFE_IMAGE_SOURCE`) and `analyzeHints(kind, data, hints, descriptor)` — total, pure, no rendering side effects
- [x] 1.2 Checks: unknown top-level keys vs descriptor `hints` with Levenshtein ≤ 2 suggestions; `columns`/`fieldFormat`/`images` keys vs actual columns/fields; `images` value domain; `isSafeImageSrc` on image-hinted values; `expandDepth` type
- [x] 1.3 Export from the catalog entry; unit tests for the five delta scenarios plus a garbage-input totality case

## 2. Handler integration (mcp-server)

- [x] 2.1 `handleRenderWidget(catalog, args, options?: { slim?: boolean })`: slim default-format content = one-line confirmation (kind + "visual already displayed, do not restate the data") + payload block; explicit formats untouched; `structuredContent` identical across modes
- [x] 2.2 Run `analyzeHints` on successful renders; append `Hint notes:` tail to the model-facing text (slim and full) and set `structuredContent.diagnostics` only when non-empty
- [x] 2.3 Tests: slim shape, format-contract invariance under `slim: true`, `Hint notes:` + diagnostics array for a misspelled hint, silent path for coherent hints, structuredContent equality slim-vs-full

## 3. Server wiring (capability signal)

- [x] 3.1 `server.ts`: capture the `oninitialized` UI-capability outcome into connection state; resolve slim = session signal > `WIDGENTIC_ASSUME_UI` env > false; pass `{ slim }` into the render handler call
- [x] 3.2 Tests/verification: stdio-style session with UI capability → slim; without → full; env override on an un-negotiated instance → slim

## 4. Verification, deploy, docs

- [x] 4.1 Full `npm test` + typecheck green; existing format tests unmodified and passing
- [x] 4.2 Deploy `v5` with `WIDGENTIC_ASSUME_UI=1` on the Container App; curl-verify slim default output and a `Hint notes:` response through `mcp.widgentic.dev`
- [x] 4.3 Live agent check (Copilot or basic-host): deliberately misspelled hint → agent visibly self-corrects on the follow-up call; record in TESTING.md
- [x] 4.4 README/TESTING.md notes: slim behavior, `WIDGENTIC_ASSUME_UI`, `Hint notes:` feedback loop
