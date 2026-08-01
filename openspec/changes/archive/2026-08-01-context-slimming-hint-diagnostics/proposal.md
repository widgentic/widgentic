# Context Slimming + Hint-Coherence Diagnostics

## Why

Two agent-experience gaps surfaced repeatedly in live testing. First, every `render_widget` result ships the full rendered HTML as a model-facing text block even when the host mounts the widget visually from `structuredContent` — pure context weight (heavier now that images exist) that also tempts agents into restating the data as text (observed verbatim in the first Copilot run). Second, agents silently drop or misaim hints — Copilot omitted `images` and `fieldFormat` in one run and passed them in another — and widgentic's forward-compatible "ignore unknown/unmatched hints" policy means the agent never learns; a structured nudge in the tool result is the only feedback channel that reaches it.

## What Changes

- **Capability-aware model-context slimming**: when the client is known (or configured) to be an MCP Apps host, the *default-format* `render_widget` result replaces the full-HTML text block with a one-line confirmation that also tells the model the visual is already displayed and the data should not be restated. Explicit `format` requests keep their exact current contracts. `structuredContent` (the iframe channel) is unchanged.
- **Capability signal resolution**: session-negotiated UI capability (stdio / stateful transports) is authoritative; on stateless HTTP — where a `tools/call` POST builds a fresh server that never saw `initialize` — an explicit deployment default (`WIDGENTIC_ASSUME_UI`) decides, defaulting to current behavior when unset.
- **Hint-coherence analyzer** (`widget-catalog`): a pure, render-independent `analyzeHints(kind, data, hints, descriptor)` producing structured, never-fatal diagnostics: unknown hint keys (with near-miss spelling suggestions against the descriptor's advertised hints), per-key mismatches for the built-ins (`columns`/`fieldFormat`/`images` keys matching no record column or field, `images` values that are not valid shapes, unsafe image sources under an image hint, `expandDepth` type errors), and hints advertised by no descriptor entry for the kind.
- **Diagnostics surfacing** (`mcp-server`): `render_widget` appends a compact `Hint notes:` section to the model-facing text when diagnostics exist (in both slim and full modes) and includes the structured array as `structuredContent.diagnostics`. Valid renders stay `isError: false`.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `widget-catalog`: new hint-coherence analyzer requirement (pure function, exported from the catalog entry; renderers untouched).
- `mcp-server`: default-format output becomes capability-aware (slim confirmation vs. full HTML); diagnostics appended to model-facing text and carried in `structuredContent`.

## Impact

- `src/catalog/hints.ts` (new) + catalog entry export; `src/mcp-server/handlers.ts` (diagnostics wiring, slim option); `examples/mcp-server/server.ts` (capability plumb from `oninitialized`, `WIDGENTIC_ASSUME_UI`); `examples/mcp-server/http.ts` unchanged (env-driven).
- Specs: delta files for `widget-catalog` and `mcp-server`.
- Tests: analyzer matrix, slim-vs-full output shapes, diagnostics-in-text/structuredContent, capability plumbing; existing format-contract tests must stay green (explicit formats unchanged).
- Hosts: no protocol change — Apps hosts see less redundant text; text-only hosts see identical output.
