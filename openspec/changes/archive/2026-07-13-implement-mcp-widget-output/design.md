## Context

MCP tool results are `{ content: ContentBlock[], ... }` where blocks are typed (`text`, `image`, `resource`, ...). The widgentic convention must let a tool embed a `WidgetPayload` in a result such that (a) aware hosts can find and validate it, (b) unaware hosts degrade to something readable, and (c) neither side needs a specific MCP SDK. The project convention is explicit: MCP integration is a convention, not a dependency. All building blocks exist — contract validation, `parseJson`, catalog rendering.

## Goals / Non-Goals

**Goals:**
- Zero-dependency emit/extract/negotiate helpers over structural MCP types.
- Wire format that is valid, ordinary MCP content — no protocol extensions, just a reserved mime type, URI scheme, and capability key.
- Graceful degradation both ways: text fallback inside widget results, and a text-only emission path for hosts that never opted in.
- Deterministic, testable behavior end-to-end (tool → host → rendered HTML).

**Non-Goals:**
- No MCP transport, server, or client — only result/capability object shapes.
- No streaming or multi-widget results (one widgentic block per result; first wins).
- No versioned payload migration — `version: 1` is declared, negotiation semantics beyond presence-checking are deferred until a v2 exists.
- No host UI integration (that's the host's catalog usage, exercised in tests only).

## Decisions

### Decision 1: Embedded resource block with a reserved mime type
`toWidgetResult` emits the payload as `{ type: "resource", resource: { uri, mimeType: "application/vnd.widgentic+json", text: JSON.stringify(payload) } }`. Resource blocks are standard MCP content; the vendor mime type (`application/vnd.widgentic+json`) is the discriminator, and `uri` defaults to `ui://widgentic/widget` (overridable) following the emerging `ui://` convention for UI-bearing resources.

*Alternative considered*: `structuredContent` with a marker field — rejected: `structuredContent` is semantically the tool's *data* output and collides with tools that already use it; a sibling content block composes instead of competing. *Alternative*: text block with a magic prefix — rejected: fragile parsing, and unaware hosts would display the marker garbage.

### Decision 2: Widget results carry their own text fallback
`toWidgetResult` places a `text` block (same representation as `toTextResult`) *before* the resource block. Hosts that ignore unknown resource mime types still show meaningful text, so a tool that misjudges host capability degrades gracefully rather than rendering nothing. Aware hosts detect by mime type, not by block position, so the extra block is inert for them. `options.text` overrides the generated fallback.

### Decision 3: Three-state extraction result
`extractWidgetPayload` returns `{ found: false } | { found: true; ok: true; payload } | { found: true; ok: false; error }`. The spec requires hosts to leave non-widget results alone — that is a different situation from a malformed widgentic block, which the host should surface as an error rather than silently text-render. A two-state result would conflate them. `error` reuses the existing shapes (`AdapterError` for JSON failures via `parseJson`, `WidgetContractError` for validation failures) rather than inventing a third error vocabulary.

### Decision 4: Capability convention rides MCP `experimental`
Hosts advertise `{ experimental: { widgentic: { version: 1 } } }` in their MCP client capabilities. The `experimental` namespace is the protocol's sanctioned place for non-standard capabilities, needs no protocol change, and is where every SDK already surfaces unknown keys. `hostSupportsWidgets` checks presence (any truthy `widgentic` value); `declareWidgetCapability` adds the key without mutating or dropping the caller's existing capabilities. Version semantics stay presence-only until a second version exists.

### Decision 5: Structural typing, no SDK import
`McpToolResult`, `McpContentBlock`, and `McpCapabilities` are defined locally as minimal structural interfaces with index signatures (matching the contract's forward-compatibility stance). Any SDK's real objects satisfy them; our emitted objects satisfy any SDK's parameter types. Extraction treats `content` defensively (missing/non-array → `{ found: false }`) since inputs cross a trust boundary.

### Decision 6: Text fallback format is title + pretty JSON
`toTextResult` produces `meta.title` (when present) on the first line, then `JSON.stringify(data, null, 2)` (with the same never-throw fallback discipline as the catalog's `custom` widget). It is deliberately the plain-text sibling of the `custom` renderer: predictable, inspectable, no layout ambitions. Richer text (e.g., markdown tables) is a host/renderer concern, not an emission concern.

## Risks / Trade-offs

- [Another implementation could pick a different discriminator] → constants are exported and spec'd; the mime type is the single source of truth, so interop only requires agreeing on it.
- [First-widgentic-block-wins may surprise multi-widget tools] → documented and spec'd; multi-widget results are an explicit non-goal until a real use case exists.
- [Presence-only version check defers real negotiation] → acceptable: with one version there is nothing to negotiate; the `version` field exists so v2 can negotiate without changing the capability key.
- [`JSON.stringify` on payloads with circular `data` throws] → emission catches and falls back to `String(data)` inside the text path; the resource path cannot carry non-JSON data, so `toWidgetResult` returns the text-only shape in that degenerate case (documented, tested).
