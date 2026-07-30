## Why

The final live test proved the last boundary: widgentic renders correctly, but non-aware hosts (Claude Code chat) display nothing — the result exists only as tool-result text, forcing file/artifact workarounds. MCP Apps-capable hosts (Claude Desktop and the OpenAI Apps surfaces) can mount `ui://` **text/html resources inline in chat**, and widgentic is one convention-step away: `format: "page"` output already *is* a self-contained HTML document. This change emits it the way Apps hosts expect, making widgets visible in chat with no files and no artifacts.

## What Changes

- **New `format: "app"`** on `render_widget`: the result carries the self-contained page as an embedded **`ui://` resource block with `mimeType: "text/html"`** (URI `ui://widgentic/page/<kind>`), alongside the existing widgentic JSON payload block and a one-line text fallback for hosts that render neither. This is the host-agnostic static path (mcp-ui-style embedded HTML resources), reusing `composePage` — themed body, registered styles, theme tokens all included.
- **MCP Apps declaration at the wiring layer** (`examples/mcp-server/main.ts`): register the page as a server resource and declare the tool↔UI linkage via tool `_meta` per the MCP Apps convention supported by the installed SDK — verified against the SDK's actual API surface at apply time (the exact `_meta` keys and registration calls are the drift risk, so they live only in the wiring file, never in `src/`).
- Constants exported for interop: `WIDGENTIC_UI_URI_PREFIX` (`"ui://widgentic/page/"`) and the html mime handling beside the existing `WIDGENTIC_MIME_TYPE`.
- `RENDER_WIDGET_TOOL` format description gains `"app"` with guidance on when hosts should prefer it; the zod mirrors extend accordingly.
- Tests: handler coverage for the `"app"` content shape (html resource + payload block + fallback text, theme/styles present in the document), SDK interop round trip, and a live stdio check.
- README: how to see widgets inline in an Apps-capable host (Claude Desktop) vs. the file workflow for non-aware hosts.
- Zero new dependencies; `src/` stays SDK-free.

Out of scope: interactive app-bridge templates (postMessage/bidirectional UI — a future change once the static path is proven in real hosts), tool-side UI state, and any change to non-`app` formats.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `mcp-server`: `render_widget` gains `format: "app"` (embedded text/html `ui://` resource); the runnable server declares the Apps linkage best-effort per the installed SDK.

## Impact

- Code: `src/mcp-server/` (format value, app content composition — reuses `composePage`), `examples/mcp-server/main.ts` (resource registration + `_meta` declaration), README.
- Depends on: existing theming/page machinery; no new packages.
- Downstream: the morning-briefing use case renders inline on Apps-capable hosts; Claude Code and other non-aware hosts keep the documented file/artifact paths.
