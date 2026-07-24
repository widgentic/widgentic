## Why

`mcp-widget-output` is the last unimplemented capability: everything below it works (parse → map → validate → render), but there is no convention for an MCP tool to actually ship a widget payload to a host, or for a host to detect and read one. Implementing it completes the foundation and makes widgentic usable end-to-end from a real MCP tool.

## What Changes

- Add `src/mcp/` implementing the widgentic MCP convention as plain functions over structural types — no MCP SDK dependency, so the convention works with any SDK (or none).
- Emit side (tools):
  - `toWidgetResult(payload, options?)`: returns an MCP-shaped tool result whose `content` carries the payload as an embedded resource (`mimeType: "application/vnd.widgentic+json"`, `uri: "ui://widgentic/widget"` by default) plus a plain-text fallback block for non-aware hosts.
  - `toTextResult(payload)`: text-only result for hosts that did not advertise support (deterministic representation: `meta.title` line + pretty-printed JSON of `data`).
- Consume side (hosts):
  - `extractWidgetPayload(result, options?)`: finds the widgentic block and returns a three-state discriminated result — `{ found: false }` for non-widget results (host leaves them alone), `{ found: true, ok: true, payload }` after contract validation, `{ found: true, ok: false, error }` for malformed blocks. Accepts optional `knownKinds` (e.g., from `catalog.kinds()`).
  - `isWidgetResult(result)`: cheap detection predicate.
- Capability negotiation convention (MCP `experimental` capabilities):
  - `declareWidgetCapability(capabilities?)`: returns capabilities with `experimental.widgentic: { version: 1 }` added non-destructively (hosts).
  - `hostSupportsWidgets(capabilities)`: checks for it (tools) — `hostSupportsWidgets(caps) ? toWidgetResult(p) : toTextResult(p)`.
- Export constants (`WIDGENTIC_MIME_TYPE`, `WIDGENTIC_URI`, `WIDGENTIC_CAPABILITY`, `WIDGENTIC_VERSION`) so other implementations can interoperate without importing the functions.
- Export from a new package entry `./mcp`; reuse `parseJson` (adapters) and `validateWidgetPayload` (contract) internally.
- Add Vitest coverage for every scenario in `openspec/specs/mcp-widget-output/spec.md` plus the new programmatic-surface requirements, including an end-to-end test: tool emits → host extracts → catalog renders → HTML.

No breaking changes.

## Capabilities

### New Capabilities
<!-- None. This change implements an existing capability. -->

### Modified Capabilities
- `mcp-widget-output`: add requirements for the programmatic TypeScript surface (emission, extraction, negotiation helpers), the concrete wire convention (mime type, URI, capability key, embedded text fallback), and the three-state extraction result. Existing behavioral requirements are unchanged.

## Impact

- New code: `src/mcp/` with `index.ts`, structural MCP types, emit/extract/capability modules, and `__tests__/`.
- New package entry: `./mcp` in `package.json` `exports`.
- Depends on: `widgentic/contract` (validation), `widgentic/adapters` (`parseJson`); composes with `widgentic/catalog` in tests. No new dependencies of any kind.
- Downstream: completes the foundation; reference patterns (Azure Functions MCP extension, fluent MCP SDK) can adopt the convention without code changes here.
