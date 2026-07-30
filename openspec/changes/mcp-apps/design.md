## Context

The dual-format result always anticipated three consumption rungs: text fallback (any host), native payload mounting (widgentic-aware hosts), and inline UI (the `ui://` URI chosen back in `mcp-widget-output` was this rung's placeholder). MCP Apps is now a real convention with real hosts: UI ships as `text/html` resources under `ui://` URIs, rendered in sandboxed views; the OpenAI Apps SDK and the MCP Apps extension differ in metadata flavor but share the resource shape. Widgentic's `format: "page"` already produces the exact artifact — self-contained, CSP-friendly (no external references, no scripts), themed.

## Goals / Non-Goals

**Goals:**
- Widgets visible inline in Apps-capable chat hosts from a single `render_widget` call.
- A host-agnostic static path in `src/` (embedded text/html resource — meaningful even to mcp-ui-style hosts that predate the Apps SEP), with host-flavor specifics quarantined in the wiring layer.
- Keep every existing consumer working: the widgentic JSON payload block remains in `app` results, so native hosts lose nothing.

**Non-Goals:**
- No interactive templates yet (no app-bridge JS, no postMessage, no UI→tool calls) — the emitted page stays script-free, which also keeps the sandbox/CSP story trivial.
- No streaming/partial UI updates; no per-host sniffing in handlers (hosts choose by requesting `format: "app"` or by honoring the declared template).
- No changes to `both`/`html`/`widget`/`page` semantics.

## Decisions

### Decision 0 (revision, post-review): Formal declaration via `@modelcontextprotocol/ext-apps`; embedded static kept for legacy hosts
Review of the official ext-apps repo and spec (2026-01-26) established two facts that reshape Decisions 1/4: (a) **inline embedded resources were deferred from the Apps MVP** — formal hosts mount only pre-declared templates linked via `_meta.ui.resourceUri`, so the embedded path alone cannot pass the acceptance gate; (b) the official `@modelcontextprotocol/ext-apps` (1.7.5) ships `registerAppTool`/`registerAppResource`/`getUiCapability`, removing the drift risk that justified degraded mode. The adopted architecture: one declared template (`ui://widgentic/app.html`, mime `text/html;profile=mcp-app`) receiving every render via `structuredContent` on tool results; the embedded block stays in `format: "app"` (mime updated to the profile) for mcp-ui-lineage legacy hosts (Nanobot, MCPJam); `@mcp-ui/server` not adopted — its emission helpers duplicate shapes we hand-roll. The template's bridge is hand-rolled (~50 lines inline vanilla JS) rather than inlining the 330 KB `app-with-deps` bundle: the iframe protocol is plain JSON-RPC over postMessage with method names pinned by the exact-versioned spec (`ui/initialize` → `ui/notifications/initialized` → `ui/notifications/tool-result`), and the loader needs only that slice. This amends the script-free stance precisely: *content* remains script-free; the loader is fixed infrastructure with zero CSP domains.

### Decision 1: Static embedded resource first; declaration-based Apps wiring second
Two mechanisms exist: embedding a `text/html` resource directly in the result content (static, host-agnostic, works today in mcp-ui-lineage hosts), and the Apps SEP's pre-declared template + `_meta` linkage (what Claude Desktop's support formalizes). The `src/` handler implements the first — pure data, SDK-free, testable. The second is wiring-layer only (`examples/main.ts`): register the resource, set tool `_meta` per the installed SDK's actual API — because the exact keys/registration calls are where drift lives (same isolation strategy that paid off for `registerTool`/zod). If the installed SDK exposes no Apps surface, the wiring degrades to the static path with a logged note, and the change still ships value.

### Decision 2: `"app"` is a new format value, not a change to existing ones
Adding the page-sized html resource to `both` would double every default response for hosts that can't use it. `"app"` composes: `[text one-liner, ui:// text/html resource, widgentic payload block]` — the fallback line for hosts that render neither block, the document for Apps hosts, the payload for native hosts. Content order puts the human-meaningful block first, matching the convention established by `toWidgetResult`.

### Decision 3: Deterministic per-kind URIs
`ui://widgentic/page/<kind>` — stable URIs let Apps hosts cache/reference templates while staying unique per widget kind; no timestamps or nonces (resumability and caching beat uniqueness here, and the embedded resource carries its own content anyway). The prefix is an exported constant beside `WIDGENTIC_URI`, keeping the interop surface one place.

### Decision 4: The emitted page stays script-free
Apps hosts sandbox rendered HTML and apply CSP; a zero-script, zero-fetch document (which `composePage` already guarantees — verified by the round-2 external-reference scan) renders under the strictest policies without negotiation. Interactivity via the app bridge is a separate, deliberate future change — bridging requires host-flavored JS, exactly what Decision 1 quarantines away from `src/` today.

### Decision 5: Verification strategy mirrors the SDK change
Unit tests pin the `app` content shape; the in-memory interop test proves the blocks survive the protocol; the live stdio driver checks the real server. Actual inline mounting cannot be asserted from this repo — the acceptance test is a human opening Claude Desktop against this server (documented in README + tasks as the manual gate), the same way headless Chrome pixel-sampling served as round 3's visual gate.

## Risks / Trade-offs

- [Apps metadata flavor drift (`_meta` keys, mime variants like `text/html+skybridge`, registration API) since knowledge cutoff] → all flavor-specific code confined to `examples/main.ts`, verified against the installed SDK at apply time; the static embedded resource is flavor-independent and ships regardless.
- [Hosts that render *both* the html resource and honor the payload block could double-display] → hosts pick one idiom by design; documented in the format description ("Apps hosts use the html resource; native hosts the payload block").
- [`app` responses are page-sized (~3 KB CSS overhead per call)] → opt-in format; existing formats unchanged.
- [No automated proof of inline mounting] → explicit manual acceptance step (Claude Desktop) in tasks; everything below the host boundary is machine-verified.
