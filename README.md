# widgentic

**Widgets for agents.** widgentic is the UI layer for MCP skills, plugins, and agent tools that need to show structured data — JSON, CSV, or anything an agent assembles — as friendly, generic widgets (cards, tables, trees, custom).

It is the only UI an agent needs to render data from external services and APIs.

## Why

Agents call tools and APIs that return structured data. Each tool today reinvents how to present that data in chat or canvas surfaces. widgentic provides one consistent, agent-friendly contract and a small set of generic widgets, so any MCP-aware host can render rich tool output without bespoke UI per tool.

## Capabilities

The foundation is defined as OpenSpec capabilities under `openspec/changes/widget-rendering-foundation/`:

- `widget-contract` — Normalized payload (`kind`, `data`, `hints?`, `meta?`) emitted by agents and consumed by renderers.
- `widget-catalog` — Built-in widgets: `card`, `table`, `tree`, plus a `custom` extension point.
- `data-adapters` — JSON and CSV adapters that turn raw input into the contract.
- `widget-mapper` — Default widget selection from data shape, with explicit override.
- `mcp-widget-output` — Convention for MCP tools to return widget payloads to capable hosts.

## Architecture (target)

```
External API / Agent data
        │
        ▼
  Data adapter (JSON | CSV | passthrough)
        │
        ▼
  Widget mapper  ──►  { kind, data, hints?, meta? }   ◄── Widget contract
        │
        ▼
  Widget catalog  →  card · table · tree · custom
        │
        ▼
  Lightweight reactive renderer
```

See `openspec/changes/widget-rendering-foundation/design.md` for decisions and tradeoffs.

## Status

Spec-first phase. No runtime code yet — the foundational change defines the contract and capabilities. Implementation lands in follow-up OpenSpec changes per capability.

## Reference material

See `reference-links.md` for MCP, UI runtime, and design system references that inform widgentic's direction.